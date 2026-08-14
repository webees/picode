import fs from "node:fs";
import path from "node:path";
import type { PicodeConfig } from "@picode/core";
import { statusSnapshot, type StatusSnapshot } from "./status.js";
import { SessionStore } from "./session-store.js";
import { fetchLiveTokens } from "./live.js";

/**
 * supervise 观测（D093）：监控/守护正式化。纯读、无 daemon（D037 不变量延续）。
 * `deriveSuperviseObservation` 派生单次观测（statusSnapshot + 每 awake 会话
 * serve tokens + worktree `.ts` 文件数）；`isIdleStopped` 纯函数判定
 * STOPPED（全体 token 连续 N 轮零增长）。沿用 supervise.mjs 观测口径：
 * POLL_FAIL 不计入 total、不参与空闲判定（轮询失败非空闲信号）。
 */

export interface SuperviseAgent {
  agent_id: string;
  state: string;
  /** 最近 serve 样本 tokens；非 awake / POLL_FAIL → null。 */
  tokens: number | null;
}

export interface SuperviseObservation {
  ts: string;
  run_id: string;
  goal_status: string;
  agents: SuperviseAgent[];
  /** 全体 awake 会话 tokens 汇总（POLL_FAIL 不计入）。 */
  total: number;
  /** worktree 下 `.ts` 文件数。 */
  worktrees: number;
  tasks: StatusSnapshot["tasks"];
  merge_queue: StatusSnapshot["merge_queue"];
}

export interface DeriveSuperviseOpts {
  /** 时钟注入（单测确定性 ts）。 */
  now?: () => Date;
  /** fetch 注入（单测 mock serve）。 */
  fetchImpl?: typeof fetch;
  /** serve 请求有界超时 ms（缺省沿用 live.ts 5s）。 */
  timeoutMs?: number;
}

/** 由 run 目录反推 repo root（runs_root 相对路径下）→ worktree root。 */
function worktreesRootOf(dir: string, config: PicodeConfig): string {
  const runsRoot = path.dirname(dir);
  const up = config.paths.runs_root.split("/").filter(Boolean).length;
  let repoRoot = runsRoot;
  for (let i = 0; i < up; i++) repoRoot = path.dirname(repoRoot);
  return path.resolve(repoRoot, config.git.worktree_root, path.basename(dir));
}

/** worktree 下 `.ts` 文件数（递归；目录不存在 → 0）。 */
export function worktreeCount(dir: string, config: PicodeConfig): number {
  const root = worktreesRootOf(dir, config);
  if (!fs.existsSync(root)) return 0;
  let n = 0;
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".ts")) n++;
    }
  };
  walk(root);
  return n;
}

/**
 * 派生一次监督观测（D093-2）。纯读：statusSnapshot + 每 awake 会话
 * fetchLiveTokens + worktree `.ts` 计数。POLL_FAIL 会话 tokens=null 且
 * 不计入 total。
 */
export async function deriveSuperviseObservation(
  dir: string,
  config: PicodeConfig,
  opts: DeriveSuperviseOpts = {},
): Promise<SuperviseObservation> {
  const snapshot = statusSnapshot(dir, config);
  const baseUrl = config.opencode.base_url;
  const agents: SuperviseAgent[] = [];
  let total = 0;
  for (const s of new SessionStore(dir).list()) {
    if (s.state !== "awake") {
      agents.push({ agent_id: s.agent_id, state: s.state, tokens: null });
      continue;
    }
    const res = await fetchLiveTokens({
      baseUrl,
      runDir: dir,
      agentId: s.agent_id,
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl,
    });
    agents.push({
      agent_id: s.agent_id,
      state: s.state,
      tokens: res.ok ? res.tokens!.total : null,
    });
    if (res.ok) total += res.tokens!.total;
  }
  agents.sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  return {
    ts: (opts.now?.() ?? new Date()).toISOString(),
    run_id: snapshot.run_id,
    goal_status: snapshot.goal.status,
    agents,
    total,
    worktrees: worktreeCount(dir, config),
    tasks: snapshot.tasks,
    merge_queue: snapshot.merge_queue,
  };
}

export interface IdleStoppedOptions {
  /** 连续零增长轮数（D093-4：3 轮 = 15 分钟 @ 5min 间隔）。 */
  rounds?: number;
  /** 窗口内允许的累计增长容差（0 = 严格零增长）。 */
  thresholdRounds?: number;
}

/**
 * STOPPED 空闲判定（D093-4 纯函数）：取最近 `rounds+1` 条观测，total 在窗口内
 * 零增长（容差 `thresholdRounds`）→ true。语义对齐 supervise.mjs：
 * - `rounds` 条连续零增长区间需 `rounds+1` 条等值样本；
 * - total=0（无会话成功采样 / 全部 POLL_FAIL）不判空闲——轮询失败与空观测
 *   非空闲信号，需 operator 介入而非自动 STOPPED。
 */
export function isIdleStopped(
  observations: ReadonlyArray<{ total: number }>,
  opts: IdleStoppedOptions = {},
): boolean {
  const { rounds = 3, thresholdRounds = 0 } = opts;
  const window = observations.slice(-(rounds + 1));
  if (window.length < rounds + 1) return false;
  const target = window[0].total;
  if (target <= 0) return false;
  return window.every((o) => o.total >= target && o.total - target <= thresholdRounds);
}
