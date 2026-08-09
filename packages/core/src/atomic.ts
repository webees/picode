import fs from "node:fs";
import path from "node:path";
import { openSync, closeSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";

/** Write file via temp + rename (best-effort atomic on same volume). */
export function writeAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, filePath);
}

/** Simple exclusive lock using O_EXCL lockfile. */
export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T> | T,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 50;
  const delayMs = opts.delayMs ?? 20;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let i = 0; i < retries; i++) {
    try {
      const fd = openSync(lockPath, "wx");
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
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Failed to acquire lock: ${lockPath}`);
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
