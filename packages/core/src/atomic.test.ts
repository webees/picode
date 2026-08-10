import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withFileLock, writeAtomic } from "./atomic.js";
import { ErrorCode, PicodeError } from "./errors.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "picode-lock-"));
}

test("withFileLock runs fn and releases the lockfile afterwards", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  const out = await withFileLock(lock, () => 42);
  assert.equal(out, 42);
  assert.ok(!fs.existsSync(lock), "lockfile removed after fn");
});

test("D025 regression: fn exceptions propagate and the lock is still released", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  const boom = new Error("fn exploded");
  await assert.rejects(
    withFileLock(lock, () => {
      throw boom;
    }),
    (e: unknown) => e === boom,
  );
  // the lock must not be left behind (otherwise the next writer deadlocks forever)
  assert.ok(!fs.existsSync(lock), "lockfile removed even when fn throws");
});

test("withFileLock serializes concurrent writers (read-modify-write is atomic)", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  const file = path.join(dir, "count.jsonl");
  // 20 writers each append one line under the lock; without serialization the
  // interleaved appends could still be fine (appendFileSync is atomic per call),
  // so instead: each writer reads the count and writes it back + 1 (RMW).
  const writer = async (): Promise<void> => {
    await withFileLock(lock, () => {
      const cur = fs.existsSync(file)
        ? Number(fs.readFileSync(file, "utf8").trim() || "0")
        : 0;
      writeAtomic(file, String(cur + 1));
    });
  };
  await Promise.all(Array.from({ length: 20 }, () => writer()));
  assert.equal(Number(fs.readFileSync(file, "utf8").trim()), 20);
});

test("withFileLock throws LOCK_TIMEOUT after retries when the lock stays held", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  // hold the lock file for longer than the retry budget
  fs.writeFileSync(lock, "held");
  await assert.rejects(
    withFileLock(lock, () => Promise.resolve("never runs"), { retries: 3, delayMs: 5 }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.LOCK_TIMEOUT,
  );
});

test("withFileLock returns async fn results and propagates async rejections", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  assert.equal(await withFileLock(lock, async () => "async-ok"), "async-ok");
  await assert.rejects(
    withFileLock(lock, async () => {
      throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, "nope");
    }),
    (e: unknown) => e instanceof PicodeError && e.code === "SESSION_NOT_FOUND",
  );
  assert.ok(!fs.existsSync(lock));
});
