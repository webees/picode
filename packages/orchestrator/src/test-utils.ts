/**
 * Shared test fixtures (C3, run-lead 决策): git 仓库初始化的公共部分——
 * mkdtemp + git init + user config。各测试文件保留自定义准备（建文件/
 * add/commit），只复用这里的初始化，消除 19 份复制。
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
