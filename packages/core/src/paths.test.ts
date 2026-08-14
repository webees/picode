import { test } from "node:test";
import assert from "node:assert/strict";
import { matchGlob, simpleGlobMatch, branchName } from "./paths.js";
import { getDefaultConfig } from "./config.js";

test("matchGlob ** suffix", () => {
  assert.equal(matchGlob("src/module-a/foo.ts", ["src/module-a/**"]), true);
  assert.equal(matchGlob("src/module-b/foo.ts", ["src/module-a/**"]), false);
});

test("matchGlob **/ prefix matches root-level files (统一 glob 语义, P1)", () => {
  // 旧 globToRegExp 语义下 **/ 要求至少一段前缀，根级文件永不匹配 — 现已统一为标准语义
  assert.equal(matchGlob(".env", ["**/.env"]), true);
  assert.equal(matchGlob("a/.env", ["**/.env"]), true);
  assert.equal(matchGlob("a/b/.env", ["**/.env"]), true);
  assert.equal(simpleGlobMatch("**/.env", ".env"), true);
  assert.equal(matchGlob("README.md", ["**/*.md"]), true);
});

test("matchGlob single star stays within a segment", () => {
  assert.equal(matchGlob("a/b.ts", ["a/*.ts"]), true);
  assert.equal(matchGlob("a/b/c.ts", ["a/*.ts"]), false);
});

test("matchGlob segment double-glob spans depth", () => {
  assert.equal(matchGlob("src/a/b/c.ts", ["src/**/c.ts"]), true);
  assert.equal(matchGlob("src/c.ts", ["src/**/c.ts"]), true);
});

test("branch template", () => {
  const c = getDefaultConfig();
  assert.equal(branchName(c, "run-1", "task-a"), "picode/run-1/task-a");
});
