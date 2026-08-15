import fs from "node:fs";
import path from "node:path";
import { readYamlFile, type PicodeConfig } from "@picode/core";
import { SessionStore } from "./session-store.js";
import {
  OpencodeSpawner,
  opencodeSessionIdOf,
  type OpencodeRetryPolicy,
} from "./opencode-adapter.js";
import {
  CONTINUATION_PROMPT,
  CONTINUATION_SUMMARY_HEADER,
  SUMMARY_STRIP_NOISE,
} from "./summary-noise.js";
export { CONTINUATION_PROMPT, CONTINUATION_SUMMARY_HEADER };
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
 *
 * D092：CONTINUATION_PROMPT / CONTINUATION_SUMMARY_HEADER / READY_MESSAGE_TEXT
 * 及剔噪口径 SUMMARY_STRIP_NOISE 统一收敛到 summary-noise.ts（零依赖模块），
 * 本模块仅 re-export 保持既有引用路径，feed/checkpoint 同消费 SUMMARY_STRIP_NOISE。
 *
 * I1（chunk-settle-feed）：投喂语义分级 followup/steer/inject（S 变体，不碰
 * 17 §4 状态机）——derive/feed 增 FeedOptions.kind（默认 followup 零行为变化）；
 * steer 增量 next-step 引导（instruction 通道，不重灌固定模板），inject 状态
 * 通知不唤醒（只过 in-flight 门闩、不计预算）；wake 门闩沿用既有 idle/in-flight
 * 判定；投喂计数/预算/门闩全部收敛在本模块（KI-6：continuation-gate.ts 只读，
 * 不新建模块）。
 */

/**
 * 语义续跑（N7 升级）：组合续跑 prompt 的纯函数——null（无摘要/空转录）
 * 原样返回 CONTINUATION_PROMPT；有摘要则在其后追加转录要点段，
 * 让续跑带着「上一回合要点」而非空模板。同输入同输出，无副作用。
 */
export function composeContinuationPrompt(summary: string | null): string {
  if (summary === null) return CONTINUATION_PROMPT;
  return `${CONTINUATION_PROMPT}\n\n${CONTINUATION_SUMMARY_HEADER}\n${summary}`;
}

/**
 * I1（chunk-settle-feed）：投喂语义分级（S 变体，不碰 17 §4 状态机）——
 *  - followup（默认）：现状续跑投喂（新轮次，唤醒），行为与 C1 完全一致
 *  - steer：增量 next-step 引导（instruction 携带「上一步证据已回执，下一步是 X」
 *    式指令）；消息 = 摘要段 + 引导段，**不重灌固定续跑模板**（蓝图 §4.2 降级
 *    要点 1「不整体重投」）；与 followup 同门闩；计续跑预算
 *  - inject：状态通知不唤醒（策略变更/上下文快照只入队）——只对 awake oc- 会话
 *    投递（不触发状态迁移）；只过 in-flight 门闩（busy 不插队）、不过 idle 门闩
 *    （状态通知即时投递）；不计预算/不耗续跑配额（状态通知非续跑，避免噪声
 *    耗尽 D078 预算）
 */
export type ContinuationKind = "followup" | "steer" | "inject";

/** I1（D3）: 投喂选项——kind 默认 "followup"；steer 用 instruction、inject 用 notification。 */
export interface FeedOptions {
  kind?: ContinuationKind;
  /** steer 档：增量 next-step 引导指令（「上一步证据已回执，下一步是 X」式）。 */
  instruction?: string;
  /** inject 档：状态通知正文（如 checkpoint 更新 / budget 变更）。 */
  notification?: string;
}

/** I1: steer 引导段固定标题（composeSteerPrompt 输出，供测试/引用）。 */
export const STEER_HEADER = "## 下一步引导（steer：增量投喂）";

/** I1: inject 通知段固定标题（composeInjectNotice 输出，供测试/引用）。 */
export const INJECT_HEADER = "## 状态通知（inject：不唤醒）";

