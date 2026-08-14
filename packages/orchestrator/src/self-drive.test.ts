import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readYamlFile } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { addChunkAndTask, approveBrief, draftBrief } from "./task.js";
import { SessionStore } from "./session-store.js";
import { appendSessionCommand } from "./rules-engine.js";
import {
  checkBudgets,
  closeRun,
  deriveEvents,
  guardianTick,
  probeServeHealth,
  runGuardian,
  sleepIdleSessions,
  sleepPlatformSeats,
} from "./self-drive.js";
import { sweepContinuations } from "./continuation.js";
import { selfDriveCommands } from "./commands/self-drive.js";
import { listTaskCheckpoints } from "./checkpoint-store.js";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-selfdrive-" });
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

test("probeServeHealth: opencode 未启用时直接通过（ERR-01 watchdog）", async () => {
  const { dir, config } = setupRun();
  const r = await probeServeHealth(dir, config);
  assert.deepEqual(r, { ok: true, failed: [] });
});

/** opencode serve mock：base_url 探测受 state.down 控制，/message 返回 parts。 */
function mockServe(
  state: { down: boolean },
  calls: Array<{ url: string; method: string; body?: unknown }>,
  opts: { messageFailures?: number } = {},
) {
  const orig = globalThis.fetch;
  let msgAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (method === "POST" && url.includes("/message")) {
      msgAttempts++;
      if (msgAttempts <= (opts.messageFailures ?? 0)) {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return new Response(
        JSON.stringify({ info: {}, parts: [{ type: "text", text: "ack" }] }),
        { status: 200 },
      );
    }
    if (state.down) throw new Error("serve down");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

/** 造一个处于 error 的 awake opencode 会话（pm）。 */
async function errorAwakeOcSession(_dir: string, store: SessionStore, sesId: string) {
  await store.wake("pm", "test");
  await store.attachPiSession("pm", `oc-${sesId}`);
  await store.setError("pm", "serve 健康探测失败（ERR-01 watchdog）");
}

/** 统计 mock 捕获的 /message POST 调用。 */
function messagePosts(calls: Array<{ url: string; method: string; body?: unknown }>) {
  return calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
}

function enableOpencode(config: ReturnType<typeof resolveRunDir>["config"]): void {
  config.opencode.enabled = true;
  config.opencode.base_url = "http://127.0.0.1:7788";
  config.opencode.provider_id = "opencode-go";
  config.opencode.model_id = "deepseek-v4-flash";
}

test("probeServeHealth: 失联→恢复→自动重投喂 ready 并清 error（P1）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  await errorAwakeOcSession(dir, store, "ses_serve1");
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: true };
  const restore = mockServe(state, calls);
  try {
    const down = await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    assert.equal(down.ok, false);
    assert.deepEqual(down.failed, ["pm"]);
    assert.match(store.get("pm")!.error ?? "", /健康探测失败/);

    state.down = false;
    const up = await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    assert.equal(up.ok, true);
    assert.deepEqual(up.failed, []);
    assert.equal(store.get("pm")!.error, null, "恢复成功后必须清 error");

    const posts = calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
    assert.equal(posts.length, 1, "恢复只投喂一次");
    assert.equal(posts[0].url, "http://127.0.0.1:7788/session/ses_serve1/message");
    const msg = posts[0].body as { noReply: boolean; parts: Array<{ type: string; text: string }> };
    assert.equal(msg.noReply, true, "重投喂必须复用 D061 noReply 语义");
    assert.ok(msg.parts.length >= 1);
    assert.ok(store.get("pm")!.pi_session_id, "pi_session_id 不变（原地恢复，非重 spawn）");
  } finally {
    restore();
  }
});

test("probeServeHealth: 恢复会写转录归档（投喂文本 + 响应 parts，P4）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  await errorAwakeOcSession(dir, store, "ses_serve2");
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    const file = path.join(dir, "transcripts", "pm.jsonl");
    assert.ok(fs.existsSync(file), "恢复投喂必须写入转录");
    const entries = fs
      .readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { type: string });
    const types = entries.map((e) => e.type).sort();
    assert.deepEqual(types, ["incoming", "outgoing"]);
  } finally {
    restore();
  }
});

