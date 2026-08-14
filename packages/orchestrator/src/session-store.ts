import path from "node:path";
import { ErrorCode, HUMAN_ONLY_ROLES, PicodeError, assertTransition, ensureDir, readYamlFile, withFileLock, writeYamlFile, type SessionRecord, type SessionState, readYamlDir } from "@picode/core";

/**
 * Platform sessions registered per run (17 §3.2 + §3.3).
 * `sponsor` is human-only and never registered (17 §3.1).
 */
export const PLATFORM_ROLES: readonly string[] = [  "sess-mgr",
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

/**
 * Agent id safe-name pattern: platform seats (`run-lead`) and task instances
 * (`engineer@task-a`, 16 §4). Rejects `/`, `..`, spaces and any other
 * path-unsafe character — an agent id becomes a file name under sessions/.
 */
export const SAFE_AGENT_ID_RE = /^[A-Za-z0-9_-]+(@[A-Za-z0-9_-]+)?$/;

export class SessionStore {
  constructor(private runDir: string) {}

  private sessionsDir(): string {
    return path.join(this.runDir, "sessions");
  }

  private sessionPath(agentId: string): string {
    // 路径安全汇聚点：所有读/写/迁移都经过这里，非法 agent id（含 `../`）一律拒绝，
    // 防逃逸 sessions/ 目录读写任意文件（P0: agentId 直传 CLI --agent）。
    if (!SAFE_AGENT_ID_RE.test(agentId)) {
      throw new PicodeError(
        ErrorCode.BAD_ARGS,
        `agent id "${agentId}" is not safe (letters/digits/_/-/[A-Za-z0-9_-]+@… only)`,
      );
    }
    return path.join(this.sessionsDir(), `${agentId}.yaml`);
  }

  private lockPath(): string {
    return path.join(this.sessionsDir(), ".lock");
  }

  get(agentId: string): SessionRecord | null {
    return readYamlFile<SessionRecord>(this.sessionPath(agentId));
  }

  list(): SessionRecord[] {
    return readYamlDir<SessionRecord>(this.sessionsDir(), {
      sortBy: (s) => s.agent_id,
    });
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
      // C1-run-budgets: per-session wake-turn meter starts at 0.
      // C1 continuation: per-session auto-refeed counter starts at 0.
      budget: { turns: 0, continuations: 0 },
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
      return {
        ...cur,
        wake_reason: reason,
        last_wake_at: new Date().toISOString(),
        // C1-run-budgets: each sleeping→awake transition counts as one turn.
        // N3: 续跑计数持久化 — 重 wake 只加 turn，绝不重置 continuations。
        budget: {
          turns: (cur.budget?.turns ?? 0) + 1,
          continuations: cur.budget?.continuations ?? 0,
        },
      };
    });
  }

  /**
   * C1 continuation: 记录一次续跑投喂（budget.continuations +1，持久化）。
   * 幂等由调用方保证（guardian 每次 sweep 对每个目标最多投喂一次）。
   */
  async recordContinuation(agentId: string): Promise<SessionRecord> {
    const p = this.sessionPath(agentId);
    return withFileLock(this.lockPath(), () => {
      const cur = readYamlFile<SessionRecord>(p);
      if (!cur) {
        throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, `session not found: ${agentId}`);
      }
      const next: SessionRecord = {
        ...cur,
        budget: {
          turns: cur.budget?.turns ?? 0,
          continuations: (cur.budget?.continuations ?? 0) + 1,
        },
      };
      writeYamlFile(p, next);
      return next;
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

  /** Clear a session error after successful recovery (serve 自动恢复). No state change. */
  async clearError(agentId: string): Promise<SessionRecord> {
    const p = this.sessionPath(agentId);
    return withFileLock(this.lockPath(), () => {
      const cur = readYamlFile<SessionRecord>(p);
      if (!cur) {
        throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, `session not found: ${agentId}`);
      }
      const next = { ...cur, error: null };
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