/**
 * I1: steer 组合——摘要段（复用 CONTINUATION_SUMMARY_HEADER）之上追加
 * 「下一步引导」段；**不含固定续跑模板**（增量投喂，不整体重投）。
 * guidance 为调用方给出的增量指令（buildReadyMessage extraText 通道）。
 * 纯函数：同输入同输出，无副作用。
 */
export function composeSteerPrompt(summary: string | null, guidance: string): string {
  const summaryPart =
    summary === null ? "" : `${CONTINUATION_SUMMARY_HEADER}\n${summary}\n\n`;
  return `${summaryPart}${STEER_HEADER}\n${guidance}`;
}

/**
 * I1: inject 组合——纯状态通知正文（不携带续跑模板，语义 = 只入队不唤醒）。
 * 纯函数：同输入同输出，无副作用。
 */
export function composeInjectNotice(text: string): string {
  return `${INJECT_HEADER}\n${text}`;
}

/** I1: 按 FeedOptions 组合投喂正文（feedContinuation 内部使用；默认档 = followup）。 */
function composeFeedPrompt(
  opts: FeedOptions,
  summary: string | null,
): string {
  const kind = opts.kind ?? "followup";
  switch (kind) {
    case "steer":
      return composeSteerPrompt(summary, opts.instruction ?? "");
    case "inject":
      return composeInjectNotice(opts.notification ?? "");
    default:
      return composeContinuationPrompt(summary);
  }
}

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
 * 会话最近「回合完成」时刻（R3-C1 idle 时钟修复）：max(last_wake_at,
 * 最近一条 incoming 转录 ts)。续跑投喂记录为 outgoing，不参与 idle 计算——
 * 投喂（outgoing）不再重置 idle 时钟。因此 idle 时钟 = 响应时间，非投喂时间。
 */
function lastRoundCompletedMs(
  dir: string,
  agentId: string,
  lastWakeAt: string | null,
): number {
  let max = lastWakeAt ? Date.parse(lastWakeAt) : 0;
  if (Number.isNaN(max)) max = 0;
  try {
    for (const e of new TranscriptStore(dir).read(agentId)) {
      if (e.type !== "incoming") continue;
      const t = Date.parse(e.ts);
      if (!Number.isNaN(t) && t > max) max = t;
    }
  } catch {
    /* transcript 损坏视为无活动记录 */
  }
  return max;
}

/**
 * 会话是否 in-flight（R3-C1）：转录末条为 outgoing 且其后无 incoming →
 * 长回合进行中（agent 投喂后尚未响应），不进入候选（不叠投）。
 */
function isRoundInFlight(dir: string, agentId: string): boolean {
  try {
    const entries = new TranscriptStore(dir).read(agentId);
    return entries.length > 0 && entries[entries.length - 1].type === "outgoing";
  } catch {
    /* transcript 损坏视为无活动记录 */
    return false;
  }
}

/**
 * 纯函数：派生当前可续跑候选（C1-b/c/d 验收主体）。
 * 读 session/transcript/task，无网络、无写入——同输入同输出。
 *
 * 候选条件（全部满足，followup/steer 档）：
 *   1. awake 且 pi_session_id 为 oc-（opencode 会话）
 *   2. 无 error（出错会话由 serve 恢复路径处理，不叠投）
 *   3. 任务未终态（有 task 文件且 status ∈ TERMINAL_TASK_STATUSES 的跳过）
 *   4. 续跑预算未耗尽（D078：task 绑定会话 < max_per_session；平台席 <
 *      max_per_session_platform，0 = 不限）
 *   5. 平台席（无 task 绑定会话）默认 skip（platform_seats="allow" 才进候选）
 *   6. 无 in-flight 长回合（末条 outgoing 无响应 → 不投喂）
 *   7. 空闲超过 idle_sec（最近回合完成在 now - idle_sec 之前，idle 时钟=响应时间）
 *
 * I1（chunk-settle-feed）kind 档（S 变体，D3 决策）：
 *   - "followup"（默认）：上述 1-7 全量门闩（现状续跑投喂）。
 *   - "steer"：增量 next-step 引导，wake 门闩沿用 idle/in-flight 判定
 *     （isRoundInFlight / lastRoundCompletedMs），busy 不插队——与 followup
 *     同一门闩。
 *   - "inject"：状态通知不唤醒——仍从 awake oc- 会话起步（不触发状态迁移）；
 *     只过 in-flight 门闩（busy 不插队）、不过 idle 门闩（状态通知即时投递）；
 *     不计续跑预算（非续跑，预算门不适用）。
 */
