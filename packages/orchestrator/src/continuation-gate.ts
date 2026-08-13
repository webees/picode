import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { withFileLock, type ContinuationConfig, type PicodeConfig } from "@picode/core";
import { deriveContinuationTargets, feedContinuation } from "./continuation.js";

/**
 * R3-C2 (chunk-continuation-gate): 续跑投喂前的可选验证 gate（防重复重跑）。
 *
 * 默认关闭（`self_evolve.continuation.gate_commands` 空 → 行为与 C1 完全一致）。
 * 启用时，guardian 在 checkBudgets 之后、续跑 sweep 之前对每个候选跑 gate：
 *
 *  - `captureGitWorktreeSnapshot`：git status --porcelain + diff HEAD + untracked
 *    聚合 → 工作树指纹（prime-agent `captureGitWorktreeSnapshot` 同构）。
 *  - `shouldRunGate`：上次失败快照与当前一致 → 不重跑 gate（防没改代码反复重跑）。
 *  - `runContinuationGate`：有界超时跑 `gate_commands`；通过 → 该会话本轮不投喂
 *    （停靠语义，`gate_passed` 同 Q1）；失败 → 不投喂但保留候选（下轮可重试）。
 *
 * 纯文件真相：失败快照按 agent 持久化在 run 目录 continuation-gate.jsonl。
 * 不引入 LLM 决策、不引入 daemon；gate 关闭时零行为差异（回归 C1）。
 */

/** 单条 gate 命令的有界超时（ms）；超时视为 gate 失败。 */
export const CONTINUATION_GATE_TIMEOUT_MS = 60_000;

/** 续跑 gate 的失败快照记录（jsonl 一行一条，按 agent 最新为准）。 */
export interface ContinuationGateRecord {
  schema_version: "1";
  type: "continuation_gate_failure";
  agent_id: string;
  /** 工作树快照指纹（sha256）；用于「上次失败快照 == 当前快照」比对。 */
  snapshot_fingerprint: string;
  failed_at: string;
}

/** 读取 continuation.gate_commands（C1 声明字段；本地类型未含时按缺省空处理）。 */
export function gateCommandsOf(config: PicodeConfig): string[] {
  const cont = config.self_evolve.continuation as ContinuationConfig & { gate_commands?: string[] };
  return cont.gate_commands ?? [];
}

/** 从 run 目录向上解析 git 仓库根；非 git 仓库返回 null。 */
export function repoRootOf(dir: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * 工作树快照：`git status --porcelain` + `git diff HEAD` + untracked 内容 sha256
 * 聚合。非 git 仓库 / git 失败 → null（无法比对快照）。
 */
export function captureGitWorktreeSnapshot(cwd: string): string | null {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
    // 无 HEAD（全新仓库未提交）时 diff HEAD 失败 → 视为空 diff，快照仍有效。
    let diff = "";
    try {
      diff = execFileSync("git", ["diff", "HEAD"], { cwd, encoding: "utf8" });
    } catch {
      diff = "";
    }
    const untrackedHash = untrackedDigest(cwd, status);
    return `${status}${untrackedHash ? `\n--untracked--\n${untrackedHash}` : ""}\n--diff--\n${diff}`;
  } catch {
    return null;
  }
}

/** 对 status --porcelain 中 `?? ` 开头的 untracked 文件内容做 sha256 聚合。 */
function untrackedDigest(cwd: string, status: string): string {
  const hash = crypto.createHash("sha256");
  const paths = status
    .split("\n")
    .filter((l) => l.startsWith("?? "))
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
  for (const p of paths) {
    const full = path.join(cwd, p);
    try {
      if (fs.statSync(full).isFile()) {
        hash.update(p);
        hash.update(fs.readFileSync(full));
      } else {
        hash.update(`dir:${p}`);
      }
    } catch {
      hash.update(`missing:${p}`);
    }
  }
  return hash.digest("hex");
}

/** sha256 指纹；用于持久化与比对（快照字符串可能含大 diff）。 */
export function snapshotFingerprint(snapshot: string): string {
  return crypto.createHash("sha256").update(snapshot).digest("hex");
}

/**
 * 是否重跑 gate：
 *  - gate 未启用（commands 空）→ false
 *  - 快照不可得（null）→ true（保守跑一次）
 *  - 上次失败快照指纹 === 当前指纹 → false（快照未变，不重跑；防重复重跑）
 *  - 否则 → true
 */
export function shouldRunGate(
  gateCommands: string[],
  lastFailedFingerprint: string | null,
  currentSnapshot: string | null,
): boolean {
  if (gateCommands.length === 0) return false;
  if (currentSnapshot === null) return true;
  if (lastFailedFingerprint !== null && lastFailedFingerprint === snapshotFingerprint(currentSnapshot)) {
    return false;
  }
  return true;
}

/** 一次 gate 运行结果。 */
export interface GateRunResult {
  /** 本轮是否实际执行了 gate 命令（快照未变跳过 → false）。 */
  ran: boolean;
  /** gate 命令全部通过 → true；失败 / 超时 / 快照未变跳过 → false。 */
  passed: boolean;
  /** 本轮快照（可能为 null = 非 git 仓库无法比对）。 */
  snapshot: string | null;
  /** 跳过原因：disabled / snapshot_unchanged / gate_failed / gate_passed。 */
  reason: "disabled" | "snapshot_unchanged" | "gate_failed" | "gate_passed";
  /** 各命令 stdout 截断拼接，供观测。 */
  output: string;
}

