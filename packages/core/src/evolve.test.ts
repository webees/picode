import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertEvolveWritePathAllowed,
  evolveWritePaths,
  withEvolveWriteGuard,
} from "./evolve.js";
import { getDefaultConfig, type EvolveGoalSpec } from "./config.js";
import { PicodeError, type ErrorCode } from "./errors.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "picode-evolve-"));
}

test("withEvolveWriteGuard: matching baseline writes and content lands", () => {
  const dir = tmpDir();
  const file = path.join(dir, "run-1.md");
  fs.writeFileSync(file, "old\n");
  withEvolveWriteGuard(file, "new\n", { expectedBaseline: "old\n" });
  assert.equal(fs.readFileSync(file, "utf8"), "new\n");
});

test("withEvolveWriteGuard: no expectedBaseline still writes (first write / no watcher)", () => {
  const dir = tmpDir();
  const file = path.join(dir, "run-2.md");
  withEvolveWriteGuard(file, "first\n");
  assert.equal(fs.readFileSync(file, "utf8"), "first\n");
});

test("withEvolveWriteGuard: stale baseline → EVOLVE_WRITE_CONFLICT and original preserved (rollback)", () => {
  const dir = tmpDir();
  const file = path.join(dir, "run-3.md");
  fs.writeFileSync(file, "someone-else\n");
  assert.throws(
    () => withEvolveWriteGuard(file, "mine\n", { expectedBaseline: "stale\n" }),
    (e: unknown) => e instanceof PicodeError && e.code === ("EVOLVE_WRITE_CONFLICT" as ErrorCode),
  );
  assert.equal(
    fs.readFileSync(file, "utf8"),
    "someone-else\n",
    "a rejected write must not clobber the existing file",
  );
});

test("withEvolveWriteGuard: expectedBaseline for a missing file → conflict (nothing to compare)", () => {
  const dir = tmpDir();
  const file = path.join(dir, "run-4.md");
  assert.throws(
    () => withEvolveWriteGuard(file, "mine\n", { expectedBaseline: "old\n" }),
    (e: unknown) => e instanceof PicodeError && e.code === ("EVOLVE_WRITE_CONFLICT" as ErrorCode),
  );
  assert.ok(!fs.existsSync(file), "conflict must not create the file");
});

// --- E2 排除语义（Bug B: 按层分组判定）回归 ---

const multiLayerSpec: EvolveGoalSpec = {
  layers: ["knowledge", "docs"],
  risk: "medium",
  baseline_ref: "main",
  success_metrics: ["npm test 全绿"],
  rollback: "git revert",
  forbidden_paths: [],
};

test("E2 Bug B regression: layers=[knowledge,docs] — docs/knowledge/** allowed via knowledge layer include", () => {
  const config = getDefaultConfig(); // allowed: knowledge,prompts,docs,tests
  // knowledge layer includes docs/knowledge/** with no carve-out → allowed
  // even though the docs layer's `!docs/knowledge/**` carve-out exists in the union.
  assert.doesNotThrow(() =>
    assertEvolveWritePathAllowed(config, multiLayerSpec, "docs/knowledge/evolve/run-x.md"),
  );
  // knowledge layer alone also permits it
  assert.doesNotThrow(() =>
    assertEvolveWritePathAllowed(
      config,
      { ...multiLayerSpec, layers: ["knowledge"] },
      "docs/knowledge/evolve/run-x.md",
    ),
  );
});

test("E2 regression: docs-layer carve-out still vetoes its own layer (single layer)", () => {
  const config = getDefaultConfig();
  assert.throws(
    () =>
      assertEvolveWritePathAllowed(
        config,
        { ...multiLayerSpec, layers: ["docs"] },
        "docs/knowledge/evolve/run-x.md",
      ),
    /excluded/,
  );
});

test("E2 regression: forbidden_paths veto regardless of layer; non-layer paths still rejected", () => {
  const config = getDefaultConfig();
  assert.throws(
    () =>
      assertEvolveWritePathAllowed(
        config,
        { ...multiLayerSpec, forbidden_paths: ["**/secrets/**"] },
        "docs/knowledge/secrets/leak.md",
      ),
    /excluded/,
  );
  assert.throws(
    () => assertEvolveWritePathAllowed(config, multiLayerSpec, "src/main.ts"),
    /E2/,
  );
});

test("E2 regression: evolveWritePaths keeps flattened union with `!`-prefixed exclusions (shape contract)", () => {
  const wp = evolveWritePaths(getDefaultConfig(), multiLayerSpec);
  assert.ok(wp.includes("docs/knowledge/**"), "knowledge layer include kept");
  assert.ok(wp.includes("!docs/knowledge/**"), "docs layer carve-out kept as !-prefixed exclusion");
  assert.ok(wp.includes("docs/**"));
});
