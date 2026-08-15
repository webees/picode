import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
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

function setup() {
  // seed an initial commit so `git worktree add -b <branch> <path> main` works
  const repo = tmpGitRepo({ email: "test@picode", name: "picode-test", readme: "# test\n" });
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
  const { staffing, wokeSquad } = await approveStaffing(repo, dir, config, taskId);
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
  await fullHire(repo, dir, config, taskId);
  // staffing approved, brief missing → prepare must fail
  assert.throws(() => prepareTask(repo, dir, config, taskId), /work brief/);
});

test("prepare succeeds only with both latches", async () => {
  const { repo, dir, config, taskId } = setup();
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
  await assert.rejects(() => approveStaffing(repo, dir, config, taskId), /people-qa failed/);
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
  const { staffing } = await approveStaffing(repo, dir, config, taskId);
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
  const { staffing } = await approveStaffing(repo, dir, config, taskId);
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
  await assert.rejects(() => approveStaffing(repo, dir, config, taskId), /not a safe name/);
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

test("D058: wake rejections surface as woke_errors (max_awake=0), event engine stays best-effort", async () => {
  const { repo, dir, config, taskId } = setup();
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript", "testing"] });
  draftPersonas(repo, dir, config, taskId);
  // max_awake=0 ⇒ every wake in the task_ready event is rejected
  const cfg = structuredClone(config) as typeof config;
  cfg.sess_mgr.max_awake = 0;
  const r = await approveStaffing(repo, dir, cfg, taskId);
  assert.equal(r.wokeSquad, true, "event fired");
  assert.equal(r.wokeErrors.length, 3, "all three triad wakes rejected");
  for (const e of r.wokeErrors) {
    assert.match(e.reason, /max_awake/);
  }
  const seats = r.wokeErrors.map((e) => e.agent_id).sort();
  assert.deepEqual(seats, [
    "engineer@task-chunk-a",
    "sdet@task-chunk-a",
    "squad-lead@task-chunk-a",
  ]);
  // best-effort preserved: approve itself succeeded and sessions stay sleeping
  const store = new SessionStore(dir);
  for (const seat of seats) assert.equal(store.get(seat)?.state, "sleeping");
});

test("D058: no wake errors when max_awake allows the triad", async () => {
  const { repo, dir, config, taskId } = setup();
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript", "testing"] });
  draftPersonas(repo, dir, config, taskId);
  const r = await approveStaffing(repo, dir, config, taskId);
  assert.equal(r.wokeSquad, true);
  assert.deepEqual(r.wokeErrors, []);
});

// --- E7 排除语义（Bug B: 按层分组判定）回归 ---

/** self_evolve run on a picode-marked tmp repo (19 §4 marker: package.json name=picode). */
function selfEvolveRun(evolveLayers: Array<"knowledge" | "prompts" | "docs" | "tests" | "code" | "policy">): {
  repo: string;
  dir: string;
  config: ReturnType<typeof resolveRunDir>["config"];
} {
  const repo = tmpGitRepo({ email: "test@picode", name: "picode-test", readme: "# test\n" });
  fs.writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ name: "picode", version: "0.0.0" }),
  );
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "add picode marker"], { cwd: repo });
  const { runId } = createRun(repo, {
    title: "evolve",
    kind: "self_evolve",
    evolveLayers,
  });
  const { dir, config } = resolveRunDir(repo, runId);
  return { repo, dir, config };
}

