import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createRun,
  parkGoal,
  resolveRunDir,
  setGoalStatus,
  setProductAcceptance,
  sweepDraftPark,
  unparkGoal,
} from "./run-store.js";
import { getDefaultConfig } from "@picode/core";

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
