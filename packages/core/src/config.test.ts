import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultConfig, validateConfig } from "./config.js";
import { loadConfig } from "./loader.js";
import { ErrorCode, PicodeError } from "./errors.js";

function tmpRepoWithConfig(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-cfg-"));
  fs.mkdirSync(path.join(dir, ".picode"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".picode", "config.yaml"), yaml);
  return dir;
}

test("windows defaults: split_hour 12, keep ratio 0.8", () => {
  const cfg = getDefaultConfig();
  assert.equal(cfg.windows.split_hour, 12);
  assert.equal(cfg.windows.compression.ratio, 0.8);
  assert.equal(cfg.windows.compression.min_keep, 20);
});

test("windows config overridable via project yaml", () => {
  const dir = tmpRepoWithConfig(
    "windows:\n  split_hour: 14\n  compression:\n    ratio: 0.9\n    min_keep: 5\n",
  );
  const cfg = loadConfig(dir);
  assert.equal(cfg.windows.split_hour, 14);
  assert.equal(cfg.windows.compression.ratio, 0.9);
  assert.equal(cfg.windows.compression.min_keep, 5);
});

test("validateConfig rejects invalid windows values", () => {
  const base = getDefaultConfig();
  for (const patch of [
    { windows: { ...base.windows, split_hour: 24 } },
    { windows: { ...base.windows, split_hour: -1 } },
    { windows: { ...base.windows, compression: { ...base.windows.compression, ratio: 0 } } },
    { windows: { ...base.windows, compression: { ...base.windows.compression, ratio: 1.5 } } },
    { windows: { ...base.windows, compression: { ...base.windows.compression, min_keep: 0 } } },
  ] as const) {
    assert.throws(() => validateConfig({ ...base, ...patch }));
  }
});

test("D3: run-level override cannot downgrade v1-fixed values (13 §2 validation after merge)", () => {
  const dir = tmpRepoWithConfig(""); // defaults only
  fs.mkdirSync(path.join(dir, ".picode", "runs", "run-x"), { recursive: true });
  // override tries to turn sponsor into an LLM — must be rejected, not merged in
  fs.writeFileSync(
    path.join(dir, ".picode", "runs", "run-x", "config.override.yaml"),
    "sponsor:\n  human_only: false\n",
  );
  assert.throws(
    () => loadConfig(dir, "run-x"),
    (e: unknown) =>
      e instanceof PicodeError &&
      e.code === ErrorCode.CONFIG_INVALID &&
      /sponsor\.human_only must be true/.test(e.message),
  );
});

test("D3: run-level override can legitimately tune non-fixed keys", () => {
  const dir = tmpRepoWithConfig("");
  fs.mkdirSync(path.join(dir, ".picode", "runs", "run-x"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".picode", "runs", "run-x", "config.override.yaml"),
    "windows:\n  split_hour: 14\n",
  );
  const cfg = loadConfig(dir, "run-x");
  assert.equal(cfg.windows.split_hour, 14);
  // untouched defaults survive the merge
  assert.equal(cfg.windows.compression.ratio, 0.8);
  assert.equal(cfg.sess_mgr.max_awake, 8);
});

test("D4: reserved keys keep their defaults but are documented (no reads in impl)", () => {
  const cfg = getDefaultConfig();
  // values exist and are stable — the comments in PicodeConfig mark the D055 set
  assert.equal(cfg.scheduler.max_parallel_triads, 3);
  assert.equal(cfg.git.merge_serial, true);
  assert.equal(cfg.i18n.locale, "zh-CN");
  assert.equal(cfg.bus.adapter, "file");
  assert.equal(cfg.self_evolve.enabled, true);
});

test("C1: self_evolve.budgets conservative defaults (0 = unlimited, 20 wake-turns)", () => {
  const b = getDefaultConfig().self_evolve.budgets;
  assert.equal(b.maxTurns, 20);
  assert.equal(b.maxTokens, 0);
  assert.equal(b.timeoutMs, 0);
  assert.deepEqual(b.gate_commands, []);
});

