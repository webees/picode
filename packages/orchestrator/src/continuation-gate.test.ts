import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readYamlFile, writeYamlFile } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import {
  captureGitWorktreeSnapshot,
  gateCommandsOf,
  runContinuationGate,
  shouldRunGate,
  snapshotFingerprint,
  sweepContinuationsGated,
  ContinuationGateStore,
} from "./continuation-gate.js";

function setupRun() {
  const repo = gitInit({ prefix: "picode-gate-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
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

/** 配置 continuation.gate_commands（类型字段由 C1 声明，此处按缺省 cast）。 */
function setGateCommands(config: ReturnType<typeof resolveRunDir>["config"], cmds: string[]): void {
  (config.self_evolve.continuation as unknown as { gate_commands: string[] }).gate_commands = cmds;
}

/** 直改 session.yaml（backdate last_wake_at）。 */
function patchSession(dir: string, agentId: string, patch: Record<string, unknown>): void {
  const p = path.join(dir, "sessions", `${agentId}.yaml`);
  const rec = readYamlFile<Record<string, unknown>>(p)!;
  writeYamlFile(p, { ...rec, ...patch });
}

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

/** opencode serve mock：POST /message 返回 parts（续跑投喂成功）。 */
function mockServe(calls: Array<{ url: string; method: string; body?: unknown }>): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    return new Response(
      JSON.stringify({ info: {}, parts: [{ type: "text", text: "ack" }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

function messagePosts(calls: Array<{ url: string; method: string; body?: unknown }>) {
  return calls.filter((c) => c.method === "POST" && c.url.includes("/message"));
}

// ---------------------------------------------------------------------------
// R3-C2-b：gate_commands 默认空 → 不启用（行为与 C1 一致）；配置后启用
// ---------------------------------------------------------------------------

test("R3-C2-b: gateCommandsOf 默认空 → gate 未启用（回归 C1 行为）", async () => {
  const { config } = setupRun();
  assert.deepEqual(gateCommandsOf(config), []);
});

test("R3-C2-b: 配置 gate_commands 后启用", async () => {
  const { config } = setupRun();
  setGateCommands(config, ["npm test", "npm run build"]);
  assert.deepEqual(gateCommandsOf(config), ["npm test", "npm run build"]);
});

// ---------------------------------------------------------------------------
// R3-C2-c：git 快照比对——上次失败快照一致 → shouldRunGate=false 且不投喂；
// 工作树有变化 → 重跑 gate
// ---------------------------------------------------------------------------

test("R3-C2-c: captureGitWorktreeSnapshot 在 git 仓库内返回指纹，工作树变化后不同", () => {
  const repo = gitInit({ prefix: "picode-gate-snap-" });
  fs.writeFileSync(path.join(repo, "a.txt"), "v1");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: repo });

  const before = captureGitWorktreeSnapshot(repo);
  assert.ok(before, "git 仓库内必须能拍快照");

  fs.writeFileSync(path.join(repo, "a.txt"), "v2");
  const after = captureGitWorktreeSnapshot(repo);
  assert.ok(after, "第二次快照非 null");
  assert.notEqual(after, before, "工作树变化后快照必须不同");

  const untracked = gitInit({ prefix: "picode-gate-snap-u-" });
  fs.writeFileSync(path.join(untracked, "u.txt"), "x");
  const withUntracked = captureGitWorktreeSnapshot(untracked);
  fs.writeFileSync(path.join(untracked, "u.txt"), "y");
  const untrackedChanged = captureGitWorktreeSnapshot(untracked);
  assert.ok(withUntracked && untrackedChanged);
  assert.notEqual(withUntracked, untrackedChanged, "untracked 内容变化必须反映到快照");
});

test("R3-C2-c: captureGitWorktreeSnapshot 非 git 目录 → null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-notgit-" + Date.now()));
  try {
    assert.equal(captureGitWorktreeSnapshot(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R3-C2-c: shouldRunGate — gate 未启用 / 快照一致 / 变化 三分支", () => {
  assert.equal(shouldRunGate([], "fp", "snapshot-any"), false, "未启用 → false");
  const snap = "worktree-v1";
  const fp = snapshotFingerprint(snap);
  assert.equal(shouldRunGate(["npm test"], fp, snap), false, "上次失败指纹 === 当前 → 不重跑");
  assert.equal(
    shouldRunGate(["npm test"], fp, "worktree-v2"),
    true,
    "工作树有变化 → 重跑 gate",
  );
  assert.equal(shouldRunGate(["npm test"], null, snap), true, "无失败记录 → 跑 gate");
  assert.equal(shouldRunGate(["npm test"], fp, null), true, "快照不可得 → 保守跑 gate");
});

// ---------------------------------------------------------------------------
// R3-C2-d：gate 通过 → 该会话跳过本轮投喂；gate 失败 → 不投喂但保留候选
// ---------------------------------------------------------------------------

test("R3-C2-d: runContinuationGate — gate 未启用 → disabled（不拦截投喂）", async () => {
  const { dir, config } = setupRun();
  const r = await runContinuationGate(dir, config, "engineer@task-x");
  assert.equal(r.reason, "disabled");
  assert.equal(r.ran, false);
});

test("R3-C2-d: runContinuationGate — gate 通过 → gate_passed", async () => {
  const { dir, config, store } = setupRun();
  setGateCommands(config, ["true"]);
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_pass");

  const r = await runContinuationGate(dir, config, "engineer@task-x");
  assert.equal(r.reason, "gate_passed");
  assert.equal(r.ran, true);
  assert.equal(r.passed, true);
});

test("R3-C2-d: runContinuationGate — gate 失败 → gate_failed 且记录失败快照", async () => {
  const { repo, dir, config, store } = setupRun();
  setGateCommands(config, ["false"]);
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_fail");

  const r = await runContinuationGate(dir, config, "engineer@task-x");
  assert.equal(r.reason, "gate_failed");
  assert.equal(r.ran, true);
  assert.equal(r.passed, false);

  const gateStore = new ContinuationGateStore(dir);
  const snap = captureGitWorktreeSnapshot(repo);
  assert.equal(gateStore.lastFailed("engineer@task-x"), snapshotFingerprint(snap!), "失败快照必须持久化");
});

test("R3-C2-d: 快照未变 → 不重跑 gate（snapshot_unchanged）", async () => {
  const { dir, config, store } = setupRun();
  setGateCommands(config, ["false"]);
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_unchanged");

  await runContinuationGate(dir, config, "engineer@task-x");
  const again = await runContinuationGate(dir, config, "engineer@task-x");
  assert.equal(again.reason, "snapshot_unchanged");
  assert.equal(again.ran, false, "快照未变不得重跑 gate");
});

test("R3-C2-d: 工作树有变化 → 重跑 gate", async () => {
  const { repo, dir, config, store } = setupRun();
  setGateCommands(config, ["false"]);
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_changed");

  await runContinuationGate(dir, config, "engineer@task-x");
  fs.writeFileSync(path.join(repo, "worktree-probe.txt"), new Date().toISOString(), "utf8");
  const again = await runContinuationGate(dir, config, "engineer@task-x");
  assert.equal(again.ran, true, "工作树变化后必须重跑 gate");
});

// ---------------------------------------------------------------------------
// sweep 集成：默认关闭（回归）→ 正常投喂；启用后 gate 通过/失败均不投喂
// ---------------------------------------------------------------------------

test("R3-C2-b: sweepContinuationsGated 默认关闭 → 行为与 C1 一致（正常投喂）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_off");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuationsGated(dir, config);
    assert.deepEqual(res.fed, ["engineer@task-x"], "gate 关闭时必须正常投喂");
    assert.equal(res.gate[0].reason, "disabled");
    assert.equal(messagePosts(calls).length, 1);
    assert.equal(store.get("engineer@task-x")!.budget?.continuations, 1, "计数 +1 并持久化");
  } finally {
    restore();
  }
});

test("R3-C2-d: gate 通过 → 该会话跳过本轮投喂（停靠语义）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  setGateCommands(config, ["true"]);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_skip_pass");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const res = await sweepContinuationsGated(dir, config);
    assert.deepEqual(res.fed, [], "gate 通过 → 本轮不投喂");
    assert.equal(res.gate[0].reason, "gate_passed");
    assert.equal(messagePosts(calls).length, 0);
    assert.equal(store.get("engineer@task-x")!.budget?.continuations ?? 0, 0, "不计数");
  } finally {
    restore();
  }
});

