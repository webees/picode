import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withEvolveWriteGuard } from "./evolve.js";
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
