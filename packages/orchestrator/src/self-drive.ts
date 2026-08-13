import fs from "node:fs";
import path from "node:path";
import { readYamlFile, withFileLock, SESSION_EVENTS, type PicodeConfig } from "@picode/core";
import { SessionStore } from "./session-store.js";
import {
  applyEvent,
  drainSessionCommands,
  type ApplyResult,
} from "./rules-engine.js";
import { sweepDraftPark, readGoal } from "./run-store.js";
import { sweepProgress, type SweepResult } from "./progress.js";
import { sleepAgent, buildPiEnv } from "./pi-adapter.js";
import { OpencodeSpawner } from "./opencode-adapter.js";
import { TranscriptStore } from "./transcript-store.js";
import { sweepContinuations } from "./continuation.js";

// C2 (chunk-continuation-recovery): 把 continuation 机制经本模块透出到包公共面，
// 供 mcp-server 的 continuation_status / continuation_feed 包装（index.ts 在 T06
// 写集之外不可改，self-drive.ts 是 index 已 re-export 的最近可达模块）。
export * from "./continuation.js";

/**
 * Self-drive guardian (TC-02): a deterministic loop that advances a run
 * without a human pushing events.
 *
 * The rules engine (`applyEvent`) and command queue (`drainSessionCommands`)
 * only act when invoked. The guardian derives which rule-table events SHOULD
 * fire from the run's state files, applies them mechanically, drains the
 * sess-mgr command queue, sweeps stale progress (`progress_due`) and parks
 * idle drafts — so a run keeps moving while conditions are met.
 *
 * Safety: every applied event goes through the same idempotent rule table as a
 * CLI invocation (already-awake sessions are skipped, max_awake is enforced).
 * The guardian never writes business code; it only drives the session state
 * machine.
 */

/** A rule-table event derived from run state, ready for `applyEvent`. */
export interface DerivedEvent {
  event: string;
  taskId?: string;
}

interface TaskMeta {
  id: string;
  status: string;
  triad?: { "squad-lead": string; engineer: string; sdet: string };
}

interface ChunkMeta {
  id: string;
  status: string;
  task_id?: string;
}

function readChunks(dir: string): ChunkMeta[] {
  const p = path.join(dir, "chunks.yaml");
  if (!fs.existsSync(p)) return [];
  const data = readYamlFile<{ chunks?: ChunkMeta[] }>(p);
  return data?.chunks ?? [];
}

function readTask(dir: string, taskId: string): TaskMeta | null {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(p)) return null;
  return readYamlFile<TaskMeta>(p);
}

function readRunState(dir: string): { halt?: boolean } | null {
  const p = path.join(dir, "run.yaml");
  if (!fs.existsSync(p)) return null;
  return readYamlFile<{ halt?: boolean }>(p);
}

function briefApproved(dir: string, taskId: string): boolean {
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) return false;
  const b = readYamlFile<{ status?: string }>(p);
  return b?.status === "approved";
}

function seatIdsOf(task: TaskMeta): string[] | null {
  if (!task.triad) return null;
  return [task.triad["squad-lead"], task.triad.engineer, task.triad.sdet];
}

/**
 * Pure derivation: which rule-table events should fire given current run state.
 * Deterministic and read-only — the same inputs always yield the same events.
 */
export function deriveEvents(dir: string, config: PicodeConfig): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const goal = readGoal(dir);
  const sessions = new SessionStore(dir).list();

  // Bootstrap: a fresh run where no session has ever been woken gets run_created.
  if (sessions.length > 0 && sessions.every((s) => !s.last_wake_at)) {
    events.push({ event: SESSION_EVENTS.RUN_CREATED });
  }

  if (goal.status === "active") {
    // Planning seats (scout/sys-arch) get woken once when the goal activates.
    const planning = sessions.filter(
      (s) => s.role_id === "scout" || s.role_id === "sys-arch",
    );
    if (planning.length > 0 && planning.every((s) => !s.last_wake_at)) {
      events.push({ event: SESSION_EVENTS.GOAL_ACTIVE });
    }

    // Task-chain self-next: a ready chunk whose task is still queued and whose
    // triad is registered (staffed) with an approved brief fires task_ready.
    for (const chunk of readChunks(dir)) {
      if (chunk.status !== "ready" || !chunk.task_id) continue;
      const task = readTask(dir, chunk.task_id);
      if (!task || task.status !== "queued") continue;
      const seats = seatIdsOf(task);
      if (!seats) continue;
      const sessionById = new Map(sessions.map((s) => [s.agent_id, s]));
      const registered = seats.every((id) => sessionById.has(id));
      if (!registered) continue;
      const alreadyStarted = seats.some((id) => sessionById.get(id)?.state === "awake");
      if (alreadyStarted) continue;
      if (config.work_brief.require_run_lead_approval && !briefApproved(dir, chunk.task_id)) {
        continue;
      }
      events.push({ event: SESSION_EVENTS.TASK_READY, taskId: chunk.task_id });
    }
  }

  // Dissolution: when the goal closes, dissolve any task not already dissolved.
  if (goal.status === "completed" || goal.status === "cancelled") {
    for (const chunk of readChunks(dir)) {
      if (!chunk.task_id) continue;
      const task = readTask(dir, chunk.task_id);
      if (task && task.status !== "dissolved") {
        events.push({ event: SESSION_EVENTS.TASK_DISSOLVED, taskId: chunk.task_id });
      }
    }
  }

  return events;
}

