import fs from "node:fs";
import path from "node:path";
import { readYamlFile, type PicodeConfig } from "@picode/core";
import { SESSION_EVENTS } from "@picode/core";
import { applyEvent } from "./rules-engine.js";

/**
 * Progress state per task (18 phase F): tasks/<id>/progress.json.
 * No daemon: a sweep triggered from CLI/status checks staleness and fires
 * the `progress_due` rule (wake squad-lead).
 */
export interface ProgressState {
  task_id: string;
  phase: string;
  blocked: boolean;
  summary: string;
  updated_at: string;
}

export function progressPath(dir: string, taskId: string): string {
  return path.join(dir, "tasks", taskId, "progress.json");
}

export function readProgress(dir: string, taskId: string): ProgressState | null {
  const p = progressPath(dir, taskId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ProgressState;
  } catch (e) {
    // core 约定：损坏状态文件绝不静默当缺失 — 否则 sweep 会把损坏误判为
    // 超时并错误唤醒 squad-lead（P1）
    throw new Error(`progress file corrupt (${p}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

function listTaskIds(dir: string): string[] {
  const tasksDir = path.join(dir, "tasks");
  if (!fs.existsSync(tasksDir)) return [];
  return fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(tasksDir, d.name, "task.yaml")))
    .map((d) => d.name);
}

export interface SweepResult {
  checked: number;
  overdue: Array<{ task_id: string; stale_sec: number }>;
  woke: string[];
}

/**
 * Sweep all tasks: those without a fresh progress report beyond
 * `timeouts.task_timeout_sec` fire `progress_due` (wake squad-lead, idempotent).
 */
export async function sweepProgress(dir: string, config: PicodeConfig): Promise<SweepResult> {
  const timeoutSec = config.timeouts.task_timeout_sec;
  const now = Date.now();
  const res: SweepResult = { checked: 0, overdue: [], woke: [] };
  for (const taskId of listTaskIds(dir)) {
    res.checked += 1;
    const p = readProgress(dir, taskId);
    let staleSec = Number.POSITIVE_INFINITY;
    if (p) {
      staleSec = (now - Date.parse(p.updated_at)) / 1000;
    }
    if (staleSec > timeoutSec) {
      res.overdue.push({ task_id: taskId, stale_sec: Math.round(staleSec) });
      const ev = await applyEvent(dir, config, SESSION_EVENTS.PROGRESS_DUE, { taskId });
      for (const a of ev.actions) {
        if (a.outcome === "ok" || a.outcome === "skipped") res.woke.push(a.agent_id);
      }
    }
  }
  return res;
}

/** Read a task's triad seat list (squad agents) for status output. */
export function readTaskMeta(dir: string, taskId: string): {
  status?: string;
  chunk_id?: string;
} {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  return readYamlFile<{ status?: string; chunk_id?: string }>(p) ?? {};
}
