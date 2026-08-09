import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { SessionStore } from "./session-store.js";
import {
  applyEvent,
  appendSessionCommand,
  drainSessionCommands,
} from "./rules-engine.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

function setupRun(opts: { scale?: "S" | "M" | "L"; maxAwake?: number } = {}) {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: opts.scale ?? "S" });
  const { dir } = resolveRunDir(repo, runId);
  if (opts.maxAwake !== undefined) {
    fs.writeFileSync(
      path.join(dir, "config.override.yaml"),
      `sess_mgr:\n  max_awake: ${opts.maxAwake}\n`,
    );
    const config = loadConfig(repo, runId);
    return { repo, runId, dir, config, store: new SessionStore(dir) };
  }
  const { config } = resolveRunDir(repo, runId);
  return { repo, runId, dir, config, store: new SessionStore(dir) };
}

function activateGoal(dir: string): void {
  const p = path.join(dir, "goal.yaml");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("status: intake", "status: active"));
}

/** Simulate a completed hire: register the task triad as sleeping (staffing stage D). */
function registerTriad(store: SessionStore, taskId: string): void {
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    store.register(seat, { agentId: `${seat}@${taskId}`, initialState: "sleeping" });
  }
}

function awakeIds(store: SessionStore): string[] {
  return store.awake().map((s) => s.agent_id);
}

test("T23: intake_start wakes pm + run-lead (+ind-res when parallel_on_intake)", async () => {
  const { dir, config, store } = setupRun();
  assert.deepEqual(awakeIds(store), []);

  const res = await applyEvent(dir, config, "intake_start");
  const woke = res.actions.filter((a) => a.outcome === "ok").map((a) => a.agent_id).sort();
  assert.deepEqual(woke, ["ind-res", "pm", "run-lead"]);
  assert.deepEqual(awakeIds(store).sort(), ["ind-res", "pm", "run-lead"]);
});

test("run_created wakes sess-mgr + run-lead + pm (17 §5.3)", async () => {
  const { dir, config, store } = setupRun();
  await applyEvent(dir, config, "run_created");
  assert.deepEqual(awakeIds(store).sort(), ["pm", "run-lead", "sess-mgr"]);
});

test("rule events are idempotent (re-apply is safe)", async () => {
  const { dir, config, store } = setupRun();
  await applyEvent(dir, config, "intake_start");
  await applyEvent(dir, config, "intake_start");
  assert.equal(store.awake().length, 3);
  // already-awake agents are skipped, not rejected
  const res = await applyEvent(dir, config, "intake_start");
  assert.ok(res.actions.every((a) => a.outcome === "skipped"));
});

test("task_ready wakes the task triad; task_dissolved terminates it (T27 basis)", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);

  await applyEvent(dir, config, "task_ready", { taskId });
  const triad = store.get("squad-lead@task-chunk-a");
  assert.ok(triad);
  assert.equal(triad.state, "awake");
  assert.equal(store.get("engineer@task-chunk-a")!.state, "awake");
  assert.equal(store.get("sdet@task-chunk-a")!.state, "awake");

  await applyEvent(dir, config, "task_dissolved", { taskId });
  assert.equal(store.get("squad-lead@task-chunk-a")!.state, "terminated");
  assert.equal(store.get("engineer@task-chunk-a")!.state, "terminated");
  assert.equal(store.get("sdet@task-chunk-a")!.state, "terminated");
});

test("DoD: max_awake=2 never leaves 3 awake implementation seats", async () => {
  const { repo, dir, config, store } = setupRun({ maxAwake: 2 });
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);

  const res = await applyEvent(dir, config, "task_ready", { taskId });
  const rejected = res.actions.filter((a) => a.outcome === "rejected");
  assert.ok(
    rejected.length >= 1,
    `expected at least one rejected wake, got ${JSON.stringify(res.actions)}`,
  );
  const awake = store.awake().length;
  assert.ok(awake <= 2, `awake=${awake} exceeds max_awake=2`);
});

test("unknown event is rejected (table-driven, no LLM fallback in L0)", async () => {
  const { dir, config } = setupRun();
  const res = await applyEvent(dir, config, "no_such_event");
  assert.equal(res.rejected, true);
  assert.deepEqual(res.actions, []);
});

test("session command queue: sess-mgr wake command is drained by orchestrator", async () => {
  const { dir, config, store } = setupRun();
  const cmd = await appendSessionCommand(dir, "sess-mgr", {
    action: "wake",
    agent_id: "pm",
    reason: "intake needs pm",
  });
  assert.ok(cmd.id.startsWith("cmd-"));

  // non-sess-mgr cannot enqueue
  await assert.rejects(
    () => appendSessionCommand(dir, "run-lead", { action: "wake", agent_id: "pm", reason: "x" }),
    /non-sess-mgr/,
  );

  const drain = await drainSessionCommands(dir, config);
  assert.equal(drain.processed, 1);
  assert.equal(drain.results[0].outcome, "ok");
  assert.equal(store.get("pm")!.state, "awake");

  // re-drain is idempotent-safe (already awake → skipped)
  const drain2 = await drainSessionCommands(dir, config);
  assert.equal(drain2.results[0].outcome, "skipped");
});

test("drain respects max_awake unless force", async () => {
  const { dir, config, store } = setupRun({ maxAwake: 1 });
  await appendSessionCommand(dir, "sess-mgr", { action: "wake", agent_id: "pm", reason: "a" });
  await appendSessionCommand(dir, "sess-mgr", { action: "wake", agent_id: "run-lead", reason: "b" });
  await appendSessionCommand(dir, "sess-mgr", {
    action: "wake",
    agent_id: "ind-res",
    reason: "c",
    force: true,
  });
  const drain = await drainSessionCommands(dir, config);
  const outcomes = Object.fromEntries(drain.results.map((r) => [r.agent_id, r.outcome]));
  assert.equal(outcomes["pm"], "ok");
  assert.match(outcomes["run-lead"], /max_awake/);
  assert.equal(outcomes["ind-res"], "ok"); // force bypass
  assert.ok(store.awake().length <= 2);
});