/** 服务恢复退避（秒级→下次尝试前的等待）；最多 3 次尝试（P1 自动恢复）。 */
export const SERVE_RECOVERY_BACKOFF_MS = [1_000, 5_000, 15_000];
export const MAX_SERVE_RECOVERY_ATTEMPTS = 3;

export interface ServeHealthOpts {
  /** base_url 探测超时。 */
  probeTimeoutMs?: number;
  /** 每次恢复尝试之间的退避；默认 [1s, 5s, 15s]。 */
  recoveryBackoffMs?: number[];
  /** 恢复尝试上限；默认 3。 */
  maxRecoveryAttempts?: number;
}

/**
 * ERR-01 watchdog + P1 serve 自动恢复：
 *  - serve 失联：把 awake 的 opencode 会话标记 error（可观测）。
 *  - serve 恢复：对处于 error 的 awake opencode 会话做有界恢复——退避重投喂
 *    ready 消息（D061 noReply），成功后清 error 并记入恢复台账。
 *  - 防风暴：每会话最多 1 次自动恢复（台账持久化），超出保持 error。
 */
export async function probeServeHealth(
  dir: string,
  config: PicodeConfig,
  opts: ServeHealthOpts = {},
): Promise<{ ok: boolean; failed: string[] }> {
  if (!config.opencode.enabled) return { ok: true, failed: [] };
  const url = config.opencode.base_url.replace(/\/+$/, "");
  try {
    await fetch(url, { signal: AbortSignal.timeout(opts.probeTimeoutMs ?? 5_000) });
  } catch {
    return {
      ok: false,
      failed: await markServeSessionsError(dir, "serve 健康探测失败（ERR-01 watchdog）"),
    };
  }
  return { ok: true, failed: await recoverServeSessions(dir, config, opts) };
}

/** serve 失联时把 awake 的 opencode 会话标记 error；返回受影响 agent 列表。 */
async function markServeSessionsError(dir: string, reason: string): Promise<string[]> {
  const store = new SessionStore(dir);
  const failed: string[] = [];
  for (const s of store.awake()) {
    if (s.pi_session_id?.startsWith("oc-")) {
      await store.setError(s.agent_id, reason);
      failed.push(s.agent_id);
    }
  }
  return failed;
}

/** 对处于 error 的 awake opencode 会话逐台做有界恢复；返回仍处 error 的 agent 列表。 */
async function recoverServeSessions(
  dir: string,
  config: PicodeConfig,
  opts: ServeHealthOpts,
): Promise<string[]> {
  const store = new SessionStore(dir);
  const ledger = new ServeRecoveryStore(dir);
  const transcript = new TranscriptStore(dir);
  const failed: string[] = [];
  for (const s of store.awake()) {
    if (!s.pi_session_id?.startsWith("oc-") || !s.error) continue;
    if (ledger.hasRecovered(s.agent_id)) {
      // 防风暴：已自动恢复过 1 次，超出保持 error
      failed.push(s.agent_id);
      continue;
    }
    const spawner = new OpencodeSpawner(config, {
      onMessagePosted: (e) => {
        const jobs: Promise<unknown>[] = [transcript.recordOutgoing(e.agent_id, e.text)];
        if (e.parts.length > 0) {
          jobs.push(transcript.recordResponse(e.agent_id, e.parts));
        }
        return Promise.all(jobs).then(() => {});
      },
    });
    const recovered = await attemptServeRecovery(dir, config, s.agent_id, spawner, opts);
    if (recovered) {
      await ledger.record(s.agent_id);
      await new SessionStore(dir).clearError(s.agent_id);
    } else {
      failed.push(s.agent_id);
    }
  }
  return failed;
}

/** 一次有界恢复：退避重投喂 ready 消息，成功即返回 true。 */
async function attemptServeRecovery(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  spawner: OpencodeSpawner,
  opts: ServeHealthOpts,
): Promise<boolean> {
  const maxAttempts = opts.maxRecoveryAttempts ?? MAX_SERVE_RECOVERY_ATTEMPTS;
  const backoff = opts.recoveryBackoffMs ?? SERVE_RECOVERY_BACKOFF_MS;
  const session = new SessionStore(dir).get(agentId);
  if (!session?.pi_session_id) return false;
  const env = buildPiEnv(dir, config, session);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const wait = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0;
      await delay(wait);
    }
    try {
      await spawner.sendReady(session.pi_session_id, agentId, env);
      return true;
    } catch {
      /* transient/hard failure → 退避重试；耗尽后保持 error */
    }
  }
  return false;
}

