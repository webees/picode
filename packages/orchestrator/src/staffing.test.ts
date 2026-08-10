import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask, approveBrief, draftBrief, prepareTask } from "./task.js";
import { SessionStore } from "./session-store.js";
import {
  approveStaffing,
  checkPersonas,
  createStaffingRequest,
  draftPersonas,
  parsePersonaFile,
  readStaffing,
} from "./staffing.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  // seed an initial commit so `git worktree add -b <branch> <path> main` works
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
  // P01: product acceptance criteria before active (18 phase E).
  setProductAcceptance(dir, ["module-a compiles and tests pass"]);
  setGoalStatus(dir, "active");
  const { taskId } = addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: ["src/module-a/**"],
  });
  return { repo, runId, dir, config, taskId };
}

async function fullHire(repo: string, dir: string, config: ReturnType<typeof resolveRunDir>["config"], taskId: string) {
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript", "testing"] });
  draftPersonas(repo, dir, config, taskId);
  const { staffing, wokeSquad } = await approveStaffing(dir, config, taskId);
  return { staffing, wokeSquad };
}

test("T18/T24: prepare fails without staffing approval (double latch)", () => {
  const { repo, dir, config, taskId } = setup();
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  // brief approved, staffing missing → prepare must fail
  assert.throws(() => prepareTask(repo, dir, config, taskId), /staffing not approved/);
});

test("T24: prepare fails without brief approval even when staffed", async () => {
  const { repo, dir, config, taskId } = setup();
  setGoalStatus(dir, "active");
  await fullHire(repo, dir, config, taskId);
  // staffing approved, brief missing → prepare must fail
  assert.throws(() => prepareTask(repo, dir, config, taskId), /work brief/);
});

test("prepare succeeds only with both latches", async () => {
  const { repo, dir, config, taskId } = setup();
  setGoalStatus(dir, "active");
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await fullHire(repo, dir, config, taskId);
  const r = prepareTask(repo, dir, config, taskId);
  assert.ok(r.worktree);
  assert.ok(r.branch);
});

test("T19: people-qa fails when a persona seat is missing", async () => {
  const { repo, dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId);
  draftPersonas(repo, dir, config, taskId);
  // delete the sdet persona
  fs.unlinkSync(path.join(dir, "tasks", taskId, "staffing", "personas", "sdet.md"));
  const issues = checkPersonas(dir, config, taskId);
  const sdetIssue = issues.find((i) => i.seat === "sdet");
  assert.ok(sdetIssue, "sdet should have an issue");
  assert.match(sdetIssue.problems[0], /missing/);
  await assert.rejects(() => approveStaffing(dir, config, taskId), /people-qa failed/);
});

test("T25: people-qa fails when persona lacks mission", async () => {
  const { repo, dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId);
  draftPersonas(repo, dir, config, taskId);
  // strip mission from engineer persona frontmatter
  const p = path.join(dir, "tasks", taskId, "staffing", "personas", "engineer.md");
  const { frontmatter, body } = parsePersonaFile(p);
  const mutable = frontmatter as unknown as Record<string, unknown>;
  delete mutable.mission;
  fs.writeFileSync(p, `---\n${JSON.stringify(mutable, null, 2)}\n---\n${body}\n`);
  const issues = checkPersonas(dir, config, taskId);
  const eng = issues.find((i) => i.seat === "engineer");
  assert.ok(eng, "engineer should have an issue");
  assert.match(eng.problems.join("; "), /mission/);
});

test("staffing request wakes the people cell (17 §5.3)", async () => {
  const { dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId);
  const store = new SessionStore(dir);
  const awake = store.awake().map((s) => s.agent_id).sort();
  assert.deepEqual(awake, ["people-lead", "people-qa", "recruiter"]);
});

test("staffing approve locks staffing.yaml and registers triad sessions", async () => {
  const { repo, dir, config, taskId } = setup();
  const { staffing } = await fullHire(repo, dir, config, taskId);
  assert.equal(staffing.status, "approved");
  assert.equal(staffing.approved_by, "run-lead");
  assert.ok(staffing.approved_at);
  assert.deepEqual(Object.keys(staffing.triad).sort(), ["engineer", "sdet", "squad-lead"]);

  const store = new SessionStore(dir);
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    const s = store.get(`${seat}@task-chunk-a`);
    assert.ok(s, `session for ${seat}@task-chunk-a`);
    assert.equal(s.state, "sleeping");
  }
  // on disk
  const onDisk = readStaffing(dir, taskId)!;
  assert.equal(onDisk.triad.engineer.agent_id, "engineer@task-chunk-a");
});

test("double latch fires task_ready (squad awake) when brief already approved", async () => {
  const { repo, dir, config, taskId } = setup();
  setGoalStatus(dir, "active");
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  const { wokeSquad } = await fullHire(repo, dir, config, taskId);
  assert.equal(wokeSquad, true);
  const store = new SessionStore(dir);
  assert.equal(store.get("squad-lead@task-chunk-a")!.state, "awake");
  assert.equal(store.get("engineer@task-chunk-a")!.state, "awake");
  assert.equal(store.get("sdet@task-chunk-a")!.state, "awake");
});

