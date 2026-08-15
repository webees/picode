import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { statusSnapshot, checkpointOverview } from "./status.js";
import { SessionStore } from "./session-store.js";
import { TranscriptStore } from "./transcript-store.js";
import { captureTaskCheckpoint, DEFAULT_CHECKPOINT_BOUNDARY } from "./checkpoint-store.js";

test("status snapshot reflects goal, sessions, tasks and merge queue", async () => {
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["a", "b"]);
  setGoalStatus(dir, "active");
  await addChunkAndTask(repo, dir, config, { chunkId: "chunk-a", writePaths: ["src/a/**"] });

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
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
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
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
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

test("C2: 平台席 row 反映 max_per_session_platform，task 席反映 max_per_session", async () => {
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
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

test("C1: status snapshot exposes per-task latest checkpoint overview segment", () => {
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
  const { runId } = createRun(repo, { title: "goal-cp", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["a"]);
  setGoalStatus(dir, "active");
  addChunkAndTask(repo, dir, config, { chunkId: "chunk-cp", writePaths: ["src/a/**"] });

  // 未捕获 → 空段
  const s0 = statusSnapshot(dir, config);
  assert.deepEqual(s0.checkpoint, [], "no checkpoints → empty segment");

  // 捕获一次 → 段反映 latest 概要（task_id/latest_at/boundary/sha256）
  const now = new Date("2026-08-14T00:00:00.000Z");
  const r = captureTaskCheckpoint(dir, "task-chunk-cp", { now });
  assert.ok(r, "capture must succeed");
  const s = statusSnapshot(dir, config);
  assert.equal(s.checkpoint.length, 1);
  const row = s.checkpoint[0];
  assert.equal(row.task_id, "task-chunk-cp");
  assert.equal(row.count, 1);
  assert.equal(row.latest_at, now.toISOString());
  assert.equal(row.boundary, DEFAULT_CHECKPOINT_BOUNDARY);
  assert.equal(row.sha256, r!.checkpoint.sha256);
});

test("C1: checkpointOverview derivation is the single source used by status segment", () => {
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
  const { runId } = createRun(repo, { title: "goal-cp2", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["a"]);
  setGoalStatus(dir, "active");
  addChunkAndTask(repo, dir, config, { chunkId: "chunk-cp2", writePaths: ["src/a/**"] });
  const now = new Date("2026-08-14T01:00:00.000Z");
  captureTaskCheckpoint(dir, "task-chunk-cp2", { now });

  assert.deepEqual(
    statusSnapshot(dir, config).checkpoint,
    checkpointOverview(dir),
    "statusSnapshot.checkpoint 与 checkpointOverview 同源（同一派生）",
  );
});