/** Scaffold a self_evolve task tree with fully valid triad personas (all 17 §6 required dims). */
function writeEvolvePersonas(
  dir: string,
  taskId: string,
  opts: { writePaths: string[]; forbidden: string[] },
): void {
  const taskDir = path.join(dir, "tasks", taskId, "staffing", "personas");
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tasks", taskId, "task.yaml"),
    `id: ${taskId}\nchunk_id: chunk-b\ngoal_id: goal-1\nkind: implement\nstatus: queued\nwrite_paths: ${JSON.stringify(opts.writePaths)}\nacceptance: []\n`,
  );
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    fs.writeFileSync(
      path.join(taskDir, `${seat}.md`),
      `---\n${JSON.stringify({
        schema_version: "1",
        instance_id: `${seat}@${taskId}`,
        seat,
        codename: `c-${seat}`,
        display_name: seat,
        mission: "evolve docs",
        scope_in: ["docs"],
        scope_out: ["code"],
        skills: ["typescript"],
        stack: [],
        communication: "concise",
        risk_posture: "careful",
        tool_profile: "implement." + seat,
        write_paths: opts.writePaths,
        read_paths: [],
        reports_to: "run-lead",
        handoff_to: "docs-lead",
        rooms_post: [],
        acceptance_focus: [],
        definition_of_done: "docs green",
        forbidden: opts.forbidden,
        must_read_refs: ["WORK_BRIEF.md"],
        check_rubric: null,
      })}\n---\n# ${seat}\n`,
    );
  }
}

test("E7 Bug B regression: layers=[knowledge,docs] — persona writing docs/knowledge/** passes people-qa", async () => {
  const { dir, config } = selfEvolveRun(["knowledge", "docs"]);
  const taskId = "task-chunk-b";
  writeEvolvePersonas(dir, taskId, { writePaths: ["docs/knowledge/**"], forbidden: ["net"] });
  // knowledge layer includes docs/knowledge/** with no carve-out → the docs
  // layer's `!docs/knowledge/**` carve-out must NOT veto this persona's writes.
  const issues = checkPersonas(dir, config, taskId);
  assert.deepEqual(
    issues,
    [],
    `expected people-qa to pass, got: ${JSON.stringify(issues)}`,
  );
});

test("E7 regression: docs-only persona writing docs/knowledge/** still flagged (carve-out vetoes its own layer)", async () => {
  const { dir, config } = selfEvolveRun(["docs"]);
  const taskId = "task-chunk-c";
  writeEvolvePersonas(dir, taskId, { writePaths: ["docs/knowledge/**"], forbidden: ["net"] });
  const issues = checkPersonas(dir, config, taskId);
  assert.equal(issues.length, 3, `expected all three seats flagged, got: ${JSON.stringify(issues)}`);
  assert.ok(
    issues.every(
      (i) => i.problems.length === 1 && i.problems[0] === "E7: write_paths outside evolve layers: docs/knowledge/**",
    ),
    `expected exactly one E7-outside problem per seat, got: ${JSON.stringify(issues)}`,
  );
});

// --- I4 子代理写集只收窄（子 ⊆ 父 write_paths；task.yaml `parent_task` 可选字段） ---

/**
 * I4 fixture: a child (subagent) task under an existing parent task.
 * `parent_task` is an optional task.yaml field (缺省 = 顶层任务，规则退化为现状).
 */
function setupSubagentTask(
  dir: string,
  parentTaskId: string,
  opts: { childTaskId?: string; writePaths: string[]; parentTask?: string },
): { childTaskId: string } {
  const childTaskId = opts.childTaskId ?? "task-child-1";
  const taskDir = path.join(dir, "tasks", childTaskId);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(taskDir, "brief"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "evidence"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "handoff"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "inbox"), { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "task.yaml"),
    [
      `id: ${childTaskId}`,
      "chunk_id: chunk-child",
      "goal_id: goal-1",
      "kind: implement",
      "status: queued",
      `write_paths: ${JSON.stringify(opts.writePaths)}`,
      "read_paths: []",
      "acceptance: []",
      `parent_task: ${opts.parentTask ?? parentTaskId}`,
      "",
    ].join("\n"),
  );
  return { childTaskId };
}

test("I4: draftPersonas narrows a subagent task's write set to parent ∩ declared (只收窄不放宽)", async () => {
  const { repo, dir, config, taskId: parentTaskId } = setup();
  // child declares a write set wider than the parent → effective = parent ∩ declared
  const { childTaskId } = setupSubagentTask(dir, parentTaskId, {
    writePaths: ["src/module-a/**", "src/module-b/**"],
  });
  await createStaffingRequest(dir, config, childTaskId, { skills: ["typescript"] });
  draftPersonas(repo, dir, config, childTaskId);
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    const { frontmatter } = parsePersonaFile(
      path.join(dir, "tasks", childTaskId, "staffing", "personas", `${seat}.md`),
    );
    assert.deepEqual(
      frontmatter.write_paths,
      ["src/module-a/**"],
      `${seat}: write_paths should be parent ∩ declared`,
    );
    assert.deepEqual(
      frontmatter.scope_in,
      ["src/module-a/**"],
      `${seat}: scope_in should follow the effective write set`,
    );
  }
});

