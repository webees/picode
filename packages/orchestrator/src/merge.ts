import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ensureDir,
  withFileLock,
  writeAtomic,
  type PicodeConfig,
} from "@picode/core";
import { isEvolveRun, runVerifyCommands } from "./evolve-run.js";

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

export function readMergeQueue(dir: string): MergeRequest[] {
  const p = queuePath(dir);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as MergeRequest);
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
}

/**
 * Merge the head of the queue onto main. Holds merge.lock for the whole
 * operation so concurrent merges serialize. A task whose squad sessions are
 * still awake is skipped (nothing mid-flight lands on main).
 */
export async function mergeNext(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
): Promise<MergeOutcome> {
  const branchFor = (taskId: string) =>
    config.git.branch_template
      .replace("{run_id}", path.basename(dir))
      .replace("{task_id}", taskId);

  return withFileLock(lockPath(dir), async () => {
    const queue = readMergeQueue(dir);
    const idx = queue.findIndex((q) => q.status === "queued");
    if (idx === -1) return { merged: null, remaining: queue.filter((q) => q.status === "queued").length, skipped_due_to_active: false };

    const req = queue[idx];
    const branch = branchFor(req.task_id);
    let status: MergeRequest["status"] = "merged";
    let error: string | null = null;
    try {
      // never merge while the squad is still awake on that task
      const squadDir = path.join(dir, "sessions");
      const agents = [`squad-lead@${req.task_id}`, `engineer@${req.task_id}`, `sdet@${req.task_id}`];
      const awake = agents.some((a) => {
        const p = path.join(squadDir, `${a}.yaml`);
        if (!fs.existsSync(p)) return false;
        const y = fs.readFileSync(p, "utf8");
        return /^state: awake$/m.test(y);
      });
      if (awake) {
        return { merged: null, remaining: queue.filter((q) => q.status === "queued").length, skipped_due_to_active: true };
      }
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
      error = e instanceof Error ? e.message.split("\n")[0] : String(e);
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
      remaining: queue.filter((q) => q.status === "queued").length,
      skipped_due_to_active: false,
    };
  });
}
