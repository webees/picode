import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readYamlFile, withFileLock, SESSION_EVENTS, type PicodeConfig } from "@picode/core";
import { RoomStore } from "@picode/bus";
import { SessionStore } from "./session-store.js";
import {
  applyEvent,
  drainSessionCommands,
  type ApplyResult,
} from "./rules-engine.js";
import { sweepDraftPark, readGoal } from "./run-store.js";
import { runWatchdogCheck } from "./session-watchdog.js";
import { isBriefApproved } from "./task.js";
import { sweepProgress, type SweepResult } from "./progress.js";
import { sleepAgent, buildPiEnv } from "./pi-adapter.js";
import { OpencodeSpawner } from "./opencode-adapter.js";
import { TranscriptStore } from "./transcript-store.js";
import { sweepContinuationsGated } from "./continuation-gate.js";
import { taskIdOfAgent } from "./continuation.js";
import { delay } from "./timing.js";
import {
  captureDueGuardianCheckpoints,
  type GuardianCheckpointCaptureResult,
} from "./checkpoint-store.js";

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

/**
 * I6（chunk-settle-feed）：子代理结算机械通知负载（机械层观察 session.yaml 派生）。
 * 来源标注纪律：结算通知由机械层（orchestrator）观察状态文件派生，不是子代理
 * LLM 自报（蓝图 §2.4@114-125 / spec-17 §9）；复用既有 bus 词汇 `cell_done`
 * （room-store.ts@40 已注册），不新增 SESSION_EVENTS（spec-10 无需注册）。
 */
export interface SubagentSettledNotice {
  agent_id: string;
  /** 父会话 agent_id（决定父房）；无父会话 → null（无可投递房间）。 */
  parent_session: string | null;
  /** 子代理嵌套深度（>=1）。 */
  delegation_depth: number;
}

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
      if (config.work_brief.require_run_lead_approval && !isBriefApproved(dir, chunk.task_id, config)) {
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

/**
 * I6（D1 决策）：纯派生——子代理终态（delegation_depth>0 ∧ state=terminated ∧
 * parent_session 非空）→ 结算通知负载列表。只读无副作用（对齐 deriveEvents
 * 纯派生风格与 TASK_DISSOLVED 先例；`deriveEvents` 本身零改动——结算通知不是
 * 规则表事件，不进 applyEvent/rules-engine 事件面）。
 */
export function deriveSettledSubagentNotices(dir: string): SubagentSettledNotice[] {
  const notices: SubagentSettledNotice[] = [];
  for (const s of new SessionStore(dir).list()) {
    if ((s.delegation_depth ?? 0) > 0 && s.state === "terminated" && s.parent_session) {
      notices.push({
        agent_id: s.agent_id,
        parent_session: s.parent_session,
        delegation_depth: s.delegation_depth ?? 0,
      });
    }
  }
  return notices;
}

/** 服务恢复退避（秒级→下次尝试前的等待）；最多 3 次尝试（P1 自动恢复）。 */
export const SERVE_RECOVERY_BACKOFF_MS = [1_000, 5_000, 15_000];
export const MAX_SERVE_RECOVERY_ATTEMPTS = 3;

/**
 * I6: 父房解析——父会话 agent_id（如 engineer@task-x）→ 其 squad 房
 * （squad-task-x，task.yaml work_room 约定）。平台席父会话（无 @task- 绑定）
 * 无 squad 房 → null（无可投递房间，调用方保守跳过）。
 */
export function parentRoomOf(parentSession: string | null): string | null {
  if (!parentSession) return null;
  const taskId = taskIdOfAgent(parentSession);
  return taskId ? `squad-${taskId}` : null;
}

/**
 * I6（D2 决策）：幂等检查——父房 bus 文件是否已有该子代理的 cell_done
 * （type=cell_done ∧ meta.subagent === agent_id）。bus 文件是通知真相
 * （D002 文件真相），不建事件日志/通知台账。
 */
function alreadyNotified(dir: string, room: string, agentId: string): boolean {
  const file = path.join(dir, "bus", `${room}.jsonl`);
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line) as { type?: string; meta?: { subagent?: string } };
      if (m.type === "cell_done" && m.meta?.subagent === agentId) return true;
    } catch {
      /* 损坏行跳过（与 RoomStore.readBus 同款容错） */
    }
  }
  return false;
}

