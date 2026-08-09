import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "picode-test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

function setup() {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["x"]);
  setGoalStatus(dir, "active");
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  return { repo, runId, dir, config, taskId };
}

test("change order lifecycle: proposed → applied → closed + leadership notice", async () => {
  const { dir, taskId } = setup();
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
  assert.throws(() => transitionChangeOrder(dir, co.id, "applied"), /already closed/);
});

test("draft park: draft brief → parked; approved brief cannot be parked", () => {
  const { dir, taskId } = setup();
  draftBrief(dir, taskId);
  const parked = parkDraft(dir, taskId);
  assert.equal(parked.status, "parked");
  assert.ok(parked.parked_at);
  const brief = fs.readFileSync(path.join(dir, "tasks", taskId, "brief", "brief.yaml"), "utf8");
  assert.match(brief, /status: parked/);
  // approved brief cannot be parked
  const s2 = setup();
  draftBrief(s2.dir, s2.taskId);
  approveBrief(s2.dir, s2.taskId, "run-lead");
  assert.throws(() => parkDraft(s2.dir, s2.taskId), /already approved/);
});

test("knowledge ingest writes docs/knowledge/<task_id>.md", () => {
  const { repo, dir, config, taskId } = setup();
  const out = ingestTaskKnowledge(repo, dir, config, taskId);
  assert.ok(fs.existsSync(out));
  assert.match(out, /docs[\\/]knowledge[\\/]task-chunk-a\.md$/);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /Knowledge — task-chunk-a/);
  assert.match(md, /Acceptance/);
});
