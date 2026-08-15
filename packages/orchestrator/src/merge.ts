import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  branchName,
  ensureDir,
  readYamlFile,
  withFileLock,
  writeAtomic,
  writeYamlFile,
  type PicodeConfig,
} from "@picode/core";
import { isEvolveRun, runVerifyCommands } from "./evolve-run.js";
import { SessionStore } from "./session-store.js";
import { readJsonl } from "./rules-engine.js";
import {
  captureTaskCheckpoint,
  PRE_MERGE_CHECKPOINT_BOUNDARY,
} from "./checkpoint-store.js";

/**
 * Serial merge queue (18 phase F): runs/<id>/merge_queue.jsonl + merge.lock.
 * One merge at a time — two tasks never land on main in parallel (T11 / DoD).
 */
export interface MergeRequest {
  id: string;
  ts: string;
  task_id: string;
  from: string;
  status: "queued" | "merged" | "failed";
  merged_at: string | null;
  error: string | null;
}

function queuePath(dir: string): string {
  return path.join(dir, "merge_queue.jsonl");
}

function lockPath(dir: string): string {
  return path.join(dir, "merge.lock");
}

/**
 * Chunk-level topological dependencies for a task (11 stage 7): chunks.yaml
 * records `depends_on: [chunkId, ...]`; a merge must wait until every
 * dependency's own merge has landed on main before it is picked.
 */
export function taskDependencies(dir: string, taskId: string): string[] {
  const chunksPath = path.join(dir, "chunks.yaml");
  if (!fs.existsSync(chunksPath)) return [];
  const data = readYamlFile<{ chunks?: Array<{ id: string; task_id?: string; depends_on?: string[] }> }>(chunksPath)!;
  const chunk = (data.chunks ?? []).find(
    (c) => c.task_id === taskId || `task-${c.id}` === taskId,
  );
  return chunk?.depends_on ?? [];
}

/**
 * Whether the merge for a dependency task no longer blocks a downstream merge.
 * A dependency counts as satisfied once it landed (`merged`) or was attempted
 * and failed (`failed`) — a failed upstream is release-eng's to resolve, but
 * must not wedge the queue forever (D045). Absent entry → not ready yet.
 */
function depSatisfied(dir: string, depTaskId: string): boolean {
  const req = readMergeQueue(dir).find((q) => q.task_id === depTaskId);
  if (!req) return false;
  return req.status === "merged" || req.status === "failed";
}

/**
 * Detect a dependency cycle among the queued merge requests (A→B→A would
 * otherwise wait on itself forever). Only queued tasks participate.
 */
