/**
 * Shared test fixtures (C3): 与 orchestrator 同款 gitInit（mcp-server 测试
 * 曾各自复制 mkdtemp+init+config）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function gitInit(opts: { prefix?: string; email?: string; name?: string } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), opts.prefix ?? "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", opts.email ?? "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", opts.name ?? "t"], { cwd: dir });
  return dir;
}
