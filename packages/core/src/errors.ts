/**
 * Unified error-code registry (方向 A2 / E3).
 *
 * Every user-facing failure carries a stable machine-readable `code` so the
 * CLI can render `[picode] ERROR: <code>: <message>` (E3) and scripts can
 * branch on the code without parsing message text. Codes are constants, never
 * inline string literals, so a typo fails at compile time.
 *
 * Throwing convention:
 *   - bus / orchestrator / adapters: `throw new PicodeError(ErrorCode.X, msg)`
 *   - pi-extension tools: return `err(ErrorCode.X, msg)` in the JSON result
 *   - config validation: `throw new PicodeError(ErrorCode.CONFIG_INVALID, msg)`
 */

export const ErrorCode = {
  // config / infra
  CONFIG_INVALID: "CONFIG_INVALID",
  LOCK_TIMEOUT: "LOCK_TIMEOUT",
  // CLI surface (方向 E1: missing/invalid arguments)
  USAGE: "USAGE",
  // session state machine (17 §4)
  SESSION_HUMAN_ONLY: "SESSION_HUMAN_ONLY",
  SESSION_ALREADY_REGISTERED: "SESSION_ALREADY_REGISTERED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  ILLEGAL_TRANSITION: "ILLEGAL_TRANSITION",
  ILLEGAL_STATE: "ILLEGAL_STATE",
  MAX_AWAKE_EXCEEDED: "MAX_AWAKE_EXCEEDED",
  // I3: 子代理嵌套深度围栏（统一 spawn 入口 wakeAgent 结构化拒绝；消息含当前深度与上限）
  SUBAGENT_DEPTH_EXCEEDED: "SUBAGENT_DEPTH_EXCEEDED",
  // bus (10 §1/§2, room ACL)
  BUS_TYPE_DENIED: "BUS_TYPE_DENIED",
  ROOM_POST_DENIED: "ROOM_POST_DENIED",
  ROOM_READ_DENIED: "ROOM_READ_DENIED",
  // spawn adapters (18 phase C / D044)
  PI_SPAWN_FAILED: "PI_SPAWN_FAILED",
  OPENCODE_SPAWN_FAILED: "OPENCODE_SPAWN_FAILED",
  COMMAND_FROM_DENIED: "COMMAND_FROM_DENIED",
  // pi-extension tool results (09 matrix)
  TOOL_DENIED: "TOOL_DENIED",
  TOKEN_INVALID: "TOKEN_INVALID",
  NO_RUN: "NO_RUN",
  BUS_ERROR: "BUS_ERROR",
  WRITE_PATH_DENIED: "WRITE_PATH_DENIED",
  READ_PATH_DENIED: "READ_PATH_DENIED",
  PATH_ESCAPE: "PATH_ESCAPE",
  NOT_FOUND: "NOT_FOUND",
  COMMAND_NOT_ALLOWLISTED: "COMMAND_NOT_ALLOWLISTED",
  COMMAND_FAILED: "COMMAND_FAILED",
  BAD_ARGS: "BAD_ARGS",
  BAD_REGEX: "BAD_REGEX",
  GIT_ERROR: "GIT_ERROR",
  WEB_ERROR: "WEB_ERROR",
  BAD_URL: "BAD_URL",
  URL_BLOCKED: "URL_BLOCKED",
  STATE_DENIED: "STATE_DENIED",
  // E 沙箱三态（C3）：mode 解析/越界拒绝/升级校验
  SANDBOX_MODE_INVALID: "SANDBOX_MODE_INVALID",
  SANDBOX_DENIED: "SANDBOX_DENIED",
  SANDBOX_ESCALATION_INVALID: "SANDBOX_ESCALATION_INVALID",
  ESCALATION_MALFORMED: "ESCALATION_MALFORMED",
  // E 升级审批阶梯（C3）：ask/never fail-closed + 成对审计 + allowed-once
  APPROVAL_POLICY_INVALID: "APPROVAL_POLICY_INVALID",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  APPROVAL_DENIED: "APPROVAL_DENIED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  APPROVAL_NOT_FOUND: "APPROVAL_NOT_FOUND",
  APPROVAL_ALREADY_DECIDED: "APPROVAL_ALREADY_DECIDED",
  APPROVAL_ALREADY_USED: "APPROVAL_ALREADY_USED",
  // E read-before-edit 守卫（C3）：编辑目标未先读
  FS_NOT_OBSERVED: "FS_NOT_OBSERVED",
  // R17 M2（env-gate）：wakeAgent spawn 前工具探测失败（bash/node/git 缺失）→
  // spawn 中止 + session.error 置码；details.missing 为结构化缺失清单
  TOOL_ENV_BROKEN: "TOOL_ENV_BROKEN",
  // R17 M4（env-gate）：工作房（worktree）未真实创建 → prepare/spawn 拒绝，
  // 中文可操作原因（提示 run-lead 先跑 scripts/worktree-setup.sh）
  WORKTREE_MISSING: "WORKTREE_MISSING",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error carrying a stable machine-readable code (CLI/extension display). */
export class PicodeError extends Error {
  readonly code: ErrorCode;

  /**
   * 结构化附加字段（可选，R17 M2 起）：如 TOOL_ENV_BROKEN 的 `{ missing: [...] }`
   * 缺失清单——调用方可程序化分支，不只靠 message 文本。向后兼容：不传则缺省。
   */
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PicodeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Extract the code from any thrown value (plain errors have none). */
export function errorCodeOf(e: unknown): ErrorCode | null {
  if (e instanceof PicodeError) return e.code;
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    if (typeof c === "string") return c as ErrorCode;
  }
  return null;
}

/** E3: uniform CLI/extension error rendering. */
export function formatPicodeError(e: unknown): string {
  const code = errorCodeOf(e);
  const msg = e instanceof Error ? e.message : String(e);
  return code ? `[picode] ERROR: ${code}: ${msg}` : `[picode] ERROR: ${msg}`;
}
