/**
 * Execution surface (D064): the pi-extension's 20 tools, 1:1, with the full
 * ACL stack intact — profile matrix + HMAC token + room ACL + write-path
 * globs + state whitelist + run_allowlist token boundaries.
 *
 * The extension captures its env at load time, so every call re-injects a
 * fresh env (run/agent/token/profile/cwd/paths) and re-captures the tool
 * table — the same pattern the test harness and the opencode plugin use.
 * Registration is synchronous and stateless, so per-call capture is cheap.
 *
 * Transport params are `_`-prefixed and stripped before the tool runs:
 *   _run_id       run id（默认取服务器环境 PICODE_RUN_ID）
 *   _agent_id     agent 身份（token 主体 + 房间成员 id + profile 判定）
 *   _token        agent token（缺省由服务器代签：issueToken(agentId, secret)）
 *   _tool_profile 工具画像（默认 implement.engineer；未知名 fail-closed 只读）
 *   _cwd          repo_* / git_* 的根（默认 repo 根；建议传 task_prepare 的 worktree）
 *   _write_paths  repo_write 写集 glob（默认 [] → 全拒）
 *   _read_paths   repo_read/glob/grep 读集（默认 [] → 空）
 *   _run_allowlist run_allowlisted 命令白名单（token 边界匹配）
 *   _task_id      progress_report 写 progress.json 用
 *   _squad_room   progress_report 汇报房间（默认 program）
 */
import path from "node:path";
import { PicodeError, ErrorCode, readRunSecret } from "@picode/core";
import { issueToken } from "@picode/bus";
import { captureTools, type CapturedTool } from "@picode/pi-extension/dist/capture.js";
import type { ToolDef } from "./registry.js";
import { runsRootOf, type ServerEnv } from "./context.js";

function envOf(p: Record<string, unknown>, k: string, fallback = ""): string {
  const v = p[k];
  return v === undefined || v === null ? fallback : String(v);
}

function jsonArr(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (v === undefined || v === null) return "[]";
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x)));
  return JSON.stringify([String(v)]);
}

/** Build the PICODE_* env for one execution call. */
function buildEnv(p: Record<string, unknown>, env: ServerEnv): Record<string, string> {
  const runId = envOf(p, "_run_id", env.runId ?? "");
  const agentId = envOf(p, "_agent_id");
  if (!runId) {
    throw new PicodeError(ErrorCode.USAGE, "_run_id required (or set server env PICODE_RUN_ID)");
  }
  if (!agentId) throw new PicodeError(ErrorCode.USAGE, "_agent_id required");
  const runsRoot = runsRootOf(env, runId);
  const secret = readRunSecret(path.join(runsRoot, runId));
  const token = envOf(p, "_token", issueToken(agentId, secret));
  return {
    PICODE_RUN_ID: runId,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_AGENT_ID: agentId,
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: envOf(p, "_tool_profile", "implement.engineer"),
    PICODE_CWD: envOf(p, "_cwd", env.repo),
    PICODE_WRITE_PATHS: jsonArr(p, "_write_paths"),
    PICODE_READ_PATHS: jsonArr(p, "_read_paths"),
    PICODE_RUN_ALLOWLIST: jsonArr(p, "_run_allowlist"),
    PICODE_TASK_ID: envOf(p, "_task_id"),
    PICODE_SQUAD_ROOM: envOf(p, "_squad_room"),
  };
}

const TRANSPORT_PROPS: Record<string, unknown> = {
  _run_id: { type: "string", description: "run id（默认取服务器环境 PICODE_RUN_ID）" },
  _agent_id: { type: "string", description: "agent 身份（token 主体 + 房间成员 id + profile 判定）" },
  _token: { type: "string", description: "agent token（缺省服务器代签）" },
  _tool_profile: { type: "string", description: "工具画像，默认 implement.engineer" },
  _cwd: { type: "string", description: "repo_* / git_* 根（默认 repo 根）" },
  _write_paths: { type: "array", items: { type: "string" }, description: "repo_write 写集（默认 [] 全拒）" },
  _read_paths: { type: "array", items: { type: "string" }, description: "读集（默认 [] 空）" },
  _run_allowlist: { type: "array", items: { type: "string" }, description: "run_allowlisted 白名单" },
  _task_id: { type: "string", description: "progress_report 写 progress 用" },
  _squad_room: { type: "string", description: "progress_report 汇报房间" },
};
const TRANSPORT_REQUIRED = ["_agent_id"];

/** Wrap one captured pi-extension tool as an MCP tool. */
function executionToolDef(tool: CapturedTool): ToolDef {
  const params = tool.parameters ?? {};
  const props = params.properties as Record<string, unknown> | undefined;
  const required = (params.required as string[] | undefined) ?? [];
  return {
    name: tool.name,
    description: `${tool.description ?? tool.name}（执行面 · ACL 全保留：profile+token+房间+路径）`,
    inputSchema: {
      type: "object",
      properties: { ...TRANSPORT_PROPS, ...(props ?? {}) },
      required: [...TRANSPORT_REQUIRED, ...required],
    },
    async run(p, env) {
      const picodeEnv = buildEnv(p, env);
      const tools = captureTools(picodeEnv);
      const t = tools.get(tool.name);
      if (!t) {
        return { ok: false, code: "TOOL_NOT_FOUND", message: `${tool.name} not registered` };
      }
      // strip transport params; pass only the tool's own args
      const toolParams: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        if (!k.startsWith("_")) toolParams[k] = v;
      }
      // return the extension's structured JSON (its `err()` shape keeps
      // {ok:false, code} visible; thrown errors surface via toMcpError)
      const res = await t.execute("mcp-call", toolParams);
      return JSON.parse(res.content[0].text);
    },
  };
}

let cached: ToolDef[] | null = null;

/** The 20 pi-extension tools (captured once; per-call env re-injection). */
export function executionTools(): ToolDef[] {
  if (cached) return cached;
  const tools = captureTools({});
  const defs = [...tools.values()].map(executionToolDef);
  if (defs.length !== 20) {
    throw new Error(`pi-extension registered ${defs.length} tools; expected 20 (09 matrix)`);
  }
  cached = defs;
  return defs;
}