/** 每会话 1 次自动恢复的持久化台账（runs/<id>/serve-recovery.jsonl，防风暴）。 */
export interface ServeRecoveryRecord {
  schema_version: "1";
  type: "serve_recovery";
  agent_id: string;
  recovered_at: string;
}

class ServeRecoveryStore {
  constructor(private runDir: string) {}

  private path(): string {
    return path.join(this.runDir, "serve-recovery.jsonl");
  }

  private lockPath(): string {
    return path.join(this.runDir, ".serve-recovery.lock");
  }

  hasRecovered(agentId: string): boolean {
    const p = this.path();
    if (!fs.existsSync(p)) return false;
    const lines = fs
      .readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    for (const line of lines) {
      try {
        if ((JSON.parse(line) as { agent_id?: string }).agent_id === agentId) return true;
      } catch {
        /* 跳过损坏行 */
      }
    }
    return false;
  }

  async record(agentId: string): Promise<void> {
    const rec: ServeRecoveryRecord = {
      schema_version: "1",
      type: "serve_recovery",
      agent_id: agentId,
      recovered_at: new Date().toISOString(),
    };
    await withFileLock(this.lockPath(), () => {
      fs.appendFileSync(this.path(), JSON.stringify(rec) + "\n", "utf8");
    });
  }
}

/** Result of one guardian tick (one pass over the run). */
export interface GuardianTickResult {
  ticked_at: string;
  drained: number;
  draft_parked: string | null;
  progress: SweepResult;
  events: ApplyResult[];
  slept: string[];
  serve: { ok: boolean; failed: string[] };
  budgets: BudgetCheckResult;
  /** C1 continuation: 本轮自动投喂续跑 prompt 的 agent 列表。 */
  continuation: { fed: string[] };
  halt: boolean;
}

/** Sleep sessions awake beyond `sess_mgr.idle_sleep_sec` (opt-in). */
export async function sleepIdleSessions(
  dir: string,
  config: PicodeConfig,
  nowMs: number = Date.now(),
): Promise<string[]> {
  const store = new SessionStore(dir);
  const idleSec = config.sess_mgr.idle_sleep_sec;
  const slept: string[] = [];
  for (const s of store.awake()) {
    if (!s.last_wake_at) continue;
    const idle = (nowMs - Date.parse(s.last_wake_at)) / 1000;
    if (idle > idleSec) {
      await sleepAgent(dir, config, s.agent_id, "guardian:idle");
      slept.push(s.agent_id);
    }
  }
  return slept;
}

/** One over-limit session: which budget field was hit and its usage. */
export interface BudgetExceeded {
  agent_id: string;
  field: "maxTurns" | "maxTokens" | "timeoutMs";
  limit: number;
  used: number;
}

/** Result of one budget sweep over the awake roster. */
export interface BudgetCheckResult {
  /** Agent ids stopped this pass (setError "budget exceeded" + sleep). */
  stopped: string[];
  /** Over-limit sessions with the limiting field, for audit. */
  exceeded: BudgetExceeded[];
  /** Configured gate verification commands (C1): 达到限额 ≠ 成功, never success. */
  gate_commands: string[];
}

/**
 * C1-run-budgets: runaway protection for awake sessions.
 *
 * Checks every awake session against `self_evolve.budgets` and stops the ones
 * over a limit: `setError("budget exceeded")` + sleep. Gate stopping is NOT
 * success — the error marker makes the budget hit observable (prime-agent
 * autonomous.ts: "达到限额 ≠ 任务成功").
 *
 *  - maxTurns      — per-session wake-turn counter (`session.budget.turns`); >0 enforced
 *  - timeoutMs     — continuous awake wall-clock since last_wake_at; >0 enforced
 *  - maxTokens     — declared but v1 has no token meter (0 = unlimited, never fires)
 *  - gate_commands — declared/returned for observers; execution is out of scope
 */
