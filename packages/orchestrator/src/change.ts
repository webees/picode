import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ensureDir, writeAtomic, type PicodeConfig } from "@picode/core";
import { applyEvent } from "./rules-engine.js";

/**
 * change_order (18 phase G / 10-bus-messages): run-lead issues requirement
 * changes that can update in-flight tasks. Applying records the change on the
 * task and wakes its squad-lead via the `change_applied` rule.
 */
export interface ChangeOrder {
  schema_version: "1";
  id: string;
  goal_id: string;
  status: "draft" | "applied" | "rejected";
  summary: string;
  affects_chunks: string[];
  affects_tasks: string[];
  new_acceptance: string[];
  cancelled_tasks: string[];
  created_by: string;
  created_at: string;
  applied_at: string | null;
  user_ack_at: string | null;
}

function coDir(dir: string): string {
  return path.join(dir, "change_orders");
}

export function createChangeOrder(
  dir: string,
  runId: string,
  opts: {
    summary: string;
    affects_tasks?: string[];
    new_acceptance?: string[];
    cancelled_tasks?: string[];
    by?: string;
  },
): ChangeOrder {
  const id = `co-${Date.now()}`;
  const co: ChangeOrder = {
    schema_version: "1",
    id,
    goal_id: `goal-${runId}`,
    status: "draft",
    summary: opts.summary,
    affects_chunks: opts.affects_tasks ?? [],
    affects_tasks: opts.affects_tasks ?? [],
    new_acceptance: opts.new_acceptance ?? [],
    cancelled_tasks: opts.cancelled_tasks ?? [],
    created_by: opts.by ?? "run-lead",
    created_at: new Date().toISOString(),
    applied_at: null,
    user_ack_at: null,
  };
  ensureDir(coDir(dir));
  writeAtomic(path.join(coDir(dir), `${id}.yaml`), YAML.stringify(co));
  return co;
}

export function readChangeOrder(dir: string, id: string): ChangeOrder | null {
  const p = path.join(coDir(dir), `${id}.yaml`);
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as ChangeOrder;
}

/**
 * Apply a change order: record it on every affected task (updating in-flight
 * tasks is the DoD), then fire `change_applied` so the squad-lead wakes.
 */
export async function applyChangeOrder(
  dir: string,
  config: PicodeConfig,
  id: string,
  userAck = false,
): Promise<ChangeOrder> {
  const co = readChangeOrder(dir, id);
  if (!co) throw new Error(`change order not found: ${id}`);
  if (co.status === "applied") return co; // idempotent

  for (const taskId of co.affects_tasks) {
    const p = path.join(dir, "tasks", taskId, "task.yaml");
    if (!fs.existsSync(p)) continue;
    const task = YAML.parse(fs.readFileSync(p, "utf8")) as {
      change_orders?: Array<{ co_id: string; summary: string; applied_at: string }>;
    };
    const list = task.change_orders ?? [];
    list.push({ co_id: co.id, summary: co.summary, applied_at: new Date().toISOString() });
    task.change_orders = list;
    writeAtomic(p, YAML.stringify(task));
    await applyEvent(dir, config, "change_applied", { taskId });
  }

  const next: ChangeOrder = {
    ...co,
    status: "applied",
    applied_at: new Date().toISOString(),
    user_ack_at: userAck ? new Date().toISOString() : null,
  };
  writeAtomic(path.join(coDir(dir), `${id}.yaml`), YAML.stringify(next));
  return next;
}
