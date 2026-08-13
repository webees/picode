import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { statusSnapshot } from "./status.js";
import { SessionStore } from "./session-store.js";
import { TranscriptStore } from "./transcript-store.js";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-test-", email: "test@picode", name: "picode-test" });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

test("status snapshot reflects goal, sessions, tasks and merge queue", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["a", "b"]);
  setGoalStatus(dir, "active");
  addChunkAndTask(repo, dir, config, { chunkId: "chunk-a", writePaths: ["src/a/**"] });

  const s = statusSnapshot(dir, config);
  assert.equal(s.goal.status, "active");
  assert.equal(s.goal.scale, "S");
  assert.equal(s.goal.product_acceptance, 2);
  // init registered all platform roles (17) — no sponsor
  assert.equal(s.sessions.total, 17);
  assert.equal(s.sessions.awake.length, 0);
  // one task, latches missing
  assert.equal(s.tasks.length, 1);
  assert.equal(s.tasks[0].brief, "missing");
  assert.equal(s.tasks[0].staffing, "missing");
  assert.equal(s.merge_queue.queued, 0);
  assert.ok(Array.isArray(s.rooms));
});

test("R3-C3: status snapshot exposes continuation telemetry section", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-tel", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  const agentId = "engineer@task-tel";
  store.register("engineer", { agentId, initialState: "sleeping" });
  await store.wake(agentId, "test");
  await store.attachPiSession(agentId, "oc-ses_tel");
  await store.recordContinuation(agentId);
  const tx = new TranscriptStore(dir);
  await tx.recordOutgoing(agentId, "续跑 prompt");
  await tx.recordResponse(agentId, [{ type: "text", text: "ok" }]);

  const s = statusSnapshot(dir, config);
  assert.equal(
    s.continuation.max_per_session,
    config.self_evolve.continuation.max_per_session,
  );
  assert.equal(s.continuation.idle_sec, config.self_evolve.continuation.idle_sec);
  const row = s.continuation.sessions.find((x) => x.agent_id === agentId);
  assert.ok(row, "continuation.sessions must include the registered agent");
  assert.equal(row!.continuations_used, 1, "continuations_used after one feed");
  assert.ok(row!.last_continuation_at, "last_continuation_at from outgoing transcript ts");
  assert.equal(row!.in_flight, false, "last transcript incoming → not in-flight");
  assert.equal(row!.platform_seat, false, "task-bound agent is not a platform seat");
  // 平台席（无任务绑定）默认标记 platform_seat=true
  const pm = s.continuation.sessions.find((x) => x.agent_id === "pm");
  assert.ok(pm, "platform sessions registered by init appear in continuation.sessions");
  assert.equal(pm!.platform_seat, true);
});

test("R3-C3: in-flight = 末条转录为 outgoing（投喂后无响应）", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-inflight", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  const agentId = "engineer@task-inflight";
  store.register("engineer", { agentId, initialState: "sleeping" });
  await store.wake(agentId, "test");
  await store.attachPiSession(agentId, "oc-ses_if");
  await new TranscriptStore(dir).recordOutgoing(agentId, "续跑 prompt");

  const row = statusSnapshot(dir, config).continuation.sessions.find((x) => x.agent_id === agentId);
  assert.ok(row, "agent appears in continuation.sessions");
  assert.equal(row!.in_flight, true, "outgoing without response → in-flight");
  assert.ok(row!.last_continuation_at, "last feed ts recorded");
  assert.equal(row!.continuations_used, 0, "recordOutgoing alone does not bump budget");
});

test("C2: 平台席 row 反映 max_per_session_platform，task 席反映 max_per_session", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-cap", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.max_per_session_platform = 2;
  const store = new SessionStore(dir);
  store.register("engineer", { agentId: "engineer@task-cap", initialState: "sleeping" });
  void store.wake("engineer@task-cap", "test");
  void store.wake("scout", "test");

  const s = statusSnapshot(dir, config);
  assert.equal(s.continuation.max_per_session, 5, "顶层 max_per_session 为 task cap");
  assert.equal(
    s.continuation.max_per_session_platform,
    2,
    "顶层增 max_per_session_platform 字段（D078）",
  );
  const pm = s.continuation.sessions.find((x) => x.agent_id === "scout")!;
  assert.equal(pm.platform_seat, true);
  assert.equal(pm.max_per_session, 2, "平台席 row 反映 max_per_session_platform");
  const task = s.continuation.sessions.find((x) => x.agent_id === "engineer@task-cap")!;
  assert.equal(task.platform_seat, false);
  assert.equal(task.max_per_session, 5, "task 绑定 row 反映 max_per_session");
});
