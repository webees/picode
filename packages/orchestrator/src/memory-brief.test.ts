import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import {
  createRun,
  resolveRunDir,
  setGoalStatus,
  setProductAcceptance,
  parkGoal,
  unparkGoal,
  sweepDraftPark,
} from "./run-store.js";
import { addChunkAndTask, draftBrief } from "./task.js";
import { writeMemoryBrief, ackMemoryBrief, listMemoryBriefs } from "./docs-memory.js";
import { createChangeOrder, transitionChangeOrder, readChangeOrders } from "./memory.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@p"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

async function setup() {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["compiles"]);
  setGoalStatus(dir, "active");
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  return { repo, runId, dir, config, taskId };
}

test("Memory Brief: docs-lead delivers, run-lead acks (I14 / 11 DoD)", async () => {
  const { dir } = await setup();
  const brief = writeMemoryBrief(dir, {
    l1_summary: "module-a implemented, docs updated",
    l2_paths: ["docs/knowledge/task-chunk-a.md"],
    risks: ["sec review pending"],
    by: "docs-lead",
  });
  assert.equal(brief.status, "delivered");
  assert.equal(brief.by, "docs-lead");
  assert.ok(listMemoryBriefs(dir).length === 1);

  const acked = ackMemoryBrief(dir, brief.id, "run-lead");
  assert.equal(acked.status, "acked");
  assert.equal(acked.acked_by, "run-lead");
  assert.ok(acked.acked_at);
  // idempotent ack
  ackMemoryBrief(dir, brief.id);
  assert.equal(listMemoryBriefs(dir)[0].status, "acked");
  // unknown id
  assert.throws(() => ackMemoryBrief(dir, "mb-nope"), /not found/);
});

test("DoD: change_order apply updates the in-flight task (task.yaml)", async () => {
  const { dir, taskId } = await setup();
  draftBrief(dir, taskId);
  const co = await createChangeOrder(dir, taskId, "module-a must also build with flag X", "run-lead");
  transitionChangeOrder(dir, co.id, "applied");
  const task = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "task.yaml"), "utf8"),
  ) as { change_orders?: Array<{ co_id: string }> };
  assert.ok(task.change_orders?.some((c) => c.co_id === co.id), "task must record the change");
  assert.equal(readChangeOrders(dir)[0].status, "applied");
});

test("goal draft park: only draft can park; unpark restores (07§7)", async () => {
  const { dir } = await setup();
  // active goal cannot be parked
  assert.throws(() => parkGoal(dir), /only draft/);
  setGoalStatus(dir, "draft");
  const parked = parkGoal(dir, "draft-idle-sweep");
  assert.ok(parked.parked_at);
  assert.equal(parked.park_reason, "draft-idle-sweep");
  const restored = unparkGoal(dir);
  assert.equal(restored.parked_at, null);
});

test("goal draft sweep parks idle drafts when policy is park", async () => {
  const { dir, config } = await setup();
  setGoalStatus(dir, "draft");
  // backdate created_at to make the draft idle beyond draft_idle_sec=0
  const p = path.join(dir, "goal.yaml");
  const goal = YAML.parse(fs.readFileSync(p, "utf8"));
  goal.created_at = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(p, YAML.stringify(goal));
  // config override: idle 0 + park policy
  fs.writeFileSync(path.join(dir, "config.override.yaml"), `timeouts:\n  draft_idle_sec: 0\n  draft_idle_policy: park\n`);
  const cfg = JSON.parse(JSON.stringify(config));
  cfg.timeouts = { ...cfg.timeouts, draft_idle_sec: 0, draft_idle_policy: "park" };
  const parked = sweepDraftPark(dir, cfg);
  assert.ok(parked, "idle draft should be parked");
  assert.ok(parked.parked_at);
});