test("probeServeHealth: 恢复失败退避耗尽后保持 error（最多 3 次）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  await errorAwakeOcSession(dir, store, "ses_serve3");
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls, { messageFailures: Number.MAX_SAFE_INTEGER });
  try {
    const r = await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.failed, ["pm"], "恢复失败保持 error");
    assert.match(store.get("pm")!.error ?? "", /健康探测失败/);
    const posts = calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
    assert.equal(posts.length, 3, "退避重试最多 3 次");
  } finally {
    restore();
  }
});

test("probeServeHealth: 风暴限流 —— 每会话最多 1 次自动恢复（P1）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  await errorAwakeOcSession(dir, store, "ses_serve4");
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    const first = await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    assert.deepEqual(first.failed, []);
    assert.equal(store.get("pm")!.error, null);
    const postsAfterFirst = calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
    assert.equal(postsAfterFirst.length, 1);

    // 再次进入 error：已恢复过 1 次，必须保持 error，不重投喂
    await store.setError("pm", "serve 健康探测失败（ERR-01 watchdog）");
    const second = await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    assert.equal(second.ok, true);
    assert.deepEqual(second.failed, ["pm"], "超出 1 次自动恢复 → 保持 error");
    assert.match(store.get("pm")!.error ?? "", /健康探测失败/);
    const postsAfterSecond = calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
    assert.equal(postsAfterSecond.length, 1, "不得重投喂");
  } finally {
    restore();
  }
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

test("sleepPlatformSeats: sleeps only awake platform seats (no task binding), idempotent", async () => {
  const { dir, config, store } = setupRun();
  // platform seat (no @task- binding) — awake
  await store.wake("pm", "test");
  // task-bound seat — must be left alone
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");

  const slept = await sleepPlatformSeats(dir, config);
  assert.deepEqual(slept, ["pm"]);
  assert.equal(store.get("pm")!.state, "sleeping");
  assert.equal(store.get("engineer@task-x")!.state, "awake", "task 席不在此列");

  // idempotent: second pass sleeps nothing new
  const again = await sleepPlatformSeats(dir, config);
  assert.deepEqual(again, []);
});

test("closeRun: 终态 goal 补发 TASK_DISSOLVED + 休眠平台席（best-effort，幂等）", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  await store.wake(`squad-lead@${taskId}`, "test");
  await store.wake("pm", "test");
  fs.writeFileSync(
    path.join(dir, "goal.yaml"),
    fs.readFileSync(path.join(dir, "goal.yaml"), "utf8").replace("status: active", "status: completed"),
  );

  const r = await closeRun(dir, config);
  assert.deepEqual(r.dissolved, [taskId]);
  assert.deepEqual(r.slept_platform, ["pm"]);
  assert.equal(store.get("pm")!.state, "sleeping");
  // TASK_DISSOLVED → terminate_squad: awake triad seat must be terminated
  assert.equal(store.get(`squad-lead@${taskId}`)!.state, "terminated");

  // idempotent: 任务已 dissolved 的再次 closeRun 不再重复 terminate
  const again = await closeRun(dir, config);
  assert.deepEqual(again.slept_platform, []);
});

test("guardianTick: 终态 goal 后休眠平台席并回报 slept_platform", async () => {
  const { dir, config, store } = setupRun();
  await store.wake("pm", "test");
  fs.writeFileSync(
    path.join(dir, "goal.yaml"),
    fs.readFileSync(path.join(dir, "goal.yaml"), "utf8").replace("status: intake", "status: completed"),
  );

  const res = await guardianTick(dir, config);
  assert.deepEqual(res.slept_platform, ["pm"]);
  assert.equal(store.get("pm")!.state, "sleeping");
});

test("guardianTick: 非终态 goal 不休眠平台席", async () => {
  const { dir, config, store } = setupRun();
  await store.wake("pm", "test");

  const res = await guardianTick(dir, config);
  assert.deepEqual(res.slept_platform, []);
  assert.equal(store.get("pm")!.state, "awake");
});

test("checkBudgets: default config does not stop a normal session (默认不触发)", async () => {
  const { dir, config, store } = setupRun();
  await store.wake("pm", "test");
  const r = await checkBudgets(dir, config);
  assert.deepEqual(r, { stopped: [], exceeded: [], gate_commands: [] });
  const rec = store.get("pm")!;
  assert.equal(rec.state, "awake");
  assert.equal(rec.error, null);
});

