import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { approveStaffing, createStaffingRequest, draftPersonas } from "./staffing.js";
import { HANDOFF_FILES, ackHandoff, submitEvidence } from "./closure.js";
import { readScores, scoreTask } from "./hr-score.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-score-test-"));
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
  setProductAcceptance(dir, ["module-a compiles and tests pass"]);
  setGoalStatus(dir, "active");
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  return { repo, runId, dir, config, taskId };
}

async function hire(repo: string, dir: string, config: ReturnType<typeof resolveRunDir>["config"], taskId: string) {
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript", "testing"] });
  draftPersonas(repo, dir, config, taskId);
  const { staffing } = await approveStaffing(dir, config, taskId);
  return staffing;
}

/** Simulate a finished, well-delivered task: evidence pass + full handoff + ack. */
function finishTask(dir: string, taskId: string): void {
  const tpath = path.join(dir, "tasks", taskId, "task.yaml");
  const task = YAML.parse(fs.readFileSync(tpath, "utf8")) as { status: string; retries: number };
  task.status = "dissolved";
  task.retries = 0;
  fs.writeFileSync(tpath, YAML.stringify(task));
  submitEvidence(dir, taskId, {
    cmds: [{ cmd: "npm test", exit_code: 0, log_ref: "evidence/test.log" }],
    by: `sdet@${taskId}`,
  });
  const hd = path.join(dir, "tasks", taskId, "handoff");
  fs.mkdirSync(hd, { recursive: true });
  for (const f of HANDOFF_FILES) fs.writeFileSync(path.join(hd, f), `# ${f}\n`);
  ackHandoff(dir, taskId, "tpm");
}

test("score: happy path yields ~100 team/persona and persists scores.yaml + knowledge archives", async () => {
  const { repo, dir, config, taskId } = setup();
  const staffing = await hire(repo, dir, config, taskId);
  finishTask(dir, taskId);

  const scores = scoreTask(repo, dir, config, taskId, { by: "people-qa", note: "clean run" });
  // base 50 + evidence 30 + dissolved 10 + ack 5 + retries 0 + handoff 0 = 95
  assert.equal(scores.team_score, 95);
  assert.equal(scores.team_name, staffing.team_name);
  assert.equal(scores.scored_by, "people-qa");
  assert.equal(scores.note, "clean run");
  assert.equal(scores.persona_scores.length, 3);
  for (const ps of scores.persona_scores) {
    assert.ok(ps.codename.length > 0, "persona score must carry the codename");
    assert.equal(ps.breakdown.seat > 0, true, `seat delta for ${ps.seat} should be positive`);
  }
  // codename archive
  const eng = scores.persona_scores.find((p) => p.seat === "engineer")!;
  const pArch = YAML.parse(
    fs.readFileSync(path.join(repo, "docs/knowledge/hr/personas", `${eng.codename}.yaml`), "utf8"),
  ) as { kind: string; seat: string; records: Array<{ task_id: string; score: number }>; summary: { count: number; avg: number } };
  assert.equal(pArch.kind, "persona");
  assert.equal(pArch.seat, "engineer");
  assert.equal(pArch.records.length, 1);
  assert.equal(pArch.records[0].task_id, taskId);
  assert.equal(pArch.summary.count, 1);
  // team archive
  const tArch = YAML.parse(
    fs.readFileSync(path.join(repo, "docs/knowledge/hr/teams", `${staffing.team_name}.yaml`), "utf8"),
  ) as { kind: string; records: Array<{ score: number }> };
  assert.equal(tArch.kind, "team");
  assert.equal(tArch.records[0].score, 95);
  // on-disk scores.yaml readable
  const onDisk = readScores(dir, taskId)!;
  assert.equal(onDisk.team_score, 95);
});

test("score: re-scoring is idempotent (archive records keyed by task+seat)", async () => {
  const { repo, dir, config, taskId } = setup();
  const staffing = await hire(repo, dir, config, taskId);
  finishTask(dir, taskId);
  scoreTask(repo, dir, config, taskId);
  scoreTask(repo, dir, config, taskId);
  const tArch = YAML.parse(
    fs.readFileSync(path.join(repo, "docs/knowledge/hr/teams", `${staffing.team_name}.yaml`), "utf8"),
  ) as { records: unknown[]; summary: { count: number } };
  assert.equal(tArch.records.length, 1);
  assert.equal(tArch.summary.count, 1);
});

test("score: failed evidence and retries drag the score down", async () => {
  const { repo, dir, config, taskId } = setup();
  await hire(repo, dir, config, taskId);
  const tpath = path.join(dir, "tasks", taskId, "task.yaml");
  const task = YAML.parse(fs.readFileSync(tpath, "utf8")) as { status: string; retries: number };
  task.status = "failed";
  task.retries = 2;
  fs.writeFileSync(tpath, YAML.stringify(task));
  submitEvidence(dir, taskId, {
    cmds: [{ cmd: "npm test", exit_code: 1, log_ref: "evidence/fail.log" }],
    by: `sdet@${taskId}`,
  });

  const scores = scoreTask(repo, dir, config, taskId);
  // base 50 + evidence −30 + failed −10 + ack 0 + retries −10 = 0; sdet seat −5 (fail)
  assert.equal(scores.team_score, 0);
  const sdet = scores.persona_scores.find((p) => p.seat === "sdet")!;
  assert.equal(sdet.score, 0);
  assert.equal(sdet.breakdown.seat, -5);
});

test("score: refuses without approved staffing", () => {
  const { repo, dir, config, taskId } = setup();
  assert.throws(() => scoreTask(repo, dir, config, taskId), /staffing not approved/);
});

test("score: refuses a task that has not finished (16 §9 P07 gate)", async () => {
  const { repo, dir, config, taskId } = setup();
  await hire(repo, dir, config, taskId);
  // task.status is still "queued" (never dissolved) → must refuse
  assert.throws(() => scoreTask(repo, dir, config, taskId), /not finished/);
});
