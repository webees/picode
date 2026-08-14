import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir, readYamlFile, writeYamlFile } from "@picode/core";
import {
  captureGitWorktreeSnapshot,
  repoRootOf,
  snapshotFingerprint,
} from "./continuation-gate.js";
import { CONTINUATION_PROMPT } from "./continuation.js";
import { READY_MESSAGE_TEXT } from "./opencode-adapter.js";
import { SessionStore } from "./session-store.js";
import { TranscriptStore } from "./transcript-store.js";

/**
 * Task 级会话 checkpoint（D082）。
 *
 * 边界决策：checkpoint 是捕获时刻对文件真相的**只读投影**，写入后不可变
 * （timestamped 单文件，append-only 目录）。**任何代码路径不得读 checkpoint
 * 来驱动状态决策**——恢复/续跑/调度/合并仍只读 session.yaml / task.yaml /
 * transcripts / git。checkpoint 只是观测/审计产物（best-effort），丢失或损坏
 * 不影响任何恢复路径。
 *
 * - `captureTaskCheckpoint`：纯派生（同输入同输出，now 注入保证确定性）+
 *   不可变落盘 `runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml`；task
 *   不存在 → null。
 * - `listTaskCheckpoints` / `latestTaskCheckpoint` / `listCheckpointTasks`：
 *   只读查询（ts 排序）。
 *
 * 无守护自动写：MVP 仅显式 CLI `picode checkpoint capture` 触发。
 */

export const CHECKPOINT_SCHEMA_VERSION = "1";

/** 捕获边界（D082-3 预留字段；本轮仅 manual）。 */
export const DEFAULT_CHECKPOINT_BOUNDARY = "manual";

/** historySummary 剔除的机械投喂模板噪音（口径同 D077 feed 路径）。 */
export const CHECKPOINT_NOISE: readonly string[] = [
  READY_MESSAGE_TEXT,
  CONTINUATION_PROMPT,
];

/** 单个三角会话的快照段（state + budget，均为文件真相的只读投影）。 */
export interface TaskCheckpointSession {
  agent_id: string;
  state: string;
  budget: { turns: number; continuations: number };
}

/** 单个三角会话的转录摘要段（best-effort；无转录/损坏 → summary null）。 */
export interface TaskCheckpointSummary {
  agent_id: string;
  summary: string | null;
}

/** TaskCheckpoint schema v1（D082-4 捕获内容）。 */
export interface TaskCheckpoint {
  schema_version: "1";
  task_id: string;
  captured_at: string;
  boundary: string;
  task_status: string | null;
  sessions: TaskCheckpointSession[];
  transcript_summaries: TaskCheckpointSummary[];
  git: { fingerprint: string | null };
  /** 自指纹：对排除 sha256 自身的其余字段做 sha256（不可变校验锚点）。 */
  sha256: string;
}

/**
 * 自指纹（纯函数）：对 checkpoint 内容（不含 sha256 字段）做 sha256。
 * 构造对象时字段顺序固定，JSON 序列化确定性 → 同输入同输出。
 */
export function checkpointDigest(cp: Omit<TaskCheckpoint, "sha256">): string {
  return crypto.createHash("sha256").update(JSON.stringify(cp)).digest("hex");
}

