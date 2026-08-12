import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { submitEvidence } from "./closure.js";
import { writeEvolveKnowledgeLog } from "./evolve-run.js";
import {
  appendLessonsToEvolveLog,
  distillLesson,
  extractLessons,
  refineEvolveKnowledge,
  renderLessonsSection,
  upsertLessonsSection,
} from "./evolve-refine.js";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-test-", email: "t@picode", name: "picode-test" });
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

test("refine: evidence → lesson 提炼（pass / fail / missing）", () => {
  const { repo, dir, config, taskId } = setup();
  // pass: exit_code=0 + log_ref
  submitEvidence(dir, taskId, {
    cmds: [{ cmd: "npm test", exit_code: 0, log_ref: `tasks/${taskId}/evidence/test.log` }],
    by: `sdet@${taskId}`,
  });
  const lessons = extractLessons(repo, dir, config);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].evidence, "pass");
  assert.deepEqual(lessons[0].commands, ["npm test"]);
  assert.match(lessons[0].lesson, /evidence pass/);

  // fail: nonzero exit
  const s2 = setup();
  submitEvidence(s2.dir, s2.taskId, {
    cmds: [{ cmd: "npm test", exit_code: 1, log_ref: null }],
    by: `sdet@${s2.taskId}`,
  });
  const fail = extractLessons(s2.repo, s2.dir, s2.config);
  assert.equal(fail[0].evidence, "fail");
  assert.match(fail[0].lesson, /验证失败/);

  // missing: no evidence.yaml
  const s3 = setup();
  const missing = extractLessons(s3.repo, s3.dir, s3.config);
  assert.equal(missing[0].evidence, "missing");
  assert.match(missing[0].lesson, /无 evidence/);
});

test("refine: git log 提交进入 lesson 草稿", () => {
  const { repo, runId, dir, config, taskId } = setup();
  // create a branch and a commit on it (simulate the task worktree branch)
  const branch = `picode/${runId}/${taskId}`;
  execFileSync("git", ["checkout", "-b", branch], { cwd: repo });
  fs.mkdirSync(path.join(repo, "src", "module-a"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "module-a", "x.ts"), "export const x = 1;\n");
  execFileSync("git", ["add", "src/module-a/x.ts"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "feat(module-a): add x"], { cwd: repo });
  execFileSync("git", ["checkout", "main"], { cwd: repo });
  submitEvidence(dir, taskId, {
    cmds: [{ cmd: "npm test", exit_code: 0, log_ref: "t.log" }],
    by: `sdet@${taskId}`,
  });
  const lessons = extractLessons(repo, dir, config);
  assert.ok(lessons[0].commits.length >= 1);
  assert.match(lessons[0].commits[0], /feat\(module-a\): add x/);
});

test("refine: --approve 才落盘；默认只输出草稿", () => {
  const { repo, dir, config } = setup();
  const evPath = path.join(repo, "docs", "knowledge", "evolve", `${path.basename(dir)}.md`);

  // without approve: draft only, no file written
  const draft = refineEvolveKnowledge(repo, dir, config, { approve: false });
  assert.equal(draft.approved, false);
  assert.equal(draft.written, null);
  assert.ok(draft.lessons.length >= 1);
  assert.ok(!fs.existsSync(evPath), "no file written without --approve");

  // with approve: written
  const approved = refineEvolveKnowledge(repo, dir, config, { approve: true });
  assert.equal(approved.approved, true);
  assert.ok(approved.written);
  assert.ok(fs.existsSync(evPath));
  const md = fs.readFileSync(evPath, "utf8");
  assert.match(md, /## Lessons（auto-refine 草稿）/);
});

test("refine: upsertLessonsSection 幂等——重复 approve 不重复节", () => {
  const { repo, dir, config } = setup();
  submitEvidence(dir, "task-chunk-a", {
    cmds: [{ cmd: "npm test", exit_code: 0, log_ref: "t.log" }],
    by: "sdet@task-chunk-a",
  });
  refineEvolveKnowledge(repo, dir, config, { approve: true });
  const evPath = path.join(repo, "docs", "knowledge", "evolve", `${path.basename(dir)}.md`);
  const once = fs.readFileSync(evPath, "utf8");
  assert.equal((once.match(/## Lessons（auto-refine 草稿）/g) ?? []).length, 1);
  refineEvolveKnowledge(repo, dir, config, { approve: true });
  const twice = fs.readFileSync(evPath, "utf8");
  assert.equal((twice.match(/## Lessons（auto-refine 草稿）/g) ?? []).length, 1);
});

test("refine: appendLessonsToEvolveLog 保留既有 E6 纪要 + 追加草稿节", () => {
  const { repo, dir, config } = setup();
  submitEvidence(dir, "task-chunk-a", {
    cmds: [{ cmd: "npm test", exit_code: 0, log_ref: "t.log" }],
    by: "sdet@task-chunk-a",
  });
  writeEvolveKnowledgeLog(repo, dir, config, { summary: "fixed module-a" });
  const lessons = extractLessons(repo, dir, config);
  const out = appendLessonsToEvolveLog(repo, dir, config, lessons);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /fixed module-a/); // E6 log kept
  assert.match(md, /## Lessons（auto-refine 草稿）/);
  assert.ok(md.indexOf("## Lessons") > md.indexOf("fixed module-a"));
});

test("refine: 无任务目录 → 空草稿；render 空节", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "empty", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const lessons = extractLessons(repo, dir, config);
  assert.deepEqual(lessons, []);
  const section = renderLessonsSection(lessons);
  assert.match(section, /## Lessons（auto-refine 草稿）/);
  assert.match(section, /无任务证据/);
});

test("refine: distillLesson 语义（P07/T07）", () => {
  assert.match(distillLesson("t1", null), /T07/);
  assert.match(
    distillLesson("t1", {
      schema_version: "1",
      task_id: "t1",
      result: "fail",
      commands: [{ cmd: "npm test", exit_code: 1, log_ref: null }],
      tester_id: "sdet",
      at: "",
    }),
    /验证失败/,
  );
});

test("refine: upsertLessonsSection 替换既有节不残留旧内容", () => {
  const section = renderLessonsSection([
    {
      task_id: "t1",
      status: "dissolved",
      evidence: "pass",
      commands: ["npm test"],
      commits: ["abc fix"],
      write_paths: ["src/**"],
      lesson: "正例",
    },
  ]);
  const md = "header\n\n## Lessons（auto-refine 草稿）\n\nold stale content\n";
  const out = upsertLessonsSection(md, section);
  assert.ok(!out.includes("old stale content"));
  assert.match(out, /### t1/);
  assert.equal((out.match(/## Lessons（auto-refine 草稿）/g) ?? []).length, 1);
});
