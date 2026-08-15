import { test } from "node:test";
import { gitInit } from "../test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createRun,
  resolveRunDir,
  readGoal,
  setGoalStatus,
  setProductAcceptance,
} from "../run-store.js";
import { SessionStore } from "../session-store.js";
import { goalCommands } from "./goal.js";
import type { CommandContext } from "./types.js";

function setupRun() {
  const repo = gitInit({ prefix: "picode-goal-cli-" });
  fs.writeFileSync(path.join(repo, "README.md"), "# t\n");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  return { repo, runId, dir, config, store };
}

function setStatusCmd() {
  const cmd = goalCommands.find((c) => c.path.join(" ") === "goal set-status");
  assert.ok(cmd, "goal set-status 必须注册");
  return cmd!;
}

/** 模拟 CLI ctx：--status 取值，其余 flag 一律 undefined。 */
function ctxFor(dir: string, config: ReturnType<typeof setupRun>["config"], status: string) {
  return {
    args: ["goal", "set-status", "--status", status],
    has: () => false,
    arg: (name: string) => (name === "--status" ? status : undefined),
    dir,
    config,
  } as unknown as CommandContext;
}

function captureLog<T>(fn: () => T): Promise<{ ret: Awaited<T>; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  return Promise.resolve(fn()).finally(() => {
    console.log = orig;
  }).then((ret) => ({ ret, logs }));
}

test("goal set-status completed: 终态分支调 closeRun（平台席休眠 + TASK_DISSOLVED）", async () => {
  const { repo, dir, config, store } = setupRun();
  // 造一个 awake 平台席 + 一个 awake 任务席
  await store.wake("pm", "test");
  const taskId = "task-x";
  store.register("squad-lead", { agentId: `squad-lead@${taskId}`, initialState: "sleeping" });
  store.register("engineer", { agentId: `engineer@${taskId}`, initialState: "sleeping" });
  store.register("sdet", { agentId: `sdet@${taskId}`, initialState: "sleeping" });
  await store.wake(`squad-lead@${taskId}`, "test");

  // 合法路径：先激活再终态（状态机校验 intake→completed 不合法）
  setProductAcceptance(dir, ["compiles"]);
  setGoalStatus(dir, "active");
  const { logs } = await captureLog(() => setStatusCmd().run(ctxFor(dir, config, "completed")));
  assert.equal(logs.length, 1, "仅输出一次 JSON");
  const out = JSON.parse(logs[0]) as {
    goal: { status: string };
    close: { dissolved: string[]; slept_platform: string[] };
  };
  assert.equal(out.goal.status, "completed");
  assert.deepEqual(out.close.slept_platform, ["pm"], "平台席随终态休眠");
  assert.equal(store.get("pm")!.state, "sleeping");
  void repo;
});

test("goal set-status active: 非终态不调 closeRun，平台席保持 awake", async () => {
  const { dir, config, store } = setupRun();
  await store.wake("pm", "test");
  // active 需要 product acceptance（P01）
  const goal = store ? null : null;
  void goal;
  const acceptCmd = goalCommands.find((c) => c.path.join(" ") === "goal set-product-acceptance");
  const { logs: acceptLogs } = await captureLog(() =>
    acceptCmd!.run({
      args: ["goal", "set-product-acceptance", "--acceptance", "a; b"],
      has: () => false,
      arg: (name: string) => (name === "--acceptance" ? "a; b" : undefined),
      dir,
      config,
    } as unknown as CommandContext),
  );
  assert.equal(acceptLogs.length, 1);

  const { logs } = await captureLog(() => setStatusCmd().run(ctxFor(dir, config, "active")));
  assert.equal(logs.length, 1);
  const out = JSON.parse(logs[0]) as { status: string; close?: unknown };
  assert.equal(out.status, "active", "非终态输出裸 goal");
  assert.equal(out.close, undefined, "非终态不输出 close");
  assert.equal(store.get("pm")!.state, "awake", "非终态平台席不休眠");
});

