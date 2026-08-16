import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateWatchdog,
  type OutputSignal,
  type WatchdogState,
} from "./session-watchdog.js";

const noOutput: OutputSignal = { has_output: false, detail: "无产出" };
const hasOutput: OutputSignal = { has_output: true, detail: "有提交" };

function state(over: Partial<WatchdogState> = {}): WatchdogState {
  return {
    agent_id: "engineer@task-a",
    silent_rounds: 0,
    at_risk: false,
    takeover_candidate: false,
    last_action: null,
    last_action_at: null,
    ...over,
  };
}

describe("evaluateWatchdog（纯规则）", () => {
  it("有产出 → 保持正常（none）", () => {
    const v = evaluateWatchdog(null, hasOutput);
    assert.equal(v.action, "none");
    assert.equal(v.state.silent_rounds, 0);
  });

  it("1 轮无产出 → 不升级（none，计数 1）", () => {
    const v = evaluateWatchdog(state(), noOutput);
    assert.equal(v.action, "none");
    assert.equal(v.state.silent_rounds, 1);
  });

  it("2 轮无产出 → at_risk + steer", () => {
    const v = evaluateWatchdog(state({ silent_rounds: 1 }), noOutput);
    assert.equal(v.action, "steer");
    assert.equal(v.state.at_risk, true);
    assert.equal(v.state.silent_rounds, 2);
  });

  it("4 轮无产出 → takeover_candidate + notify", () => {
    const v = evaluateWatchdog(state({ silent_rounds: 3, at_risk: true }), noOutput);
    assert.equal(v.action, "notify_takeover");
    assert.equal(v.state.takeover_candidate, true);
  });

  it("产出恢复 → 归零解除 at_risk/takeover", () => {
    const v = evaluateWatchdog(
      state({ silent_rounds: 4, at_risk: true, takeover_candidate: true, last_action: "notify_takeover" }),
      hasOutput,
    );
    assert.equal(v.action, "none");
    assert.equal(v.state.silent_rounds, 0);
    assert.equal(v.state.at_risk, false);
    assert.equal(v.state.takeover_candidate, false);
  });

  it("TOOL_ENV_BROKEN: 前缀 → 立即 at_risk + steer（跳过 2 轮）", () => {
    const v = evaluateWatchdog(null, noOutput, { error: "TOOL_ENV_BROKEN: node missing" });
    assert.equal(v.action, "steer");
    assert.equal(v.state.at_risk, true);
    assert.equal(v.state.silent_rounds, 2);
  });

  it("WORKTREE_MISSING: 前缀同样立即 at_risk", () => {
    const v = evaluateWatchdog(null, noOutput, { error: "WORKTREE_MISSING: worktree 未创建" });
    assert.equal(v.state.at_risk, true);
  });

  it("终态会话跳过（terminal → none，状态不变）", () => {
    const prev = state();
    const v = evaluateWatchdog(prev, noOutput, { terminal: true });
    assert.equal(v.action, "none");
    assert.equal(v.state.silent_rounds, 0);
  });

  it("at_risk 后继续无产出到第 3 轮 → 不再重复 steer（none，计数继续）", () => {
    const v = evaluateWatchdog(state({ silent_rounds: 2, at_risk: true, last_action: "steer" }), noOutput);
    assert.equal(v.action, "none");
    assert.equal(v.state.silent_rounds, 3);
  });
});
