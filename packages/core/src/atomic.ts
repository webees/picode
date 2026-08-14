import fs from "node:fs";
import path from "node:path";
import { openSync, closeSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { ErrorCode, PicodeError } from "./errors.js";

/** Write file via temp + rename (best-effort atomic on same volume). */
export function writeAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, filePath);
}

/**
 * Simple exclusive lock using O_EXCL lockfile.
 *
 * Stale-lock recovery (P1): the lockfile records `{pid, at}` on acquire; a
 * contender that finds the lock held checks whether the holder is gone (pid
 * no longer alive) or the lock is older than `staleMs`, and steals it —
 * otherwise a crashed writer would leave the lock behind forever and every
 * later writer would fail with LOCK_TIMEOUT. Legacy empty lockfiles (no JSON)
 * fall back to the file mtime. Non-EEXIST open errors (permissions etc.) are
 * real failures and propagate instead of masquerading as "another holder".
 */
export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T> | T,
  opts: { retries?: number; delayMs?: number; staleMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 50;
  const delayMs = opts.delayMs ?? 20;
  const staleMs = opts.staleMs ?? 30000;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let i = 0; i < retries; i++) {
    let fd: number | undefined;
    try {
      fd = openSync(lockPath, "wx");
      // 记录持有者（pid + 时间戳），供陈旧锁检测；写入失败不影响锁本身
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      } catch {
        /* best-effort */
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e; // 真实错误（如 EACCES）直接抛出，不再伪装成"他人持锁"
      if (tryStealStale(lockPath, staleMs)) continue; // 陈旧锁被接管 → 下一轮直接尝试
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    try {
      return await fn();
    } finally {
      closeSync(fd);
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
  }
  throw new PicodeError(ErrorCode.LOCK_TIMEOUT, `failed to acquire lock: ${lockPath}`);
}

/**
 * Steal a stale lockfile: holder pid no longer alive, or lock older than
 * `staleMs` (JSON `at` field, or file mtime for legacy empty lockfiles).
 * Returns true when the lockfile was removed.
 */
function tryStealStale(lockPath: string, staleMs: number): boolean {
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    let holderPid: number | null = null;
    let at: number | null = null;
    try {
      const info = JSON.parse(raw) as { pid?: number; at?: number };
      holderPid = typeof info.pid === "number" ? info.pid : null;
      at = typeof info.at === "number" ? info.at : null;
    } catch {
      // legacy empty lockfile: fall back to mtime below
    }
    const age = Date.now() - (at ?? fs.statSync(lockPath).mtimeMs);
    const pidAlive = holderPid !== null && isAlive(holderPid);
    if (holderPid === null) {
      // legacy 空锁文件（无 pid）：只能按年龄判定；超龄才偷（并删除）
      if (age < staleMs) return false;
      fs.unlinkSync(lockPath);
      return true;
    }
    if (pidAlive && age < staleMs) return false;
    // holder gone or lock stale → steal
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false; // 读/删失败（含刚被释放）→ 不偷，让主循环重试
  }
}

/** True when a process with `pid` exists (and we may signal it). */
function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // 存在但无权限信号
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