export async function checkBudgets(
  dir: string,
  config: PicodeConfig,
  nowMs: number = Date.now(),
): Promise<BudgetCheckResult> {
  const b = config.self_evolve.budgets;
  const store = new SessionStore(dir);
  const exceeded: BudgetExceeded[] = [];
  for (const s of store.awake()) {
    const used = s.budget?.turns ?? 0;
    if (b.maxTurns > 0 && used >= b.maxTurns) {
      exceeded.push({
        agent_id: s.agent_id,
        field: "maxTurns",
        limit: b.maxTurns,
        used,
      });
      continue;
    }
    if (b.timeoutMs > 0 && s.last_wake_at) {
      const awakeMs = nowMs - Date.parse(s.last_wake_at);
      if (awakeMs > b.timeoutMs) {
        exceeded.push({
          agent_id: s.agent_id,
          field: "timeoutMs",
          limit: b.timeoutMs,
          used: awakeMs,
        });
      }
    }
  }
  const stopped: string[] = [];
  for (const ex of exceeded) {
    await store.setError(ex.agent_id, `budget exceeded (${ex.field}: ${ex.used}/${ex.limit})`);
    await sleepAgent(dir, config, ex.agent_id, "guardian:budget");
    stopped.push(ex.agent_id);
  }
  return { stopped, exceeded, gate_commands: b.gate_commands };
}

/**
 * One guardian pass. Order matters for determinism:
 *   1. park idle drafts
 *   2. drain the sess-mgr command queue
 *   3. derive + apply rule-table events (self-next chain) — start events
 *      (run_created / goal_active / task_ready) fire BEFORE progress nudges,
 *      so a freshly-queued task is woken as a triad, not split by progress_due
 *   4. sweep stale progress → progress_due (nudge for tasks already running)
 *   5. enforce per-session budgets (C1): stop over-limit awake sessions
 *   6. continuation sweep (C1): feed idle awake oc- sessions a bounded prompt
 *   7. optionally sleep idle sessions (opt-in)
 *   8. probe serve health (P1): mark error on outage / bounded recovery
 *
 * C2 recovery-linkage contract (plan §b C2): the continuation sweep runs AFTER
 * checkBudgets and BEFORE probeServeHealth. Error sessions are therefore never
 * feed (C1 gate) — they are recovered by P1's sendReady + clearError in step 8,
 * and the NEXT tick's sweep resumes from the persisted budget.continuations
 * count (N3): recovery/wake never reset the counter, so a recovered session can
 * only ever advance toward — never exceed — self_evolve.continuation.max_per_session.
 */
export async function guardianTick(
  dir: string,
  config: PicodeConfig,
  opts: { idleSleep?: boolean } = {},
): Promise<GuardianTickResult> {
  const parked = sweepDraftPark(dir, config);
  const drain = await drainSessionCommands(dir, config);

  const events: ApplyResult[] = [];
  for (const ev of deriveEvents(dir, config)) {
    events.push(await applyEvent(dir, config, ev.event, ev.taskId ? { taskId: ev.taskId } : {}));
  }

  const progress = await sweepProgress(dir, config);

  const budgets = await checkBudgets(dir, config);

  // C1 continuation (N1/N2/N3): 在 checkBudgets 之后、probeServeHealth 之前，
  // 对空闲 awake 的 opencode 会话有界投喂续跑 prompt（C2 顺序契约）。
  const continuation = await sweepContinuations(dir, config);

  const slept = opts.idleSleep ? await sleepIdleSessions(dir, config) : [];
  const serve = await probeServeHealth(dir, config);

  const runState = readRunState(dir);
  return {
    ticked_at: new Date().toISOString(),
    drained: drain.processed,
    draft_parked: parked?.parked_at ?? null,
    progress,
    events,
    slept,
    serve,
    budgets,
    continuation,
    halt: runState?.halt ?? false,
  };
}

/** Options for the guardian loop. */
export interface GuardianOptions {
  intervalMs?: number;
  maxTicks?: number;
  haltFile?: string;
  idleSleep?: boolean;
}

/** Summary of a guardian loop run. */
export interface GuardianSummary {
  ticks: number;
  halted: boolean;
  ticksRun: GuardianTickResult[];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Guardian loop: tick every `intervalMs` until `maxTicks`, the halt file
 * appears, `run.yaml.halt` is set, or SIGINT/SIGTERM is received.
 */
export async function runGuardian(
  dir: string,
  config: PicodeConfig,
  opts: GuardianOptions = {},
): Promise<GuardianSummary> {
  const intervalMs = opts.intervalMs ?? 60_000;
  const maxTicks = opts.maxTicks ?? Number.POSITIVE_INFINITY;
  const haltFile = opts.haltFile ?? path.join(dir, "guardian.halt");

  let halted = false;
  let ticks = 0;
  const ticksRun: GuardianTickResult[] = [];

  const stop = () => {
    halted = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (ticks < maxTicks && !halted) {
      if (fs.existsSync(haltFile)) {
        halted = true;
        break;
      }
      ticks += 1;
      const result = await guardianTick(dir, config, { idleSleep: opts.idleSleep });
      ticksRun.push(result);
      if (result.halt) {
        halted = true;
        break;
      }
      if (ticks < maxTicks && !halted) {
        await delay(intervalMs);
      }
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }

  return { ticks, halted, ticksRun };
}
