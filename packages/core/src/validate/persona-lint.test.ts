import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { checkPersonasDir, PersonaLintCode } from "./persona-lint.js";
import { getDefaultConfig } from "../config.js";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `picode-${prefix}-`));
}

function writeAgent(dir: string, stem: string, frontmatter: Record<string, unknown>): void {
  const yaml = YAML.stringify(frontmatter).trimEnd();
  fs.writeFileSync(path.join(dir, `${stem}.md`), `---\n${yaml}\n---\n\nbody\n`);
}

/** Minimal complete frontmatter that passes every required field. */
function validFrontmatter(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    description: `${name} description`,
    mission: `mission for ${name}`,
    scope_in: ["packages/core/src"],
    scope_out: ["write_paths 之外"],
    skills: ["typescript"],
    codename: name,
    tool_profile: "implement.engineer",
    write_paths: ["packages/core/src"],
    forbidden: ["私自 web"],
    must_read_refs: ["docs/AUTHORITY.md"],
    definition_of_done: "npm test 全绿",
    ...overrides,
  };
}

/** Point HOME at a scratch dir so ~/.picode/config.yaml never leaks in. */
function withHome(home: string, fn: () => void): void {
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    fn();
  } finally {
    process.env.HOME = saved;
  }
}

test("合法 agents 目录通过（无问题）", () => {
  const dir = tmpDir("lint-ok");
  writeAgent(dir, "engineer", validFrontmatter("engineer"));
  const result = checkPersonasDir(dir, { roles: ["engineer"] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.files, ["engineer.md"]);
});

test("合法 agents 目录通过，sponsor 例外缺模板不报错", () => {
  const dir = tmpDir("lint-ok-exc");
  writeAgent(dir, "engineer", validFrontmatter("engineer"));
  const result = checkPersonasDir(dir, { roles: ["engineer", "sponsor"] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test("缺 frontmatter 必填字段报错（FM_FIELD_MISSING，结构化列表不抛错）", () => {
  const dir = tmpDir("lint-missing");
  writeAgent(dir, "engineer", validFrontmatter("engineer", { write_paths: undefined, scope_in: [] }));
  const result = checkPersonasDir(dir, { roles: ["engineer"] });
  assert.equal(result.ok, false);
  const fields = result.problems.map((p) => p.field);
  assert.ok(fields.includes("write_paths"), `expected write_paths missing, got ${fields.join(",")}`);
  assert.ok(fields.includes("scope_in"), `expected scope_in missing, got ${fields.join(",")}`);
  for (const p of result.problems) {
    assert.equal(p.severity, "error");
    assert.equal(p.code, PersonaLintCode.FM_FIELD_MISSING);
    assert.equal(p.file, "engineer.md");
  }
});

test("非法 frontmatter：无 frontmatter 块 / YAML 解析失败 / 非 mapping 均报错", () => {
  const noFm = tmpDir("lint-nofm");
  fs.writeFileSync(path.join(noFm, "engineer.md"), "纯正文，无 frontmatter\n");
  assert.equal(checkPersonasDir(noFm, { roles: ["engineer"] }).problems[0].code, PersonaLintCode.FM_MISSING);

  const badYaml = tmpDir("lint-badyaml");
  fs.writeFileSync(path.join(badYaml, "engineer.md"), '---\nname: "unterminated\n---\n');
  assert.equal(checkPersonasDir(badYaml, { roles: ["engineer"] }).problems[0].code, PersonaLintCode.FM_INVALID_YAML);

  const notMapping = tmpDir("lint-listfm");
  fs.writeFileSync(path.join(notMapping, "engineer.md"), "---\n- a\n- b\n---\n");
  assert.equal(checkPersonasDir(notMapping, { roles: ["engineer"] }).problems[0].code, PersonaLintCode.FM_NOT_OBJECT);
});

test("非法 frontmatter：字段类型错误报错（FM_FIELD_INVALID）", () => {
  const dir = tmpDir("lint-type");
  writeAgent(dir, "engineer", validFrontmatter("engineer", { skills: "typescript" }));
  const result = checkPersonasDir(dir, { roles: ["engineer"] });
  const invalids = result.problems.filter((p) => p.code === PersonaLintCode.FM_FIELD_INVALID);
  assert.ok(invalids.some((p) => p.field === "skills"), JSON.stringify(result.problems));
});

test("frontmatter name 与文件 stem 不一致报错（NAME_MISMATCH）", () => {
  const dir = tmpDir("lint-name");
  writeAgent(dir, "engineer", validFrontmatter("engineer", { name: "dev" }));
  const result = checkPersonasDir(dir, { roles: ["engineer"] });
  assert.ok(
    result.problems.some((p) => p.code === PersonaLintCode.NAME_MISMATCH),
    JSON.stringify(result.problems),
  );
});

test("可选 success_metrics：缺省通过，非法类型报错", () => {
  const dir = tmpDir("lint-smetrics");
  writeAgent(dir, "engineer", validFrontmatter("engineer", { success_metrics: ["lint 全绿"] }));
  assert.equal(checkPersonasDir(dir, { roles: ["engineer"] }).ok, true);

  const bad = tmpDir("lint-smetrics-bad");
  writeAgent(bad, "engineer", validFrontmatter("engineer", { success_metrics: "lint 全绿" }));
  const result = checkPersonasDir(bad, { roles: ["engineer"] });
  assert.ok(
    result.problems.some((p) => p.code === PersonaLintCode.FM_FIELD_INVALID && p.field === "success_metrics"),
    JSON.stringify(result.problems),
  );
});

test("目录漂移：agents 文件无对应 config role 报错（AGENT_NOT_REGISTERED）", () => {
  const dir = tmpDir("lint-drift-file");
  writeAgent(dir, "engineer", validFrontmatter("engineer"));
  writeAgent(dir, "ghost-role", validFrontmatter("ghost-role"));
  const result = checkPersonasDir(dir, { roles: ["engineer"] });
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.code === PersonaLintCode.AGENT_NOT_REGISTERED && p.file === "ghost-role.md"),
    JSON.stringify(result.problems),
  );
});

test("目录漂移：config role 无对应 agents 文件报错（ROLE_WITHOUT_AGENT）", () => {
  const dir = tmpDir("lint-drift-role");
  writeAgent(dir, "engineer", validFrontmatter("engineer"));
  const result = checkPersonasDir(dir, { roles: ["engineer", "sec-eng", "sponsor"] });
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.code === PersonaLintCode.ROLE_WITHOUT_AGENT && p.message.includes("sec-eng")),
    JSON.stringify(result.problems),
  );
  assert.ok(
    !result.problems.some((p) => p.code === PersonaLintCode.ROLE_WITHOUT_AGENT && p.message.includes("sponsor")),
    "sponsor 例外不应报错",
  );
});

test("config.yaml 注册表一致性端到端：repo root 传入，roles 来自 DEFAULTS", () => {
  const repo = tmpDir("lint-repo");
  fs.mkdirSync(path.join(repo, ".picode"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".picode", "config.yaml"), "");
  fs.mkdirSync(path.join(repo, ".picode", "agents"), { recursive: true });
  const roles = getDefaultConfig().roles.filter((r) => r.enabled !== false).map((r) => r.id);
  for (const role of roles) {
    if (role === "sponsor") continue;
    writeAgent(path.join(repo, ".picode", "agents"), role, validFrontmatter(role));
  }
  withHome(tmpDir("lint-home"), () => {
    const result = checkPersonasDir(repo);
    assert.equal(result.ok, true, JSON.stringify(result.problems));
    assert.ok(result.files.length === roles.length - 1);
  });
});
