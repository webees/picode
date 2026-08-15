import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask, draftBrief, approveBrief } from "./task.js";
import {
  createChangeOrder,
  readChangeOrders,
  transitionChangeOrder,
  parkDraft,
  ingestTaskKnowledge,
} from "./memory.js";
import { RoomStore } from "@picode/bus";

async function setup() {
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "active");
  const { taskId } = await addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  return { repo, runId, dir, config, taskId };
}

test("change order lifecycle: proposed → applied → closed + leadership notice", async () => {
  const { dir, taskId } = await setup();
  const co = await createChangeOrder(dir, taskId, "use feature flag for module-a", "run-lead");
  assert.equal(co.status, "proposed");
  assert.equal(readChangeOrders(dir).length, 1);
  // bus notice in leadership room
  const bus = new RoomStore(dir);
  const msgs = await bus.history("leadership", "run-lead");
  assert.ok(msgs.some((m) => m.type === "change_order" && m.meta?.co_id === co.id));
  const applied = transitionChangeOrder(dir, co.id, "applied");
  assert.equal(applied.status, "applied");
  assert.ok(applied.applied_at);
  const closed = transitionChangeOrder(dir, co.id, "closed");
  assert.equal(closed.status, "closed");
  assert.throws(() => transitionChangeOrder(dir, co.id, "applied"), /transition not allowed/);
});

test("change order state machine: proposed→closed 直跳被拒、重复 apply 幂等（P1）", async () => {
  const { dir, taskId } = await setup();
  const co = await createChangeOrder(dir, taskId, "flag x", "run-lead");
  // proposed → closed 直跳被拒
  assert.throws(() => transitionChangeOrder(dir, co.id, "closed"), /transition not allowed/);
  // applied 幂等：重复 apply 不重复追加 change_orders
  transitionChangeOrder(dir, co.id, "applied");
  transitionChangeOrder(dir, co.id, "applied");
  const task = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "task.yaml"), "utf8"),
  ) as { change_orders?: Array<{ co_id: string }> };
  const count = task.change_orders?.filter((x) => x.co_id === co.id).length ?? 0;
  assert.equal(count, 1, "重复 apply 只记录一次");
});

test("draft park: draft brief → parked; approved brief cannot be parked", async () => {
  const { dir, taskId } = await setup();
  draftBrief(dir, taskId);
  const parked = parkDraft(dir, taskId);
  assert.equal(parked.status, "parked");
  assert.ok(parked.parked_at);
  const brief = fs.readFileSync(path.join(dir, "tasks", taskId, "brief", "brief.yaml"), "utf8");
  assert.match(brief, /status: parked/);
  // approved brief cannot be parked
  const s2 = await setup();
  draftBrief(s2.dir, s2.taskId);
  approveBrief(s2.dir, s2.taskId, "run-lead");
  assert.throws(() => parkDraft(s2.dir, s2.taskId), /already approved/);
});

test("knowledge ingest writes docs/knowledge/<task_id>.md", async () => {
  const { repo, dir, config, taskId } = await setup();
  const out = ingestTaskKnowledge(repo, dir, config, taskId);
  assert.ok(fs.existsSync(out));
  assert.match(out, /docs[\\/]knowledge[\\/]task-chunk-a\.md$/);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /Knowledge — task-chunk-a/);
  assert.match(md, /Acceptance/);
});
