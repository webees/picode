import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { writeAtomic } from "@picode/core";
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
  const { dir, config, taskId } = await setupPreparedTask({ scale: "L" });
  const sessions = new SessionStore(dir);
  // approveStaffing already slept the people triad; merge_ready must wake the gates
  const { applyEvent } = await import("./rules-engine.js");
  await applyEvent(dir, config, "merge_ready", { taskId });
  assert.equal(sessions.get("code-review")?.state, "awake");
  assert.equal(sessions.get("sec-eng")?.state, "awake");
});

test("progress sweep flags stale tasks and wakes squad-lead (U8)", async () => {
  const { dir, config, taskId } = await setupPreparedTask();
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

test("merge queue honors chunk depends_on (11 stage 7 topological order)", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["works"]);
  setGoalStatus(dir, "active");
  const { taskId: taskA } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/a/**"],
  });
  const { taskId: taskB } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-b",
    writePaths: ["src/b/**"],
  });
  // chunk-a depends on chunk-b
  const chunksPath = path.join(dir, "chunks.yaml");
  const data = YAML.parse(fs.readFileSync(chunksPath, "utf8")) as {
    chunks: Array<{ id: string; depends_on: string[] }>;
  };
  data.chunks.find((c) => c.id === "chunk-a")!.depends_on = ["chunk-b"];
  writeAtomic(chunksPath, YAML.stringify(data));

  await enqueueMerge(dir, taskA, "release-eng");
  // dependency task-b has no merge entry yet → task-a must wait
  const skip = await mergeNext(repo, dir, config);
  assert.equal(skip.skipped_due_to_deps, true);
  assert.equal(skip.merged, null);

  // append a merged entry for task-b → task-a is now allowed (picked, not skipped)
  const queue = readMergeQueue(dir);
  queue.push({
    id: "merge-b",
    ts: new Date().toISOString(),
    task_id: taskB,
    from: "release-eng",
    status: "merged",
    merged_at: new Date().toISOString(),
    error: null,
  });
  writeAtomic(
    path.join(dir, "merge_queue.jsonl"),
    queue.map((q) => JSON.stringify(q)).join("\n") + "\n",
  );
  const out = await mergeNext(repo, dir, config);
  assert.equal(out.skipped_due_to_deps, false);
  // branch does not exist here → merge attempt fails, but it was picked
  assert.equal(out.merged?.status, "failed");
});

test("merge queue treats a failed dependency as non-blocking (no wedge)", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["works"]);
  setGoalStatus(dir, "active");
  const { taskId: taskA } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/a/**"],
  });
  addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-b",
    writePaths: ["src/b/**"],
  });
  const chunksPath = path.join(dir, "chunks.yaml");
  const data = YAML.parse(fs.readFileSync(chunksPath, "utf8")) as {
    chunks: Array<{ id: string; depends_on: string[] }>;
  };
  data.chunks.find((c) => c.id === "chunk-a")!.depends_on = ["chunk-b"];
  writeAtomic(chunksPath, YAML.stringify(data));

  await enqueueMerge(dir, taskA, "release-eng");
  // dependency task-b failed → task-a must NOT wait forever
  const queue = readMergeQueue(dir);
  queue.push({
    id: "merge-b-failed",
    ts: new Date().toISOString(),
    task_id: "task-chunk-b",
    from: "release-eng",
    status: "failed",
    merged_at: null,
    error: "conflict",
  });
  writeAtomic(
    path.join(dir, "merge_queue.jsonl"),
    queue.map((q) => JSON.stringify(q)).join("\n") + "\n",
  );
  const out = await mergeNext(repo, dir, config);
  assert.equal(out.skipped_due_to_deps, false);
  // picked (branch missing → fails), not wedged
  assert.equal(out.merged?.status, "failed");
});

test("merge queue detects a dependency cycle among queued tasks", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["works"]);
  setGoalStatus(dir, "active");
  const { taskId: taskA } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/a/**"],
  });
  const { taskId: taskB } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-b",
    writePaths: ["src/b/**"],
  });
  const chunksPath = path.join(dir, "chunks.yaml");
  const data = YAML.parse(fs.readFileSync(chunksPath, "utf8")) as {
    chunks: Array<{ id: string; depends_on: string[] }>;
  };
  data.chunks.find((c) => c.id === "chunk-a")!.depends_on = ["chunk-b"];
  data.chunks.find((c) => c.id === "chunk-b")!.depends_on = ["chunk-a"];
  writeAtomic(chunksPath, YAML.stringify(data));
  await enqueueMerge(dir, taskA, "release-eng");
  await enqueueMerge(dir, taskB, "release-eng");
  await assert.rejects(() => mergeNext(repo, dir, config), /dependency cycle/);
});

test("failed merge aborts and leaves the working tree clean (11 stage 7)", async () => {
  const { repo, dir, config, taskId, worktree } = await setupPreparedTask();
  // second task touching the same file to force a conflict — its branch is
  // created directly on main (no need for a full brief/staffing pipeline here)
  const { taskId: taskB } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-conflict",
    writePaths: ["src/module-a/**"],
  });
  const branchB = config.git.branch_template
    .replace("{run_id}", path.basename(dir))
    .replace("{task_id}", taskB);
  commitOnWorktree(worktree, "src/module-a/a.ts", "export const a = 1;\n", "feat: a");
  await enqueueMerge(dir, taskId, "release-eng");
  const sessions = new SessionStore(dir);
  for (const s of [`squad-lead@${taskId}`, `engineer@${taskId}`, `sdet@${taskId}`]) {
    await sessions.sleep(s, "handoff");
  }
  const first = await mergeNext(repo, dir, config);
  assert.equal(first.merged?.status, "merged");

  // conflicting change on the same file from the second branch
  execFileSync("git", ["checkout", "-b", branchB], { cwd: repo, stdio: "pipe" });
  fs.writeFileSync(path.join(repo, "src", "module-a", "a.ts"), "export const b = 2;\n");
  execFileSync("git", ["add", "."], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["commit", "-qm", "feat: b"], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["checkout", config.git.base_branch], { cwd: repo, stdio: "pipe" });
  await enqueueMerge(dir, taskB, "release-eng");
  // taskB never went through prepareTask → no squad sessions exist, so the
  // awake check passes trivially and the conflicting merge is attempted
  const fail = await mergeNext(repo, dir, config);
  assert.equal(fail.merged?.status, "failed");
  // working tree restored: no in-progress merge, no uncommitted changes,
  // HEAD back on the base branch (11 stage 7 abort)
  let mergeHead = "present";
  try {
    execFileSync("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: repo, stdio: "pipe" });
  } catch {
    mergeHead = "absent";
  }
  assert.equal(mergeHead, "absent");
  const diff = execFileSync("git", ["diff", "--quiet"], { cwd: repo, encoding: "utf8" });
  assert.equal(diff, "");
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(branch, config.git.base_branch);
});