test("checkBudgets: over-limit session is stopped — setError + sleep (超限停靠)", async () => {
  const { dir, config, store } = setupRun();
  config.self_evolve.budgets.maxTurns = 2;
  await store.wake("pm", "turn-1");
  await store.sleep("pm", "turn-1");
  await store.wake("pm", "turn-2"); // second wake-turn reaches the cap

  const r = await checkBudgets(dir, config);
  assert.deepEqual(r.stopped, ["pm"]);
  assert.equal(r.exceeded.length, 1);
  assert.equal(r.exceeded[0].field, "maxTurns");
  assert.equal(r.exceeded[0].limit, 2);
  assert.equal(r.exceeded[0].used, 2);

  const rec = store.get("pm")!;
  assert.equal(rec.state, "sleeping", "超限会话必须停靠");
  assert.equal(rec.budget?.turns, 2);
  assert.match(rec.error ?? "", /budget exceeded \(maxTurns: 2\/2\)/);
});

test("checkBudgets: timeoutMs stops a long-awake session and surfaces gate_commands", async () => {
  const { dir, config, store } = setupRun();
  config.self_evolve.budgets.timeoutMs = 1000;
  config.self_evolve.budgets.gate_commands = ["npm test", "npm run build"];
  await store.wake("pm", "test");
  const rec = store.get("pm")!;
  rec.last_wake_at = new Date(Date.now() - 3600_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", "pm.yaml"), YAML.stringify(rec));

  const r = await checkBudgets(dir, config);
  assert.deepEqual(r.stopped, ["pm"]);
  assert.equal(r.exceeded[0].field, "timeoutMs");
  assert.deepEqual(r.gate_commands, ["npm test", "npm run build"], "gate_commands 配置原样透出");
  const stopped = store.get("pm")!;
  assert.equal(stopped.state, "sleeping");
  assert.match(stopped.error ?? "", /budget exceeded \(timeoutMs/);
});

test("guardianTick: stops an over-budget awake session in the same pass", async () => {
  const { dir, config, store } = setupRun();
  config.self_evolve.budgets.maxTurns = 1;
  await store.wake("pm", "test");

  const res = await guardianTick(dir, config);
  assert.deepEqual(res.budgets.stopped, ["pm"]);
  assert.equal(store.get("pm")!.state, "sleeping");
  assert.match(store.get("pm")!.error ?? "", /budget exceeded/);
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

test("guardianTick: feeds a continuation to an idle awake oc- session (C1)", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  // loadConfig 的嵌套对象与 DEFAULTS 共享引用，先前测试可能改过 budgets；
  // 克隆隔离 + 显式清零预算，确保本测试只验证续跑 sweep。
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.budgets = { maxTurns: 0, maxTokens: 0, timeoutMs: 0, gate_commands: [] };
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_g1");
  const rec = store.get("engineer@task-x")!;
  rec.last_wake_at = new Date(Date.now() - 120_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec));

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    const res = await guardianTick(dir, config);
    assert.deepEqual(res.continuation.fed, ["engineer@task-x"]);
    const posts = calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
    assert.equal(posts.length, 1);
    const msg = posts[0].body as { noReply: boolean; parts: Array<{ type: string; text: string }> };
    assert.equal(msg.noReply, true);
    assert.ok(msg.parts.some((p) => p.text.includes("继续推进")));
    assert.equal(store.get("engineer@task-x")!.budget?.continuations, 1);
  } finally {
    restore();
  }
});

test("guardianTick: opencode 未启用时 continuation 恒空（无 oc- 会话）", async () => {
  const { dir, config } = setupRun();
  const res = await guardianTick(dir, config);
  assert.deepEqual(res.continuation.fed, []);
});

// ---------------------------------------------------------------------------
// R3-C2（chunk-continuation-gate）：guardianTick 接线——checkBudgets 之后、
// 续跑 sweep 之前跑 gate；gate 启用时「通过 → 停靠不投喂」「失败/快照未变 →
// 本轮不投喂但保留候选」。默认关闭不改变 C1 行为（回归）。
// ---------------------------------------------------------------------------

/** 配置 continuation.gate_commands（类型字段由 C1 声明，此处按缺省 cast）。 */
function setGateCommands(config: ReturnType<typeof resolveRunDir>["config"], cmds: string[]): void {
  (config.self_evolve.continuation as unknown as { gate_commands: string[] }).gate_commands = cmds;
}

test("R3-C2: guardianTick 默认 gate 关闭 → 正常投喂（回归，continuation.fed 结构不变）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.budgets = { maxTurns: 0, maxTokens: 0, timeoutMs: 0, gate_commands: [] };
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_gate_tick_off");
  const rec = store.get("engineer@task-x")!;
  rec.last_wake_at = new Date(Date.now() - 120_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec));

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    const res = await guardianTick(dir, config);
    assert.deepEqual(res.continuation.fed, ["engineer@task-x"]);
    assert.equal(res.continuation.gate[0].reason, "disabled", "gate 未启用 → 标记 disabled");
    assert.equal(messagePosts(calls).length, 1);
  } finally {
    restore();
  }
});

