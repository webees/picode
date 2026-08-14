import { test } from "node:test";
import { gitInit } from "../test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "../run-store.js";
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
