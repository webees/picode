import fs from "node:fs";
import path from "node:path";
import { readYamlFile, type PicodeConfig } from "@picode/core";
import { SessionStore } from "./session-store.js";
import {
  OpencodeSpawner,
  opencodeSessionIdOf,
  type OpencodeRetryPolicy,
} from "./opencode-adapter.js";
import { TranscriptStore } from "./transcript-store.js";
import { buildPiEnv } from "./pi-adapter.js";

/**
 * C1 continuation (N1/N2/N3 / prime-agent autonomous continuation):
 * 机械层对「已 awake、无 error、任务未终态、预算未耗尽、空闲超过 idle_sec」
 * 的 opencode 会话，按 D061 noReply 语义投喂固定续跑 prompt。
 *
 *  - deriveContinuationTargets：纯派生（读 session/transcript/task，无副作用）
 *  - feedContinuation：POST /session/{id}/message + 转录落盘 + budget.continuations +1
 *  - sweepContinuations：guardian 每次 tick 的入口（budget 之后、serve 探测之前）
 *
 * 不引入 LLM 决策、不引入 daemon；所有状态落盘（session.yaml / transcripts），
 * 幂等且断连可恢复（N3：serve 重启后计数不重置）。
 */

/** 续跑 prompt 固定模板（N7 v1：复用 ready 的角色/任务上下文 + 固定指令）。 */
export const CONTINUATION_PROMPT =
  "检测到本会话已空闲一段时间。若你负责的任务尚未完成，请继续推进：按你的角色 prompt、任务 work brief 与 write_paths 约束工作，持续推进到可交付状态。若任务已完成或你无法继续，请整理证据/交接并明确回报完成情况。不要等待下一次投喂，直接行动。";

/** POST /message 有界重试（C2：断连退避复用 requestWithRetry；成功才计数）。 */
export const CONTINUATION_RETRY: OpencodeRetryPolicy = {
  attempts: 3,
  timeoutMs: 30_000,
  backoffMs: 500,
};

/** 任务终态：续跑 sweep 必须跳过（C1-c；closure.ts dissolve + merge.ts merge 的终态）。 */
export const TERMINAL_TASK_STATUSES = new Set<string>([
  "dissolved",
  "failed",
  "cancelled",
  "merged",
]);

/** 一个可续跑候选：agent_id + 其 opencode 会话 id（pi_session_id，形如 oc-<id>）。 */
export interface ContinuationTarget {
  agent_id: string;
  session_id: string;
}

/** 一次续跑投喂的结果。 */
export interface FeedResult {
  agent_id: string;
  session_id: string;
  /** 投喂后持久化的 budget.continuations 计数。 */
  continuations_used: number;
}

/** 从 agent_id（"engineer@task-x"）解析任务 id（"task-x"）；平台席无任务 → null。 */
export function taskIdOfAgent(agentId: string): string | null {
  const m = /@task-(.+)$/.exec(agentId);
  return m ? `task-${m[1]}` : null;
}

function readTaskStatus(dir: string, taskId: string): string | null {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(p)) return null;
  const task = readYamlFile<{ status?: string }>(p);
  return task?.status ?? null;
}

/**
 * 会话最近活动时刻：max(last_wake_at, 最近一条转录 ts)。续跑投喂也会写入
 * 转录，因此「投喂后 idle 时钟自动重置」——两次续跑之间至少间隔 idle_sec。
 */
function lastActivityMs(dir: string, agentId: string, lastWakeAt: string | null): number {
  let max = lastWakeAt ? Date.parse(lastWakeAt) : 0;
  if (Number.isNaN(max)) max = 0;
  try {
    for (const e of new TranscriptStore(dir).read(agentId)) {
      const t = Date.parse(e.ts);
      if (!Number.isNaN(t) && t > max) max = t;
    }
  } catch {
    /* transcript 损坏视为无活动记录 */
  }
  return max;
}

