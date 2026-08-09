import { test } from "node:test";
import assert from "node:assert/strict";
import { matchGlob, branchName } from "./paths.js";
import { getDefaultConfig } from "./config.js";

test("matchGlob ** suffix", () => {
  assert.equal(matchGlob("src/module-a/foo.ts", ["src/module-a/**"]), true);
  assert.equal(matchGlob("src/module-b/foo.ts", ["src/module-a/**"]), false);
});

test("branch template", () => {
  const c = getDefaultConfig();
  assert.equal(branchName(c, "run-1", "task-a"), "picode/run-1/task-a");
});
