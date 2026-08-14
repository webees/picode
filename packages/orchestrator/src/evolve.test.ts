import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import {
  assertEvolveTargetRoot,
  assertEvolveWritePathAllowed,
  effectiveLayers,
  evolveLayerGlobs,
  evolveRisk,
  evolveWritePaths,
  getDefaultConfig,
  simpleGlobMatch,
  PicodeError,
  type ErrorCode,
  type EvolveGoalSpec,
} from "@picode/core";
import { createRun, resolveRunDir, readGoal } from "./run-store.js";
import { writeEvolveKnowledgeLog } from "./evolve-run.js";
import { checkPersonas } from "./staffing.js";

function tmpGitRepo(name = "picode"): string {
  const dir = gitInit({ prefix: "picode-test-", email: "t@p" });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0" }));
  fs.mkdirSync(path.join(dir, "packages", "core"), { recursive: true });
  fs.writeFileSync(path.join(dir, "packages", "core", "package.json"), "{}");
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

const evolveSpec: EvolveGoalSpec = {
  layers: ["docs", "tests"],
  risk: "medium",
  baseline_ref: "main",
  success_metrics: ["npm test 全绿"],
  rollback: "git revert",
  forbidden_paths: ["**/secrets/**"],
};

test("simpleGlobMatch: ** spans depths, * within segment", () => {
  assert.ok(simpleGlobMatch("packages/**", "packages/core/src/config.ts"));
  assert.ok(simpleGlobMatch("docs/**", "docs/knowledge/evolve/run.md"));
  assert.ok(simpleGlobMatch("packages/**/*.test.ts", "packages/core/src/evolve.test.ts"));
  assert.ok(!simpleGlobMatch("docs/**", "src/main.ts"));
  assert.ok(!simpleGlobMatch("packages/core/**", "packages/bus/src/x.ts"));
});

test("evolveLayerGlobs + evolveWritePaths honor layers and forbidden paths", () => {
  assert.ok(evolveLayerGlobs("code").includes("packages/**"));
  const wp = evolveWritePaths(getDefaultConfig(), evolveSpec);
  assert.ok(wp.includes("docs/**"));
  assert.ok(wp.includes("packages/**/*.test.*"));
  assert.ok(!wp.includes("**/secrets/**"), "forbidden paths removed");
});

test("effectiveLayers intersects goal layers with config allowed layers", () => {
  const config = getDefaultConfig(); // allowed: knowledge,prompts,docs,tests
  assert.deepEqual(effectiveLayers(config, { ...evolveSpec, layers: ["docs", "code"] }), ["docs"]);
});

test("assertEvolveWritePathAllowed rejects out-of-layer writes (E2)", () => {
  const config = getDefaultConfig();
  assertEvolveWritePathAllowed(config, evolveSpec, "docs/guide.md");
  assert.throws(
    () => assertEvolveWritePathAllowed(config, evolveSpec, "docs/knowledge/evolve/run.md"),
    /excluded/,
  );
  assert.throws(
    () => assertEvolveWritePathAllowed(config, evolveSpec, "docs/secrets/leak.md"),
    /excluded/,
  );
  assert.throws(
    () => assertEvolveWritePathAllowed(config, evolveSpec, "src/business/main.ts"),
    /E2/,
  );
});

test("assertEvolveTargetRoot accepts picode monorepo, rejects others (19 §4 MUST)", () => {
  const ok = tmpGitRepo("picode");
  assertEvolveTargetRoot(ok, getDefaultConfig());
  const bad = tmpGitRepo("not-picode");
  assert.throws(() => assertEvolveTargetRoot(bad, getDefaultConfig()), /self_evolve target_repo/);
});

test("init --kind self_evolve writes kind/target_repo/evolve; delivery default", () => {
  const repo = tmpGitRepo("picode");
  const { runId } = createRun(repo, {
    title: "upgrade picode",
    kind: "self_evolve",
    targetRepo: repo,
    evolveLayers: ["docs", "tests", "code"],
    evolveRisk: "high",
  });
  const { dir } = resolveRunDir(repo, runId);
  const goal = readGoal(dir);
  assert.equal(goal.kind, "self_evolve");
  assert.equal(goal.target_repo, repo);
  assert.ok(goal.evolve);
  assert.deepEqual(goal.evolve.layers, ["docs", "tests", "code"]);
  assert.equal(goal.evolve.risk, "high");
  assert.equal(evolveRisk(goal.evolve), "high");

  const repo2 = tmpGitRepo();
  const { runId: r2 } = createRun(repo2, { title: "business" });
  assert.equal(readGoal(path.join(repo2, ".picode", "runs", r2)).kind, "delivery");
});

test("init self_evolve on non-picode target is rejected", () => {
  const repo = tmpGitRepo("not-picode");
  assert.throws(
    () => createRun(repo, { title: "x", kind: "self_evolve", targetRepo: repo }),
    /self_evolve target_repo/,
  );
});

test("old goal without kind reads as delivery (backward compat)", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "old" });
  const { dir } = resolveRunDir(repo, runId);
  const goalPath = path.join(dir, "goal.yaml");
  const raw = fs.readFileSync(goalPath, "utf8");
  // strip kind/target_repo/evolve to simulate a pre-19 goal
  const goal = JSON.parse(JSON.stringify(requireYaml(raw)));
  delete goal.kind;
  delete goal.target_repo;
  delete goal.evolve;
  fs.writeFileSync(goalPath, toYaml(goal));
  const g = readGoal(dir);
  assert.equal(g.kind, "delivery");
  assert.equal(g.target_repo, null);
  assert.equal(g.evolve, null);
});

