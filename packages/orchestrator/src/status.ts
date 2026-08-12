import fs from "node:fs";
import path from "node:path";
import { readYamlFile, type PicodeConfig } from "@picode/core";
import { readGoal } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { readMergeQueue } from "./merge.js";
import { readProgress } from "./progress.js";

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

export function statusSnapshot(dir: string, config: PicodeConfig): StatusSnapshot {
  void config;
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
  };
}
