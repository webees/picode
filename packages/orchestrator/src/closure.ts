import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  branchName,
  ensureDir,
  readYamlFile,
  worktreePath,
  writeAtomic,
  type PicodeConfig,
  writeYamlFile,
} from "@picode/core";
import { SessionStore } from "./session-store.js";
import { terminateAgent } from "./pi-adapter.js";
import { checkWritePathsInDiff, type TaskState } from "./task.js";

/**
 * Task closure (11 playbook stage 6 / PROCESSES P07 + P14):
 * evidence → handoff package + ack → dissolve, and force-dissolve / gc.
 *
 * Order (P07, MUST):
 *   verifying: sdet evidence pass (exit_code=0 + log_ref)
 *     → handing_over → handoff package complete + acceptance.yaml
 *       → dissolving → dissolved → chunk.status = done
 *
 * Invariants enforced here:
 *   08 §43  handoff/merge 前 MUST `git diff` ⊆ write_paths        (T06)
 *   08 §48  dissolved 前 MUST 有 handoff 包 + acceptance.yaml      (T07/T08)
 *   08 §49  解散 MUST NOT 删除 evidence/handoff                    (kept)
 */

// ---------------------------------------------------------------------------
// Evidence (tasks/<id>/evidence/evidence.yaml)
// ---------------------------------------------------------------------------

export interface EvidenceCommand {
  cmd: string;
  exit_code: number;
  log_ref: string | null;
}

export interface EvidenceState {
  schema_version: string;
  task_id: string;
  result: "pass" | "fail";
  commands: EvidenceCommand[];
  tester_id: string;
  at: string;
}

export function evidencePath(dir: string, taskId: string): string {
  return path.join(dir, "tasks", taskId, "evidence", "evidence.yaml");
}

/**
 * Record sdet evidence. `pass` requires at least one command AND every command
 * to be exit_code=0 with a log_ref (P07: evidence pass = exit_code=0 + log_ref).
 */
export function submitEvidence(
  dir: string,
  taskId: string,
  opts: { cmds: EvidenceCommand[]; by: string },
): EvidenceState {
  const allPass =
    opts.cmds.length > 0 &&
    opts.cmds.every((c) => c.exit_code === 0 && Boolean(c.log_ref));
  const ev: EvidenceState = {
    schema_version: "1",
    task_id: taskId,
    result: allPass ? "pass" : "fail",
    commands: opts.cmds,
    tester_id: opts.by,
    at: new Date().toISOString(),
  };
  ensureDir(path.dirname(evidencePath(dir, taskId)));
  writeYamlFile(evidencePath(dir, taskId), ev);
  return ev;
}

export function readEvidence(dir: string, taskId: string): EvidenceState | null {
  const p = evidencePath(dir, taskId);
  if (!fs.existsSync(p)) return null;
  return readYamlFile<EvidenceState>(p)!;
}

/** T07: no evidence pass → no handoff/dissolve path. */
export function assertEvidencePassed(dir: string, taskId: string): void {
  const ev = readEvidence(dir, taskId);
  if (!ev) {
    throw new Error(`evidence missing for ${taskId}; handoff requires evidence pass (T07)`);
  }
  if (ev.result !== "pass") {
    throw new Error(`evidence not passed for ${taskId}; handoff requires result=pass (T07)`);
  }
}

// ---------------------------------------------------------------------------
// Handoff package (tasks/<id>/handoff/)
// ---------------------------------------------------------------------------

export const HANDOFF_FILES = [
  "summary.md",
  "artifact_index.md",
  "known_issues.md",
  "diff_scope.md",
] as const;

export function handoffDir(dir: string, taskId: string): string {
  return path.join(dir, "tasks", taskId, "handoff");
}

export function acceptancePath(dir: string, taskId: string): string {
  return path.join(dir, "tasks", taskId, "handoff", "acceptance.yaml");
}

function readTask(dir: string, taskId: string): TaskState {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(p)) throw new Error(`task not found: ${taskId}`);
  return readYamlFile<TaskState>(p)!;
}

function chunkDependsOn(dir: string, chunkId: string): string[] {
  const p = path.join(dir, "chunks.yaml");
  if (!fs.existsSync(p)) return [];
  const data = readYamlFile<{ chunks: Array<{ id: string; depends_on?: string[] }> }>(p)!;
  return data.chunks.find((c) => c.id === chunkId)?.depends_on ?? [];
}

