import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { statusSnapshot } from "./status.js";

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

test("status snapshot reflects goal, sessions, tasks and merge queue", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["a", "b"]);
  setGoalStatus(dir, "active");
  addChunkAndTask(repo, dir, config, { chunkId: "chunk-a", writePaths: ["src/a/**"] });

  const s = statusSnapshot(dir, config);
  assert.equal(s.goal.status, "active");
  assert.equal(s.goal.scale, "S");
  assert.equal(s.goal.product_acceptance, 2);
  // init registered all platform roles (17) — no sponsor
  assert.equal(s.sessions.total, 17);
  assert.equal(s.sessions.awake.length, 0);
  // one task, latches missing
  assert.equal(s.tasks.length, 1);
  assert.equal(s.tasks[0].brief, "missing");
  assert.equal(s.tasks[0].staffing, "missing");
  assert.equal(s.merge_queue.queued, 0);
  assert.ok(Array.isArray(s.rooms));
});
