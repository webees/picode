import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readYamlFile, writeYamlFile } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import {
  deriveContinuationTargets,
  feedContinuation,
  sweepContinuations,
} from "./continuation.js";

function setupRun() {
  const repo = gitInit({ prefix: "picode-cont-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  // loadConfig 嵌套对象与 DEFAULTS 共享引用，克隆隔离 self_evolve，
  // 避免测试间的 budget/continuation 变更相互泄漏。
  config.self_evolve = structuredClone(config.self_evolve);
  const store = new SessionStore(dir);
  return { repo, runId, dir, config, store };
}

function enableOpencode(config: ReturnType<typeof resolveRunDir>["config"]): void {
  config.opencode.enabled = true;
  config.opencode.base_url = "http://127.0.0.1:7788";
  config.opencode.provider_id = "opencode-go";
  config.opencode.model_id = "deepseek-v4-flash";
}

/** 直改 session.yaml（backdate last_wake_at / 预置 budget 等）。 */
function patchSession(dir: string, agentId: string, patch: Record<string, unknown>): void {
  const p = path.join(dir, "sessions", `${agentId}.yaml`);
  const rec = readYamlFile<Record<string, unknown>>(p)!;
  writeYamlFile(p, { ...rec, ...patch });
}

/** 注册 + 唤醒 + 挂接 opencode 会话 + 回拨 last_wake_at。 */
async function idleAwakeOcSession(
  dir: string,
  store: SessionStore,
  agentId: string,
  sesId: string,
  idleMsAgo = 120_000,
): Promise<void> {
  store.register("engineer", { agentId, initialState: "sleeping" });
  await store.wake(agentId, "test");
  await store.attachPiSession(agentId, `oc-${sesId}`);
  patchSession(dir, agentId, { last_wake_at: new Date(Date.now() - idleMsAgo).toISOString() });
}

/** opencode serve mock：POST /message 返回 parts；messageFailures 模拟瞬时超时。 */
function mockServe(
  calls: Array<{ url: string; method: string; body?: unknown }>,
  opts: { messageFailures?: number } = {},
): () => void {
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
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

function messagePosts(calls: Array<{ url: string; method: string; body?: unknown }>) {
  return calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
}

// ---------------------------------------------------------------------------
// C1-b：空闲超 idle_sec 且预算未耗尽 → 恰好 POST 一次续跑消息
// ---------------------------------------------------------------------------

test("C1-b: awake oc- 会话空闲超 idle_sec 恰好投喂一次（noReply + 续跑指令 + 转录 + 计数）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont1");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, ["engineer@task-x"]);

    const posts = messagePosts(calls);
    assert.equal(posts.length, 1, "sweep 必须恰好 POST 一次");
    assert.equal(posts[0].url, "http://127.0.0.1:7788/session/ses_cont1/message");
    const msg = posts[0].body as {
      noReply: boolean;
      parts: Array<{ type: string; text: string }>;
    };
    assert.equal(msg.noReply, true, "续跑必须复用 D061 noReply 语义");
    assert.ok(
      msg.parts.some((p) => p.text.includes("继续推进")),
      "prompt 必须含续跑指令",
    );

    const rec = store.get("engineer@task-x")!;
    assert.equal(rec.budget?.continuations, 1, "budget.continuations 必须 +1 并持久化");

    const file = path.join(dir, "transcripts", "engineer@task-x.jsonl");
    assert.ok(fs.existsSync(file), "投喂必须写入转录归档");
    const entries = fs
      .readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { type: string; text?: string; parts?: unknown[] });
    assert.ok(
      entries.some((e) => e.type === "outgoing" && String(e.text).includes("继续推进")),
      "转录必须记录续跑投喂文本",
    );
  } finally {
    restore();
  }
});

test("C1-b: 空闲未达 idle_sec 不投喂（节流）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 300;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont2", 60_000); // 空闲 60s < 300s

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0);
  } finally {
    restore();
  }
});

test("C1-b: 投喂后紧接的 sweep 不重复投喂（转录重置 idle 时钟，幂等）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont3");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const first = await sweepContinuations(dir, config);
    assert.deepEqual(first.fed, ["engineer@task-x"]);
    const second = await sweepContinuations(dir, config);
    assert.deepEqual(second.fed, [], "转录已重置 idle 时钟，紧接的 sweep 不得重投");
    assert.equal(messagePosts(calls).length, 1);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// C1-c：预算耗尽 / error / sleeping / 非 oc- / 任务终态 → 永不投喂
// ---------------------------------------------------------------------------

test("C1-c: 续跑预算耗尽（continuations >= max_per_session）不再投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 2;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont4");
  patchSession(dir, "engineer@task-x", {
    budget: { turns: 1, continuations: 2 },
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0, "预算耗尽不得投喂");
    assert.equal(store.get("engineer@task-x")!.budget?.continuations, 2);
  } finally {
    restore();
  }
});

