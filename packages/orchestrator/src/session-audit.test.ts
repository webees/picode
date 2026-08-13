import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, runsRoot } from "@picode/core";
import { createRun, resolveRunDir, setGoalStatus } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import {
  cleanResidual,
  deriveAuditReport,
  isTerminalGoal,
  listRunIds,
} from "./session-audit.js";

function tmpGitRepo(): string {
  return gitInit({ prefix: "picode-session-audit-" });
}

function setupRuns() {
  const repo = tmpGitRepo();
  const config = loadConfig(repo);
  const root = runsRoot(repo, config);
  const makeRun = (title: string) => {
    const { runId } = createRun(repo, { title, scale: "S" });
    return resolveRunDir(repo, runId);
  };
  return { repo, config, root, makeRun };
}

/** 激活 goal（直接改文件，绕开 product_acceptance 门禁——与 self-drive.test 同法）。 */
function activateGoal(dir: string): void {
  const p = path.join(dir, "goal.yaml");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("status: intake", "status: active"));
}

async function wakePlatformSeats(store: SessionStore, agents: string[]): Promise<void> {
  for (const a of agents) await store.wake(a, "audit-test");
}

test("isTerminalGoal: completed/cancelled are terminal; active/intake are not", () => {
  assert.equal(isTerminalGoal("completed"), true);
  assert.equal(isTerminalGoal("cancelled"), true);
  for (const s of ["intake", "draft", "active", "blocked"]) {
    assert.equal(isTerminalGoal(s), false, `goal_status=${s}`);
  }
});

test("deriveAuditReport: empty runsRoot yields all-zero summary", () => {
  const { config, root } = setupRuns();
  const report = deriveAuditReport(path.join(root, "does-not-exist"), config);
  assert.deepEqual(report.summary, {
    runs_total: 0,
    runs_terminal: 0,
    runs_residual: 0,
    awake_total: 0,
    residual_awake: 0,
    max_awake: config.sess_mgr.max_awake,
    max_awake_exhausted: false,
  });
});

test("deriveAuditReport: lists run ids only for dirs with goal.yaml", () => {
  const { root } = setupRuns();
  fs.mkdirSync(path.join(root, "not-a-run"), { recursive: true });
  assert.deepEqual(listRunIds(root), []);
});

test("deriveAuditReport: terminal run with awake sessions is residual", async () => {
  const { config, root, makeRun } = setupRuns();
  const { dir } = makeRun("t1");
  setGoalStatus(dir, "completed");
  const store = new SessionStore(dir);
  await wakePlatformSeats(store, ["run-lead", "pm"]);

  const report = deriveAuditReport(root, config);
  const row = report.runs[0];
  assert.equal(row.goal_status, "completed");
  assert.equal(row.terminal, true);
  assert.deepEqual(row.awake.sort(), ["pm", "run-lead"]);
  assert.equal(row.residual, true);

  assert.equal(report.summary.runs_total, 1);
  assert.equal(report.summary.runs_terminal, 1);
  assert.equal(report.summary.runs_residual, 1);
  assert.equal(report.summary.residual_awake, 2);
});

test("deriveAuditReport: active run with awake sessions is NOT residual; cross-run summary vs max_awake", async () => {
  const { config, root, makeRun } = setupRuns();
  const { dir: active } = makeRun("active-run");
  activateGoal(active);
  await wakePlatformSeats(new SessionStore(active), ["run-lead"]);

  const { dir: done } = makeRun("done-run");
  setGoalStatus(done, "completed");
  await wakePlatformSeats(new SessionStore(done), ["pm", "sess-mgr", "scout"]);

  const report = deriveAuditReport(root, config);
  const byId = new Map(report.runs.map((r) => [r.run_id, r]));
  const rows = [...byId.values()];
  assert.equal(rows.length, 2);

  const activeRow = rows.find((r) => r.goal_status === "active")!;
  assert.equal(activeRow.terminal, false);
  assert.equal(activeRow.residual, false);

  const doneRow = rows.find((r) => r.goal_status === "completed")!;
  assert.equal(doneRow.residual, true);

  assert.equal(report.summary.runs_total, 2);
  assert.equal(report.summary.runs_terminal, 1);
  assert.equal(report.summary.runs_residual, 1);
  assert.equal(report.summary.awake_total, 4);
  assert.equal(report.summary.residual_awake, 3);
  assert.equal(report.summary.max_awake, config.sess_mgr.max_awake);
});

