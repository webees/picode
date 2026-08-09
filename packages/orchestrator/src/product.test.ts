import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance, readGoal } from "./run-store.js";
import { RoomStore } from "@picode/bus";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
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
  return { repo, runId, dir, config };
}

test("active is rejected before product acceptance criteria exist (P01)", () => {
  const { dir } = setup();
  assert.throws(() => setGoalStatus(dir, "active"), /no product acceptance criteria/);
  assert.equal(readGoal(dir).status, "intake");
});

test("setProductAcceptance then active succeeds; product/brief.md written", () => {
  const { dir } = setup();
  setProductAcceptance(dir, ["module-a compiles", "tests pass"]);
  const goal = setGoalStatus(dir, "active");
  assert.equal(goal.status, "active");
  assert.deepEqual(goal.product_acceptance, ["module-a compiles", "tests pass"]);
  assert.ok(goal.user_confirmed_at);
  const brief = fs.readFileSync(path.join(dir, "product", "brief.md"), "utf8");
  assert.match(brief, /module-a compiles/);
});

test("product room members include pm and sponsor (T28)", () => {
  const { dir } = setup();
  const bus = new RoomStore(dir);
  const members = bus.loadMembers("product");
  assert.ok(members.some((m) => m.id === "pm" && m.access === "post"));
  assert.ok(members.some((m) => m.id === "sponsor" && m.access === "post"));
});

test("sponsor human channel: only chat posts allowed (18 phase E)", async () => {
  const { dir } = setup();
  const bus = new RoomStore(dir);
  // sponsor may chat
  await bus.post("product", "sponsor", { type: "chat", body: "hello", refs: [] });
  // sponsor may NOT post progress (would fake an agent signal)
  await assert.rejects(
    () => bus.post("product", "sponsor", { type: "progress", body: "pong", refs: [] }),
    /ROOM_POST_DENIED/,
  );
});
