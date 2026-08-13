import fs from "node:fs";
import path from "node:path";
import { ErrorCode, PicodeError, type PicodeConfig } from "@picode/core";
import { readGoal } from "./run-store.js";
import { SessionStore } from "./session-store.js";

/**
 * C2 session-audit: 跨 run 会话残留审计 + 清理（product acceptance:
 *   - 提供会话残留检查/清理手段（CLI 可审计跨 run 残留）
 *   - max_awake 不再被已完成 run 的残留会话占满
 *
 * `deriveAuditReport` 纯派生（只读）：逐 run 读 goal.status + SessionStore.list()，
 * 输出 run_id/goal_status/awake[]/terminal，并汇总跨 run 残留 vs max_awake。
 * `cleanResidual` 执行器：对终态 run 的残留会话调 C1 `closeRun` 原语（best-effort，
 * 单 run 失败不阻断整体）。
 *
 * 数据源为 `runsRoot`（config.paths.runs_root 解析后的绝对路径，见 @picode/core
 * runsRoot()），与 dashboard-server 的 listRuns 口径一致：run 目录含 goal.yaml 才计入。
 */

/** goal 终态：completed/cancelled 之后 run 不再需要任何 awake 会话（C1 同判据）。 */
export const TERMINAL_GOAL_STATUSES: readonly string[] = ["completed", "cancelled"] as const;

export function isTerminalGoal(status: string): boolean {
  return TERMINAL_GOAL_STATUSES.includes(status);
}

/** 单 run 的审计行。 */
export interface AuditRunRow {
  run_id: string;
  goal_status: string;
  /** goal 是否终态（completed/cancelled）。 */
  terminal: boolean;
  /** 当前 awake 的 agent 列表（SessionStore.awake()）。 */
  awake: string[];
  /** 终态 run 仍残留 awake 会话（需要清理）。 */
  residual: boolean;
}

/** 跨 run 汇总 vs max_awake。 */
export interface AuditSummary {
  runs_total: number;
  runs_terminal: number;
  /** 存在残留（终态 + awake 非空）的 run 数。 */
  runs_residual: number;
  /** 全部 run 的 awake 会话总数。 */
  awake_total: number;
  /** 终态 run 中的 awake 会话总数（残留）。 */
  residual_awake: number;
  max_awake: number;
  /** residual_awake >= max_awake：残留会话已占满 max_awake 预算。 */
  max_awake_exhausted: boolean;
}

export interface AuditReport {
  runs: AuditRunRow[];
  summary: AuditSummary;
}

/** C1 run-close 原语契约（self-drive.ts closeRun，C1 合并后接通）。 */
export interface CloseRunResult {
  dissolved: string[];
  slept_platform: string[];
}

export type CloseRunFn = (dir: string, config: PicodeConfig) => Promise<CloseRunResult>;

/**
 * 惰性加载 C1 `closeRun` 原语（read 面先行：C1 未合并时本模块仍可审计）。
 * 动态 import 让「接通」在 C1 合并后自动发生，无需改本文件。
 */
async function loadCloseRun(): Promise<CloseRunFn> {
  const mod = (await import("./self-drive.js")) as { closeRun?: CloseRunFn };
  if (typeof mod.closeRun !== "function") {
    throw new PicodeError(
      ErrorCode.NOT_FOUND,
      "closeRun 未接通：chunk-run-close（C1）尚未合并，--clean 暂不可用；先合并 C1 或只用审计（--run 过滤）",
    );
  }
  return mod.closeRun;
}

/** 列 runsRoot 下所有含 goal.yaml 的 run 目录 id（与 dashboard listRuns 同口径）。 */
export function listRunIds(runsRoot: string): string[] {
  if (!fs.existsSync(runsRoot)) return [];
  return fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((id) => fs.existsSync(path.join(runsRoot, id, "goal.yaml")))
    .sort();
}