// ---------------------------------------------------------------------------
// C1 goal-crossrun（A1）：lifecycle 子命令 resume / disarm / block / status
// ---------------------------------------------------------------------------

function lifecycleCmds() {
  const find = (p: string) => {
    const cmd = goalCommands.find((c) => c.path.join(" ") === p);
    assert.ok(cmd, `${p} 必须注册`);
    return cmd!;
  };
  return {
    resume: find("goal resume"),
    disarm: find("goal disarm"),
    block: find("goal block"),
    status: find("goal status"),
  };
}

/** 通用 ctx 构造：block 用 --code/--message，其余命令只用 dir/config。 */
function lifeCtx(
  dir: string,
  config: ReturnType<typeof setupRun>["config"],
  extra?: Record<string, string>,
) {
  const flags = { ...(extra ?? {}) };
  return {
    args: ["goal"],
    has: () => false,
    arg: (name: string) => flags[name],
    dir,
    config,
  } as unknown as CommandContext;
}

test("goal lifecycle 子命令注册：resume/disarm/block/status", () => {
  const cmds = lifecycleCmds();
  assert.ok(cmds.resume.path.join(" ") === "goal resume");
  assert.ok(cmds.disarm.path.join(" ") === "goal disarm");
  assert.ok(cmds.block.path.join(" ") === "goal block");
  assert.ok(cmds.status.path.join(" ") === "goal status");
});

test("goal lifecycle: status 输出含 rounds/activation/blocked；resume/disarm 翻转门闩", async () => {
  const { dir, config } = setupRun();
  setProductAcceptance(dir, ["compiles"]);
  setGoalStatus(dir, "active");
  const cmds = lifecycleCmds();

  const statusOut = await captureLog(() => cmds.status.run(lifeCtx(dir, config)));
  const st = JSON.parse(statusOut.logs[0]) as {
    status: string;
    revision: number;
    rounds_started: number;
    max_goal_rounds: number;
    activation: "armed" | "disarmed";
    blocked_reason: unknown;
  };
  assert.equal(st.status, "active");
  assert.equal(st.revision, 2);
  assert.ok("rounds_started" in st, "status 含 rounds");
  assert.ok("activation" in st, "status 含 activation");
  assert.ok("blocked_reason" in st, "status 含 blocked");
  assert.equal(st.activation, "disarmed", "set-status 不自动 arm");

  // resume → armed
  const resumed = await captureLog(() => cmds.resume.run(lifeCtx(dir, config)));
  assert.equal((JSON.parse(resumed.logs[0]) as { activation: string }).activation, "armed");
  assert.equal(readGoal(dir).revision, 3, "lifecycle 变更同样 revision 递增");

  // disarm → disarmed
  const disarmed = await captureLog(() => cmds.disarm.run(lifeCtx(dir, config)));
  assert.equal((JSON.parse(disarmed.logs[0]) as { activation: string }).activation, "disarmed");

  // block --code → blocked + 政策码
  const blocked = await captureLog(() =>
    cmds.block.run(lifeCtx(dir, config, { "--code": "queue-failed", "--message": "queue stuck" })),
  );
  const b = JSON.parse(blocked.logs[0]) as {
    status: string;
    blocked_reason: { code: string; message: string };
  };
  assert.equal(b.status, "blocked");
  assert.deepEqual(b.blocked_reason, { code: "queue-failed", message: "queue stuck" });
});

test("goal block: 缺 --code 报 USAGE；非法政策码格式拒绝", async () => {
  const { dir, config } = setupRun();
  setProductAcceptance(dir, ["compiles"]);
  setGoalStatus(dir, "active");
  const cmds = lifecycleCmds();
  await assert.rejects(
    async () => cmds.block.run(lifeCtx(dir, config)),
    /missing required flag --code/,
    "缺 --code 必须报错",
  );
  await assert.rejects(
    async () => cmds.block.run(lifeCtx(dir, config, { "--code": "BAD CODE" })),
    /lower-kebab/,
    "政策码须 lower-kebab",
  );
});