test("C1: budgets overridable via project yaml (incl. gate_commands parsing)", () => {
  const dir = tmpRepoWithConfig(
    "self_evolve:\n  budgets:\n    maxTurns: 3\n    maxTokens: 50000\n    timeoutMs: 600000\n    gate_commands:\n      - \"npm test\"\n      - \"npm run build\"\n",
  );
  const cfg = loadConfig(dir);
  const b = cfg.self_evolve.budgets;
  assert.equal(b.maxTurns, 3);
  assert.equal(b.maxTokens, 50000);
  assert.equal(b.timeoutMs, 600000);
  assert.deepEqual(b.gate_commands, ["npm test", "npm run build"]);
  // untouched budgets defaults survive the merge
  assert.equal(getDefaultConfig().self_evolve.budgets.maxTurns, 20);
});

test("C1: validateConfig rejects invalid budgets values", () => {
  const base = getDefaultConfig();
  const budgets = base.self_evolve.budgets;
  const patches: Array<Record<string, unknown>> = [
    { maxTurns: -1 },
    { maxTurns: 1.5 },
    { maxTokens: -1 },
    { timeoutMs: -1 },
    { timeoutMs: 100.5 },
    { gate_commands: ["ok", 42] },
    { gate_commands: "npm test" },
  ];
  for (const patch of patches) {
    const cfg = {
      ...base,
      self_evolve: { ...base.self_evolve, budgets: { ...budgets, ...patch } },
    };
    assert.throws(() => validateConfig(cfg as typeof base), Error, `expected rejection for ${JSON.stringify(patch)}`);
  }
});

test("C1: self_evolve.refine_gate conservative defaults (heuristic, evidence+noise filter on)", () => {
  const g = getDefaultConfig().self_evolve.refine_gate;
  assert.equal(g.mode, "heuristic");
  assert.equal(g.require_evidence, true);
  assert.equal(g.reject_noise, true);
});

test("C1: refine_gate overridable via project yaml", () => {
  const dir = tmpRepoWithConfig(
    "self_evolve:\n  refine_gate:\n    mode: none\n    require_evidence: false\n    reject_noise: false\n",
  );
  const g = loadConfig(dir).self_evolve.refine_gate;
  assert.equal(g.mode, "none");
  assert.equal(g.require_evidence, false);
  assert.equal(g.reject_noise, false);
  // untouched defaults survive the merge
  assert.equal(getDefaultConfig().self_evolve.refine_gate.mode, "heuristic");
});

test("C1: validateConfig rejects invalid refine_gate values", () => {
  const base = getDefaultConfig();
  const refine_gate = base.self_evolve.refine_gate;
  const patches: Array<Record<string, unknown>> = [
    { mode: "llm" },
    { mode: "heuristic", require_evidence: "yes" },
    { mode: "heuristic", reject_noise: 1 },
  ];
  for (const patch of patches) {
    const cfg = {
      ...base,
      self_evolve: { ...base.self_evolve, refine_gate: { ...refine_gate, ...patch } },
    };
    assert.throws(() => validateConfig(cfg as typeof base), Error, `expected rejection for ${JSON.stringify(patch)}`);
  }
});

test("C1: self_evolve.continuation conservative defaults (bounded 5, idle_sec 5 min)", () => {
  const c = getDefaultConfig().self_evolve.continuation;
  assert.equal(c.max_per_session, 5, "R2-C2: 默认有界 5，任务缺席会话不能无界烧 token");
  assert.equal(c.idle_sec, 300);
  assert.equal(c.summary_entries, 8, "D077: 语义续跑摘要窗口默认 8 条");
  // R3-C1: 平台席默认 skip（无 task 会话不进候选），gate_commands 默认空（C2 预留关闭）
  assert.equal(c.platform_seats, "skip", "R3-C1: 平台席默认不进候选");
  assert.deepEqual(c.gate_commands, [], "R3-C2 预留：默认不启用 gate");
});

test("C1: continuation overridable via project yaml", () => {
  const dir = tmpRepoWithConfig(
    "self_evolve:\n  continuation:\n    max_per_session: 10\n    idle_sec: 60\n    summary_entries: 4\n    platform_seats: allow\n    gate_commands: ['npm test']\n",
  );
  const c = loadConfig(dir).self_evolve.continuation;
  assert.equal(c.max_per_session, 10);
  assert.equal(c.idle_sec, 60);
  assert.equal(c.summary_entries, 4, "D077: 摘要窗口可配置");
  assert.equal(c.platform_seats, "allow");
  assert.deepEqual(c.gate_commands, ["npm test"]);
  // untouched defaults survive the merge (bounded 5 default, R2-C2)
  assert.equal(getDefaultConfig().self_evolve.continuation.max_per_session, 5);
  assert.equal(getDefaultConfig().self_evolve.continuation.idle_sec, 300);
  assert.equal(getDefaultConfig().self_evolve.continuation.summary_entries, 8);
});

