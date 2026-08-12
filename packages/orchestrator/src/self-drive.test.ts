import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir } from "./run-store.js";
import { addChunkAndTask, approveBrief, draftBrief } from "./task.js";
import { SessionStore } from "./session-store.js";
import { appendSessionCommand } from "./rules-engine.js";
import {
  deriveEvents,
  guardianTick,
  runGuardian,
  sleepIdleSessions,
} from "./self-drive.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-selfdrive-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  return dir;
}

function setupRun() {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  return { repo, runId, dir, config, store };
}

function activateGoal(dir: string): void {
  const p = path.join(dir, "goal.yaml");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("status: intake", "status: active"));
}

/** Simulate a completed hire: register the task triad as sleeping. */
function registerTriad(store: SessionStore, taskId: string): void {
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    store.register(seat, { agentId: `${seat}@${taskId}`, initialState: "sleeping" });
  }
}

test("deriveEvents: fresh run with never-woken sessions fires run_created", async () => {
  const { dir, config } = setupRun();
  const events = deriveEvents(dir, config);
  assert.ok(events.some((e) => e.event === "run_created"));
});

test("deriveEvents: goal active + staffed queued task + approved brief fires task_ready", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");

  const events = deriveEvents(dir, config);
  const ready = events.filter((e) => e.event === "task_ready");
  assert.equal(ready.length, 1);
  assert.equal(ready[0].taskId, taskId);
});

test("deriveEvents: skips task_ready until the work brief is approved", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  // no approveBrief → guardian must hold back the squad

  const events = deriveEvents(dir, config);
  assert.ok(!events.some((e) => e.event === "task_ready" && e.taskId === taskId));
});

test("deriveEvents: no task_ready while a triad seat is already awake (idempotent self-next)", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await store.wake(`squad-lead@${taskId}`, "manual");

  const events = deriveEvents(dir, config);
  assert.ok(!events.some((e) => e.event === "task_ready" && e.taskId === taskId));
});

test("deriveEvents: completed goal dissolves any task still in flight", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  fs.writeFileSync(
    path.join(dir, "goal.yaml"),
    fs.readFileSync(path.join(dir, "goal.yaml"), "utf8").replace("status: active", "status: completed"),
  );

  const events = deriveEvents(dir, config);
  const dissolved = events.filter((e) => e.event === "task_dissolved");
  assert.equal(dissolved.length, 1);
  assert.equal(dissolved[0].taskId, taskId);
});

test("guardianTick: drains the sess-mgr command queue and applies derived events", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await appendSessionCommand(dir, "sess-mgr", {
    action: "wake",
    agent_id: "pm",
    reason: "guardian test",
  });

  const res = await guardianTick(dir, config);
  assert.equal(res.drained, 1);
  assert.equal(store.get("pm")!.state, "awake");
  assert.ok(res.events.some((e) => e.event === "task_ready"));
  assert.equal(store.get(`squad-lead@${taskId}`)!.state, "awake");
});

test("sleepIdleSessions: sleeps awake sessions idle beyond idle_sleep_sec", async () => {
  const { dir, config, store } = setupRun();
  await store.wake("pm", "test");
  // fake an old wake time
  const rec = store.get("pm")!;
  rec.last_wake_at = new Date(Date.now() - 3600_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", "pm.yaml"), YAML.stringify(rec));

  const slept = await sleepIdleSessions(dir, config);
  assert.deepEqual(slept, ["pm"]);
  assert.equal(store.get("pm")!.state, "sleeping");
});

test("runGuardian: bounded by max-ticks and stops on halt file", async () => {
  const { dir, config } = setupRun();
  const haltFile = path.join(dir, "guardian.test.halt");

  const bounded = await runGuardian(dir, config, { maxTicks: 2, intervalMs: 5 });
  assert.equal(bounded.ticks, 2);
  assert.equal(bounded.halted, false);
  assert.equal(bounded.ticksRun.length, 2);

  fs.writeFileSync(haltFile, "stop");
  const halted = await runGuardian(dir, config, { maxTicks: 10, intervalMs: 5, haltFile });
  assert.equal(halted.halted, true);
  assert.equal(halted.ticks, 0); // halt file checked before the first tick
});