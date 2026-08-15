/**
 * Shared test fixtures (C3/C5): 与 orchestrator 同款 gitInit + tmpGitRepo
 * （mcp-server 测试曾各自复制 mkdtemp+init+config，C5 收敛为共享单源）。
 *
 * `toMcpError`（自 errors.ts 薄壳并入，chunk-shell-file-merge）：测试侧走
 * 本 helper 而非 ./index.js——index 顶层 `await server.connect(...)` 使测试
 * 无法安全 import。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PicodeError, errorCodeOf } from "@picode/core";

export function gitInit(
  opts: { prefix?: string; email?: string; name?: string; branch?: string | null } = {},
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), opts.prefix ?? "picode-test-"));
  const initArgs = ["init", "-q"];
  // branch: null 保留 `git init -q` 原始形态（product.test.ts 全手工 init 无 -b）；
  // 默认/undefined 显式 `-b main`（默认分支语义不变）。
  if (opts.branch !== null) initArgs.push("-b", opts.branch ?? "main");
  execFileSync("git", initArgs, { cwd: dir });
  execFileSync("git", ["config", "user.email", opts.email ?? "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", opts.name ?? "t"], { cwd: dir });
  return dir;
}

/**
 * 共享 tmpGitRepo：gitInit 之上叠加测试常用准备步骤（写 README/额外文件/
 * .gitignore + `git add` + 初始 commit）。参数语义与各测试文件原本地包装
 * 逐字等价（C5 收敛，行为零变化）：
 * - readme:    写入 README.md 的内容（省略则不写）；
 * - files:     额外文件（相对路径 → 内容），父目录自动 mkdir；
 * - gitignore: 写入 .gitignore 的内容（省略则不写）；
 * - add:       `git add` 参数，默认 "."（mcp 原包装用 "-A" 处显式传）；
 * - commit:    默认 true 执行 `git commit -qm init`。
 */
export function tmpGitRepo(opts: {
  prefix?: string;
  email?: string;
  name?: string;
  branch?: string | null;
  readme?: string;
  files?: Record<string, string>;
  gitignore?: string;
  add?: "." | "-A";
  commit?: boolean;
} = {}): string {
  const dir = gitInit(opts);
  if (opts.readme !== undefined) {
    fs.writeFileSync(path.join(dir, "README.md"), opts.readme);
  }
  if (opts.gitignore !== undefined) {
    fs.writeFileSync(path.join(dir, ".gitignore"), opts.gitignore);
  }
  if (opts.files) {
    for (const [rel, content] of Object.entries(opts.files)) {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
  }
  if (opts.commit !== false) {
    execFileSync("git", ["add", opts.add ?? "."], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  }
  return dir;
}

/**
 * Error mapping for MCP tool calls. picode errors are `PicodeError` carrying
 * a stable `ErrorCode`; the structured shape below keeps the code visible to
 * the MCP client (machine-readable) while `isError: true` marks the call as
 * failed per the MCP spec.
 */
export function toMcpError(
  e: unknown,
): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const code = e instanceof PicodeError ? e.code : (errorCodeOf(e) ?? "INTERNAL");
  const message = e instanceof Error ? e.message : String(e);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: false, code, message }, null, 2),
      },
    ],
    isError: true,
  };
}