/**
 * P07 receiver: downstream squad-lead when depends_on exists, otherwise
 * docs-lead or tpm (docs-lead 代持 on timeout).
 */
export function isAllowedAcceptor(dir: string, taskId: string, by: string): boolean {
  if (by === "docs-lead" || by === "tpm") return true;
  const task = readTask(dir, taskId);
  const deps = chunkDependsOn(dir, task.chunk_id);
  if (deps.length === 0) return false;
  const m = /^squad-lead@task-(.+)$/.exec(by);
  return Boolean(m && deps.includes(m[1]));
}

export interface PackageResult {
  files: string[];
  diff: { ok: boolean; offenders: string[]; files: string[] };
}

/**
 * Generate/verify the handoff package. T06: diff must stay inside write_paths.
 * T07: evidence must have passed before any handoff path opens.
 */
export function packageHandoff(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
): PackageResult {
  assertEvidencePassed(dir, taskId); // T07
  const task = readTask(dir, taskId);
  const wt = worktreePath(repoRoot, config, path.basename(dir), taskId);
  if (!fs.existsSync(wt)) {
    throw new Error(`task not prepared; no worktree at ${wt}`);
  }
  const diff = checkWritePathsInDiff(wt, config.git.base_branch, task.write_paths);
  if (!diff.ok) {
    throw new Error(
      `handoff rejected: diff out of write_paths (T06): ${diff.offenders.join(", ")}`,
    );
  }
  const hd = handoffDir(dir, taskId);
  ensureDir(hd);
  const skeletons: Record<string, string> = {
    "summary.md": "# Handoff Summary\n\n(由 squad-lead 填写:完成内容、验收对照)\n",
    "artifact_index.md": "# Artifact Index\n\n(由 engineer 填写:交付物清单与位置)\n",
    "known_issues.md": "# Known Issues\n\n(由三角填写:已知问题与风险)\n",
  };
  const diffScope =
    `# Diff Scope\n\nWrite-path gate: OK (diff ⊆ write_paths)\n\n` +
    `Files changed:\n${diff.files.map((f) => `- ${f}`).join("\n") || "(none)"}\n`;
  const written: string[] = [];
  for (const f of HANDOFF_FILES) {
    const p = path.join(hd, f);
    if (!fs.existsSync(p)) {
      writeAtomic(p, f === "diff_scope.md" ? diffScope : (skeletons[f] ?? ""));
      written.push(f);
    }
  }
  return { files: written, diff };
}

export interface AcceptanceState {
  schema_version: string;
  task_id: string;
  accepted_by: string[];
  accepted_at: string;
  notes: string | null;
}

/** T08 basis: record the receiver's ack (docs-lead / tpm / downstream lead). */
export function ackHandoff(
  dir: string,
  taskId: string,
  by: string,
  notes?: string,
): AcceptanceState {
  // ack presupposes a complete package
  const hd = handoffDir(dir, taskId);
  for (const f of HANDOFF_FILES) {
    if (!fs.existsSync(path.join(hd, f))) {
      throw new Error(`handoff package incomplete; missing ${f}`);
    }
  }
  if (!isAllowedAcceptor(dir, taskId, by)) {
    throw new Error(
      `handoff ack by "${by}" not allowed; expect docs-lead/tpm (or downstream squad-lead)`,
    );
  }
  // append, idempotent per acceptor: later acks must not clobber earlier ones
  const existing = readAcceptance(dir, taskId);
  const acceptedBy = existing?.accepted_by ?? [];
  if (!acceptedBy.includes(by)) acceptedBy.push(by);
  const acc: AcceptanceState = {
    schema_version: "1",
    task_id: taskId,
    accepted_by: acceptedBy,
    accepted_at: new Date().toISOString(),
    notes: notes ?? existing?.notes ?? null,
  };
  writeYamlFile(acceptancePath(dir, taskId), acc);
  return acc;
}

export function readAcceptance(dir: string, taskId: string): AcceptanceState | null {
  const p = acceptancePath(dir, taskId);
  if (!fs.existsSync(p)) return null;
  return readYamlFile<AcceptanceState>(p)!;
}

