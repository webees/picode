import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readYamlFile, writeYamlFile } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { READY_MESSAGE_TEXT } from "./opencode-adapter.js";
import {
  CONTINUATION_PROMPT,
  CONTINUATION_SUMMARY_HEADER,
  composeContinuationPrompt,
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

/** 追加一条转录记录（可控 ts，用于精确构造 idle 时钟时间线）。 */
function appendTranscript(dir: string, agentId: string, entry: Record<string, unknown>): void {
  const p = path.join(dir, "transcripts", `${agentId}.jsonl`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(
    p,
    JSON.stringify({ schema_version: "1", agent_id: agentId, ...entry }) + "\n",
    "utf8",
  );
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

/** 唤醒 createRun 已注册的平台席（scout/sys-arch 等）+ 挂接 opencode 会话 + 回拨 last_wake_at。 */
async function idleAwakePlatformSession(
  dir: string,
  store: SessionStore,
  agentId: string,
  sesId: string,
): Promise<void> {
  await store.wake(agentId, "test");
  await store.attachPiSession(agentId, `oc-${sesId}`);
  patchSession(dir, agentId, { last_wake_at: new Date(Date.now() - 600_000).toISOString() });
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
// R3-C1-b：idle 时钟 = 回合完成时间（最近 incoming 响应 ts），投喂不重置；
// 进行中回合（末条 outgoing 无后续 incoming）不进入候选、不投喂
// ---------------------------------------------------------------------------

test("R3-C1-b: 转录末条为 outgoing 且无后续 incoming（长回合进行中）→ 不产出候选且不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_r3_b1");
  appendTranscript(dir, "engineer@task-x", {
    type: "outgoing",
    ts: new Date(Date.now() - 10_000).toISOString(),
    text: "续跑投喂（进行中回合，尚无响应）",
  });

  const targets = deriveContinuationTargets(dir, config, new Date());
  assert.deepEqual(targets, [], "进行中回合（in-flight）不得被选为续跑候选");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0, "in-flight 回合不得投喂");
  } finally {
    restore();
  }
});

test("R3-C1-b: idle 时钟 = 最近 incoming 响应时间（投喂 outgoing 不重置）；响应后空闲超 idle_sec 恢复候选", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_r3_b2", 600_000);
  const now = Date.now();
  // 回合序列：120s 前投喂（outgoing）、30s 前响应（incoming）
  appendTranscript(dir, "engineer@task-x", {
    type: "outgoing",
    ts: new Date(now - 120_000).toISOString(),
    text: "投喂（不应重置 idle 时钟）",
  });
  appendTranscript(dir, "engineer@task-x", {
    type: "incoming",
    ts: new Date(now - 30_000).toISOString(),
    parts: [{ type: "text", text: "继续工作中" }],
  });

  // 若 idle 时钟 = 投喂时间（120s > 60s）应候选；实际 = 响应时间（30s < 60s）→ 不候选
  assert.deepEqual(deriveContinuationTargets(dir, config, new Date(now)), []);

  // 响应后空闲超 idle_sec（响应 70s 前）→ 恢复候选（idle 时钟 = 响应时间）
  const later = new Date(now + 40_000);
  assert.deepEqual(deriveContinuationTargets(dir, config, later), [
    { agent_id: "engineer@task-x", session_id: "oc-ses_r3_b2" },
  ]);
});

test("R3-C1-b: 投喂（outgoing）后无响应 → 长期保持 in-flight 不投喂（不回退到投喂时间）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_r3_b3", 600_000);
  appendTranscript(dir, "engineer@task-x", {
    type: "outgoing",
    ts: new Date(Date.now() - 10 * 60_000).toISOString(),
    text: "长回合进行中",
  });

  const targets = deriveContinuationTargets(dir, config, new Date());
  assert.deepEqual(targets, [], "outgoing 10 分钟前也仍视为 in-flight（无响应），不得投喂");
});

// ---------------------------------------------------------------------------
// R3-C1-c：平台席（无 task 绑定会话）默认 platform_seats=skip 不进候选；
// "allow" 时进入但受 max_per_session 有界
// ---------------------------------------------------------------------------