test("C1: validateConfig rejects invalid continuation values", () => {
  const base = getDefaultConfig();
  const cont = base.self_evolve.continuation;
  const patches: Array<Record<string, unknown>> = [
    { max_per_session: -1 },
    { max_per_session: 1.5 },
    { idle_sec: -1 },
    { idle_sec: 10.5 },
    { summary_entries: -1 },
    { summary_entries: 2.5 },
    { platform_seats: "maybe" },
    { gate_commands: "npm test" },
    { gate_commands: [42] },
  ];
  for (const patch of patches) {
    const cfg = {
      ...base,
      self_evolve: { ...base.self_evolve, continuation: { ...cont, ...patch } },
    };
    assert.throws(() => validateConfig(cfg as typeof base), Error, `expected rejection for ${JSON.stringify(patch)}`);
  }
});

test("C2: self_evolve.continuation.max_per_session_platform 默认 2（平台席独立预算）", () => {
  const c = getDefaultConfig().self_evolve.continuation;
  assert.equal(c.max_per_session_platform, 2, "D078: 平台席独立续跑上限默认 2，比 task 的 5 更紧");
});

test("C2: max_per_session_platform overridable via project yaml", () => {
  const dir = tmpRepoWithConfig(
    "self_evolve:\n  continuation:\n    max_per_session_platform: 7\n    platform_seats: allow\n",
  );
  const c = loadConfig(dir).self_evolve.continuation;
  assert.equal(c.max_per_session_platform, 7);
  assert.equal(c.platform_seats, "allow");
  // untouched defaults survive the merge
  assert.equal(getDefaultConfig().self_evolve.continuation.max_per_session_platform, 2);
});

test("C2: validateConfig rejects invalid max_per_session_platform values", () => {
  const base = getDefaultConfig();
  const cont = base.self_evolve.continuation;
  const patches: Array<Record<string, unknown>> = [
    { max_per_session_platform: -1 },
    { max_per_session_platform: 1.5 },
    { max_per_session_platform: "many" },
  ];
  for (const patch of patches) {
    const cfg = {
      ...base,
      self_evolve: { ...base.self_evolve, continuation: { ...cont, ...patch } },
    };
    assert.throws(() => validateConfig(cfg as typeof base), Error, `expected rejection for ${JSON.stringify(patch)}`);
  }
});

test("C1: self_evolve.checkpoints 保守默认（关闭自动捕获，D082 显式捕获行为不变）", () => {
  const c = getDefaultConfig().self_evolve.checkpoints;
  assert.equal(c.enabled, false, "D082: 默认仅显式捕获，自动捕获关闭");
  assert.equal(c.guardian_interval_sec, 600, "guardian 周期默认 600s 节流");
  assert.equal(c.pre_merge, true, "merge 前捕获默认开启但受 enabled 总开关约束");
});

test("C1: checkpoints overridable via project yaml", () => {
  const dir = tmpRepoWithConfig(
    "self_evolve:\n  checkpoints:\n    enabled: true\n    guardian_interval_sec: 60\n    pre_merge: false\n",
  );
  const c = loadConfig(dir).self_evolve.checkpoints;
  assert.equal(c.enabled, true);
  assert.equal(c.guardian_interval_sec, 60);
  assert.equal(c.pre_merge, false);
  // untouched defaults survive the merge
  assert.equal(getDefaultConfig().self_evolve.checkpoints.enabled, false);
  assert.equal(getDefaultConfig().self_evolve.checkpoints.guardian_interval_sec, 600);
  assert.equal(getDefaultConfig().self_evolve.checkpoints.pre_merge, true);
});

test("C1: validateConfig rejects invalid checkpoints values", () => {
  const base = getDefaultConfig();
  const checkpoints = base.self_evolve.checkpoints;
  const patches: Array<Record<string, unknown>> = [
    { enabled: "yes" },
    { enabled: 1 },
    { guardian_interval_sec: -1 },
    { guardian_interval_sec: 1.5 },
    { pre_merge: "on" },
  ];
  for (const patch of patches) {
    const cfg = {
      ...base,
      self_evolve: { ...base.self_evolve, checkpoints: { ...checkpoints, ...patch } },
    };
    assert.throws(() => validateConfig(cfg as typeof base), Error, `expected rejection for ${JSON.stringify(patch)}`);
  }
});