test("I4: checkPersonas passes when subagent persona write_paths ⊆ parent (只收窄合法)", async () => {
  const { repo, dir, config, taskId: parentTaskId } = setup();
  const { childTaskId } = setupSubagentTask(dir, parentTaskId, {
    writePaths: ["src/module-a/**"],
  });
  await createStaffingRequest(dir, config, childTaskId, { skills: ["typescript"] });
  draftPersonas(repo, dir, config, childTaskId);
  assert.deepEqual(checkPersonas(dir, config, childTaskId), []);
});

test("I4: checkPersonas structurally rejects a subagent persona wider than its parent (子宽于父)", async () => {
  const { repo, dir, config, taskId: parentTaskId } = setup();
  const { childTaskId } = setupSubagentTask(dir, parentTaskId, {
    writePaths: ["src/module-a/**", "src/module-b/**"], // declared inside the task…
  });
  await createStaffingRequest(dir, config, childTaskId, { skills: ["typescript"] });
  draftPersonas(repo, dir, config, childTaskId); // …but drafted narrowed to parent ∩ declared
  // manually widen the engineer persona back to the task-level set: inside the
  // task, outside the parent → only the I4 narrowing check may flag it.
  const p = path.join(dir, "tasks", childTaskId, "staffing", "personas", "engineer.md");
  const { frontmatter, body } = parsePersonaFile(p);
  const mutable = frontmatter as unknown as Record<string, unknown>;
  mutable.write_paths = ["src/module-a/**", "src/module-b/**"];
  fs.writeFileSync(p, `---\n${YAML.stringify(mutable).trimEnd()}\n---\n${body}\n`);
  const issues = checkPersonas(dir, config, childTaskId);
  const eng = issues.find((i) => i.seat === "engineer");
  assert.ok(eng, "engineer should have an I4 issue");
  assert.deepEqual(eng!.problems, [
    `write_paths outside parent task ${parentTaskId}: src/module-b/**`,
  ]);
  await assert.rejects(
    () => approveStaffing(repo, dir, config, childTaskId),
    /people-qa failed/,
  );
});

test("I4: draftPersonas fails loudly when the parent task is missing (misconfig)", async () => {
  const { repo, dir, config, taskId: parentTaskId } = setup();
  const { childTaskId } = setupSubagentTask(dir, parentTaskId, {
    writePaths: ["src/module-a/**"],
    parentTask: "task-missing",
  });
  await createStaffingRequest(dir, config, childTaskId, { skills: ["typescript"] });
  assert.throws(() => draftPersonas(repo, dir, config, childTaskId), /parent task not found/);
});

test("I4: checkPersonas flags a parent_task that disappeared (fails loudly)", async () => {
  const { repo, dir, config, taskId: parentTaskId } = setup();
  const { childTaskId } = setupSubagentTask(dir, parentTaskId, {
    writePaths: ["src/module-a/**"],
  });
  await createStaffingRequest(dir, config, childTaskId, { skills: ["typescript"] });
  draftPersonas(repo, dir, config, childTaskId);
  // simulate misconfig after drafting: parent gone / parent_task typo
  const taskYaml = path.join(dir, "tasks", childTaskId, "task.yaml");
  const raw = fs.readFileSync(taskYaml, "utf8");
  fs.writeFileSync(
    taskYaml,
    raw.replace(`parent_task: ${parentTaskId}`, "parent_task: task-missing"),
  );
  const issues = checkPersonas(dir, config, childTaskId);
  const eng = issues.find((i) => i.seat === "engineer");
  assert.ok(eng, "engineer should be flagged");
  assert.match(eng!.problems.join("; "), /parent task not found/);
});
