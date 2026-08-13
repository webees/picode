/**
 * Session state machine types (spec 17-agent-runtime §4).
 *
 *   registered → sleeping ⇄ awake → terminated
 *
 * `sponsor` never enters this machine (human, non-session).
 */

import { ErrorCode, PicodeError } from "./errors.js";

export type SessionState = "registered" | "sleeping" | "awake" | "terminated";

/** Per-session runaway budget meter (C1-run-budgets / 19 §10 budgets). */
export interface SessionBudgetUsed {
  /** Wake-turn counter: incremented once per sleeping→awake transition. */
  turns: number;
  /**
   * C1 continuation: 自动续跑投喂计数（guardian 对空闲 awake 会话投喂一次
   * 续跑 prompt 即 +1）。持久化在 session.yaml（N3：serve 重启/重 wake 不重置）。
   */
  continuations: number;
}

export interface SessionRecord {
  schema_version: "1";
  agent_id: string;
  role_id: string;
  state: SessionState;
  pi_session_id: string | null;
  last_wake_at: string | null;
  last_sleep_at: string | null;
  wake_reason: string | null;
  persona_path: string | null;
  error: string | null;
  /** Optional (C1): present on sessions registered after the budget rollout. */
  budget?: SessionBudgetUsed;
}

/** Legal transitions per 17 §4. Any other pair is rejected. */
const TRANSITIONS: Record<SessionState, SessionState[]> = {
  registered: ["sleeping"],
  sleeping: ["awake", "terminated"],
  awake: ["sleeping", "terminated"],
  terminated: [],
};

export function canTransition(from: SessionState, to: SessionState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SessionState, to: SessionState, agentId: string): void {
  if (!canTransition(from, to)) {
    throw new PicodeError(
      ErrorCode.ILLEGAL_TRANSITION,
      `illegal session transition: ${from} -> ${to} for agent "${agentId}"`,
    );
  }
}

/** Only an awake session may consume model calls (17 §4 MUST; T21). */
export function canConsumeModel(session: Pick<SessionRecord, "state">): boolean {
  return session.state === "awake";
}

/** Human sponsor must never be registered as a session (17 §3.1 / T26).
 * 生产消费方：orchestrator session-store（C8 收敛；原 orchestrator 本地 HUMAN_ONLY_ROLES 删除）。 */
export const HUMAN_ONLY_ROLES: readonly string[] = ["sponsor"] as const;

/**
 * Deterministic scheduler events (17 §5.3 / D026). Single source of truth for
 * the event ids used in `sess_mgr.rules[]` and by `applyEvent` callers, so a
 * typo in one place fails at compile time (方向 C3).
 */
export const SESSION_EVENTS = {
  RUN_CREATED: "run_created",
  INTAKE_START: "intake_start",
  SPONSOR_MESSAGE: "sponsor_message",
  GOAL_ACTIVE: "goal_active",
  STAFFING_REQUEST: "staffing_request",
  BRIEF_ASSEMBLE: "brief_assemble",
  TASK_READY: "task_ready",
  PROGRESS_DUE: "progress_due",
  MERGE_READY: "merge_ready",
  TASK_DISSOLVED: "task_dissolved",
  CHANGE_APPLIED: "change_applied",
} as const;

export type SessionEvent = (typeof SESSION_EVENTS)[keyof typeof SESSION_EVENTS];

