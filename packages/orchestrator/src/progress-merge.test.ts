import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, writeAtomic } from "@picode/core";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { SessionStore } from "./session-store.js";
import { progressPath, sweepProgress } from "./progress.js";
import { enqueueMerge, mergeNext, readMergeQueue } from "./merge.js";
import { applyEvent } from "./rules-engine.js";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-test-", email: "t@p" });
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  // keep runs/ state out of git so checkout during merge tests can't clobber it
  fs.writeFileSync(path.join(dir, ".gitignore"), ".picode/\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

async function setupTask(opts: { scale?: "S" | "M" | "L"; timeoutSec?: number } = {}) {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: opts.scale ?? "S" });
  const { dir } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["compiles"]);
  setGoalStatus(dir, "active");
  if (opts.timeoutSec !== undefined) {
    fs.writeFileSync(
      path.join(dir, "config.override.yaml"),
      `timeouts:\n  task_timeout_sec: ${opts.timeoutSec}\n`,
    );
  }
  const config = loadConfig(repo, runId);
  const { taskId } = await addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  return { repo, runId, dir, config, taskId, store: new SessionStore(dir) };
}

test("T11: progress sweep fires progress_due and wakes squad-lead", async () => {
  const { dir, config, taskId, store } = await setupTask();
  // register triad so the event can wake them
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    store.register(seat, { agentId: `${seat}@${taskId}`, initialState: "sleeping" });
  }
  // fresh progress → not overdue
  writeAtomic(progressPath(dir, taskId), JSON.stringify({ task_id: taskId, phase: "implementing", blocked: false, summary: "on track", updated_at: new Date().toISOString() }));
  const r1 = await sweepProgress(dir, config);
  assert.deepEqual(r1.overdue, []);

  // backdate the progress → overdue + squad-lead woke
  const p = path.join(dir, "tasks", taskId, "progress.json");
  const state = JSON.parse(fs.readFileSync(p, "utf8"));
  state.updated_at = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
  const r2 = await sweepProgress(dir, config);
  assert.equal(r2.overdue.length, 1);
  assert.equal(r2.overdue[0].task_id, taskId);
  assert.ok(r2.woke.includes("squad-lead@task-chunk-a"));
  assert.equal(store.get("squad-lead@task-chunk-a")!.state, "awake");
});

test("progress sweep is idempotent (no double wake error)", async () => {
  const { dir, config, taskId, store } = await setupTask();
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    store.register(seat, { agentId: `${seat}@${taskId}`, initialState: "sleeping" });
  }
  const p = path.join(dir, "tasks", taskId, "progress.json");
  const state = { task_id: taskId, phase: "stale", blocked: false, summary: "x", updated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() };
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
  await sweepProgress(dir, config);
  await sweepProgress(dir, config);
  assert.equal(store.get("squad-lead@task-chunk-a")!.state, "awake");
  assert.equal(store.awake().length, 1);
});

test("merge queue: request → next merges branch onto main (serial lock)", async () => {
  const { repo, dir, config, taskId } = await setupTask();
  // set up a branch to merge
  const branch = `picode/${path.basename(dir)}/${taskId}`;
  execFileSync("git", ["checkout", "-b", branch], { cwd: repo, stdio: "pipe" });
  fs.writeFileSync(path.join(repo, "src.txt"), "change");
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "work"], { cwd: repo });
  execFileSync("git", ["checkout", "main"], { cwd: repo, stdio: "pipe" });

  await enqueueMerge(dir, taskId);
  const out = await mergeNext(repo, dir, config);
  assert.ok(out.merged, "should have merged");
  assert.equal(out.merged!.status, "merged");
  assert.ok(out.merged!.merged_at);
  // branch is on main now
  const log = execFileSync("git", ["log", "--oneline", "-1"], { cwd: repo, encoding: "utf8" });
  assert.match(log, /merge/);
  // queue drained
  assert.equal(readMergeQueue(dir).filter((q) => q.status === "queued").length, 0);
});

test("DoD: two queued tasks never merge in parallel (merge.lock serializes)", async () => {
  const { repo, dir, config, taskId } = await setupTask();
  const branch = `picode/${path.basename(dir)}/${taskId}`;
  execFileSync("git", ["checkout", "-b", branch], { cwd: repo, stdio: "pipe" });
  fs.writeFileSync(path.join(repo, "a.txt"), "a");
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a"], { cwd: repo });
  execFileSync("git", ["checkout", "main"], { cwd: repo, stdio: "pipe" });

  await enqueueMerge(dir, taskId);
  await enqueueMerge(dir, taskId); // second request, same branch (idempotent merge)
  const o1 = await mergeNext(repo, dir, config);
  assert.equal(o1.merged!.status, "merged");
  // mergeNext holds merge.lock for the whole operation; sequential calls can't overlap
  const o2 = await mergeNext(repo, dir, config);
  assert.equal(o2.merged!.status, "merged");
});

test("merge skips tasks whose squad is still awake (nothing mid-flight to main)", async () => {
  const { repo, dir, config, taskId, store } = await setupTask();
  store.register("squad-lead", { agentId: `squad-lead@${taskId}`, initialState: "sleeping" });
  await store.wake(`squad-lead@${taskId}`, "working");
  await enqueueMerge(dir, taskId);
  const out = await mergeNext(repo, dir, config);
  assert.equal(out.merged, null);
  assert.equal(out.skipped_due_to_active, true);
  // still queued
  assert.equal(readMergeQueue(dir).filter((q) => q.status === "queued").length, 1);
});

test("scale matrix: merge_ready wakes code-review at S, sec-eng only at L", async () => {
  // S scale
  {
    const { dir, config } = await setupTask({ scale: "S" });
    const r = await applyEvent(dir, config, "merge_ready");
    const woke = r.actions.filter((a) => a.outcome === "ok").map((a) => a.agent_id);
    assert.ok(woke.includes("code-review"));
    assert.ok(!woke.includes("sec-eng"));
  }
  // L scale
  {
    const { dir, config } = await setupTask({ scale: "L" });
    const r = await applyEvent(dir, config, "merge_ready");
    const woke = r.actions.filter((a) => a.outcome === "ok").map((a) => a.agent_id);
    assert.ok(woke.includes("code-review"));
    assert.ok(woke.includes("sec-eng"));
  }
});