/**
 * I6（D1/D2/D4 决策）：投递所有子代理结算 cell_done 机械通知到父房。
 *  - 复用 RoomStore.post 既有通道（cell_done 词汇已注册）；
 *    投递身份 = 父会话 agent_id（父房 post 成员通道——"orchestrator" 非房间
 *    成员，ACL 会拒绝；机械来源由消息体/meta 标注承载：meta.source =
 *    "orchestrator" + meta.derived_from="session.yaml"，来源标注纪律不丢）。
 *  - refs 指子代理转录（transcripts/<agent>.jsonl）与会话文件
 *    （sessions/<agent>.yaml）——D2 定稿；另附父任务证据目录
 *    （tasks/<taskId>/evidence）对齐验收口径「refs 指转录/证据」。
 *  - 幂等：父房 bus 已有该子代理 cell_done → 跳过（bus 文件是通知真相）。
 *  - 平台席父会话（无 squad 房）→ 保守跳过。
 *  - 单条投递 best-effort（P1 容错）：post ACL 失败等不阻断其余、不炸 tick。
 *  - 返回本轮已投递的子代理 agent_id 列表（GuardianTickResult.settled，观测用）。
 */
export async function postSettledSubagentNotices(dir: string): Promise<string[]> {
  const delivered: string[] = [];
  for (const notice of deriveSettledSubagentNotices(dir)) {
    try {
      const room = parentRoomOf(notice.parent_session);
      if (!room) continue;
      if (alreadyNotified(dir, room, notice.agent_id)) continue;
      const parent = notice.parent_session!;
      const taskId = taskIdOfAgent(parent)!;
      const bus = new RoomStore(dir);
      await bus.post(room, parent, {
        type: "cell_done",
        body: `子代理 ${notice.agent_id} 已结算（机械通知：guardian 观察会话终态派生，非子代理 LLM 自报）。`,
        refs: [
          path.join("transcripts", `${notice.agent_id}.jsonl`),
          path.join("sessions", `${notice.agent_id}.yaml`),
          path.join("tasks", taskId, "evidence"),
        ],
        meta: {
          subagent: notice.agent_id,
          parent_session: parent,
          delegation_depth: notice.delegation_depth,
          source: "orchestrator",
          derived_from: "session.yaml",
        },
      });
      delivered.push(notice.agent_id);
    } catch {
      /* best-effort：单条投递失败保持可重试，不阻断其余（P1 容错） */
    }
  }
  return delivered;
}

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
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      failed: await markServeSessionsError(
        dir,
        `serve 健康探测失败（ERR-01 watchdog）: ${reason.slice(0, 120)}`,
      ),
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

/**
 * R2-C3 (chunk-guardian-reload-signal): guardian 代码更新检测信号。
 * 守护进程启动时 import 缓存使 TS dist 热载复杂且有中途退出风险（违背「无 daemon」
 * 不变量），因此不自动热载、不自动退出——只做观测：启动时记录 repo HEAD，每 tick
 * 对比 `git rev-parse HEAD`，main HEAD 前移（合并落地）即置 detected 并警告一次，
 * 运维据此按 operations.md 重启守护。
 */
export interface CodeUpdatedSignal {
  detected: boolean;
  base_sha: string;
  head_sha: string;
}