test("C1-c: error 会话永不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont5");
  await store.setError("engineer@task-x", "serve 健康探测失败（ERR-01 watchdog）");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0);
  } finally {
    restore();
  }
});

test("C1-c: sleeping 会话永不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  // 直写一个「sleeping 但残留 oc- 句柄」的记录，隔离验证状态门本身
  patchSession(dir, "engineer@task-x", {
    pi_session_id: "oc-ses_cont6",
    last_wake_at: new Date(Date.now() - 120_000).toISOString(),
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0);
  } finally {
    restore();
  }
});

test("C1-c: 非 oc-（pi 进程）会话永不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  store.register("pm", { agentId: "pi-agent", initialState: "sleeping" });
  await store.wake("pi-agent", "test");
  await store.attachPiSession("pi-agent", "pid-999");
  patchSession(dir, "pi-agent", { last_wake_at: new Date(Date.now() - 120_000).toISOString() });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0);
  } finally {
    restore();
  }
});

test("C1-c: 任务终态（dissolved）永不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont7");
  fs.mkdirSync(path.join(dir, "tasks", "task-x"), { recursive: true });
  writeYamlFile(path.join(dir, "tasks", "task-x", "task.yaml"), {
    id: "task-x",
    chunk_id: "chunk-x",
    goal_id: "goal-1",
    kind: "implement",
    status: "dissolved",
    write_paths: ["packages/**"],
    read_paths: [],
    acceptance: [],
    triad: {
      "squad-lead": "squad-lead@task-x",
      engineer: "engineer@task-x",
      sdet: "sdet@task-x",
    },
    work_room: "squad-task-x",
    retries: 0,
    max_retries: 3,
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0, "任务终态会话不得投喂");
  } finally {
    restore();
  }
});

test("R2-C1-c: 任务终态（merged）不再被选中且 sweep 不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont_merged");
  fs.mkdirSync(path.join(dir, "tasks", "task-x"), { recursive: true });
  writeYamlFile(path.join(dir, "tasks", "task-x", "task.yaml"), {
    id: "task-x",
    chunk_id: "chunk-x",
    goal_id: "goal-1",
    kind: "implement",
    status: "merged",
    write_paths: ["packages/**"],
    read_paths: [],
    acceptance: [],
    triad: {
      "squad-lead": "squad-lead@task-x",
      engineer: "engineer@task-x",
      sdet: "sdet@task-x",
    },
    work_room: "squad-task-x",
    retries: 0,
    max_retries: 3,
  });

  const targets = deriveContinuationTargets(dir, config, new Date());
  assert.deepEqual(targets, [], "merged 任务不得被选为续跑候选");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0, "merged 任务会话不得投喂");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// C1-d：纯函数（同输入同输出，无网络副作用）
// ---------------------------------------------------------------------------

test("C1-d: deriveContinuationTargets 纯函数 — 同输入同输出且不触碰网络", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont8");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const now = new Date();
    const a = deriveContinuationTargets(dir, config, now);
    const b = deriveContinuationTargets(dir, config, now);
    assert.deepEqual(a, b, "同输入必须同输出");
    assert.deepEqual(a, [{ agent_id: "engineer@task-x", session_id: "oc-ses_cont8" }]);
    assert.equal(calls.length, 0, "纯函数不得发起网络请求");

    const before = readYamlFile<Record<string, unknown>>(
      path.join(dir, "sessions", "engineer@task-x.yaml"),
    );
    deriveContinuationTargets(dir, config, now);
    const after = readYamlFile<Record<string, unknown>>(
      path.join(dir, "sessions", "engineer@task-x.yaml"),
    );
    assert.deepEqual(before, after, "纯函数不得写状态文件");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// 投喂健壮性：瞬时超时重试成功只计 1 次；重试耗尽失败不计数不阻断
// ---------------------------------------------------------------------------

test("C1: POST /message 瞬时超时 → 有界重试后成功并计数 1 次（不双计）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont9");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls, { messageFailures: 2 });
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, ["engineer@task-x"]);
    const posts = messagePosts(calls);
    assert.equal(posts.length, 3, "瞬时超时退避重试共 3 次尝试");
    assert.equal(store.get("engineer@task-x")!.budget?.continuations, 1, "成功只计数一次");
  } finally {
    restore();
  }
});

test("C1: POST 重试耗尽失败 → 不计数、不阻断 sweep", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_cont10");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls, { messageFailures: Number.MAX_SAFE_INTEGER });
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 3, "重试耗尽");
    assert.equal(store.get("engineer@task-x")!.budget?.continuations, 0, "失败不计数");
  } finally {
    restore();
  }
});

test("C1: feedContinuation 对非 awake / 非 oc- 会话幂等返回 null", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  store.register("pm", { agentId: "ghost-agent", initialState: "sleeping" });
  const none = await feedContinuation(dir, config, "ghost-agent");
  assert.equal(none, null);
});