/**
 * 纯函数：派生当前可续跑候选（C1-b/c/d 验收主体）。
 * 读 session/transcript/task，无网络、无写入——同输入同输出。
 *
 * 候选条件（全部满足）：
 *   1. awake 且 pi_session_id 为 oc-（opencode 会话）
 *   2. 无 error（出错会话由 serve 恢复路径处理，不叠投）
 *   3. 任务未终态（有 task 文件且 status ∈ TERMINAL_TASK_STATUSES 的跳过）
 *   4. 续跑预算未耗尽（continuations < max_per_session，0 = 不限）
 *   5. 空闲超过 idle_sec（最近活动在 now - idle_sec 之前）
 */
export function deriveContinuationTargets(
  dir: string,
  config: PicodeConfig,
  now: Date = new Date(),
): ContinuationTarget[] {
  const cont = config.self_evolve.continuation;
  const targets: ContinuationTarget[] = [];
  for (const s of new SessionStore(dir).awake()) {
    if (!s.pi_session_id?.startsWith("oc-")) continue;
    if (s.error) continue;
    if (cont.max_per_session > 0 && (s.budget?.continuations ?? 0) >= cont.max_per_session) {
      continue;
    }
    const taskId = taskIdOfAgent(s.agent_id);
    if (taskId) {
      const status = readTaskStatus(dir, taskId);
      if (status && TERMINAL_TASK_STATUSES.has(status)) continue;
    }
    const idleMs = now.getTime() - lastActivityMs(dir, s.agent_id, s.last_wake_at);
    if (idleMs < cont.idle_sec * 1000) continue;
    const sessionId = opencodeSessionIdOf(s.pi_session_id);
    if (!sessionId) continue;
    targets.push({ agent_id: s.agent_id, session_id: s.pi_session_id });
  }
  return targets;
}

/**
 * 向单个会话投喂一次续跑 prompt：D061 noReply POST + 转录落盘 +
 * budget.continuations 计数（持久化）。POST 失败（重试耗尽）抛错且不计数。
 * 会话非 awake / 非 oc- → 返回 null（幂等）。
 */
export async function feedContinuation(
  dir: string,
  config: PicodeConfig,
  agentId: string,
): Promise<FeedResult | null> {
  const store = new SessionStore(dir);
  const session = store.get(agentId);
  if (!session?.pi_session_id || session.state !== "awake") return null;
  const sessionId = opencodeSessionIdOf(session.pi_session_id);
  if (!sessionId) return null;

  const env = buildPiEnv(dir, config, session);
  const transcript = new TranscriptStore(dir);
  const spawner = new OpencodeSpawner(config);
  const message = spawner.buildReadyMessage(env, CONTINUATION_PROMPT);
  const res = await spawner.postMessage(sessionId, message, CONTINUATION_RETRY);
  await transcript.recordOutgoing(agentId, message.parts.map((p) => p.text).join("\n"));
  if (res.parts.length > 0) {
    await transcript.recordResponse(agentId, res.parts);
  }
  const updated = await store.recordContinuation(agentId);
  return {
    agent_id: agentId,
    session_id: session.pi_session_id,
    continuations_used: updated.budget?.continuations ?? 0,
  };
}

/**
 * guardian 每 tick 的续跑 sweep：派生候选并逐个投喂；单次失败不阻断整轮
 * （serve 失联等瞬时问题下轮重试）。返回本轮的 fed 列表。
 */
export async function sweepContinuations(
  dir: string,
  config: PicodeConfig,
  now: Date = new Date(),
): Promise<{ fed: string[] }> {
  const fed: string[] = [];
  for (const t of deriveContinuationTargets(dir, config, now)) {
    try {
      const res = await feedContinuation(dir, config, t.agent_id);
      if (res) fed.push(res.agent_id);
    } catch {
      /* 单次投喂失败（瞬时超时/失联耗尽重试）保持可重试，不阻断 sweep */
    }
  }
  return { fed };
}