/** 单 run 审计行派生（纯读）。 */
export function auditRun(runDir: string): AuditRunRow {
  const run_id = path.basename(runDir);
  const goal = readGoal(runDir);
  const awake = new SessionStore(runDir)
    .awake()
    .map((s) => s.agent_id);
  const terminal = isTerminalGoal(goal.status);
  return { run_id, goal_status: goal.status, terminal, awake, residual: terminal && awake.length > 0 };
}

/** 过滤 run 列表：--run <id> 指定单个 run（不存在 → 空）。 */
function filterRunIds(runsRoot: string, runId?: string): string[] {
  const ids = listRunIds(runsRoot);
  if (!runId) return ids;
  return ids.filter((id) => id === runId);
}

/**
 * C2 纯派生：跨 run 会话残留审计报告（只读零写）。
 * 逐 run 读 goal.status + SessionStore.list()，汇总 vs config.sess_mgr.max_awake。
 * `runId` 可选：只看指定 run（--run 过滤）。
 */
export function deriveAuditReport(
  runsRoot: string,
  config: PicodeConfig,
  opts: { runId?: string } = {},
): AuditReport {
  const runs = filterRunIds(runsRoot, opts.runId).map((id) => auditRun(path.join(runsRoot, id)));
  const max_awake = config.sess_mgr.max_awake;
  const residualAwake = runs.reduce((n, r) => n + (r.residual ? r.awake.length : 0), 0);
  return {
    runs,
    summary: {
      runs_total: runs.length,
      runs_terminal: runs.filter((r) => r.terminal).length,
      runs_residual: runs.filter((r) => r.residual).length,
      awake_total: runs.reduce((n, r) => n + r.awake.length, 0),
      residual_awake: residualAwake,
      max_awake,
      max_awake_exhausted: residualAwake >= max_awake,
    },
  };
}

export interface CleanResidualRun {
  run_id: string;
  dissolved: string[];
  slept_platform: string[];
}

export interface CleanResidualResult {
  /** 已执行 closeRun 的 run。 */
  cleaned: CleanResidualRun[];
  /** 跳过（非终态/无残留）或失败的 run 及原因。 */
  skipped: Array<{ run_id: string; reason: string }>;
  /** C1 closeRun 是否已接通（--clean 前置依赖）。 */
  close_run_connected: boolean;
}

/**
 * C2 执行器：对终态 run 的残留会话调 C1 `closeRun` 原语。
 * best-effort：单 run 失败仅记入 skipped，不阻断其余 run 清理。
 * `closeRun` 可注入（测试）；默认动态加载 self-drive.ts 的 C1 原语。
 */
export async function cleanResidual(
  runsRoot: string,
  config: PicodeConfig,
  opts: { closeRun?: CloseRunFn; runId?: string } = {},
): Promise<CleanResidualResult> {
  const report = deriveAuditReport(runsRoot, config, { runId: opts.runId });
  const residualRuns = report.runs.filter((r) => r.residual);
  if (residualRuns.length === 0) {
    return { cleaned: [], skipped: [], close_run_connected: opts.closeRun !== undefined };
  }

  let closeRun: CloseRunFn;
  try {
    closeRun = opts.closeRun ?? (await loadCloseRun());
  } catch (e) {
    return {
      cleaned: [],
      skipped: residualRuns.map((r) => ({ run_id: r.run_id, reason: String(e instanceof Error ? e.message : e) })),
      close_run_connected: false,
    };
  }

  const cleaned: CleanResidualRun[] = [];
  const skipped: Array<{ run_id: string; reason: string }> = [];
  for (const r of residualRuns) {
    try {
      const res = await closeRun(path.join(runsRoot, r.run_id), config);
      cleaned.push({ run_id: r.run_id, ...res });
    } catch (e) {
      skipped.push({
        run_id: r.run_id,
        reason: `closeRun failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  for (const r of report.runs.filter((x) => !x.residual)) {
    skipped.push({ run_id: r.run_id, reason: r.terminal ? "no-residual" : "not-terminal" });
  }
  return { cleaned, skipped, close_run_connected: true };
}
