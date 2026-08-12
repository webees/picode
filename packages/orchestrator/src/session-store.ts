import fs from "node:fs";
import path from "node:path";
import {
  ErrorCode,
  HUMAN_ONLY_ROLES,
  PicodeError,
  assertTransition,
  ensureDir,
  readYamlFile,
  withFileLock,
  writeYamlFile,
  type SessionRecord,
  type SessionState,
} from "@picode/core";

/**
 * Platform sessions registered per run (17 §3.2 + §3.3).
 * `sponsor` is human-only and never registered (17 §3.1).
 */
export const PLATFORM_ROLES: readonly string[] = [
  "sess-mgr",
  "run-lead",
  "tpm",
  "proc-audit",
  "pm",
  "ind-res",
  "scout",
  "sys-arch",
  "docs-lead",
  "tech-writer",
  "docs-qa",
  "people-lead",
  "recruiter",
  "people-qa",
  "code-review",
  "release-eng",
  "sec-eng",
] as const;

export class SessionStore {
  constructor(private runDir: string) {}

  private sessionsDir(): string {
    return path.join(this.runDir, "sessions");
  }

  private sessionPath(agentId: string): string {
    return path.join(this.sessionsDir(), `${agentId}.yaml`);
  }

  private lockPath(): string {
    return path.join(this.sessionsDir(), ".lock");
  }

  get(agentId: string): SessionRecord | null {
    return readYamlFile<SessionRecord>(this.sessionPath(agentId));
  }

  list(): SessionRecord[] {
    const dir = this.sessionsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => readYamlFile<SessionRecord>(path.join(dir, f))!)
      .sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  }

  /** Sessions currently awake (T21: sleeping sessions must not appear here). */
  awake(): SessionRecord[] {
    return this.list().filter((s) => s.state === "awake");
  }

  /**
   * Register a session in the roster.
   * Human-only roles (sponsor) are rejected; initialState may be
   * "registered" (default) or "sleeping" (init fast-path per 18 phase A).
   */
  register(roleId: string, opts: { agentId?: string; initialState?: "registered" | "sleeping" } = {}): SessionRecord {
    if (HUMAN_ONLY_ROLES.includes(roleId)) {
      throw new PicodeError(
        ErrorCode.SESSION_HUMAN_ONLY,
        "sponsor is human-only; cannot register session",
      );
    }
    const agentId = opts.agentId ?? roleId;
    const existing = this.get(agentId);
    if (existing) {
      throw new PicodeError(ErrorCode.SESSION_ALREADY_REGISTERED, `session already registered: ${agentId}`);
    }

    const state = opts.initialState ?? "registered";
    const record: SessionRecord = {
      schema_version: "1",
      agent_id: agentId,
      role_id: roleId,
      state,
      pi_session_id: null,
      last_wake_at: null,
      last_sleep_at: null,
      wake_reason: null,
      persona_path: null,
      error: null,
    };
    ensureDir(this.sessionsDir());
    writeYamlFile(this.sessionPath(agentId), record);
    return record;
  }

  /** Transition sleeping -> awake. maxAwake is a soft scheduling target (17 §5 / D012). */
  async wake(
    agentId: string,
    reason: string,
    opts: { maxAwake?: number; force?: boolean } = {},
  ): Promise<SessionRecord> {
    return this.transition(agentId, "awake", (cur) => {
      if (!opts.force && opts.maxAwake !== undefined && opts.maxAwake >= 0) {
        const over = this.awake().filter((s) => s.agent_id !== agentId).length >= opts.maxAwake;
        if (over) {
          throw new PicodeError(
            ErrorCode.MAX_AWAKE_EXCEEDED,
            `max_awake=${opts.maxAwake} exceeded; wake "${agentId}" would exceed limit`,
          );
        }
      }
      return { ...cur, wake_reason: reason, last_wake_at: new Date().toISOString() };
    });
  }

  /** Transition awake -> sleeping. */
  async sleep(agentId: string, reason: string): Promise<SessionRecord> {
    return this.transition(agentId, "sleeping", (cur) => {
      void reason;
      return {
        ...cur,
        pi_session_id: null,
        wake_reason: null,
        last_sleep_at: new Date().toISOString(),
      };
    });
  }

  /** Transition sleeping|awake -> terminated (task dissolved, run closed, …). */
  async terminate(agentId: string, _reason: string): Promise<SessionRecord> {
    return this.transition(agentId, "terminated", (cur) => ({
      ...cur,
      error: null,
      wake_reason: null,
      pi_session_id: null,
    }));
  }

  /** Record a session error (18 phase C: Pi spawn failure etc.). No state change. */
  async setError(agentId: string, error: string): Promise<SessionRecord> {
    const p = this.sessionPath(agentId);
    return withFileLock(this.lockPath(), () => {
      const cur = readYamlFile<SessionRecord>(p);
      if (!cur) {
        throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, `session not found: ${agentId}`);
      }
      const next = { ...cur, error };
      writeYamlFile(p, next);
      return next;
    });
  }

  /** Record the live Pi session id on an awake session (stage C). */
  async attachPiSession(agentId: string, piSessionId: string): Promise<SessionRecord> {
    return withFileLock(this.lockPath(), () => {
      const p = this.sessionPath(agentId);
      const cur = readYamlFile<SessionRecord>(p);
      if (!cur) {
        throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, `session not found: ${agentId}`);
      }
      if (cur.state !== "awake") {
        throw new PicodeError(
          ErrorCode.ILLEGAL_STATE,
          `attachPiSession requires awake state, got ${cur.state}`,
        );
      }
      const next: SessionRecord = { ...cur, pi_session_id: piSessionId };
      writeYamlFile(p, next);
      return next;
    });
  }

  /** Read-modify-write under flock; enforces the 17 §4 state machine. */
  private async transition(
    agentId: string,
    to: SessionState,
    mutate: (cur: SessionRecord) => Partial<SessionRecord>,
  ): Promise<SessionRecord> {
    const p = this.sessionPath(agentId);
    return withFileLock(this.lockPath(), () => {
      const cur = readYamlFile<SessionRecord>(p);
      if (!cur) {
        throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, `session not found: ${agentId}`);
      }
      assertTransition(cur.state, to, agentId);
      const next: SessionRecord = { ...cur, ...mutate(cur), state: to };
      writeYamlFile(p, next);
      return next;
    });
  }
}