/** Result of one guardian tick (one pass over the run). */
export interface GuardianTickResult {
  /** P1-3：tick 顶层错误（正常 tick 为 undefined） */
  error?: string;
  /** R17 M1：零产出看门狗结果 */
  watchdog?: import("./session-watchdog.js").WatchdogRunResult;
  ticked_at: string;
  drained: number;
  draft_parked: string | null;
  progress: SweepResult;
  events: ApplyResult[];
  slept: string[];
  serve: { ok: boolean; failed: string[] };
  budgets: BudgetCheckResult;
  /**
   * C1 continuation + R3-C2 gate: 本轮自动投喂续跑 prompt 的 agent 列表；
   * gate 启用时附带每候选的 gate 结果（通过/失败/快照未变跳过）。
   */
  continuation: {
    fed: string[];
    gate: Array<{ agent_id: string; reason: string; ran: boolean; passed: boolean }>;
  };
  /**
   * I6（D4）: 本轮已投递 cell_done 机械通知的子代理 agent_id 列表（观测用，
   * additive 不破坏既有断言；来源 = orchestrator 观察会话终态派生）。
   */
  settled: string[];
  /** C1 checkpoint-auto: 本轮 guardian 周期捕获的 task（boundary=guardian）；默认关闭 → 空。 */
  checkpoints: GuardianCheckpointCaptureResult;
  /**
   * R2-C3: 守护启动后 main HEAD 是否前移（合并落地 → 需重启热载）。
   * null = 基线不可得/代码未变（幂等）；非 null = detected 且含 base/head SHA。
   */
  code_updated: CodeUpdatedSignal | null;
  /** C1-run-close: 终态 goal（completed/cancelled）后本轮休眠的平台席列表。 */
  slept_platform: string[];
  halt: boolean;
}

