import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SKILL_MAX_BYTES,
  SkillLoadError,
  discoverSkills,
  buildSkillIndex,
  loadSkill,
  personaDeclaredSkills,
  resolveSkillsRoot,
} from "./skills.js";
import { getDefaultConfig, validateConfig, type PicodeConfig } from "./config.js";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `picode-${prefix}-`));
}

function writeSkill(root: string, dir: string, name: string, description: string): void {
  const skillDir = path.join(root, dir);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`,
  );
}

test("discoverSkills 在 skills/ 找到 ponytail/ponytail-review 且 name==目录名（C1-b）", () => {
  const root = tmpDir("skills-disc");
  writeSkill(root, "engineering/ponytail", "ponytail", "Lazy senior dev");
  writeSkill(root, "engineering/ponytail-review", "ponytail-review", "Over-engineering review");
  const metas = discoverSkills(root);
  assert.equal(metas.length, 2);
  const names = metas.map((m) => m.name).sort();
  assert.deepEqual(names, ["ponytail", "ponytail-review"]);
  for (const m of metas) {
    assert.equal(m.name, m.dir, `name should equal dir for ${m.name}`);
    assert.ok(m.description.length > 0);
    assert.ok(m.relPath.endsWith("SKILL.md"));
  }
});

test("discoverSkills 缺失/空目录返回空数组", () => {
  assert.deepEqual(discoverSkills(path.join(tmpDir("skills-none"), "nope")), []);
  assert.deepEqual(discoverSkills(tmpDir("skills-empty")), []);
});

test("buildSkillIndex 输出 name: desc (path) 且 max 截断生效（C1-b）", () => {
  const root = tmpDir("skills-index");
  writeSkill(root, "a-one", "one", "First skill");
  writeSkill(root, "b-two", "two", "Second skill");
  writeSkill(root, "c-three", "three", "Third skill");
  const metas = discoverSkills(root);
  assert.equal(metas.length, 3);

  const full = buildSkillIndex(metas);
  for (const m of metas) {
    assert.ok(full.includes(`${m.name}: ${m.description} (${m.relPath})`), full);
  }

  const capped = buildSkillIndex(metas, { max: 2 });
  const cappedLines = capped.split("\n").filter((l) => l.length > 0);
  assert.equal(cappedLines.length, 3); // 2 skills + ellipsis
  assert.ok(capped.includes("one"));
  assert.ok(capped.includes("… and 1 more skill(s)"));
  assert.ok(!capped.includes("three"), "capped index must omit the 3rd skill body");

  const noCap = buildSkillIndex(metas, { max: 0 });
  assert.equal(noCap.split("\n").filter((l) => l.length > 0).length, 3);
});

test("personaDeclaredSkills 解析 frontmatter skills[]，未知名返回 unavailable 不抛错（C1-d）", () => {
  const root = tmpDir("skills-decl");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const metas = discoverSkills(root);
  assert.equal(metas.length, 1);

  const persona = path.join(tmpDir("skills-persona"), "persona.md");
  fs.mkdirSync(path.dirname(persona), { recursive: true });
  fs.writeFileSync(
    persona,
    "---\nname: eng\nskills:\n  - ponytail\n  - ghost-skill\n---\n\nbody\n",
  );
  const declared = personaDeclaredSkills(persona, metas);
  assert.equal(declared.length, 2);
  const byName = new Map(declared.map((d) => [d.name, d]));
  assert.equal(byName.get("ponytail")?.available, true);
  assert.ok(byName.get("ponytail")?.path?.endsWith("SKILL.md"));
  assert.equal(byName.get("ghost-skill")?.available, false);
  assert.equal(byName.get("ghost-skill")?.path, null);
});

test("personaDeclaredSkills 缺文件/无 skills 返回空，单字符串也解析（C1-d）", () => {
  assert.deepEqual(personaDeclaredSkills(path.join(tmpDir("skills-none"), "x.md"), []), []);

  const root = tmpDir("skills-decl2");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const metas = discoverSkills(root);

  const noSkills = path.join(tmpDir("skills-decl2"), "persona.md");
  fs.mkdirSync(path.dirname(noSkills), { recursive: true });
  fs.writeFileSync(noSkills, "---\nname: eng\n---\n\nbody\n");
  assert.deepEqual(personaDeclaredSkills(noSkills, metas), []);

  const singleStr = path.join(tmpDir("skills-decl3"), "persona.md");
  fs.mkdirSync(path.dirname(singleStr), { recursive: true });
  fs.writeFileSync(singleStr, "---\nskills: ponytail\n---\n\nbody\n");
  const declared = personaDeclaredSkills(singleStr, metas);
  assert.equal(declared.length, 1);
  assert.equal(declared[0].name, "ponytail");
  assert.equal(declared[0].available, true);
});

test("resolveSkillsRoot 解析相对 skills_root 到 repoRoot（C1）", () => {
  const cfg = getDefaultConfig();
  assert.equal(resolveSkillsRoot("/repo", cfg), path.resolve("/repo", "skills"));
});

test("validateConfig 拒绝绝对/逃逸 skills_root，默认合法（C1-e）", () => {
  const ok = getDefaultConfig();
  assert.doesNotThrow(() => validateConfig(ok));

  for (const bad of ["/abs/path", "C:\\abs", "..", "skills/../escape", "a/../../b"]) {
    const cfg: PicodeConfig = getDefaultConfig();
    cfg.paths.skills_root = bad;
    assert.throws(
      () => validateConfig(cfg),
      (e: unknown) => e instanceof Error && /skills_root/.test(e.message),
      `skills_root "${bad}" must be rejected`,
    );
  }

  const okDeep = getDefaultConfig();
  okDeep.paths.skills_root = "vendor/skills";
  assert.doesNotThrow(() => validateConfig(okDeep));
});

// ---- B 按需 skill 加载：loadSkill（C2）----

test("loadSkill 按 discoverSkills 索引解析完整 body，未截断（B1）", () => {
  const root = tmpDir("skills-load-body");
  writeSkill(root, "engineering/ponytail", "ponytail", "Lazy senior dev");
  const md = path.join(root, "engineering/ponytail", "SKILL.md");
  fs.writeFileSync(
    md,
    "---\nname: ponytail\ndescription: Lazy senior dev\n---\n\n# Ponytail\n\nfull body line\n",
  );
  const metas = discoverSkills(root);
  const loaded = loadSkill("ponytail", metas, { cwd: root, maxBytes: 0 });
  assert.equal(loaded.name, "ponytail");
  assert.equal(loaded.truncated, false);
  assert.equal(loaded.body, fs.readFileSync(md, "utf8"), "full body incl. frontmatter");
  assert.ok(loaded.body.includes("# Ponytail"));
  assert.ok(loaded.path.endsWith("SKILL.md"));
  assert.ok(loaded.relPath.endsWith("SKILL.md"));
});

test("loadSkill maxBytes 超限截断并标注 truncated（B2）", () => {
  const root = tmpDir("skills-load-cap");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const md = path.join(root, "ponytail", "SKILL.md");
  const longBody = `---\nname: ponytail\ndescription: Lazy senior dev\n---\n\n${"x".repeat(500)}\n`;
  fs.writeFileSync(md, longBody);
  const metas = discoverSkills(root);
  const loaded = loadSkill("ponytail", metas, { cwd: root, maxBytes: 100 });
  assert.equal(loaded.truncated, true);
  assert.equal(loaded.bytes, Buffer.byteLength(longBody, "utf8"));
  assert.ok(Buffer.byteLength(loaded.body, "utf8") <= 100, "body must not exceed the cap");
  assert.ok(loaded.body.startsWith("---"), "truncation keeps the head");
});

test("loadSkill 默认 maxBytes 常量生效（DEFAULT_SKILL_MAX_BYTES，B2）", () => {
  assert.ok(DEFAULT_SKILL_MAX_BYTES > 0);
  const root = tmpDir("skills-load-default");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const metas = discoverSkills(root);
  // 小 body 走默认上限不截断
  const small = loadSkill("ponytail", metas, { cwd: root });
  assert.equal(small.maxBytes, DEFAULT_SKILL_MAX_BYTES);
  assert.equal(small.truncated, false);
});

test("loadSkill 未知名技能 → SKILL_NOT_FOUND 结构化错误（B1，不进 ErrorCode 枚举）", () => {
  const root = tmpDir("skills-load-unknown");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const metas = discoverSkills(root);
  assert.throws(
    () => loadSkill("ghost-skill", metas, { cwd: root }),
    (e: unknown) =>
      e instanceof SkillLoadError &&
      e.code === "SKILL_NOT_FOUND" &&
      e.skillName === "ghost-skill",
  );
});

test("loadSkill SKILL.md 缺失 → SKILL_MD_MISSING（健康校验）", () => {
  const root = tmpDir("skills-load-missing");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const metas = discoverSkills(root);
  const stale: typeof metas = [{ ...metas[0], path: path.join(root, "nope", "SKILL.md") }];
  assert.throws(
    () => loadSkill("ponytail", stale, { cwd: root }),
    (e: unknown) => e instanceof SkillLoadError && e.code === "SKILL_MD_MISSING",
  );
});

test("loadSkill 坏 frontmatter → SKILL_BAD_FRONTMATTER（健康校验）", () => {
  const root = tmpDir("skills-load-badfm");
  const skillDir = path.join(root, "broken");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# no frontmatter at all\n");
  const metas = discoverSkills(root);
  assert.equal(metas.length, 1);
  assert.throws(
    () => loadSkill("broken", metas, { cwd: root }),
    (e: unknown) => e instanceof SkillLoadError && e.code === "SKILL_BAD_FRONTMATTER",
  );
});

test("loadSkill 越界路径（meta.path 逃逸 cwd）→ SKILL_PATH_DENIED；无 cwd 不限制", () => {
  const root = tmpDir("skills-load-escape");
  writeSkill(root, "ponytail", "ponytail", "Lazy senior dev");
  const metas = discoverSkills(root);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "picode-outside-"));
  fs.writeFileSync(
    path.join(outside, "SKILL.md"),
    "---\nname: ponytail\ndescription: Lazy senior dev\n---\n\noutside body\n",
  );
  const escaped: typeof metas = [
    { ...metas[0], path: path.join(outside, "SKILL.md"), relPath: "escape/SKILL.md" },
  ];
  assert.throws(
    () => loadSkill("ponytail", escaped, { cwd: root }),
    (e: unknown) => e instanceof SkillLoadError && e.code === "SKILL_PATH_DENIED",
  );
  // 未给 cwd → 不做路径围栏（信任调用方）
  const noCwd = loadSkill("ponytail", escaped, { maxBytes: 0 });
  assert.equal(noCwd.truncated, false);
  assert.ok(noCwd.body.includes("outside body"));
});