test("R3-C2: guardianTick gate 通过 → 该会话本轮不投喂（停靠语义）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.budgets = { maxTurns: 0, maxTokens: 0, timeoutMs: 0, gate_commands: [] };
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  setGateCommands(config, ["true"]);
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_gate_tick_pass");
  const rec = store.get("engineer@task-x")!;
  rec.last_wake_at = new Date(Date.now() - 120_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec));

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    const res = await guardianTick(dir, config);
    assert.deepEqual(res.continuation.fed, [], "gate 通过 → 本轮不投喂");
    assert.equal(res.continuation.gate[0].reason, "gate_passed");
    assert.equal(messagePosts(calls).length, 0);
  } finally {
    restore();
  }
});

test("R3-C2: guardianTick gate 失败 → 不投喂（保留候选），下轮快照未变不重跑", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.budgets = { maxTurns: 0, maxTokens: 0, timeoutMs: 0, gate_commands: [] };
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  setGateCommands(config, ["false"]);
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_gate_tick_fail");
  const rec = store.get("engineer@task-x")!;
  rec.last_wake_at = new Date(Date.now() - 120_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec));

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    const first = await guardianTick(dir, config);
    assert.deepEqual(first.continuation.fed, []);
    assert.equal(first.continuation.gate[0].reason, "gate_failed");

    const second = await guardianTick(dir, config);
    assert.deepEqual(second.continuation.fed, []);
    assert.equal(second.continuation.gate[0].reason, "snapshot_unchanged", "快照未变 → 不重跑");
    assert.equal(messagePosts(calls).length, 0, "全程不投喂");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// C2-b：会话 error（serve 失联）→ P1 恢复重投喂 ready + 清 error → 续跑计数
// 保持（不重置）、sweep 从持久化计数续发且不超 max_per_session（N3）
// ---------------------------------------------------------------------------

test("C2-b: error 会话经 P1 恢复后续跑计数保持、sweep 续发且不超 max_per_session", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.budgets = { maxTurns: 0, maxTokens: 0, timeoutMs: 0, gate_commands: [] };
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;

  // awake oc- 会话，空闲 120s；持久化续跑计数已用 4 次（serve 失联前的真实值）
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_c2b");
  const YAML = (await import("yaml")).default;
  const rec = store.get("engineer@task-x")!;
  rec.budget = { turns: 1, continuations: 4 };
  rec.last_wake_at = new Date(Date.now() - 120_000).toISOString();
  fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec));
  await store.setError("engineer@task-x", "serve 健康探测失败（ERR-01 watchdog）");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const state = { down: false };
  const restore = mockServe(state, calls);
  try {
    // P1 恢复：重投喂 ready + 清 error（恢复本身不计数、不重置计数）
    const r = await probeServeHealth(dir, config, { recoveryBackoffMs: [0, 0, 0] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.failed, []);
    assert.equal(store.get("engineer@task-x")!.error, null, "恢复成功必须清 error");
    assert.equal(
      store.get("engineer@task-x")!.budget?.continuations,
      4,
      "恢复不得重置续跑计数（N3 持久化）",
    );

    // 恢复重投喂已写转录（idle 时钟被重置）；回拨 idle：删转录 + 回拨 last_wake_at
    const txPath = path.join(dir, "transcripts", "engineer@task-x.jsonl");
    if (fs.existsSync(txPath)) fs.rmSync(txPath);
    const rec2 = store.get("engineer@task-x")!;
    rec2.last_wake_at = new Date(Date.now() - 120_000).toISOString();
    fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec2));

    // 续跑 sweep：从持久化计数（4）续发 → 5（恰达上限，不超发）
    const postsBefore = messagePosts(calls);
    const sweep = await sweepContinuations(dir, config);
    assert.deepEqual(sweep.fed, ["engineer@task-x"], "恢复后 sweep 必须续发该会话");
    assert.equal(messagePosts(calls).length - postsBefore.length, 1, "本轮恰好投喂一次");
    assert.equal(
      store.get("engineer@task-x")!.budget?.continuations,
      5,
      "计数从持久化值续发：4+1=5（不重置为 1）",
    );

    // 再 sweep：预算耗尽（5 >= max_per_session）不得投喂、不得超发
    const next = await sweepContinuations(dir, config);
    assert.deepEqual(next.fed, []);
    assert.equal(store.get("engineer@task-x")!.budget?.continuations, 5, "永不超 max_per_session");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// C2-d：`self-drive continuation` 命令表面 —— 已注册，且 --status 只读派生候选
