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

test("P1 stale-lock recovery: dead-holder lock is stolen, fn runs", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  // 模拟崩溃残留：锁文件记录的 pid 不存在（死进程）+ 超龄
  fs.writeFileSync(lock, JSON.stringify({ pid: 99999999, at: Date.now() - 60000 }));
  const out = await withFileLock(lock, () => "stolen");
  assert.equal(out, "stolen");
  assert.ok(!fs.existsSync(lock), "lock released after steal");
});

test("P1 stale-lock recovery: fresh live-holder lock is NOT stolen", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }));
  await assert.rejects(
    withFileLock(lock, () => Promise.resolve("never runs"), { retries: 3, delayMs: 5 }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.LOCK_TIMEOUT,
  );
});

test("P1 stale-lock recovery: legacy empty lockfile older than staleMs is stolen", async () => {
  const dir = tmpDir();
  const lock = path.join(dir, "x.lock");
  fs.writeFileSync(lock, ""); // 旧版本格式（空文件）
  const old = new Date(Date.now() - 120000);
  fs.utimesSync(lock, old, old);
  const out = await withFileLock(lock, () => "legacy-stolen", { staleMs: 30000 });
  assert.equal(out, "legacy-stolen");
});

test("P1 stale-lock recovery: non-EEXIST open errors propagate", async () => {
  const dir = tmpDir();
  // 父目录是一个普通文件 → mkdirSync/openSync 必然失败（EEXIST/ENOTDIR），
  // 且不是"他人持锁"：必须传播真实错误而非伪装成 LOCK_TIMEOUT
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "x");
  const lock = path.join(blocker, "x.lock");
  await assert.rejects(
    withFileLock(lock, () => 1, { retries: 3, delayMs: 5 }),
    (e: unknown) => {
      const code = (e as NodeJS.ErrnoException).code;
      return code === "EEXIST" || code === "ENOTDIR" || code === "ENOENT";
    },
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
