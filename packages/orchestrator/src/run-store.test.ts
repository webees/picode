import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  blockGoal,
  createRun,
  disarmGoal,
  parkGoal,
  readGoal,
  recordGoalRound,
  resolveRunDir,
  resumeGoal,
  setGoalStatus,
  setProductAcceptance,
  sweepDraftPark,
  unparkGoal,
  updateGoal,
} from "./run-store.js";
import { ErrorCode, PicodeError, getDefaultConfig, readYamlFile, writeYamlFile } from "@picode/core";

/** 模拟旧格式：从当前 goal.yaml 抹掉 C1 增量字段（revision/rounds/activation/…）。 */
function stripGoalIncrementalFields(dir: string): void {
  const p = path.join(dir, "goal.yaml");
  const rec = readYamlFile<Record<string, unknown>>(p)!;
  for (const k of ["revision", "rounds_started", "max_goal_rounds", "activation", "blocked_reason"]) {
    delete rec[k];
  }
  writeYamlFile(p, rec);
}

function freshRun(): { repo: string; runId: string; dir: string } {
  const repo = tmpGitRepo({ prefix: "picode-runs-", readme: "# t\n" });
  const { runId } = createRun(repo, { title: "goal-001" });
  const { dir } = resolveRunDir(repo, runId);
  return { repo, runId, dir };
}

test("P01: goal cannot activate without product acceptance criteria", () => {
  const { dir } = freshRun();
  assert.throws(() => setGoalStatus(dir, "active"), /no product acceptance criteria/);
  // sponsor (CLI) sets acceptance, then activation works
  setProductAcceptance(dir, ["compiles"]);
  const goal = setGoalStatus(dir, "active");
  assert.equal(goal.status, "active");
  assert.ok(goal.user_confirmed_at, "user_confirmed_at = sponsor confirmation time");
  assert.ok(fs.existsSync(path.join(dir, "product", "brief.md")));
});

test("parkGoal rejects non-draft goals; unpark clears park state", () => {
  const { dir } = freshRun();
  assert.throws(() => parkGoal(dir, "idle"), /only draft goals can be parked/);
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "draft");
  const parked = parkGoal(dir, "idle");
  assert.ok(parked.parked_at);
  assert.equal(parked.park_reason, "idle");
  const unparked = unparkGoal(dir);
  assert.equal(unparked.parked_at, null);
  assert.equal(unparked.park_reason, null);
});

test("resolveRunDir on a missing run fails", () => {
  const repo = tmpGitRepo({ prefix: "picode-runs-", readme: "# t\n" });
  assert.throws(() => resolveRunDir(repo, "run-does-not-exist"), /run not found/);
});

test("sweepDraftPark parks only idle drafts under the park policy", () => {
  const { dir } = freshRun();
  const config = getDefaultConfig();
  // not a draft → untouched
  assert.equal(sweepDraftPark(dir, config), null);
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "draft");
  // draft_idle_sec default 86400 — the goal was just created, so not idle
  assert.equal(sweepDraftPark(dir, config), null);
  // force idleness by backdating created_at
  const goalPath = path.join(dir, "goal.yaml");
  const raw = fs.readFileSync(goalPath, "utf8").replace(
    /created_at: .*/,
    `created_at: ${new Date(Date.now() - 2 * 86400 * 1000).toISOString()}`,
  );
  fs.writeFileSync(goalPath, raw);
  const parked = sweepDraftPark(dir, config);
  assert.ok(parked && parked.parked_at, "idle draft parked by sweep");
  // parked goals never get swept again
  assert.equal(sweepDraftPark(dir, config), null);
});

// ---------------------------------------------------------------------------
// C1 goal-crossrun（A1/A3/A4）：增量字段默认补齐 + revision CAS + lifecycle 语义
// ---------------------------------------------------------------------------

test("A1: 旧格式 goal.yaml（无新字段）readGoal 直接可读并补齐默认值", () => {
  const { dir } = freshRun();
  stripGoalIncrementalFields(dir);
  const goal = readGoal(dir);
  assert.equal(goal.revision, 0, "旧格式 revision 默认 0");
  assert.equal(goal.rounds_started, 0, "旧格式 rounds_started 默认 0");
  assert.equal(goal.max_goal_rounds, 0, "旧格式 max_goal_rounds 默认 0（不限）");
  assert.equal(goal.blocked_reason, null, "旧格式 blocked_reason 默认 null");
  assert.equal(goal.activation, "disarmed", "非 active 旧格式默认 disarmed");
  // 既有字段不受影响
  assert.equal(goal.status, "intake");
  assert.ok(goal.title);
});

test("A1: 旧格式 active goal → activation 按 set-status 语义默认 armed（行为兼容）", () => {
  const { dir } = freshRun();
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "active");
  stripGoalIncrementalFields(dir);
  assert.equal(readGoal(dir).activation, "armed", "旧 active goal 曾显式激活 → 续跑照旧");
});