/** R2-C3: 读当前仓库 HEAD（git rev-parse HEAD）；非 git 仓库或无提交返回 null。 */
export function repoHeadSha(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/** R2-C3: 对比启动时 base HEAD 与当前 HEAD；未变/不可得 → null（幂等），前移 → 检测信号。 */
export function detectCodeUpdated(cwd: string, baseSha: string): CodeUpdatedSignal | null {
  const headSha = repoHeadSha(cwd);
  if (headSha === null || headSha === baseSha) return null;
  return { detected: true, base_sha: baseSha, head_sha: headSha };
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

/**
 * C1-run-close: 平台席休眠（product acceptance: run 收尾不残留 awake 占 max_awake）。
 * 遍历 SessionStore.list() 中 awake 且无 task 绑定（taskIdOfAgent === null）的
 * 平台席，逐个 sleepAgent。幂等：非 awake 或已休眠的会话自然跳过，重复调用无副作用。
 */
export async function sleepPlatformSeats(
  dir: string,
  config: PicodeConfig,
): Promise<string[]> {
  const store = new SessionStore(dir);
  const slept: string[] = [];
  for (const s of store.list()) {
    if (s.state !== "awake") continue;
    if (taskIdOfAgent(s.agent_id) !== null) continue;
    await sleepAgent(dir, config, s.agent_id, "guardian:run-close");
    slept.push(s.agent_id);
  }
  return slept;
}

/**
 * C1-run-close: run 收尾（goal 终态 completed/cancelled 后）。
 *  - applyEvent 补发 TASK_DISSOLVED（幂等：任务已 dissolved 的 applyEvent 无副作用）
 *  - sleepPlatformSeats 休眠所有 awake 平台席
 * best-effort：单点失败不阻断整体（guardianTick 与 CLI 共用，收尾不可因单席失败中断）。
 */
export async function closeRun(
  dir: string,
  config: PicodeConfig,
): Promise<{ dissolved: string[]; slept_platform: string[] }> {
  const dissolved: string[] = [];
  for (const chunk of readChunks(dir)) {
    if (!chunk.task_id) continue;
    const task = readTask(dir, chunk.task_id);
    if (task && task.status !== "dissolved") {
      try {
        await applyEvent(dir, config, SESSION_EVENTS.TASK_DISSOLVED, {
          taskId: chunk.task_id,
        });
        dissolved.push(chunk.task_id);
      } catch {
        /* best-effort: 单任务失败不阻断整体 */
      }
    }
  }
  const slept_platform = await sleepPlatformSeats(dir, config);
  return { dissolved, slept_platform };
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
 *   7. run-close (C1): 终态 goal（completed/cancelled）→ sleepPlatformSeats（平台席收尾）
 *   8. optionally sleep idle sessions (opt-in)
 *   9. probe serve health (P1): mark error on outage / bounded recovery
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
  opts: { idleSleep?: boolean; baseSha?: string | null } = {},
): Promise<GuardianTickResult> {
  // P1-3（R17 修复波）：tick 顶层错误边界——任一环节抛错（坏 yaml/LOCK_TIMEOUT/
  // sleepAgent 失败等）不再整轮 tick 死亡退出 runGuardian 循环；错误落盘 + 返回
  // 含 error 字段的结果（runGuardian 侧退避续跑，自治 run 不静默停摆）。
  try {
    return await guardianTickInner(dir, config, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = `guardian tick 失败（P1-3 边界捕获）: ${msg.slice(0, 300)}`;
    try {
      fs.appendFileSync(
        path.join(dir, "guardian-errors.log"),
        `${new Date().toISOString()} ${reason}\n`,
        "utf8",
      );
    } catch {
      /* 日志落盘失败不掩盖原始错误 */
    }
    return {
      ticked_at: new Date().toISOString(),
      drained: 0,
      draft_parked: null,
      progress: { checked: 0, overdue: [], woke: [] },
      events: [{
        event: "guardian_tick_error",
        rejected: true,
        actions: [{ agent_id: "*", action: "skip", outcome: "rejected", reason }],
      }],
      slept: [],
      serve: { ok: false, failed: [] },
      budgets: { stopped: [], exceeded: [], gate_commands: [] },
      continuation: { fed: [], gate: [] },
      settled: [],
      checkpoints: { boundary: "guardian", captured: [] },
      code_updated: null,
      slept_platform: [],
      halt: false,
      error: reason,
    } satisfies GuardianTickResult;
  }
}

async function guardianTickInner(
  dir: string,
  config: PicodeConfig,
  opts: { idleSleep?: boolean; baseSha?: string | null } = {},
): Promise<GuardianTickResult> {
  const parked = sweepDraftPark(dir, config);
  const drain = await drainSessionCommands(dir, config);

  const events: ApplyResult[] = [];
  for (const ev of deriveEvents(dir, config)) {
    // 单事件容错（P1）：一个 applyEvent 抛错（如 sleepAgent 后端失败）不再
    // 毁掉整轮 tick — 记录错误事件，其余事件照常处理
    try {
      events.push(await applyEvent(dir, config, ev.event, ev.taskId ? { taskId: ev.taskId } : {}));
    } catch (e) {
      events.push({
        event: ev.event,
        rejected: true,
        actions: [
          {
            agent_id: ev.taskId ? `task:${ev.taskId}` : "*",
            action: "skip",
            outcome: "rejected",
            reason: e instanceof Error ? e.message : String(e),
          },
        ],
      });
    }
  }

  const progress = await sweepProgress(dir, config);

  const budgets = await checkBudgets(dir, config);

  // C1 checkpoint-auto: guardian 周期捕获（enabled 时对非终态任务追加只读观测快照；
  // 默认关闭 → 空。只写不读，快照只读边界不变 D082）。
  const checkpoints = captureDueGuardianCheckpoints(dir, config);

  // C1 continuation (N1/N2/N3): 在 checkBudgets 之后、probeServeHealth 之前，
  // 对空闲 awake 的 opencode 会话有界投喂续跑 prompt（C2 顺序契约）。
  // R3-C2: 投喂前先跑可选 gate（gate_commands 非空才启用）；gate 启用时
  // 「通过 → 停靠不投喂」「失败/快照未变 → 不投喂但保留候选（下轮可重试）」。
  const continuation = await sweepContinuationsGated(dir, config);

  // I6（D4）: continuation sweep 之后投递子代理结算机械通知——cell_done 进父房
  // （复用既有 bus 词汇；来源 = orchestrator 观察会话终态派生，非 LLM 自报；
  // 幂等：父房 bus 已有则跳过；平台席父会话保守跳过；单条 best-effort）。
  const settled = await postSettledSubagentNotices(dir);

  // C1-run-close: 终态 goal（completed/cancelled）后休眠所有 awake 平台席，
  // 不残留 awake 占 max_awake（product acceptance：run 收尾自动休眠平台席）。
  const goal = readGoal(dir);
  const slept_platform =
    goal.status === "completed" || goal.status === "cancelled"
      ? await sleepPlatformSeats(dir, config)
      : [];

  const slept = opts.idleSleep ? await sleepIdleSessions(dir, config) : [];
  const serve = await probeServeHealth(dir, config);

  // R17 M1：零产出看门狗——产出信号/at_risk/接管候选（纯规则；动作幂等；
  // error 前缀 TOOL_ENV_BROKEN:/WORKTREE_MISSING: 触发立即 at_risk）。
  const watchdog = await runWatchdogCheck(dir, path.resolve(dir, "../../.."), config);

  const runState = readRunState(dir);
  // R2-C3: 仅当守护进程提供了启动时基线 HEAD 才检测代码更新（单次 tick 无基线 → null）。
  const code_updated =
    opts.baseSha != null ? detectCodeUpdated(dir, opts.baseSha) : null;
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
    settled,
    checkpoints,
    code_updated,
    slept_platform,
    watchdog,
    halt: runState?.halt ?? false,
  };
}

/** Options for the guardian loop. */
export interface GuardianOptions {
  intervalMs?: number;
  maxTicks?: number;
  haltFile?: string;
  idleSleep?: boolean;
  /** R2-C3: 启动时记录的 repo HEAD 基线（默认 null → 启动时实时记录）。 */
  baseSha?: string | null;
}

/** 只保留最近 24 轮 tick 结果（缺省无限 maxTicks 长跑时防 OOM，P2）。 */
const MAX_TICKS_RETAINED = 24;

/** Summary of a guardian loop run. */
export interface GuardianSummary {
  ticks: number;
  halted: boolean;
  ticksRun: GuardianTickResult[];
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

  // R2-C3: 启动时记录 base HEAD（守护代码基线）；每 tick 对比，main HEAD 前移即
  // 置 code_updated 警告一次（不自动退出、不热载——见 operations.md 重启规程）。
  const baseSha = opts.baseSha ?? repoHeadSha(dir);
  let codeWarned = false;

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
      let result: GuardianTickResult;
      try {
        result = await guardianTick(dir, config, {
          idleSleep: opts.idleSleep,
          baseSha,
        });
      } catch (e) {
        // 保底（P1-3）：guardianTick 自身意外抛错（不应发生，边界已内聚）也继续循环
        const msg = e instanceof Error ? e.message : String(e);
        result = {
          ticked_at: new Date().toISOString(),
          drained: 0,
          draft_parked: null,
          progress: { checked: 0, overdue: [], woke: [] },
          events: [{
            event: "guardian_tick_error",
            rejected: true,
            actions: [{ agent_id: "*", action: "skip", outcome: "rejected", reason: msg.slice(0, 200) }],
          }],
          slept: [],
          serve: { ok: false, failed: [] },
          budgets: { stopped: [], exceeded: [], gate_commands: [] },
          continuation: { fed: [], gate: [] },
          settled: [],
          checkpoints: { boundary: "guardian", captured: [] },
          code_updated: null,
          slept_platform: [],
          halt: false,
          error: `runGuardian 保底捕获: ${msg.slice(0, 200)}`,
        };
      }
      ticksRun.push(result);
      if (ticksRun.length > MAX_TICKS_RETAINED) ticksRun.shift();
      if (result.code_updated?.detected && !codeWarned) {
        console.warn(
          `[guardian] 检测到仓库 HEAD 前移：base ${result.code_updated.base_sha} → head ${result.code_updated.head_sha}；` +
            "守护进程仍载入旧代码，请按 docs/guides/operations.md 重启守护热载（guardian 不自动退出）",
        );
        codeWarned = true;
      }
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
