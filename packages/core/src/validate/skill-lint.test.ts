import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { checkSkillsDir, SkillLintCode, DEFAULT_DESCRIPTION_MAX } from "./skill-lint.js";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `picode-${prefix}-`));
}

function writeSkill(dir: string, name: string, extra: Record<string, unknown> = {}): void {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const fm: Record<string, unknown> = {
    name,
    description: `${name} description`,
    ...extra,
  };
  const yaml = YAML.stringify(fm).trimEnd();
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\n${yaml}\n---\n\nbody\n`);
}

test("合法 SKILL.md 通过（零问题）", () => {
  const dir = tmpDir("skill-ok");
  writeSkill(dir, "ponytail");
  const result = checkSkillsDir(dir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.files, ["ponytail/SKILL.md"]);
});

test("license/argument-hint/allowed-tools 白名单零报错（C1-c）", () => {
  const dir = tmpDir("skill-whitelist");
  writeSkill(dir, "ponytail", {
    license: "MIT",
    "argument-hint": "[lite|full|ultra]",
    "allowed-tools": ["repo_read", "repo_grep"],
  });
  const result = checkSkillsDir(dir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.problems, []);
});

test("未知 frontmatter 键 → UNKNOWN_KEY warning（不阻断）", () => {
  const dir = tmpDir("skill-unknown");
  writeSkill(dir, "ponytail", { mystery: "x" });
  const result = checkSkillsDir(dir);
  assert.equal(result.ok, true, "unknown key is only a warning");
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.UNKNOWN_KEY && p.severity === "warning"),
    JSON.stringify(result.problems),
  );
});

test("SKILL.md 缺失 → SKILLS_DIR_MISSING", () => {
  const result = checkSkillsDir(path.join(tmpDir("skill-none"), "nope"));
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].code, SkillLintCode.SKILLS_DIR_MISSING);
});

test("无 frontmatter 块 → FM_MISSING", () => {
  const dir = tmpDir("skill-nofm");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), "纯正文，无 frontmatter\n");
  const result = checkSkillsDir(dir);
  assert.equal(result.problems[0].code, SkillLintCode.FM_MISSING);
});

test("frontmatter YAML 非法 → FM_INVALID_YAML", () => {
  const dir = tmpDir("skill-badyaml");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), '---\nname: "unterminated\n---\n');
  const result = checkSkillsDir(dir);
  assert.equal(result.problems[0].code, SkillLintCode.FM_INVALID_YAML);
});

test("frontmatter 非 mapping → FM_NOT_OBJECT", () => {
  const dir = tmpDir("skill-listfm");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), "---\n- a\n- b\n---\n");
  const result = checkSkillsDir(dir);
  assert.equal(result.problems[0].code, SkillLintCode.FM_NOT_OBJECT);
});

test("name 缺失 → NAME_MISSING", () => {
  const dir = tmpDir("skill-noname");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), "---\ndescription: hi\n---\n");
  const result = checkSkillsDir(dir);
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.NAME_MISSING),
    JSON.stringify(result.problems),
  );
});

test("name 不匹配 SAFE_ID_RE → NAME_INVALID", () => {
  for (const bad of ["Ponytail", "pony tail", "pony_tail", "../x", "9lead"]) {
    const dir = tmpDir("skill-nameinv");
    writeSkill(dir, "ok-dir", { name: bad });
    const result = checkSkillsDir(dir);
    assert.ok(
      result.problems.some((p) => p.code === SkillLintCode.NAME_INVALID),
      `name "${bad}" should be invalid: ${JSON.stringify(result.problems)}`,
    );
  }
});

test("name ≠ 目录名 → NAME_MISMATCH", () => {
  const dir = tmpDir("skill-namemismatch");
  writeSkill(dir, "dir-name", { name: "other-name" });
  const result = checkSkillsDir(dir);
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.NAME_MISMATCH),
    JSON.stringify(result.problems),
  );
});

test("description 缺失 → DESCRIPTION_MISSING", () => {
  const dir = tmpDir("skill-nodesc");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), "---\nname: x\n---\n");
  const result = checkSkillsDir(dir);
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.DESCRIPTION_MISSING),
    JSON.stringify(result.problems),
  );
});

test("description 空 → DESCRIPTION_EMPTY", () => {
  const dir = tmpDir("skill-emptydesc");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), '---\nname: x\ndescription: ""\n---\n');
  const result = checkSkillsDir(dir);
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.DESCRIPTION_EMPTY),
    JSON.stringify(result.problems),
  );
});

test("description 超长（>1024）→ DESCRIPTION_TOO_LONG warning（放行）", () => {
  const dir = tmpDir("skill-longdesc");
  const long = "x".repeat(DEFAULT_DESCRIPTION_MAX + 1);
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "SKILL.md"), `---\nname: x\ndescription: "${long}"\n---\n`);
  const result = checkSkillsDir(dir);
  assert.equal(result.ok, true, "long description is only a warning");
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.DESCRIPTION_TOO_LONG && p.severity === "warning"),
    JSON.stringify(result.problems),
  );
});

test("allowed-tools 非 string[] → FIELD_INVALID", () => {
  const dir = tmpDir("skill-badlist");
  writeSkill(dir, "x", { "allowed-tools": "repo_read" });
  const result = checkSkillsDir(dir);
  assert.ok(
    result.problems.some((p) => p.code === SkillLintCode.FIELD_INVALID && p.field === "allowed-tools"),
    JSON.stringify(result.problems),
  );
});

test("现有种子 skill（ponytail/ponytail-review）过 skill-lint 零 error（C1-f）", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
  const skillsDir = path.join(repoRoot, "skills");
  if (!fs.existsSync(skillsDir)) return;
  const result = checkSkillsDir(skillsDir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.ok(result.files.some((f) => f.includes("ponytail")), JSON.stringify(result.files));
});
