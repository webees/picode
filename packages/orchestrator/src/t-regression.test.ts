import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import {
  getDefaultConfig,
  loadConfig,
  roomDisplay,
  validateConfig,
  writeAtomic,
} from "@picode/core";
import { RoomStore } from "@picode/bus";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import {
  addChunkAndTask,
  approveBrief,
  draftBrief,
  prepareTask,
  printSpawnEnv,
} from "./task.js";
import {
  approveStaffing,
  createStaffingRequest,
  draftPersonas,
} from "./staffing.js";
import { SessionStore } from "./session-store.js";

/**
 * Regression tests for playbook assertions that previously had no automated
 * coverage: T01/T02/T10/T13/T14/T15/T17 (11 regression checklist MUST).
 */

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-reg-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

test("T01: implement task cannot be created before goal is active", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  assert.throws(
    () => addChunkAndTask(repo, dir, config, { chunkId: "c1", writePaths: ["src/**"] }),
    /goal not active/,
  );
});

test("T02: goal with open questions cannot be activated", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  // simulate an intake with an open question recorded on the goal
  const goalPath = path.join(dir, "goal.yaml");
  const goal = YAML.parse(fs.readFileSync(goalPath, "utf8")) as { open_questions: string[] };
  goal.open_questions = ["Is the API v2 in scope?"];
  writeAtomic(goalPath, YAML.stringify(goal));
  assert.throws(() => setGoalStatus(dir, "active"), /open_questions/);
});

test("T10: init outside a git repository fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-nogit-"));
  assert.throws(() => createRun(dir, { title: "x" }), /Not a git repository/);
});

test("T13: room display_name override does not change the bus room id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-t13-"));
  fs.mkdirSync(path.join(dir, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".picode", "config.yaml"),
    [
      "rooms:",
      "  - id: leadership",
      "    display_name: 领导舱",
      "    enabled: true",
    ].join("\n") + "\n",
  );
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  const config = loadConfig(dir);
  assert.equal(roomDisplay(config, "leadership"), "领导舱");
  const { runId } = createRun(dir, { title: "g" });
  const { dir: runDir } = resolveRunDir(dir, runId);
  const store = new RoomStore(runDir);
  // bus room id stays the logical id, display is presentation-only
  const members = store.loadMembers("leadership");
  assert.ok(members.length > 0);
  assert.ok(store.loadMembers("领导舱").length === 0);
});

test("T14: disabling a required room without a replacement fails validation", () => {
  const base = getDefaultConfig();
  const broken = {
    ...base,
    rooms: base.rooms.map((r) =>
      r.id === "leadership" ? { ...r, enabled: false } : r,
    ),
  };
  assert.throws(() => validateConfig(broken), /required room disabled or missing/);
});

test("T15: cells.templates pointing at an unknown role fails validation", () => {
  const base = getDefaultConfig();
  const broken = {
    ...base,
    cells: {
      ...base.cells,
      templates: {
        ...base.cells.templates,
        implement: {
          ...base.cells.templates.implement,
          lead_role: "no-such-role",
        },
      },
    },
  };
  assert.throws(() => validateConfig(broken), /not in roles/);
});

test("T17: engineer spawn env never embeds unapproved research text", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "g", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["works"]);
  setGoalStatus(dir, "active");
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/a/**"],
  });
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await createStaffingRequest(dir, config, taskId, { skills: ["ts"] });
  draftPersonas(repo, dir, config, taskId);
  await approveStaffing(dir, config, taskId, "run-lead");
  prepareTask(repo, dir, config, taskId);

  // put an unapproved research brief on disk — it must not leak into spawn env
  const researchDir = path.join(dir, "research", "briefs");
  fs.mkdirSync(researchDir, { recursive: true });
  const secretFindings = "UNREVIEWED-FINDING-xyz";
  fs.writeFileSync(
    path.join(researchDir, "intake.md"),
    `# Research\n\n${secretFindings}\n`,
  );

  const env = printSpawnEnv(repo, dir, config, taskId, "engineer", "/ext/index.js");
  assert.ok(!env.includes(secretFindings), "research text leaked into spawn env");
  assert.ok(!env.includes("research"), "no research reference in spawn env");
  // the approved brief path is the only briefing the engineer receives
  assert.ok(env.includes("WORK_BRIEF.md"));
  // every squad session is awake after approval (D031: task_ready fires)
  const sessions = new SessionStore(dir);
  for (const s of [`squad-lead@${taskId}`, `engineer@${taskId}`, `sdet@${taskId}`]) {
    assert.equal(sessions.get(s)?.state, "awake");
  }
});
