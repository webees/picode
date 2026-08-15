/**
 * Shared test fixtures (C3): 与 orchestrator 同款 gitInit（mcp-server 测试
 * 曾各自复制 mkdtemp+init+config）。
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

export function gitInit(opts: { prefix?: string; email?: string; name?: string } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), opts.prefix ?? "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", opts.email ?? "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", opts.name ?? "t"], { cwd: dir });
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