test("persona files carry full 17 §6 dimensions after draft", async () => {
  const { repo, dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId);
  draftPersonas(repo, dir, config, taskId);
  const { frontmatter } = parsePersonaFile(
    path.join(dir, "tasks", taskId, "staffing", "personas", "engineer.md"),
  );
  for (const key of [
    "seat",
    "instance_id",
    "display_name",
    "mission",
    "scope_in",
    "scope_out",
    "skills",
    "stack",
    "communication",
    "risk_posture",
    "tool_profile",
    "write_paths",
    "read_paths",
    "reports_to",
    "handoff_to",
    "rooms_post",
    "acceptance_focus",
    "definition_of_done",
    "forbidden",
    "must_read_refs",
  ]) {
    assert.ok(key in frontmatter, `missing dimension ${key}`);
  }
  assert.equal(frontmatter.tool_profile, "implement.engineer");
  assert.deepEqual(frontmatter.write_paths, ["src/module-a/**"]);
  assert.equal(frontmatter.check_rubric, null); // non-check seat
  const sdet = parsePersonaFile(
    path.join(dir, "tasks", taskId, "staffing", "personas", "sdet.md"),
  ).frontmatter;
  assert.ok(sdet.check_rubric, "sdet must carry check_rubric");
});

test("naming: personas get a deterministic codename and triad a team name (16 §8)", async () => {
  const { repo, dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript", "testing"] });
  draftPersonas(repo, dir, config, taskId);
  const eng = parsePersonaFile(
    path.join(dir, "tasks", taskId, "staffing", "personas", "engineer.md"),
  ).frontmatter;
  assert.ok(eng.codename && eng.codename.length > 0, "engineer persona needs a codename");
  // deterministic across re-drafts (same instance id → same codename)
  draftPersonas(repo, dir, config, taskId);
  const eng2 = parsePersonaFile(
    path.join(dir, "tasks", taskId, "staffing", "personas", "engineer.md"),
  ).frontmatter;
  assert.equal(eng.codename, eng2.codename);
  const { staffing } = await approveStaffing(dir, config, taskId);
  assert.ok(staffing.team_name && staffing.team_name.length > 0, "triad needs a team name");
});

test("naming: request overrides win over deterministic generation (16 §8)", async () => {
  const { repo, dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId, {
    teamName: "北辰",
    codenameOverrides: { engineer: "白泽" },
    skills: ["typescript", "testing"],
  });
  draftPersonas(repo, dir, config, taskId);
  const eng = parsePersonaFile(
    path.join(dir, "tasks", taskId, "staffing", "personas", "engineer.md"),
  ).frontmatter;
  assert.equal(eng.codename, "白泽");
  const { staffing } = await approveStaffing(dir, config, taskId);
  assert.equal(staffing.team_name, "北辰");
});

test("naming: unsafe codename/team_name overrides are rejected (16 §8 file-name guard)", async () => {
  const { repo, dir, config, taskId } = setup();
  // unsafe team name → approve must fail
  await createStaffingRequest(dir, config, taskId, {
    teamName: "../../escape",
    codenameOverrides: { engineer: "白泽" },
    skills: ["typescript", "testing"],
  });
  draftPersonas(repo, dir, config, taskId);
  await assert.rejects(() => approveStaffing(dir, config, taskId), /not a safe name/);
  // unsafe codename → people-qa check must flag it
  const { dir: dir2, config: config2, taskId: taskId2, repo: repo2 } = setup();
  await createStaffingRequest(dir2, config2, taskId2, {
    teamName: "北辰",
    codenameOverrides: { engineer: "../evil" },
    skills: ["typescript", "testing"],
  });
  draftPersonas(repo2, dir2, config2, taskId2);
  const issues = checkPersonas(dir2, config2, taskId2);
  const eng = issues.find((i) => i.seat === "engineer");
  assert.ok(eng, "engineer should have an issue");
  assert.match(eng.problems.join("; "), /not a safe name/);
});

test("naming: non-string codename (YAML number) is rejected, not coerced", async () => {
  const { repo, dir, config, taskId } = setup();
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript", "testing"] });
  draftPersonas(repo, dir, config, taskId);
  const p = path.join(dir, "tasks", taskId, "staffing", "personas", "engineer.md");
  const { frontmatter, body } = parsePersonaFile(p);
  const mutable = frontmatter as unknown as Record<string, unknown>;
  mutable.codename = 12345; // YAML number — must be rejected, not stringified
  fs.writeFileSync(p, `---\n${YAML.stringify(mutable).trimEnd()}\n---\n${body}\n`);
  const issues = checkPersonas(dir, config, taskId);
  const eng = issues.find((i) => i.seat === "engineer");
  assert.ok(eng, "engineer should have an issue");
  assert.match(eng.problems.join("; "), /must be a string/);
});
