import fs from "node:fs";
import path from "node:path";

import { execFileSync } from "node:child_process";

import { RoomStore } from "@picode/bus";
import { ensureDir, readYamlFile, writeYamlFile, type PicodeConfig, type SessionRecord } from "@picode/core";

import { SessionStore } from "./session-store.js";
import { composeSteerPrompt } from "./continuation.js";

/**
 * session-watchdog.ts —— 零产出看门狗（R17 M1 · D119）
 *
 * 按 agent 追踪最近产出信号（工作房 git 提交 / 工作房文件 mtime / 转录 incoming），
 * 纯规则、零 LLM 决策：
 *   - 无产出 2 轮 → at_risk + steer 投喂（composeSteerPrompt，I1 档）
 *   - 再 2 轮（累计 4 轮）→ bus 通知 run-lead + takeover_candidate 标记
 *   - 会话 error 前缀 TOOL_ENV_BROKEN:/WORKTREE_MISSING:（env-gate M2/M4 契约）
 *     → 立即 at_risk（跳过 2 轮等待）
 *   - 产出信号恢复 → silent_rounds 归零、at_risk 解除
 *   - 幂等：状态落盘 watchdog.yaml，动作仅状态跃迁时发出（不重复投喂）
 *   - 终态会话（terminated）跳过
 *
 * 设计约束（R16 教训）：不解析 commit subject（曾致 2 次误报）——产出信号只看
 * 「提交数/文件 mtime 是否有增量」，不读消息内容。
 */

/* --------------------------------- 状态 --------------------------------- */

export interface WatchdogState {
  agent_id: string;
  silent_rounds: number;
  at_risk: boolean;
  takeover_candidate: boolean;
  last_action: "steer" | "notify_takeover" | null;
  last_action_at: string | null;
}

export interface OutputSignal {
  has_output: boolean;
  detail: string;
}

export type WatchdogAction = "none" | "steer" | "notify_takeover";

export interface WatchdogVerdict {
  state: WatchdogState;
  action: WatchdogAction;
  reason: string;
}

/** 看门狗状态文件（run 目录内，幂等/跨 tick 持久）。 */
export function watchdogStateFile(dir: string): string {
  return path.join(dir, "watchdog.yaml");
}

export function loadWatchdogStates(dir: string): Map<string, WatchdogState> {
  const f = watchdogStateFile(dir);
  if (!fs.existsSync(f)) return new Map();
  const data = readYamlFile<{ agents: Array<{ agent: WatchdogState }> }>(f);
  const map = new Map<string, WatchdogState>();
  for (const { agent } of data?.agents ?? []) map.set(agent.agent_id, agent);
  return map;
}

export function saveWatchdogStates(dir: string, states: Map<string, WatchdogState>): void {
  ensureDir(dir);
  const agents = [...states.values()].map((agent) => ({ agent }));
  writeYamlFile(watchdogStateFile(dir), { agents });
}

/* ------------------------------ 纯判定规则 ------------------------------ */

export interface WatchdogEvalOpts {
  /** 会话 error 原文（无则 null）——TOOL_ENV_BROKEN:/WORKTREE_MISSING: 前缀立即 at_risk */
  error?: string | null;
  /** 会话是否终态（terminated 等）——终态跳过 */
  terminal?: boolean;
}

const RISK_PREFIXES = ["TOOL_ENV_BROKEN:", "WORKTREE_MISSING:"];

/** 判定升级（纯函数，可单测）：prev + 本轮信号 → 下一状态与动作。 */
export function evaluateWatchdog(
  prev: WatchdogState | null,
  signal: OutputSignal,
  opts: WatchdogEvalOpts = {},
): WatchdogVerdict {
  if (opts.terminal) {
    return {
      state: prev ?? { agent_id: "?", silent_rounds: 0, at_risk: false, takeover_candidate: false, last_action: null, last_action_at: null },
      action: "none",
      reason: "终态会话跳过",
    };
  }
  const errorPrefix = opts.error ? RISK_PREFIXES.find((p) => opts.error!.startsWith(p)) : null;
  const base: WatchdogState = prev ?? {
    agent_id: "?",
    silent_rounds: 0,
    at_risk: false,
    takeover_candidate: false,
    last_action: null,
    last_action_at: null,
  };
  let next = { ...base };

  if (errorPrefix) {
    // 环境故障：立即 at_risk（跳过 2 轮等待）
    next.silent_rounds = Math.max(next.silent_rounds, 2);
    next.at_risk = true;
    if (next.takeover_candidate) {
      return { state: next, action: "none", reason: `环境故障（${errorPrefix}）且已接管候选` };
    }
    return { state: next, action: "steer", reason: `环境故障 ${errorPrefix} → 立即 at_risk + steer（M2/M4 契约）` };
  }

  if (signal.has_output) {
    if (next.silent_rounds === 0 && !next.at_risk) {
      return { state: next, action: "none", reason: "有产出，保持正常" };
    }
    const recovered = { ...next, silent_rounds: 0, at_risk: false, takeover_candidate: false, last_action: null, last_action_at: null };
    return { state: recovered, action: "none", reason: `产出恢复（${signal.detail}）→ 归零解除` };
  }

  next.silent_rounds += 1;
  if (next.silent_rounds >= 4 && !next.takeover_candidate) {
    next.takeover_candidate = true;
    return { state: next, action: "notify_takeover", reason: `无产出 ${next.silent_rounds} 轮 → 接管候选通知 run-lead` };
  }
  if (next.silent_rounds >= 2 && !next.at_risk) {
    next.at_risk = true;
    return { state: next, action: "steer", reason: `无产出 ${next.silent_rounds} 轮 → at_risk + steer 投喂` };
  }
  return { state: next, action: "none", reason: `无产出 ${next.silent_rounds}/2 轮` };
}

