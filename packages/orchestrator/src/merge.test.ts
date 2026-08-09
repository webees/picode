import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask, prepareTask, draftBrief, approveBrief } from "./task.js";
import {
  createStaffingRequest,
  draftPersonas,
  approveStaffing,
} from "./staffing.js";
import { enqueueMerge, mergeNext, readMergeQueue } from "./merge.js";
import { writeProgress, sweepProgress } from "./progress.js";
import { SessionStore } from "./session-store.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "picode-test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

async function setupPreparedTask(opts: { scale?: "S" | "M" | "L" } = {}) {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: opts.scale ?? "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["feature works"]);
  setGoalStatus(dir, "active");
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript"] });
  draftPersonas(repo, dir, config, taskId);
  await approveStaffing(dir, config, taskId, "run-lead");
  const { worktree, branch } = prepareTask(repo, dir, config, taskId);
  return { repo, runId, dir, config, taskId, worktree, branch };
}

function commitOnWorktree(worktree: string, rel: string, content: string, msg: string): void {
  fs.mkdirSync(path.dirname(path.join(worktree, rel)), { recursive: true });
  fs.writeFileSync(path.join(worktree, rel), content);
  execFileSync("git", ["-C", worktree, "add", "."], { cwd: worktree });
  execFileSync("git", ["-C", worktree, "commit", "-qm", msg], { cwd: worktree });
}

test("enqueue writes merge queue; process merges branch into main (serial)", async () => {
  const { repo, dir, config, taskId, worktree } = await setupPreparedTask();
  commitOnWorktree(worktree, "src/module-a/a.ts", "export const a = 1;\n", "feat: module-a");
  await enqueueMerge(dir, taskId, "release-eng");
  assert.equal(readMergeQueue(dir).length, 1);
  // squad still awake → mergeNext skips (nothing mid-flight lands on main)
  const skip = await mergeNext(repo, dir, config);
  assert.equal(skip.skipped_due_to_active, true);
  // put the squad to sleep, then merge succeeds
  const sessions = new SessionStore(dir);
  await sessions.sleep(`squad-lead@${taskId}`, "handoff");
  await sessions.sleep(`engineer@${taskId}`, "handoff");
  await sessions.sleep(`sdet@${taskId}`, "handoff");
  const out = await mergeNext(repo, dir, config);
  assert.ok(out.merged);
  assert.equal(out.merged.status, "merged");
  assert.ok(fs.existsSync(path.join(repo, "src", "module-a", "a.ts")));
});

test("scale L merge_ready wakes code-review AND sec-eng (T11)", async () => {
  const { repo, dir, config, taskId } = await setupPreparedTask({ scale: "L" });
  const sessions = new SessionStore(dir);
  // approveStaffing already slept the people triad; merge_ready must wake the gates
  const { applyEvent } = await import("./rules-engine.js");
  await applyEvent(dir, config, "merge_ready", { taskId });
  assert.equal(sessions.get("code-review")?.state, "awake");
  assert.equal(sessions.get("sec-eng")?.state, "awake");
});

test("progress sweep flags stale tasks and wakes squad-lead (U8)", async () => {
  const { repo, dir, config, taskId } = await setupPreparedTask();
  // never reported → progress.json missing → stale
  const res = await sweepProgress(dir, config);
  assert.ok(res.overdue.some((o) => o.task_id === taskId));
  assert.ok(res.woke.includes(`squad-lead@${taskId}`));
  const sessions = new SessionStore(dir);
  assert.equal(sessions.get(`squad-lead@${taskId}`)?.state, "awake");
});

test("fresh progress report is not flagged", async () => {
  const { dir, config, taskId } = await setupPreparedTask();
  writeProgress(dir, taskId, { phase: "running", blocked: false, summary: "working" });
  const res = await sweepProgress(dir, config);
  assert.equal(res.overdue.length, 0);
});