test("R3-C2-d: gate 失败 → 不投喂但保留候选（下轮快照未变仍不重跑）", async () => {
  const { dir, config, store } = setupRun();
  enableOpencode(config);
  setGateCommands(config, ["false"]);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_skip_fail");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    const first = await sweepContinuationsGated(dir, config);
    assert.deepEqual(first.fed, [], "gate 失败 → 本轮不投喂");
    assert.equal(first.gate[0].reason, "gate_failed");
    assert.equal(messagePosts(calls).length, 0);

    // 下轮：快照未变 → 不重跑 gate、不投喂（防重复重跑）
    const second = await sweepContinuationsGated(dir, config);
    assert.deepEqual(second.fed, []);
    assert.equal(second.gate[0].reason, "snapshot_unchanged");
    assert.equal(second.gate[0].ran, false);
    assert.equal(messagePosts(calls).length, 0, "始终不投喂");
  } finally {
    restore();
  }
});

test("R3-C2-d: 工作树变化后 gate 重跑且仍失败 → 持续保留候选不投喂", async () => {
  const { repo, dir, config, store } = setupRun();
  enableOpencode(config);
  setGateCommands(config, ["false"]);
  config.self_evolve.continuation.max_per_session = 5;
  config.self_evolve.continuation.idle_sec = 60;
  await idleAwakeOcSession(dir, store, "engineer@task-x", "ses_gate_change_fail");

  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const restore = mockServe(calls);
  try {
    await sweepContinuationsGated(dir, config);
    fs.writeFileSync(path.join(repo, "worktree-probe.txt"), "change", "utf8");
    const after = await sweepContinuationsGated(dir, config);
    assert.deepEqual(after.fed, []);
    assert.equal(after.gate[0].reason, "gate_failed", "快照变化 → 重跑 gate");
    assert.equal(after.gate[0].ran, true);
    assert.equal(messagePosts(calls).length, 0);
  } finally {
    restore();
  }
});