// （不投喂不写计数）。完整 CLI 冒烟在 commands/self-drive.test.ts（含真实
// subprocess + 独立 serve mock）。
// ---------------------------------------------------------------------------

test("C2-d: self-drive continuation 命令已注册且 --status 只读派生候选", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.budgets = { maxTurns: 0, maxTokens: 0, timeoutMs: 0, gate_commands: [] };
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_c2d_reg");
  const YAML = (await import("yaml")).default;
  const rec = store.get("engineer@task-x")!;
  rec.last_wake_at = new Date(Date.now() - 120_000).toISOString();
  fs.writeFileSync(path.join(dir, "sessions", "engineer@task-x.yaml"), YAML.stringify(rec));

  const cmd = selfDriveCommands.find((c) => c.path.join(" ") === "self-drive continuation");
  assert.ok(cmd, "self-drive continuation 子命令必须注册");

  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  try {
    await cmd!.run({
      args: ["self-drive", "continuation", "--status"],
      has: () => false,
      arg: () => undefined,
      dir,
      config,
    } as never);
  } finally {
    console.log = orig;
  }
  assert.equal(logs.length, 1);
  const out = JSON.parse(logs[0]) as { count: number; targets: Array<{ agent_id: string }> };
  assert.equal(out.count, 1);
  assert.deepEqual(out.targets, [{ agent_id: "engineer@task-x", session_id: "oc-ses_c2d_reg" }]);
  assert.equal(store.get("engineer@task-x")!.budget?.continuations ?? 0, 0, "--status 不写计数");
});

// ---------------------------------------------------------------------------
// R2-C3（chunk-guardian-reload-signal）：guardian 代码更新检测 —— 启动记录 base
// HEAD，tick 对比 git rev-parse HEAD，main HEAD 前移（合并落地）即置 detected 并
// console.warn 一次（不退出、不热载；重启规程见 operations.md）。
// ---------------------------------------------------------------------------

/** 在 repo 里追加提交并返回新 HEAD；用于模拟 main HEAD 前移。 */
function commitAndHead(repo: string, file: string, content: string): string {
  fs.writeFileSync(path.join(repo, file), content, "utf8");
  execFileSync("git", ["add", file], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["commit", "-qm", `test: ${file}`], { cwd: repo, stdio: "pipe" });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}

test("R2-C3: 初始 tick code_updated === null（base = 当前 HEAD，代码未变）", async () => {
  const repo = tmpGitRepo();
  const base = commitAndHead(repo, "a.txt", "v1");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);

  const res = await guardianTick(dir, config, { baseSha: base });
  assert.equal(res.code_updated, null, "代码未变必须为 null");
});

test("R2-C3: main HEAD 前移（新 commit）后 tick detected === true 且 base/head SHA 正确", async () => {
  const repo = tmpGitRepo();
  const base = commitAndHead(repo, "a.txt", "v1");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const head = commitAndHead(repo, "b.txt", "v2");
  assert.notEqual(head, base, "前置：HEAD 必须前移");

  const res = await guardianTick(dir, config, { baseSha: base });
  assert.ok(res.code_updated, "HEAD 前移必须被检测");
  assert.equal(res.code_updated!.detected, true);
  assert.equal(res.code_updated!.base_sha, base);
  assert.equal(res.code_updated!.head_sha, head);
});