function hasDependencyCycle(dir: string, queued: MergeRequest[]): boolean {
  const byTask = new Map(queued.map((q) => [q.task_id, q]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (done.has(taskId)) return false;
    if (visiting.has(taskId)) return true;
    const req = byTask.get(taskId);
    if (!req) return false;
    visiting.add(taskId);
    for (const dep of taskDependencies(dir, taskId)
      .map((c) => (c.startsWith("task-") ? c : `task-${c}`))
      .filter((t) => t !== taskId && byTask.has(t))) {
      if (visit(dep)) return true;
    }
    visiting.delete(taskId);
    done.add(taskId);
    return false;
  };
  return queued.some((q) => visit(q.task_id));
}

export function readMergeQueue(dir: string): MergeRequest[] {
  const p = queuePath(dir);
  if (!fs.existsSync(p)) return [];
  // 逐行容错（P1）：一行损坏不再炸掉锁内的 merge 流程
  return readJsonl<MergeRequest>(p);
}

export async function enqueueMerge(
  dir: string,
  taskId: string,
  from = "release-eng",
): Promise<MergeRequest> {
  const req: MergeRequest = {
    id: `merge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    task_id: taskId,
    from,
    status: "queued",
    merged_at: null,
    error: null,
  };
  ensureDir(dir);
  await withFileLock(lockPath(dir), () => {
    fs.appendFileSync(queuePath(dir), JSON.stringify(req) + "\n", "utf8");
  });
  return req;
}

export interface MergeOutcome {
  merged: MergeRequest | null;
  remaining: number;
  skipped_due_to_active: boolean;
  /** 11 stage 7: head of queue has unmerged dependencies (topological order). */
  skipped_due_to_deps: boolean;
  /** C1 checkpoint-auto pre-merge capture file path, or null when disabled/not captured. */
  checkpoint: string | null;
}

/**
 * Merge the next ready entry onto main. Holds merge.lock for the whole
 * operation so concurrent merges serialize. A task whose squad sessions are
 * still awake is skipped (nothing mid-flight lands on main); a task whose
 * chunk-level dependencies have not merged yet is skipped as well (11 stage 7
 * topological ordering). On failure the working tree is restored via
 * `git merge --abort` so the repo never stays in a conflicted state.
 */
/**
 * A merge that landed is terminal for the task (R2-C1): mark
 * runs/<id>/tasks/<taskId>/task.yaml status = "merged" so the continuation
 * sweep stops feeding that task's seats (TERMINAL_TASK_STATUSES). This is a
 * run-state write (under .picode/runs, gitignored), not part of the git merge.
 */
function markTaskMerged(dir: string, taskId: string): void {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(p)) return;
  const task = readYamlFile<{ status?: string }>(p);
  if (!task) return;
  task.status = "merged";
  writeYamlFile(p, task);
}

export async function mergeNext(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
): Promise<MergeOutcome> {
  return withFileLock(lockPath(dir), async () => {
    const queue = readMergeQueue(dir);
    const queued = (q: MergeRequest) => q.status === "queued";
    const remaining = () => queue.filter(queued).length;
    const idx = queue.findIndex(queued);
    if (idx === -1) return { merged: null, remaining: remaining(), skipped_due_to_active: false, skipped_due_to_deps: false, checkpoint: null };

    const req = queue[idx];
    const branch = branchName(config, path.basename(dir), req.task_id);
    // never merge while the squad is still awake on that task
    const store = new SessionStore(dir);
    const agents = [`squad-lead@${req.task_id}`, `engineer@${req.task_id}`, `sdet@${req.task_id}`];
    const awake = agents.some((a) => store.get(a)?.state === "awake");
    if (awake) {
      return { merged: null, remaining: remaining(), skipped_due_to_active: true, skipped_due_to_deps: false, checkpoint: null };
    }
    // 11 stage 7: topological order — dependencies must merge first
    const deps = taskDependencies(dir, req.task_id)
      .map((c) => (c.startsWith("task-") ? c : `task-${c}`))
      .filter((t) => t !== req.task_id);
    if (deps.some((d) => !depSatisfied(dir, d))) {
      // a cycle among queued merges can never advance — surface it instead of
      // wedging the queue silently
      if (hasDependencyCycle(dir, queue.filter(queued))) {
        throw new Error(
          `merge queue dependency cycle detected among queued tasks: ${queue
            .filter(queued)
            .map((q) => q.task_id)
            .join(", ")}`,
        );
      }
      return { merged: null, remaining: remaining(), skipped_due_to_active: false, skipped_due_to_deps: true, checkpoint: null };
    }
    // C1 checkpoint-auto: merge 前捕获（enabled && pre_merge 时，boundary=pre_merge）。
    // best-effort：捕获失败绝不阻断 merge（checkpoint 是观测产物，D082 快照只读边界）。
    let checkpoint: string | null = null;
    if (config.self_evolve.checkpoints.enabled && config.self_evolve.checkpoints.pre_merge) {
      try {
        checkpoint = captureTaskCheckpoint(dir, req.task_id, { boundary: PRE_MERGE_CHECKPOINT_BOUNDARY })?.file ?? null;
      } catch {
        checkpoint = null;
      }
    }
    let status: MergeRequest["status"] = "merged";
    let error: string | null = null;
    try {
      // E4 (19 §5): self_evolve merges must pass verify_commands first.
      if (isEvolveRun(dir)) {
        const v = runVerifyCommands(repoRoot, config);
        if (!v.ok) {
          throw new Error(`E4 verify_commands failed:\n${v.output.slice(0, 400)}`);
        }
      }
      execFileSync("git", ["checkout", config.git.base_branch], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["merge", "--no-ff", "-m", `merge ${req.task_id}`, branch], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    } catch (e) {
      status = "failed";
      const head = e instanceof Error ? e.message.split("\n")[0] : String(e);
      const out = (e as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString().trim();
      error = out ? `${head}\n${out.slice(0, 400)}` : head;
      // 11 stage 7: restore the working tree so a conflicted merge never
      // leaves main dirty. Only abort when a merge is actually in progress;
      // an abort failure is surfaced on the failed entry, not swallowed.
      let mergeInProgress = false;
      try {
        execFileSync("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], {
          cwd: repoRoot,
          stdio: "pipe",
        });
        mergeInProgress = true;
      } catch {
        /* no merge in progress (checkout failure etc.) */
      }
      if (mergeInProgress) {
        try {
          execFileSync("git", ["merge", "--abort"], { cwd: repoRoot, stdio: "pipe" });
        } catch (ae) {
          error = `${error}\n(abort failed: ${ae instanceof Error ? ae.message.split("\n")[0] : String(ae)})`;
        }
      }
    }
    // R2-C1: a landed merge is terminal — stop feeding this task's seats.
    if (status === "merged") {
      markTaskMerged(dir, req.task_id);
    }
    const updated: MergeRequest = {
      ...req,
      status,
      merged_at: status === "merged" ? new Date().toISOString() : null,
      error,
    };
    queue[idx] = updated;
    writeAtomic(queuePath(dir), queue.map((q) => JSON.stringify(q)).join("\n") + "\n");
    return {
      merged: updated,
      remaining: remaining(),
      skipped_due_to_active: false,
      skipped_due_to_deps: false,
      checkpoint,
    };
  });
}