/** 从 task.yaml 的 triad 取三个座席 agent id（顺序固定：squad-lead/engineer/sdet）。 */
function triadSeatAgentIds(task: { triad?: Record<string, string> }): string[] {
  if (!task.triad) return [];
  return ["squad-lead", "engineer", "sdet"]
    .map((seat) => task.triad![seat])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * 纯派生 checkpoint（不落盘，无副作用）：task 不存在 → null。
 * 读 task.yaml + 三角会话（SessionStore）+ 各会话 historySummary（stripNoise）
 * + git 工作树指纹（复用 continuation-gate 原语；非 git 仓 → fingerprint null）。
 * 同输入（dir/taskId/now/boundary）同输出。
 */
export function deriveTaskCheckpoint(
  dir: string,
  taskId: string,
  opts: { now?: Date; boundary?: string } = {},
): TaskCheckpoint | null {
  const task = readYamlFile<{
    status?: string;
    triad?: Record<string, string>;
  }>(path.join(dir, "tasks", taskId, "task.yaml"));
  if (task === null) return null;

  const now = opts.now ?? new Date();
  const boundary = opts.boundary ?? DEFAULT_CHECKPOINT_BOUNDARY;

  const sessions: TaskCheckpointSession[] = [];
  const summaries: TaskCheckpointSummary[] = [];
  const sessionStore = new SessionStore(dir);
  const transcript = new TranscriptStore(dir);
  for (const agentId of triadSeatAgentIds(task)) {
    const s = sessionStore.get(agentId);
    if (s) {
      sessions.push({
        agent_id: s.agent_id,
        state: s.state,
        budget: {
          turns: s.budget?.turns ?? 0,
          continuations: s.budget?.continuations ?? 0,
        },
      });
    }
    // best-effort：转录缺失/损坏 → historySummary 内部回退 null，不阻断捕获。
    summaries.push({
      agent_id: agentId,
      summary: transcript.historySummary(agentId, { stripNoise: [...CHECKPOINT_NOISE] }),
    });
  }

  const root = repoRootOf(dir);
  const snapshot = captureGitWorktreeSnapshot(root ?? dir);
  const base = {
    schema_version: CHECKPOINT_SCHEMA_VERSION as "1",
    task_id: taskId,
    captured_at: now.toISOString(),
    boundary,
    task_status: task.status ?? null,
    sessions,
    transcript_summaries: summaries,
    git: { fingerprint: snapshot === null ? null : snapshotFingerprint(snapshot) },
  };
  return { ...base, sha256: checkpointDigest(base) };
}

/** checkpoint 文件名时间戳（ISO 去冒号/点，可安全作文件名且字典序 = 时间序）。 */
function tsFilenamePart(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/**
 * 捕获并不可变落盘 `checkpoints/<taskId>/checkpoint-<ts>.yaml`：
 * task 不存在 → null；ts 由 now 派生（注入相同 now + 未变文件 → 内容逐字节一致）。
 * 重复捕获产生新 ts 文件（不同 now），不覆盖既有文件（不可变）。
 */
export function captureTaskCheckpoint(
  dir: string,
  taskId: string,
  opts: { now?: Date; boundary?: string } = {},
): { file: string; checkpoint: TaskCheckpoint } | null {
  const checkpoint = deriveTaskCheckpoint(dir, taskId, opts);
  if (checkpoint === null) return null;
  const ts = tsFilenamePart(opts.now ?? new Date());
  const file = path.join(dir, "checkpoints", taskId, `checkpoint-${ts}.yaml`);
  ensureDir(path.dirname(file));
  writeYamlFile(file, checkpoint);
  return { file, checkpoint };
}

/** 某 task 的全部 checkpoint，按 ts 倒序（最新在前）；只读。 */
export function listTaskCheckpoints(dir: string, taskId: string): TaskCheckpoint[] {
  const d = path.join(dir, "checkpoints", taskId);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".yaml"))
    .sort((a, b) => b.localeCompare(a))
    .map((f) => readYamlFile<TaskCheckpoint>(path.join(d, f)))
    .filter((c): c is TaskCheckpoint => c !== null);
}

/** 某 task 的最新 checkpoint（list 首条）；无则 null。只读。 */
export function latestTaskCheckpoint(dir: string, taskId: string): TaskCheckpoint | null {
  return listTaskCheckpoints(dir, taskId)[0] ?? null;
}

/** 全部有 checkpoint 的 task 概览（count + 最新）；只读。 */
export function listCheckpointTasks(
  dir: string,
): Array<{ task_id: string; count: number; latest: TaskCheckpoint | null }> {
  const d = path.join(dir, "checkpoints");
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((taskId) => {
      const all = listTaskCheckpoints(dir, taskId);
      return { task_id: taskId, count: all.length, latest: all[0] ?? null };
    });
}