/** T08: no handoff ack → no dissolve. */
export function assertHandoffAccepted(dir: string, taskId: string): void {
  if (!readAcceptance(dir, taskId)) {
    throw new Error(`no handoff ack for ${taskId}; dissolve requires acceptance.yaml (T08)`);
  }
}

function setChunkStatus(dir: string, chunkId: string, status: string): string | null {
  const p = path.join(dir, "chunks.yaml");
  if (!fs.existsSync(p)) return null;
  const data = readYamlFile<{ chunks: Array<{ id: string; status?: string }> }>(p)!;
  const chunk = data.chunks.find((c) => c.id === chunkId);
  if (!chunk) return null;
  chunk.status = status;
  writeYamlFile(p, data);
  return status;
}

// ---------------------------------------------------------------------------
// Dissolve (P07 normal / P14 force)
// ---------------------------------------------------------------------------

export interface DissolveResult {
  task_id: string;
  status: "dissolved" | "failed" | "cancelled";
  terminated: string[];
  chunk_status: string | null;
  backup_ref: string | null;
  worktree_removed: boolean;
}

/**
 * Normal dissolve: evidence pass ∧ package complete ∧ ack present ∧ diff ⊆
 * write_paths. Terminates the triad, marks task dissolved, chunk done.
 * NEVER deletes evidence/handoff (08 §49).
 *
 * Force dissolve (P14): skips the ack gates but MUST back up dirty WIP into a
 * `backup_ref` (auto-commit on the task branch) before removing the worktree —
 * silent data loss is forbidden.
 */