test("E6: writeEvolveKnowledgeLog writes knowledge/evolve/<run_id>.md", () => {
  const repo = tmpGitRepo("picode");
  const { runId } = createRun(repo, { title: "evolve", kind: "self_evolve", evolveLayers: ["docs"] });
  const { dir, config } = resolveRunDir(repo, runId);
  const out = writeEvolveKnowledgeLog(repo, dir, config, { summary: "fixed docs", risks: "none" });
  assert.ok(fs.existsSync(out));
  assert.match(out, /knowledge[\\/]evolve[\\/]run-.*\.md$/);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /# Evolve run-/);
  assert.match(md, /fixed docs/);
});

test("C2 write-guard: stale expectedBaseline → EVOLVE_WRITE_CONFLICT, original log intact", () => {
  const repo = tmpGitRepo("picode");
  const { runId } = createRun(repo, { title: "evolve", kind: "self_evolve", evolveLayers: ["docs"] });
  const { dir, config } = resolveRunDir(repo, runId);
  // writer A creates the log and remembers its content as the baseline
  const out = writeEvolveKnowledgeLog(repo, dir, config, { summary: "v1" });
  const baseline = fs.readFileSync(out, "utf8");
  // writer B saw the same baseline and lands its update — no conflict
  writeEvolveKnowledgeLog(repo, dir, config, { summary: "v2", expectedBaseline: baseline });
  // writer C still holds A's baseline → the file changed under it → rejected
  assert.throws(
    () => writeEvolveKnowledgeLog(repo, dir, config, { summary: "v3", expectedBaseline: baseline }),
    (e: unknown) => e instanceof PicodeError && e.code === ("EVOLVE_WRITE_CONFLICT" as ErrorCode),
  );
  // rollback: the rejected write must not clobber B's version
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /v2/);
  assert.ok(!md.includes("v3"), "conflicted write must not leak into the log");
});

test("E7: people-qa fails evolve persona missing forbidden[]", async () => {
  const repo = tmpGitRepo("picode");
  const { runId } = createRun(repo, {
    title: "evolve",
    kind: "self_evolve",
    evolveLayers: ["docs"],
  });
  const { dir, config } = resolveRunDir(repo, runId);
  // build a minimal staffing personas tree with a docs-layer task
  const taskId = "task-chunk-a";
  const taskDir = path.join(dir, "tasks", taskId, "staffing", "personas");
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tasks", taskId, "task.yaml"),
    `id: ${taskId}\nchunk_id: chunk-a\ngoal_id: goal-1\nkind: implement\nstatus: queued\nwrite_paths: ["docs/**"]\nacceptance: []\n`,
  );
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    fs.writeFileSync(
      path.join(taskDir, `${seat}.md`),
      `---\n${JSON.stringify({
        schema_version: "1",
        instance_id: `${seat}@${taskId}`,
        seat,
        mission: "evolve docs",
        scope_in: "docs",
        scope_out: "code",
        skills: [],
        stack: [],
        communication: "concise",
        risk_posture: "careful",
        tool_profile: "implement." + seat,
        write_paths: ["docs/**"],
        read_paths: [],
        reports_to: "run-lead",
        handoff_to: "docs-lead",
        rooms_post: [],
        acceptance_focus: [],
        definition_of_done: "docs green",
        forbidden: [], // missing forbidden content → E7 issue
        must_read_refs: [],
        check_rubric: null,
      })}\n---\n# ${seat}\n`,
    );
  }
  const issues = checkPersonas(dir, config, taskId);
  const eng = issues.find((i) => i.seat === "engineer");
  assert.ok(eng, "expected engineer issue");
  assert.ok(eng.problems.some((p) => p.startsWith("E7")), `expected E7 problem, got: ${eng.problems}`);
});

function requireYaml(src: string): Record<string, unknown> {
  return YAML.parse(src) as Record<string, unknown>;
}
function toYaml(obj: unknown): string {
  return YAML.stringify(obj);
}
