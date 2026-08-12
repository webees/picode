import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRun, resolveRunDir } from "./run-store.js";
import { addChunkAndTask, approveBrief, draftBrief } from "./task.js";
import { SessionStore } from "./session-store.js";
import { appendSessionCommand } from "./rules-engine.js";
import {
  deriveEvents,
  guardianTick,
  probeServeHealth,
  runGuardian,
  sleepIdleSessions,
} from "./self-drive.js";

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