export async function dissolveTask(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
  opts: { force?: boolean; status?: "failed" | "cancelled" } = {},
): Promise<DissolveResult> {
  const task = readTask(dir, taskId);
  const wt = worktreePath(repoRoot, config, path.basename(dir), taskId);

  let backupRef: string | null = null;
  let worktreeRemoved = false;

  if (!opts.force) {
    assertEvidencePassed(dir, taskId); // T07
    if (!fs.existsSync(wt)) {
      throw new Error(`task not prepared; no worktree at ${wt}`);
    }
    const diff = checkWritePathsInDiff(wt, config.git.base_branch, task.write_paths);
    if (!diff.ok) {
      throw new Error(
        `dissolve rejected: diff out of write_paths (T06): ${diff.offenders.join(", ")}`,
      );
    }
    const hd = handoffDir(dir, taskId);
    for (const f of HANDOFF_FILES) {
      if (!fs.existsSync(path.join(hd, f))) {
        throw new Error(`dissolve requires complete handoff package; missing ${f}`);
      }
    }
    assertHandoffAccepted(dir, taskId); // T08
    // Normal dissolve (domains/git-worktree §3): clean commit → worktree remove,
    // branch kept until merge or TTL. Refuse to drop uncommitted tracked changes.
    const porcelain = execFileSync("git", ["-C", wt, "status", "--porcelain"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    const trackedChanges = porcelain.filter((l) => !/^\?\?/.test(l));
    if (trackedChanges.length > 0) {
      throw new Error(
        `worktree has uncommitted tracked changes; commit them or use --force (T12 backup)`,
      );
    }
    // Uncommitted *untracked* files (build artifacts etc.) are dropped here on
    // purpose — source is committed, and --force is the escape hatch (T12).
    try {
      execFileSync("git", ["worktree", "remove", "--force", wt], {
        cwd: repoRoot,
        stdio: "pipe",
      });
      worktreeRemoved = true;
    } catch (e) {
      // removing the worktree is part of normal dissolve (domains/git-worktree
      // §3); a leftover worktree would never be reclaimed by gc (failed-only)
      throw new Error(
        `dissolve failed to remove worktree ${wt}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    execFileSync("git", ["worktree", "prune"], { cwd: repoRoot, stdio: "pipe" });
  }

  if (opts.force && fs.existsSync(wt)) {
    // P14 #2: dirty → auto-commit WIP on the task branch, record backup_ref.
    try {
      const dirty =
        execFileSync("git", ["-C", wt, "status", "--porcelain"], { encoding: "utf8" }).trim()
          .length > 0;
      if (dirty) {
        execFileSync("git", ["-C", wt, "add", "-A"], { cwd: wt, stdio: "pipe" });
        execFileSync(
          "git",
          ["-C", wt, "commit", "-qm", `WIP backup (force dissolve) ${taskId}`],
          { cwd: wt, stdio: "pipe" },
        );
        backupRef = execFileSync("git", ["-C", wt, "rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim();
        writeYamlFile(
          path.join(dir, "tasks", taskId, "backup.yaml"),
          {
            schema_version: "1",
            task_id: taskId,
            backup_ref: backupRef,
            at: new Date().toISOString(),
            reason: "force dissolve",
          },
        );
      }
    } catch (e) {
      throw new Error(
        `force dissolve backup failed; refusing to drop dirty work: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    // P14 #3: worktree remove --force + prune.
    try {
      execFileSync("git", ["worktree", "remove", "--force", wt], {
        cwd: repoRoot,
        stdio: "pipe",
      });
      execFileSync("git", ["worktree", "prune"], { cwd: repoRoot, stdio: "pipe" });
      worktreeRemoved = true;
    } catch {
      worktreeRemoved = false;
    }
  }

  // Terminate the triad (P14 #1: cancel notice; normal dissolve: dissolve).
  // D057: terminateAgent also closes opencode/pi backend sessions.
  const sessions = new SessionStore(dir);
  const terminated: string[] = [];
  for (const seat of [task.triad["squad-lead"], task.triad.engineer, task.triad.sdet]) {
    const cur = sessions.get(seat);
    if (cur && cur.state !== "terminated") {
      await terminateAgent(dir, config, seat, opts.force ? "force dissolve" : "dissolved");
      terminated.push(seat);
    }
  }

  const finalStatus = opts.force ? (opts.status ?? "failed") : "dissolved";
  task.status = finalStatus;
  writeYamlFile(path.join(dir, "tasks", taskId, "task.yaml"), task);

  // Normal dissolve unlocks downstream chunks; force leaves the chunk retryable.
  const chunkStatus = opts.force ? null : setChunkStatus(dir, task.chunk_id, "done");

  return {
    task_id: taskId,
    status: finalStatus,
    terminated,
    chunk_status: chunkStatus,
    backup_ref: backupRef,
    worktree_removed: worktreeRemoved,
  };
}

// ---------------------------------------------------------------------------
// Failed branch GC (P14 #5: failed branches live `failed_branch_ttl_sec`)
// ---------------------------------------------------------------------------

export interface GcResult {
  removed: string[];
  skipped: string[];
}

/**
 * Remove worktrees + branches of failed/cancelled tasks whose last touch is
 * older than `timeouts.failed_branch_ttl_sec`. Backup refs (backup.yaml) are
 * left intact — the ref itself stays reachable until reflog GC.
 */
export function gcFailedWorktrees(repoRoot: string, dir: string, config: PicodeConfig): GcResult {
  const ttlMs = config.timeouts.failed_branch_ttl_sec * 1000;
  const now = Date.now();
  const removed: string[] = [];
  const skipped: string[] = [];
  const tasksDir = path.join(dir, "tasks");
  if (!fs.existsSync(tasksDir)) return { removed, skipped };
  for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const taskId = entry.name;
    const tp = path.join(tasksDir, taskId, "task.yaml");
    if (!fs.existsSync(tp)) continue;
    const task = readYamlFile<{ status?: string }>(tp)!;
    if (task.status !== "failed" && task.status !== "cancelled") continue;
    if (now - fs.statSync(tp).mtimeMs < ttlMs) {
      skipped.push(taskId);
      continue;
    }
    const wt = worktreePath(repoRoot, config, path.basename(dir), taskId);
    const branch = branchName(config, path.basename(dir), taskId);
    try {
      execFileSync("git", ["worktree", "remove", "--force", wt], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    } catch {
      /* worktree already gone */
    }
    let branchRemoved = false;
    try {
      execFileSync("git", ["branch", "-D", branch], { cwd: repoRoot, stdio: "pipe" });
      branchRemoved = true;
    } catch {
      /* branch already gone or protected */
    }
    execFileSync("git", ["worktree", "prune"], { cwd: repoRoot, stdio: "pipe" });
    // only report reclaimed when the branch is actually gone; otherwise leave
    // it for a later pass rather than claiming success
    if (branchRemoved) removed.push(taskId);
    else skipped.push(taskId);
  }
  return { removed, skipped };
}
