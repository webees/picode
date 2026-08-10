/**
 * Session state machine types (spec 17-agent-runtime §4).
 *
 *   registered → sleeping ⇄ awake → terminated
 *
 * `sponsor` never enters this machine (human, non-session).
 */

import { ErrorCode, PicodeError } from "./errors.js";

export type SessionState = "registered" | "sleeping" | "awake" | "terminated";

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

/** Human sponsor must never be registered as a session (17 §3.1 / T26). */
export const NON_SESSION_ROLES: readonly string[] = ["sponsor"] as const;