test("R2-C3: 代码未变则保持 null（幂等，base=当前 HEAD）", async () => {
  const repo = tmpGitRepo();
  const head = commitAndHead(repo, "a.txt", "v1");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);

  const first = await guardianTick(dir, config, { baseSha: head });
  assert.equal(first.code_updated, null);
  const second = await guardianTick(dir, config, { baseSha: head });
  assert.equal(second.code_updated, null, "反复 tick 保持 null（幂等）");
});

test("R2-C3: runGuardian 启动记录 base HEAD，HEAD 前移后 warn 一次且不退出", async () => {
  const repo = tmpGitRepo();
  const base = commitAndHead(repo, "a.txt", "v1");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const head = commitAndHead(repo, "b.txt", "v2");

  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => warns.push(a.map(String).join(" "));
  try {
    const summary = await runGuardian(dir, config, {
      maxTicks: 2,
      intervalMs: 5,
      baseSha: base,
    });
    assert.equal(summary.ticks, 2, "不退出：maxTicks 跑满");
    assert.equal(summary.halted, false);
    assert.equal(warns.length, 1, "HEAD 前移只 warn 一次");
    assert.match(warns[0] ?? "", /检测到仓库 HEAD 前移/);
    assert.ok(
      summary.ticksRun.every((t) => t.code_updated?.detected === true),
      "每个 tick 都置 detected（持续观测）",
    );
    assert.ok(
      summary.ticksRun.every((t) => t.code_updated!.head_sha === head),
      "head_sha 与当前 HEAD 一致",
    );
  } finally {
    console.warn = orig;
  }
});

test("R2-C3: runGuardian 未提供 baseSha 时启动即记录当前 HEAD（初始 tick 为 null）", async () => {
  const repo = tmpGitRepo();
  commitAndHead(repo, "a.txt", "v1");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);

  const summary = await runGuardian(dir, config, { maxTicks: 1, intervalMs: 5 });
  assert.equal(summary.ticks, 1);
  assert.equal(summary.ticksRun[0].code_updated, null, "启动即记录 base = 当前 HEAD");
});

// ---------------------------------------------------------------------------
// C1 checkpoint-auto（task-checkpoint-auto）：guardianTick 接线
// ---------------------------------------------------------------------------

test("C1 checkpoint-auto: guardianTick 默认（checkpoints 关闭）→ checkpoints 恒空（回归）", async () => {
  const { dir, config } = setupRun();
  const res = await guardianTick(dir, config);
  assert.deepEqual(res.checkpoints, { boundary: "guardian", captured: [] });
});

test("C1 checkpoint-auto: enabled + interval=0 → guardianTick 捕获已登记非终态 task；只写不读、不驱动决策", async () => {
  const { repo, dir, config, store } = setupRun();
  activateGoal(dir);
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  registerTriad(store, taskId);
  config.self_evolve = structuredClone(config.self_evolve);
  config.self_evolve.checkpoints.enabled = true;
  config.self_evolve.checkpoints.guardian_interval_sec = 0;

  const res = await guardianTick(dir, config);
  assert.deepEqual(res.checkpoints.boundary, "guardian");
  assert.ok(res.checkpoints.captured.includes(taskId));

  // 只写观测文件：checkpoint 落盘到 checkpoints/<taskId>/
  const cps = listTaskCheckpoints(dir, taskId);
  assert.equal(cps.length, 1, "guardian tick 必须捕获一次");
  assert.equal(cps[0].boundary, "guardian");

  // 不驱动任何状态决策：task 仍 queued、三角会话仍 sleeping、无 task_ready
  const task = readYamlFile<{ status?: string }>(path.join(dir, "tasks", taskId, "task.yaml"));
  assert.equal(task?.status, "queued", "捕获不得改变 task 状态（只写观测文件）");
  assert.equal(store.get(`squad-lead@${taskId}`)?.state, "sleeping", "捕获不得唤醒会话");
  assert.equal(store.get(`engineer@${taskId}`)?.state, "sleeping");
  assert.equal(store.get(`sdet@${taskId}`)?.state, "sleeping");
  assert.ok(
    !res.events.some((e) => e.event === "task_ready"),
    "捕获不得驱动 task_ready 事件（checkpoint 不参与状态决策）",
  );
});
