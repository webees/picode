import fs from "node:fs";
import path from "node:path";
import { readYamlFile, type PicodeConfig } from "@picode/core";
import { readGoal } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { TranscriptStore } from "./transcript-store.js";
import { taskIdOfAgent } from "./continuation.js";
import { readMergeQueue } from "./merge.js";
import { readProgress } from "./progress.js";
import { listCheckpointTasks } from "./checkpoint-store.js";

/**
 * Run status snapshot (18 phase H / U12): `picode status --run <id>`.
 * Pure read — no writes, no daemon.
 */
export interface StatusSnapshot {
  run_id: string;
  goal: {
    status: string;
    scale: string;
    product_acceptance: number;
    acceptance: number;
  };
  sessions: {
    total: number;
    awake: string[];
    sleeping: number;
    terminated: number;
    errored: string[];
  };
  rooms: Array<{ room: string; messages: number }>;
  tasks: Array<{
    task_id: string;
    status: string;
    brief: string;
    staffing: string;
    progress_phase: string | null;
  }>;
  merge_queue: { queued: number; merged: number; failed: number };
  /**
   * R3-C3 continuation telemetry (D069): 续跑面只读观测。每会话暴露
   * 续跑计数 / 上次投喂时间 / in-flight（投喂后未响应）/ 平台席标记。
   */
  continuation: ContinuationTelemetry;
  /**
   * C1 (D082 观测面三面同源): 每任务最新 checkpoint 概要段。statusSnapshot /
   * `checkpoint status` / MCP `checkpoint_status` 共用同一派生
   * （checkpointOverview），口径一致；纯读零写。无 checkpoint → []。
   */
  checkpoint: CheckpointTaskOverview[];
}

/**
 * R3-C3: 单会话续跑遥测（纯读）。`last_continuation_at` = 最近一条
 * outgoing（投喂）转录 ts；`in_flight` = 末条转录为 outgoing 且其后无
 * incoming（回合进行中）。`platform_seat` = 会话未绑定任务（平台席）。
 */
export interface ContinuationSessionTelemetry {
  agent_id: string;
  state: string;
  /** 累计自动续跑投喂次数（session.budget.continuations，持久化）。 */
  continuations_used: number;
  /**
   * 该会话适用续跑上限（D078 差异化预算：task 绑定会话 →
   * self_evolve.continuation.max_per_session，平台席 →
   * max_per_session_platform，0=不限）。
   */
  max_per_session: number;
  /** 上次投喂时间（最近 outgoing 转录 ts）；无转录 → null。 */
  last_continuation_at: string | null;
  /** 投喂后尚无 incoming 响应（进行中回合）。 */
  in_flight: boolean;
  /** 平台席（未绑定 task）默认不进续跑候选（R3-C1 platform_seats=skip）。 */
  platform_seat: boolean;
}

/** R3-C3: status/CLI/MCP 三面一致的续跑观测段（纯读零写）。 */
export interface ContinuationTelemetry {
  /** 每会话续跑上限（task 绑定会话，配置值，0=不限）。 */
  max_per_session: number;
  /** 平台席（无 task 绑定会话）独立续跑上限（D078，配置值，0=不限）。 */
  max_per_session_platform: number;
  /** 空闲触发间隔（秒，配置值）。 */
  idle_sec: number;
  sessions: ContinuationSessionTelemetry[];
}

/**
 * C1 (D082 三面同源): 每任务最新 checkpoint 概要。字段全部取自最新 checkpoint
 * 文件（listCheckpointTasks → latest），latest_at = captured_at、boundary、sha256。
 */
export interface CheckpointTaskOverview {
  task_id: string;
  /** 该 task 已捕获 checkpoint 数量（listCheckpointTasks count）。 */
  count: number;
  /** 最新 checkpoint 捕获时间（ISO）；无 → null。 */
  latest_at: string | null;
  /** 最新 checkpoint 捕获边界（manual/guardian/pre_merge）；无 → null。 */
  boundary: string | null;
  /** 最新 checkpoint 自指纹 sha256；无 → null。 */
  sha256: string | null;
}

function briefStatus(dir: string, taskId: string): string {
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) return "missing";
  const b = readYamlFile<{ status?: string }>(p)!;
  return b.status ?? "missing";
}

function staffingStatus(dir: string, taskId: string): string {
  const p = path.join(dir, "tasks", taskId, "staffing", "staffing.yaml");
  if (!fs.existsSync(p)) return "missing";
  const s = readYamlFile<{ status?: string }>(p)!;
  return s.status ?? "missing";
}