test("R3-C1-c: 无 task 绑定会话（scout/sys-arch）默认 platform_seats=skip 不进候选且不投喂", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakePlatformSession(dir, store, "scout", "ses_r3_c1a");
  await idleAwakePlatformSession(dir, store, "sys-arch", "ses_r3_c1b");

  const targets = deriveContinuationTargets(dir, config, new Date());
  assert.deepEqual(targets, [], "平台席默认（skip）不得被选为续跑候选");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuations(dir, config);
    assert.deepEqual(res.fed, []);
    assert.equal(messagePosts(calls).length, 0, "平台席默认不得投喂");
  } finally {
    restore();
  }
});

test("R3-C1-c: platform_seats=allow 时平台席进入候选但受 max_per_session 有界", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.platform_seats = "allow";
  config.self_evolve.continuation.max_per_session = 2;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakePlatformSession(dir, store, "scout", "ses_r3_c2");

  assert.deepEqual(
    deriveContinuationTargets(dir, config, new Date()),
    [{ agent_id: "scout", session_id: "oc-ses_r3_c2" }],
    "allow 时平台席可被选为候选",
  );

  // 预算耗尽 → 有界拦截（回归 R2-C1-c 预算门）
  patchSession(dir, "scout", { budget: { turns: 1, continuations: 2 } });
  assert.deepEqual(
    deriveContinuationTargets(dir, config, new Date()),
    [],
    "预算耗尽不得选为候选",
  );
});