test("A1: createRun 写入增量字段（activation 默认 disarmed；max_goal_rounds 取自 config）", () => {
  const repo = tmpGitRepo({ prefix: "picode-goal-rounds-", readme: "# t\n" });
  fs.mkdirSync(path.join(repo, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".picode", "config.yaml"),
    "self_evolve:\n  goal:\n    max_rounds: 3\n",
  );
  const { runId } = createRun(repo, { title: "goal-rounds" });
  const { dir } = resolveRunDir(repo, runId);
  const goal = readGoal(dir);
  assert.equal(goal.revision, 0);
  assert.equal(goal.rounds_started, 0);
  assert.equal(goal.max_goal_rounds, 3, "config self_evolve.goal.max_rounds 写入 goal.yaml");
  assert.equal(goal.activation, "disarmed", "新 run 默认 disarmed（无显式 resume 不自动续跑）");
  assert.equal(goal.blocked_reason, null);
});

test("A3: revision CAS —— 陈旧 expected 拒绝，合法 expected 递增", () => {
  const { dir } = freshRun();
  assert.equal(readGoal(dir).revision, 0);
  const updated = updateGoal(dir, 0, (g) => {
    g.title = "t2";
  });
  assert.equal(updated.revision, 1, "每次变更 revision +1");
  // 陈旧 expected（当前已是 1）→ 拒绝（ILLEGAL_TRANSITION 复用，C3 errors.ts 不新增码）
  assert.throws(
    () =>
      updateGoal(dir, 0, (g) => {
        g.title = "t3";
      }),
    (e: unknown) =>
      e instanceof PicodeError &&
      e.code === ErrorCode.ILLEGAL_TRANSITION &&
      /stale revision/.test(e.message),
  );
  assert.equal(readGoal(dir).title, "t2", "陈旧写不得落地");
  // 不带 expected → 仍然写（向后兼容既有调用方）
  const last = updateGoal(dir, undefined, (g) => {
    g.title = "t4";
  });
  assert.equal(last.revision, 2);
  // 旧格式（revision 0 默认）首笔变更 → revision 1
  stripGoalIncrementalFields(dir);
  const legacyBump = setGoalStatus(dir, "active", {
    clearOpenQuestions: true,
    skipProductAcceptanceCheck: true,
  });
  assert.equal(legacyBump.revision, 1, "旧格式 goal 变更后从 0 起递增");
});

test("A3: resume/disarm/block —— activation 门闩 + 政策码 + GOAL_TRANSITIONS 围栏", () => {
  const { dir } = freshRun();
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "active");
  assert.equal(readGoal(dir).activation, "disarmed", "set-status 不自动 arm（新语义）");
  // resume（active）→ armed
  assert.equal(resumeGoal(dir).activation, "armed");
  // disarm → disarmed
  assert.equal(disarmGoal(dir).activation, "disarmed");
  // block active → blocked + 政策码
  const blocked = blockGoal(dir, "provider-limit", "provider down");
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blocked_reason, { code: "provider-limit", message: "provider down" });
  // resume 清除 blocker 回 active 且置 armed
  const resumed = resumeGoal(dir);
  assert.equal(resumed.status, "active");
  assert.equal(resumed.blocked_reason, null);
  assert.equal(resumed.activation, "armed");
  // 非法转换拒绝
  const fresh = freshRun();
  assert.throws(() => blockGoal(fresh.dir, "round-limit", ""), /not allowed/, "intake → blocked 拒绝");
  assert.throws(() => resumeGoal(fresh.dir), /not allowed/, "intake 不可 resume");
  assert.throws(() => blockGoal(fresh.dir, "BAD CODE", ""), /lower-kebab/, "政策码须 lower-kebab");
  // 终态不可 resume
  const done = freshRun();
  setProductAcceptance(done.dir, ["x"]);
  setGoalStatus(done.dir, "active");
  setGoalStatus(done.dir, "completed");
  assert.throws(() => resumeGoal(done.dir), /not allowed/, "completed 不可 resume");
});

test("A4: 回合预算 —— rounds_started 递增；达上限 resume 拒绝", () => {
  const { dir } = freshRun();
  // goal.yaml 显式字段覆盖 config（文件真相）
  updateGoal(dir, undefined, (g) => {
    g.max_goal_rounds = 2;
  });
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "active");
  resumeGoal(dir); // armed
  const r1 = recordGoalRound(dir);
  const r2 = recordGoalRound(dir);
  assert.equal(r2.rounds_started, 2);
  assert.equal(r1.revision + 1, r2.revision, "每次 goal 变更 revision 递增");
  disarmGoal(dir);
  assert.throws(
    () => resumeGoal(dir),
    (e: unknown) => e instanceof PicodeError && /round budget exhausted/.test(e.message),
    "达上限 resume 拒绝",
  );
  assert.equal(readGoal(dir).activation, "disarmed", "拒绝后保持 disarmed");
});

test("A4: 旧格式 goal max_goal_rounds=0 → resume 不因预算拒绝（默认不限）", () => {
  const { dir } = freshRun();
  stripGoalIncrementalFields(dir);
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "active");
  assert.equal(readGoal(dir).max_goal_rounds, 0, "旧格式预算 0 = 不限");
  assert.equal(resumeGoal(dir).activation, "armed", "0 预算不拒绝 resume");
});
