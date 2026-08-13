/**
 * Management surface tests: drive the full lifecycle over a temp git repo
 * through the MCP tool defs (same code path the server uses), asserting the
 * existing gates stay intact (P01 acceptance gate, double latch, worktree).
 */
import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { allTools } from "./registry.js";
import { toMcpError } from "./errors.js";
import type { ServerEnv } from "./context.js";
import { resolveRunDir, SessionStore, TranscriptStore } from "@picode/orchestrator";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-mcp-" });
  fs.writeFileSync(path.join(dir, "README.md"), "# tmp\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

/** Invoke a tool exactly like the server does (throw → structured error). */
async function call(
  name: string,
  params: Record<string, unknown>,
  env: ServerEnv,
): Promise<Record<string, unknown>> {
  const t = allTools().find((x) => x.name === name);
  assert.ok(t, `tool not found: ${name}`);
  try {
    const r = await t!.run(params, env);
    return (r ?? {}) as Record<string, unknown>;
  } catch (e) {
    return toMcpError(e) as unknown as Record<string, unknown>;
  }
}

test("init_run → board_view → goal gates → chunk → brief → staffing → prepare", async () => {
  const repo = tmpGitRepo();
  const env: ServerEnv = { repo };

  // init
  const init = await call("init_run", { title: "lifecycle", scale: "S" }, env);
  assert.equal(init.ok, true);
  const runId = String(init.runId);
  assert.ok(runId.startsWith("run-"));
  assert.ok(fs.existsSync(path.join(repo, ".picode", "runs", runId, "goal.yaml")));

  // board_view works on a fresh run (zero write path)
  const board = await call("board_view", { run_id: runId }, env);
  assert.equal(board.ok, true);
  assert.ok(Array.isArray((board.board as { cards: unknown[] }).cards));

  // P01 gate: cannot activate without product acceptance
  const denied = await call("goal_set_status", { run_id: runId, status: "active" }, env);
  assert.ok(denied.isError === true, "activation without acceptance must fail (P01)");
  const deniedText = JSON.parse((denied.content as Array<{ text: string }>)[0].text) as {
    ok: boolean;
  };
  assert.equal(deniedText.ok, false);

  // acceptance → active
  const acc = await call(
    "goal_set_product_acceptance",
    { run_id: runId, items: ["npm test 全绿"] },
    env,
  );
  assert.equal(acc.ok, true);
  const active = await call("goal_set_status", { run_id: runId, status: "active" }, env);
  assert.equal(active.ok, true);

  // chunk → brief (double latch #1)
  const chunk = await call(
    "chunk_add",
    { run_id: runId, chunk_id: "a", write_paths: ["src/**"] },
    env,
  );
  assert.equal(chunk.ok, true);
  const taskId = String(chunk.taskId);
  await call("brief_draft", { run_id: runId, task_id: taskId }, env);
  const briefOk = await call("brief_approve", { run_id: runId, task_id: taskId }, env);
  assert.equal(briefOk.ok, true);

  // staffing (double latch #2)
  const req = await call(
    "staffing_request",
    { run_id: runId, task_id: taskId, skills: ["typescript", "node"] },
    env,
  );
  assert.equal(req.ok, true);
  const personas = await call("staffing_draft_personas", { run_id: runId, task_id: taskId }, env);
  assert.equal(personas.ok, true);
  const check = await call("staffing_check", { run_id: runId, task_id: taskId }, env);
  assert.deepEqual(check.issues, [], "mechanical personas must pass people-qa");
  const appr = await call("staffing_approve", { run_id: runId, task_id: taskId }, env);
  assert.equal(appr.ok, true);

  // prepare creates the worktree (real git side effect)
  const prep = await call("task_prepare", { run_id: runId, task_id: taskId }, env);
  assert.equal(prep.ok, true);
  const worktree = String(prep.worktree);
  assert.ok(fs.existsSync(worktree), "worktree must exist after task_prepare");
  assert.ok(worktree.includes("worktrees"), "worktree lives under .picode/worktrees");

  // session roster shows the triad after staffing
  const roster = await call("session_roster", { run_id: runId }, env);
  assert.equal(roster.ok, true);
  const sessions = (roster.sessions as Array<{ agent_id: string }>).map((s) => s.agent_id);
  assert.ok(
    sessions.includes(`squad-lead@${taskId}`) &&
      sessions.includes(`engineer@${taskId}`) &&
      sessions.includes(`sdet@${taskId}`),
    "triad registered after staffing approve",
  );
});

test("USAGE: management tools require run_id (no server default)", async () => {
  const repo = tmpGitRepo();
  const res = await call("board_view", {}, { repo });
  assert.equal(res.isError, true);
  const body = JSON.parse((res.content as Array<{ text: string }>)[0].text) as {
    code: string;
  };
  assert.equal(body.code, "USAGE");
});

test("NO_RUN: unknown run_id surfaces as structured error, not crash", async () => {
  const repo = tmpGitRepo();
  const res = await call("board_view", { run_id: "run-nope" }, { repo });
  assert.equal(res.isError, true);
  const body = JSON.parse((res.content as Array<{ text: string }>)[0].text) as {
    code: string;
  };
  assert.equal(body.code, "INTERNAL");
});

test("session_wake_direct/sleep_direct with pure state machine (no backend)", async () => {
  const repo = tmpGitRepo();
  const env: ServerEnv = { repo };
  const init = await call("init_run", { title: "sessions" }, env);
  const runId = String(init.runId);

  const reg = await call(
    "session_register",
    { run_id: runId, role_id: "squad-lead", agent_id: "squad-lead@task-x", initial_state: "sleeping" },
    env,
  );
  assert.equal(reg.ok, true);

  const wake = await call("session_wake_direct", { run_id: runId, agent_id: "squad-lead@task-x" }, env);
  assert.equal(wake.ok, true);
  const roster = await call("session_roster", { run_id: runId }, env);
  assert.equal(roster.awake_count, 1);

  const sleep = await call("session_sleep_direct", { run_id: runId, agent_id: "squad-lead@task-x" }, env);
  assert.equal(sleep.ok, true);
  const roster2 = await call("session_roster", { run_id: runId }, env);
  assert.equal(roster2.awake_count, 0);
});

test("R3-C3: continuation_status 返回全会话续跑遥测列（预算/上次投喂/in-flight/平台席）", async () => {
  const repo = tmpGitRepo();
  const env: ServerEnv = { repo };
  const init = await call("init_run", { title: "telemetry" }, env);
  const runId = String(init.runId);
  const { dir } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  const agentId = "engineer@task-telemetry";

  store.register("engineer", { agentId, initialState: "sleeping" });
  await store.wake(agentId, "test");
  await store.attachPiSession(agentId, "oc-ses_tel");
  await store.recordContinuation(agentId);
  await new TranscriptStore(dir).recordOutgoing(agentId, "续跑 prompt");

  const res = await call("continuation_status", { run_id: runId }, env);
  assert.equal(res.ok, true);
  const sessions = res.sessions as Array<{
    agent_id: string;
    state: string;
    continuations_used: number;
    max_per_session: number;
    last_continuation_at: string | null;
    in_flight: boolean;
    platform_seat: boolean;
  }>;
  const row = sessions.find((x) => x.agent_id === agentId);
  assert.ok(row, "sessions column must include the agent");
  assert.equal(row!.continuations_used, 1);
  assert.ok(row!.last_continuation_at, "last feed ts must be exposed");
  assert.equal(row!.in_flight, true, "outgoing without response → in-flight");
  assert.equal(row!.platform_seat, false, "task-bound agent is not a platform seat");
  assert.ok((res.max_per_session as number) >= 0, "top-level budget column present");
  assert.ok(Array.isArray(res.targets), "candidates still exposed");

  const pm = sessions.find((x) => x.agent_id === "pm");
  assert.ok(pm, "platform sessions listed");
  assert.equal(pm!.platform_seat, true, "pm is a platform seat");
  // 纯读：continuation_status 不得写任何状态
  assert.equal(store.get(agentId)!.budget?.continuations, 1);
});
