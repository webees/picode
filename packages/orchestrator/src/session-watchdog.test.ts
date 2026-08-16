import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { RoomStore } from "@picode/bus";
import type { PicodeConfig } from "@picode/core";

import { SessionStore } from "./session-store.js";
import {
  evaluateWatchdog,
  runWatchdogCheck,
  type OutputSignal,
  type WatchdogState,
} from "./session-watchdog.js";

function miniConfig(): PicodeConfig {
  return {
    git: { worktree_root: ".picode/worktrees", branch_template: "picode/{run_id}/{task_id}" },
    paths: { runs_root: ".picode/runs" },
  } as unknown as PicodeConfig;
}

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

  it("4 轮无产出 → notify 动作（takeover_candidate 由执行层投递成功后置位，P1-B）", () => {
    const v = evaluateWatchdog(state({ silent_rounds: 3, at_risk: true }), noOutput);
    assert.equal(v.action, "notify_takeover");
    assert.equal(v.state.takeover_candidate, false, "判定层不置位（防投递失败永久丢失）");
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

describe("runWatchdogCheck（集成）", () => {
  it("P0-1: steer 经 sess-mgr 身份投递 leadership 房（bus 消息可读）", async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-wd-"));
    // leadership 成员表（createRun 会建；裸测试目录需手动——sess-mgr access=post）
    new RoomStore(runDir).saveMembers("leadership", [{ id: "sess-mgr", access: "post" }]);
    const store = new SessionStore(runDir);
    store.register("engineer", { agentId: "engineer@task-a", initialState: "sleeping" });
    await store.setError("engineer@task-a", "TOOL_ENV_BROKEN: node missing");
    // 工作房不存在 + error 前缀 → 立即 at_risk + steer 投递
    const res = await runWatchdogCheck(runDir, os.tmpdir(), miniConfig());
    assert.ok(res.steers.includes("engineer@task-a"), "steer 应发出");
    const busFile = path.join(runDir, "bus", "leadership.jsonl");
    assert.ok(fs.existsSync(busFile), "leadership 房应收到看门狗消息");
    const line = fs.readFileSync(busFile, "utf8").trim().split("\n").pop() ?? "";
    const msg = JSON.parse(line);
    assert.equal(msg.from, "sess-mgr", "投递身份应为成员表内的 sess-mgr（P0-1）");
    assert.equal(msg.room, "leadership");
    assert.equal(msg.type, "alert");
    assert.ok(msg.body.includes("看门狗"), "消息正文应为看门狗 steer 通知");
  });

  it("P1-1: 平台席不计数（仅 task 会话进入看门狗）", async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-wd-"));
    const store = new SessionStore(runDir);
    store.register("pm");
    const res = await runWatchdogCheck(runDir, os.tmpdir(), miniConfig());
    assert.deepEqual(res, { at_risk: [], takeover_candidates: [], steers: [], notified: [] });
    // 平台席不应产生任何看门狗动作
  });
});