export function deriveContinuationTargets(
  dir: string,
  config: PicodeConfig,
  now: Date = new Date(),
  opts: FeedOptions = {},
): ContinuationTarget[] {
  const cont = config.self_evolve.continuation;
  const kind = opts.kind ?? "followup";
  const targets: ContinuationTarget[] = [];
  for (const s of new SessionStore(dir).awake()) {
    if (!s.pi_session_id?.startsWith("oc-")) continue;
    if (s.error) continue;
    if (kind === "inject") {
      // D3: inject 只过 in-flight 门闩（busy 不插队），不过 idle 门闩、不计预算。
      if (isRoundInFlight(dir, s.agent_id)) continue;
      const sessionId = opencodeSessionIdOf(s.pi_session_id);
      if (!sessionId) continue;
      targets.push({ agent_id: s.agent_id, session_id: s.pi_session_id });
      continue;
    }
    // D078: 预算门按 taskId 分流——task 绑定会话用 max_per_session，
    // 平台席（无 task 绑定）用 max_per_session_platform（0 = 不限保留）。
    const taskId = taskIdOfAgent(s.agent_id);
    const cap = taskId ? cont.max_per_session : cont.max_per_session_platform;
    if (cap > 0 && (s.budget?.continuations ?? 0) >= cap) {
      continue;
    }
    if (taskId) {
      const status = readTaskStatus(dir, taskId);
      if (status && TERMINAL_TASK_STATUSES.has(status)) continue;
    } else if (cont.platform_seats === "skip") {
      continue;
    }
    if (isRoundInFlight(dir, s.agent_id)) continue;
    const idleMs = now.getTime() - lastRoundCompletedMs(dir, s.agent_id, s.last_wake_at);
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
 *
 * I1（chunk-settle-feed）FeedOptions 档（S 变体，D3 决策）：
 *   - "followup"（默认）：现状续跑投喂（行为与 C1 完全一致）。
 *   - "steer"：增量 next-step 引导——instruction 携带「上一步证据已回执，
 *     下一步是 X」式指令，消息 = 摘要段 + 引导段（不重灌固定模板）；仍计续跑一次。
 *   - "inject"：状态通知不唤醒——仍要求 awake（不触发状态迁移）；
 *     不计续跑预算（状态通知非续跑）。
 */
export async function feedContinuation(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  opts: FeedOptions = {},
): Promise<FeedResult | null> {
  const kind = opts.kind ?? "followup";
  const store = new SessionStore(dir);
  const session = store.get(agentId);
  if (!session?.pi_session_id || session.state !== "awake") return null;
  const sessionId = opencodeSessionIdOf(session.pi_session_id);
  if (!sessionId) return null;

  const env = buildPiEnv(dir, config, session);
  const transcript = new TranscriptStore(dir);
  const spawner = new OpencodeSpawner(config);
  const cont = config.self_evolve.continuation;
  const summary = transcript.historySummary(agentId, {
    maxEntries: cont.summary_entries,
    stripNoise: [...SUMMARY_STRIP_NOISE],
  });
  const message = spawner.buildReadyMessage(env, composeFeedPrompt(opts, summary));
  const res = await spawner.postMessage(sessionId, message, CONTINUATION_RETRY);
  await transcript.recordOutgoing(agentId, message.parts.map((p) => p.text).join("\n"));
  if (res.parts.length > 0) {
    await transcript.recordResponse(agentId, res.parts);
  }
  // D3: inject 不计续跑预算（状态通知非续跑，避免噪声耗尽 D078 预算）；
  // followup/steer 维持 budget.continuations +1（N3 持久化）。
  const updated = kind === "inject" ? session : await store.recordContinuation(agentId);
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
/** @deprecated 仅供测试 — 生产路径为 sweepContinuationsGated（门控版）。 */
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
