/**
 * E 文件沙箱三态 + 每调用 resolve（chunk-c3-sandbox-approval 单写者域）。
 *
 * 定位（E4）：write_paths 静态白名单语义不变，sandbox mode 是叠加其上的
 * **动态兜底围栏**。三态：
 *   - read-only          拒一切写（含 write_paths 内）
 *   - workspace-write    默认；write_paths 内可写，越界可申请一次性升级
 *   - danger-full-access 工作房内任意路径可写（仍拒 path escape 出 cwd）
 *
 * 每调用 resolve：会话 env（PICODE_SANDBOX_MODE，orchestrator pi-adapter 注入）
 * 覆盖 > 默认 workspace-write；非法值 fail-loud（SANDBOX_MODE_INVALID）。
 * 升级严格更宽、执行时校验（WIDER_MODES）；审批策略 ask/never（默认 ask，
 * never=fail-closed）；read-before-edit 守卫开关默认开（安全守卫 fail-closed）。
 */
import { ErrorCode, PicodeError } from "./errors.js";

export const SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"] as const;
export type SandboxMode = (typeof SANDBOX_MODES)[number];

/** 会话级默认 mode（pi-adapter 注入；本轮不新增 config 键，守 D104）。 */
export const SANDBOX_DEFAULT_MODE: SandboxMode = "workspace-write";
export const SANDBOX_MODE_ENV = "PICODE_SANDBOX_MODE";

export const APPROVAL_POLICIES = ["ask", "never"] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];
export const APPROVAL_POLICY_DEFAULT: ApprovalPolicy = "ask";
export const APPROVAL_POLICY_ENV = "PICODE_APPROVAL_POLICY";

export const READ_BEFORE_EDIT_ENV = "PICODE_READ_BEFORE_EDIT";
export const READ_BEFORE_EDIT_DEFAULT = "1";

/**
 * 严格更宽表（执行时校验）：read-only → [workspace-write, danger-full-access]；
 * workspace-write → [danger-full-access]；danger-full-access → []。
 * 升级请求的目标 mode 必须落在当前 mode 的更宽表中，否则拒绝。
 */
export const WIDER_MODES: Readonly<Record<SandboxMode, readonly SandboxMode[]>> = {
  "read-only": ["workspace-write", "danger-full-access"],
  "workspace-write": ["danger-full-access"],
  "danger-full-access": [],
};

export function isSandboxMode(v: unknown): v is SandboxMode {
  return typeof v === "string" && (SANDBOX_MODES as readonly string[]).includes(v);
}

/** 每调用 resolve：会话 env 覆盖 > 默认 workspace-write；非法值 fail-loud。 */
export function resolveSandboxMode(envValue: string | undefined): SandboxMode {
  if (envValue !== undefined && envValue !== "") {
    if (!isSandboxMode(envValue)) {
      throw new PicodeError(
        ErrorCode.SANDBOX_MODE_INVALID,
        `invalid ${SANDBOX_MODE_ENV} "${envValue}" (expected one of: ${SANDBOX_MODES.join(", ")})`,
      );
    }
    return envValue;
  }
  return SANDBOX_DEFAULT_MODE;
}

/** read-only 拒一切写；其余 mode 可写（白名单/围栏判定在调用侧）。 */
export function modeAllowsWrite(mode: SandboxMode): boolean {
  return mode !== "read-only";
}

/** DSH 词汇：结构化拒绝标记（错误码含生效 mode 的配套可读标记）。 */
export function sandboxDenialMarker(mode: SandboxMode): string {
  return `[sandbox: file access denied under ${mode} mode]`;
}

/** 拒绝后的升级提示：retry once with sandbox_permissions+justification 是唯一豁免。 */
export function escalationHint(subject: string): string {
  return `retry once with sandbox_permissions+justification to escalate (唯一豁免): ${subject}`;
}

/** 审批策略解析：默认 ask；never=fail-closed（直接拒绝不落请求）；非法值 fail-loud。 */
export function resolveApprovalPolicy(envValue: string | undefined): ApprovalPolicy {
  if (envValue !== undefined && envValue !== "") {
    if (envValue !== "ask" && envValue !== "never") {
      throw new PicodeError(
        ErrorCode.APPROVAL_POLICY_INVALID,
        `invalid ${APPROVAL_POLICY_ENV} "${envValue}" (expected ask|never)`,
      );
    }
    return envValue;
  }
  return APPROVAL_POLICY_DEFAULT;
}

/**
 * read-before-edit 守卫开关：默认开（安全守卫 fail-closed——未配置或非法值一律视为开，
 * 宁紧勿松）；显式 0/false/off/no 关闭。
 */
export function readBeforeEditEnabled(envValue: string | undefined): boolean {
  if (envValue === undefined || envValue === "") return true;
  const v = envValue.toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}