/* ------------------------------ 产出信号检测 ------------------------------ */

/** 工作房路径（R17 P1 canonical：顶层 squad-<taskId>）。 */
export function squadWorktreeOf(repoRoot: string, config: PicodeConfig, taskId: string): string {
  return path.join(repoRoot, config.git.worktree_root, `squad-${taskId}`);
}

/**
 * 产出信号：工作房 git 提交增量（rev-list 计数，不解析 subject）或最新文件 mtime 增量。
 * 纯依赖注入友好：detector 工厂可替换为测试桩。
 */
export function detectOutputSignal(
  repoRoot: string,
  config: PicodeConfig,
  agentId: string,
  base: string | null,
): OutputSignal {
  const m = /@task-(.+)$/.exec(agentId);
  if (!m) {
    return { has_output: false, detail: "平台席无工作房（看门狗只跟踪 task 会话）" };
  }
  const taskId = `task-${m[1]}`;
  const wt = squadWorktreeOf(repoRoot, config, taskId);
  if (!fs.existsSync(wt)) {
    // 工作房不存在 = M4 门闩场景；无产出但理由明确
    return { has_output: false, detail: `工作房不存在：${wt}` };
  }
  try {
    const count = Number(
      execFileSync("git", ["-C", wt, "rev-list", "--count", `${base ?? "HEAD~1"}..HEAD`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
    if (Number.isFinite(count) && count > 0) {
      return { has_output: true, detail: `工作房分支新增 ${count} 提交` };
    }
  } catch {
    /* base 解析失败（如首轮）→ 落到 mtime 判定 */
  }
  // 文件 mtime 增量：工作房最新 mtime > 分支基线 mtime（粗略但无 subject 依赖）
  let newest = 0;
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === "dist") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  try {
    walk(wt);
  } catch {
    return { has_output: false, detail: "工作房不可读" };
  }
  if (newest === 0) return { has_output: false, detail: "工作房无文件" };
  const headMtime = fs.existsSync(path.join(wt, ".git"))
    ? fs.statSync(path.join(wt, ".git")).mtimeMs
    : 0;
  return {
    has_output: newest > headMtime,
    detail: newest > headMtime ? "工作房文件有新写入" : "工作房文件无新写入",
  };
}

/* ------------------------------ 动作执行 ------------------------------ */

export interface WatchdogRunResult {
  at_risk: string[];
  takeover_candidates: string[];
  steers: string[];
  notified: string[];
}

/**
 * 一轮看门狗检查（guardian tick 内调用）：
 * 遍历会话 → 信号检测 → 判定升级 → 执行动作（steer 投喂 / bus 通知 run-lead）→ 状态落盘。
 * 幂等：动作仅跃迁时执行；同轮重复调用不重复投喂。
 */
export async function runWatchdogCheck(
  dir: string,
  repoRoot: string,
  config: PicodeConfig,
): Promise<WatchdogRunResult> {
  const store = new SessionStore(dir);
  const states = loadWatchdogStates(dir);
  const bus = new RoomStore(dir);
  const result: WatchdogRunResult = { at_risk: [], takeover_candidates: [], steers: [], notified: [] };

  const sessions: SessionRecord[] = store.list();
  for (const s of sessions) {
    const prev = states.get(s.agent_id);
    const signal = detectOutputSignal(repoRoot, config, s.agent_id, null);
    const verdict = evaluateWatchdog(prev ?? null, signal, {
      error: s.error,
      terminal: s.state === "terminated",
    });
    const next = { ...verdict.state, agent_id: s.agent_id };
    states.set(s.agent_id, next);

    if (verdict.action === "none") continue;
    const now = new Date().toISOString();
    if (next.at_risk && !result.at_risk.includes(s.agent_id)) result.at_risk.push(s.agent_id);
    if (next.takeover_candidate && !result.takeover_candidates.includes(s.agent_id))
      result.takeover_candidates.push(s.agent_id);

    if (verdict.action === "steer") {
      // 幂等：同 agent 同轮只投一次（last_action=steer 且刚投过 → 跳过；状态已跃迁则投）
      if (prev?.last_action === "steer" && next.silent_rounds === prev.silent_rounds) continue;
      const guidance = `看门狗：会话 ${s.agent_id} 已 ${next.silent_rounds} 轮无产出。请立即给出增量汇报（做了什么/WIP 路径/阻塞），若工具故障请明确上报错误原文。`;
      const body = composeSteerPrompt(null, guidance);
      try {
        await bus.post("leadership", "watchdog", { type: "alert", body, refs: [] });
        next.last_action = "steer";
        next.last_action_at = now;
        result.steers.push(s.agent_id);
      } catch (e) {
        // 投递失败不致命：状态已记 at_risk，下轮可重试
        result.at_risk.push(s.agent_id);
      }
    } else if (verdict.action === "notify_takeover") {
      if (prev?.takeover_candidate) continue;
      const body = `看门狗：会话 ${s.agent_id} 已 ${next.silent_rounds} 轮无产出（超过接管阈值）。建议 run-lead 三查核验（progress 增量 / git status+log / sdet evidence）后接管。`;
      try {
        await bus.post("leadership", "watchdog", { type: "alert", body, refs: [] });
        next.last_action = "notify_takeover";
        next.last_action_at = now;
        result.notified.push(s.agent_id);
      } catch {
        /* 同上 */
      }
    }
  }
  saveWatchdogStates(dir, states);
  return result;
}