test("cleanResidual: only residual (terminal+awake) runs get closeRun", async () => {
  const { config, root, makeRun } = setupRuns();
  const { dir: active } = makeRun("active-run");
  activateGoal(active);
  await wakePlatformSeats(new SessionStore(active), ["run-lead"]);

  const { dir: done } = makeRun("done-run");
  setGoalStatus(done, "completed");
  await wakePlatformSeats(new SessionStore(done), ["pm"]);

  const closeRunCalls: string[] = [];
  const fakeCloseRun = async (dir: string): Promise<{ dissolved: string[]; slept_platform: string[] }> => {
    closeRunCalls.push(dir);
    return { dissolved: [], slept_platform: ["pm"] };
  };

  const res = await cleanResidual(root, config, { closeRun: fakeCloseRun });
  assert.equal(res.close_run_connected, true);
  assert.equal(closeRunCalls.length, 1);
  assert.ok(closeRunCalls[0].endsWith(path.basename(done)));
  assert.equal(res.cleaned.length, 1);
  assert.equal(res.cleaned[0].slept_platform[0], "pm");

  const skipped = new Map(res.skipped.map((s) => [s.run_id, s.reason]));
  assert.equal(skipped.size, 1);
  assert.equal(skipped.get(path.basename(active)), "not-terminal");
});

test("cleanResidual: no residual runs → empty result without calling closeRun", async () => {
  const { config, root, makeRun } = setupRuns();
  const { dir } = makeRun("t");
  setGoalStatus(dir, "completed");

  let called = false;
  const res = await cleanResidual(root, config, {
    closeRun: async () => {
      called = true;
      return { dissolved: [], slept_platform: [] };
    },
  });
  assert.equal(called, false);
  assert.deepEqual(res.cleaned, []);
  assert.deepEqual(res.skipped, []);
  assert.equal(res.close_run_connected, true);
});

test("cleanResidual: closeRun failure is best-effort — recorded as skipped, others still cleaned", async () => {
  const { config, root, makeRun } = setupRuns();
  const { dir: fail } = makeRun("fail-run");
  setGoalStatus(fail, "completed");
  await wakePlatformSeats(new SessionStore(fail), ["run-lead"]);

  const { dir: ok } = makeRun("ok-run");
  setGoalStatus(ok, "completed");
  await wakePlatformSeats(new SessionStore(ok), ["pm"]);

  const fakeCloseRun = async (dir: string) => {
    if (dir.endsWith(path.basename(fail))) throw new Error("boom");
    return { dissolved: [], slept_platform: ["pm"] };
  };

  const res = await cleanResidual(root, config, { closeRun: fakeCloseRun });
  assert.equal(res.cleaned.length, 1);
  assert.equal(res.cleaned[0].run_id, path.basename(ok));
  const skipped = res.skipped.find((s) => s.run_id === path.basename(fail));
  assert.ok(skipped, "failed run recorded as skipped");
  assert.ok(skipped.reason.includes("boom"));
});

test("deriveAuditReport: --run <id> filter narrows to a single run", async () => {
  const { config, root, makeRun } = setupRuns();
  const { dir: a } = makeRun("run-a");
  setGoalStatus(a, "completed");
  await wakePlatformSeats(new SessionStore(a), ["run-lead"]);
  const { dir: b } = makeRun("run-b");
  activateGoal(b);

  const all = deriveAuditReport(root, config);
  assert.equal(all.runs.length, 2);

  const one = deriveAuditReport(root, config, { runId: path.basename(b) });
  assert.equal(one.runs.length, 1);
  assert.equal(one.runs[0].goal_status, "active");

  const none = deriveAuditReport(root, config, { runId: "run-missing" });
  assert.equal(none.runs.length, 0);
});