test("R3-C1-d: deriveContinuationTargets 纯函数 — 平台席 + in-flight 场景同输入同输出且不触碰网络", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakePlatformSession(dir, store, "scout", "ses_r3_d1");
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_r3_d2");
  appendTranscript(dir, "engineer@task-x", {
    type: "outgoing",
    ts: new Date(Date.now() - 5_000).toISOString(),
    text: "进行中",
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const now = new Date();
    const a = deriveContinuationTargets(dir, config, now);
    const b = deriveContinuationTargets(dir, config, now);
    assert.deepEqual(a, b, "同输入必须同输出");
    assert.deepEqual(a, [], "平台席 skip + in-flight 均不候选");
    assert.equal(calls.length, 0, "纯函数不得发起网络请求");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// 语义续跑（N7 升级）：composeContinuationPrompt 纯函数 + feed 集成注入要点
// ---------------------------------------------------------------------------

test("C1: composeContinuationPrompt(null) 逐字节等于 CONTINUATION_PROMPT", () => {
  assert.equal(composeContinuationPrompt(null), CONTINUATION_PROMPT);
  assert.equal(composeContinuationPrompt(null).length, CONTINUATION_PROMPT.length);
});

test("C1: composeContinuationPrompt(summary) 含模板 + 转录要点段", () => {
  const summary = "历史转录共 2 条（outgoing 1 / incoming 1），最近 2 条要点：\n- [t1] 投喂: xxx\n- [t2] 响应: yyy";
  const out = composeContinuationPrompt(summary);
  assert.ok(out.startsWith(CONTINUATION_PROMPT), "模板必须原样置于开头");
  assert.ok(out.includes(`\n\n${CONTINUATION_SUMMARY_HEADER}\n`), "必须含摘要段标题分隔");
  assert.ok(out.includes(summary), "摘要全文必须追加在摘要段内");
  assert.equal(out.indexOf(summary) > out.indexOf("## 上一回合要点"), true);
});

test("C1: 空转录（historySummary 返回 null）→ feed 投喂文本与现版 CONTINUATION_PROMPT 逐字节一致", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_sem_empty");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    await feedContinuation(dir, config, "engineer@task-x");
    const posts = messagePosts(calls);
    assert.equal(posts.length, 1);
    const msg = posts[0].body as {
      parts: Array<{ type: string; text: string }>;
    };
    assert.equal(msg.parts.length, 2, "ready 消息 = READY_MESSAGE + 续跑模板两个 part");
    assert.equal(msg.parts[1].text, CONTINUATION_PROMPT, "空转录时续跑 part 逐字节一致，不得注入摘要段");
  } finally {
    restore();
  }
});

test("C1: 有转录 → feed 投喂消息含「上一回合要点」摘要段（maxEntries 8）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_sem_feed");

  const now = Date.now();
  appendTranscript(dir, "engineer@task-x", {
    type: "incoming",
    ts: new Date(now - 120_000).toISOString(),
    parts: [{ type: "text", text: "完成模块 A 实现，验收通过" }],
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await feedContinuation(dir, config, "engineer@task-x");
    assert.ok(res, "feed 必须成功");
    const posts = messagePosts(calls);
    assert.equal(posts.length, 1);
    const msg = posts[0].body as {
      parts: Array<{ type: string; text: string }>;
    };
    const text = msg.parts.map((p) => p.text).join("\n");
    assert.ok(text.includes("## 上一回合要点（转录摘要）"), "必须含摘要段标题");
    assert.ok(text.includes("完成模块 A 实现，验收通过"), "必须含上一回合转录要点");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// D077 语义续跑：summary_entries 配置驱动摘要窗口 + stripNoise 去噪
// ---------------------------------------------------------------------------

test("D077: feedContinuation 用 cont.summary_entries 作摘要窗口 + stripNoise 去噪（机械投喂噪音不入摘要）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  config.self_evolve.continuation.summary_entries = 3;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_d077_win");

  const now = Date.now();
  // 一条「自动续跑投喂」（outgoing，机械模板文本 = READY_MESSAGE_TEXT + CONTINUATION_PROMPT）
  appendTranscript(dir, "engineer@task-x", {
    type: "outgoing",
    ts: new Date(now - 180_000).toISOString(),
    text: `${READY_MESSAGE_TEXT}\n${CONTINUATION_PROMPT}`,
  });
  // 两条真实响应
  appendTranscript(dir, "engineer@task-x", {
    type: "incoming",
    ts: new Date(now - 120_000).toISOString(),
    parts: [{ type: "text", text: "模块 A 完成" }],
  });
  appendTranscript(dir, "engineer@task-x", {
    type: "incoming",
    ts: new Date(now - 60_000).toISOString(),
    parts: [{ type: "text", text: "模块 B 完成" }],
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    await feedContinuation(dir, config, "engineer@task-x");
    const msg = messagePosts(calls)[0].body as {
      parts: Array<{ type: string; text: string }>;
    };
    // parts[0] 恒为 READY_MESSAGE_TEXT；摘要段在 parts[1]（composeContinuationPrompt 输出）
    assert.equal(msg.parts[0].text, READY_MESSAGE_TEXT);
    const composed = msg.parts[1].text;
    // 摘要段 = header 之后的正文（header 之前是 CONTINUATION_PROMPT 模板本身）
    const summary = composed.slice(composed.indexOf(CONTINUATION_SUMMARY_HEADER));
    // 窗口 = summary_entries 3：最近 3 条都在窗口内（含 1 outgoing + 2 incoming）
    assert.match(summary, /历史转录共 3 条（outgoing 1 \/ incoming 2），最近 3 条要点：/, "条数统计必须基于原始转录");
    // stripNoise：outgoing 命中 READY_MESSAGE_TEXT / CONTINUATION_PROMPT 后整条删空 → 不生成要点行
    assert.ok(!summary.includes("你已就绪。按角色 prompt 工作"), "READY_MESSAGE_TEXT 噪音必须被 strip 并跳过");
    assert.ok(!summary.includes("检测到本会话已空闲"), "CONTINUATION_PROMPT 噪音必须被 strip 并跳过");
    assert.ok(summary.includes("模块 A 完成"), "窗口内真实响应要点必须保留");
    assert.ok(summary.includes("模块 B 完成"), "窗口内真实响应要点必须保留");
    assert.ok(!summary.includes("投喂:"), "机械投喂噪音被 strip 后不得出现投喂要点行");
  } finally {
    restore();
  }
});

test("D077: summary_entries=0 时不注入摘要（回退固定模板，行为同空转录）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  config.self_evolve.continuation.summary_entries = 0;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_d077_zero");

  appendTranscript(dir, "engineer@task-x", {
    type: "incoming",
    ts: new Date(Date.now() - 60_000).toISOString(),
    parts: [{ type: "text", text: "有转录但摘要窗口关闭" }],
  });

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    await feedContinuation(dir, config, "engineer@task-x");
    const msg = messagePosts(calls)[0].body as {
      parts: Array<{ type: string; text: string }>;
    };
    const text = msg.parts.map((p) => p.text).join("\n");
    assert.ok(!text.includes("上一回合要点"), "summary_entries=0 不得注入摘要段");
    assert.equal(msg.parts[1].text, CONTINUATION_PROMPT, "必须回退固定模板");
  } finally {
    restore();
  }
});

test("C1-e 核查: deriveContinuationTargets 未改动（语义续跑不触碰候选派生）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_sem_targets");

  const now = new Date();
  assert.deepEqual(deriveContinuationTargets(dir, config, now), [
    { agent_id: "engineer@task-x", session_id: "oc-ses_sem_targets" },
  ], "deriveContinuationTargets 行为必须与现版一致（零改动）");
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