/** R3-C3: 单会话续跑遥测派生（纯读转录 + session.budget，无写无网络）。 */
function sessionContinuationTelemetry(
  dir: string,
  agentId: string,
  state: string,
  budget: { continuations?: number } | undefined,
  maxPerSession: number,
): ContinuationSessionTelemetry {
  let lastContinuationAt: string | null = null;
  let inFlight = false;
  try {
    const entries = new TranscriptStore(dir).read(agentId);
    if (entries.length > 0) {
      // 末条为 outgoing 且其后无 incoming → 投喂后未响应（进行中回合）。
      inFlight = entries[entries.length - 1].type === "outgoing";
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === "outgoing") {
          lastContinuationAt = entries[i].ts;
          break;
        }
      }
    }
  } catch {
    /* 转录损坏视为无遥测 */
  }
  return {
    agent_id: agentId,
    state,
    continuations_used: budget?.continuations ?? 0,
    max_per_session: maxPerSession,
    last_continuation_at: lastContinuationAt,
    in_flight: inFlight,
    platform_seat: taskIdOfAgent(agentId) === null,
  };
}

/**
 * R3-C3: 续跑观测段（D069）。statusSnapshot / `continuation --status` /
 * MCP `continuation_status` 三面共用同一派生，保证口径一致；纯读零写。
 */
export function continuationTelemetry(dir: string, config: PicodeConfig): ContinuationTelemetry {
  const cont = config.self_evolve.continuation;
  const sessions = new SessionStore(dir)
    .list()
    .map((s) => {
      // D078: 该会话适用 cap——task 绑定用 max_per_session，平台席用
      // max_per_session_platform（遥测反映实际预算，便于定位平台席预算耗尽）。
      const cap =
        taskIdOfAgent(s.agent_id) === null ? cont.max_per_session_platform : cont.max_per_session;
      return sessionContinuationTelemetry(dir, s.agent_id, s.state, s.budget, cap);
    })
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  return {
    max_per_session: cont.max_per_session,
    max_per_session_platform: cont.max_per_session_platform,
    idle_sec: cont.idle_sec,
    sessions,
  };
}

/**
 * C1 (D082 三面同源): 每任务最新 checkpoint 概要段。statusSnapshot /
 * `checkpoint status` / MCP `checkpoint_status` 三面共用同一派生，保证口径一致。
 * 纯读零写（listCheckpointTasks 只读，不读 checkpoint 驱动任何状态决策）。
 */
export function checkpointOverview(dir: string): CheckpointTaskOverview[] {
  return listCheckpointTasks(dir).map((t) => ({
    task_id: t.task_id,
    count: t.count,
    latest_at: t.latest?.captured_at ?? null,
    boundary: t.latest?.boundary ?? null,
    sha256: t.latest?.sha256 ?? null,
  }));
}

export function statusSnapshot(dir: string, config: PicodeConfig): StatusSnapshot {
  const goal = readGoal(dir);
  const sessions = new SessionStore(dir);
  const list = sessions.list();
  const awake = list.filter((s) => s.state === "awake").map((s) => s.agent_id);
  const errored = list.filter((s) => s.error).map((s) => s.agent_id);

  const rooms: Array<{ room: string; messages: number }> = [];
  const busDir = path.join(dir, "bus");
  if (fs.existsSync(busDir)) {
    for (const f of fs.readdirSync(busDir).filter((x) => x.endsWith(".jsonl"))) {
      const room = f.replace(/\.jsonl$/, "");
      const n = fs.readFileSync(path.join(busDir, f), "utf8").trim().split("\n").filter(Boolean).length;
      rooms.push({ room, messages: n });
    }
    rooms.sort((a, b) => b.messages - a.messages);
  }

  const tasksDir = path.join(dir, "tasks");
  const tasks: StatusSnapshot["tasks"] = [];
  if (fs.existsSync(tasksDir)) {
    for (const entry of fs.readdirSync(tasksDir)) {
      const tpath = path.join(tasksDir, entry, "task.yaml");
      if (!fs.existsSync(tpath)) continue;
      const t = readYamlFile<{ id: string; status: string }>(tpath)!;
      const prog = readProgress(dir, t.id);
      tasks.push({
        task_id: t.id,
        status: t.status,
        brief: briefStatus(dir, t.id),
        staffing: staffingStatus(dir, t.id),
        progress_phase: prog?.phase ?? null,
      });
    }
    tasks.sort((a, b) => a.task_id.localeCompare(b.task_id));
  }

  const queue = readMergeQueue(dir);
  return {
    run_id: path.basename(dir),
    goal: {
      status: goal.status,
      scale: goal.scale,
      product_acceptance: goal.product_acceptance.length,
      acceptance: goal.acceptance.length,
    },
    sessions: {
      total: list.length,
      awake,
      sleeping: list.filter((s) => s.state === "sleeping").length,
      terminated: list.filter((s) => s.state === "terminated").length,
      errored,
    },
    rooms,
    tasks,
    merge_queue: {
      queued: queue.filter((q) => q.status === "queued").length,
      merged: queue.filter((q) => q.status === "merged").length,
      failed: queue.filter((q) => q.status === "failed").length,
    },
    continuation: continuationTelemetry(dir, config),
    checkpoint: checkpointOverview(dir),
  };
}