/**
 * 对单个 agent 跑续跑 gate：
 *  - gate 未启用 → ran=false（放行投喂，行为同 C1）
 *  - 快照未变（上次失败指纹 === 当前）→ ran=false、passed=false（本轮不投喂）
 *  - 执行 gate_commands（有界超时）：全过 → passed=true（停靠，不投喂）；
 *    任一失败/超时 → 持久化失败快照指纹（下轮比对）
 */
export async function runContinuationGate(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  opts: { timeoutMs?: number } = {},
): Promise<GateRunResult> {
  const commands = gateCommandsOf(config);
  if (commands.length === 0) {
    return { ran: false, passed: false, snapshot: null, reason: "disabled", output: "" };
  }

  const root = repoRootOf(dir);
  const snapshot = captureGitWorktreeSnapshot(root ?? dir);
  const store = new ContinuationGateStore(dir);
  const lastFailed = store.lastFailed(agentId);

  if (snapshot !== null && lastFailed !== null && lastFailed === snapshotFingerprint(snapshot)) {
    return { ran: false, passed: false, snapshot, reason: "snapshot_unchanged", output: "" };
  }

  const timeoutMs = opts.timeoutMs ?? CONTINUATION_GATE_TIMEOUT_MS;
  const outputs: string[] = [];
  for (const cmd of commands) {
    try {
      const res = spawnSync(cmd, { shell: true, cwd: root ?? dir, timeout: timeoutMs, encoding: "utf8" });
      if (res.stdout) outputs.push(res.stdout);
      if (res.status !== 0 || res.error) {
        await store.recordFailure(agentId, snapshot);
        return {
          ran: true,
          passed: false,
          snapshot,
          reason: "gate_failed",
          output: outputs.join("\n"),
        };
      }
    } catch {
      await store.recordFailure(agentId, snapshot);
      return { ran: true, passed: false, snapshot, reason: "gate_failed", output: outputs.join("\n") };
    }
  }
  await store.clear(agentId);
  return { ran: true, passed: true, snapshot, reason: "gate_passed", output: outputs.join("\n") };
}

/**
 * 续跑 sweep 的 gate 化版本（guardianTick 接线入口）：
 * checkBudgets 之后、续跑 sweep 之前对每个候选跑 gate；gate 启用时
 * 「gate 通过 → 本轮不投喂（停靠）」，「gate 失败 / 快照未变 → 本轮不投喂但保留候选」。
 * gate 关闭（默认）→ 行为与 sweepContinuations 完全一致（回归 C1）。
 */
export async function sweepContinuationsGated(
  dir: string,
  config: PicodeConfig,
  now: Date = new Date(),
): Promise<{
  fed: string[];
  gate: Array<{ agent_id: string; reason: GateRunResult["reason"]; ran: boolean; passed: boolean }>;
}> {
  const targets = deriveContinuationTargets(dir, config, now);
  const fed: string[] = [];
  const gate: Array<{ agent_id: string; reason: GateRunResult["reason"]; ran: boolean; passed: boolean }> = [];
  for (const t of targets) {
    const r = await runContinuationGate(dir, config, t.agent_id);
    gate.push({ agent_id: t.agent_id, reason: r.reason, ran: r.ran, passed: r.passed });
    if (r.reason !== "disabled") {
      // gate 启用：通过/失败/快照未变 一律本轮不投喂（停靠或保留候选）
      continue;
    }
    try {
      const res = await feedContinuation(dir, config, t.agent_id);
      if (res) fed.push(res.agent_id);
    } catch {
      /* 单次投喂失败保持可重试，不阻断 sweep（同 sweepContinuations） */
    }
  }
  return { fed, gate };
}

/** 失败快照持久化（run 目录 continuation-gate.jsonl；每 agent 最新记录为准）。 */
export class ContinuationGateStore {
  constructor(private runDir: string) {}

  private path(): string {
    return path.join(this.runDir, "continuation-gate.jsonl");
  }

  private lockPath(): string {
    return path.join(this.runDir, ".continuation-gate.lock");
  }

  /** 取某 agent 最近一次失败快照指纹；无记录 → null。 */
  lastFailed(agentId: string): string | null {
    const p = this.path();
    if (!fs.existsSync(p)) return null;
    let found: string | null = null;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as Partial<ContinuationGateRecord>;
        if (rec.agent_id === agentId && rec.type === "continuation_gate_failure") {
          found = rec.snapshot_fingerprint ?? null;
        }
      } catch {
        /* 损坏行跳过 */
      }
    }
    return found;
  }

  /** 记录失败快照（追加）；snapshot 为 null 时不记录（无法比对，无意义）。 */
  async recordFailure(agentId: string, snapshot: string | null): Promise<void> {
    if (snapshot === null) return;
    const rec: ContinuationGateRecord = {
      schema_version: "1",
      type: "continuation_gate_failure",
      agent_id: agentId,
      snapshot_fingerprint: snapshotFingerprint(snapshot),
      failed_at: new Date().toISOString(),
    };
    await withFileLock(this.lockPath(), () => {
      fs.appendFileSync(this.path(), JSON.stringify(rec) + "\n", "utf8");
    });
  }

  /** 清空某 agent 的失败记录（gate 通过后调用）。 */
  async clear(agentId: string): Promise<void> {
    await withFileLock(this.lockPath(), () => {
      const p = this.path();
      if (!fs.existsSync(p)) return;
      const kept = fs
        .readFileSync(p, "utf8")
        .split("\n")
        .filter((l) => {
          if (!l.trim()) return false;
          try {
            return (JSON.parse(l) as { agent_id?: string }).agent_id !== agentId;
          } catch {
            return true;
          }
        });
      fs.writeFileSync(p, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
    });
  }
}
