import fs from "node:fs";
import path from "node:path";
import { ensureDir, readYamlFile, writeAtomic, writeYamlFile, type PicodeConfig } from "@picode/core";
import { RoomStore } from "@picode/bus";

/**
 * Memory & change management (18 phase G / U10 U11):
 * - change_order: runs/<id>/change_orders/<co_id>.yaml, proposed → applied → closed
 * - draft park: brief draft → parked (draft_idle_policy)
 * - knowledge ingest: task decisions summarized into <repo>/<knowledge_root>/<task_id>.md
 */

export interface ChangeOrder {
  id: string;
  task_id: string;
  summary: string;
  status: "proposed" | "applied" | "closed";
  by: string;
  ts: string;
  applied_at: string | null;
  closed_at: string | null;
}

function coDir(dir: string): string {
  return path.join(dir, "change_orders");
}

function coPath(dir: string, id: string): string {
  return path.join(coDir(dir), `${id}.yaml`);
}

export function readChangeOrders(dir: string): ChangeOrder[] {
  const d = coDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readYamlFile<ChangeOrder>(path.join(d, f))!)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

/** run-lead issues a change order; notifies leadership via bus (type change_order). */
export async function createChangeOrder(
  dir: string,
  taskId: string,
  summary: string,
  by: string,
): Promise<ChangeOrder> {
  const co: ChangeOrder = {
    id: `co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    task_id: taskId,
    summary,
    status: "proposed",
    by,
    ts: new Date().toISOString(),
    applied_at: null,
    closed_at: null,
  };
  ensureDir(coDir(dir));
  writeYamlFile(coPath(dir, co.id), co);
  const bus = new RoomStore(dir);
  await bus.post("leadership", by, {
    type: "change_order",
    body: summary,
    refs: [path.join("change_orders", `${co.id}.yaml`)],
    meta: { co_id: co.id, task_id: taskId },
  });
  return co;
}

/** change_order 状态机：proposed → applied → closed（禁止跳级/回退）。 */
const CHANGE_ORDER_TRANSITIONS: Record<ChangeOrder["status"], readonly ChangeOrder["status"][]> = {
  proposed: ["applied"],  // 必须先 applied 再 closed（禁直跳）
  applied: ["closed"],
  closed: [],
};

export function transitionChangeOrder(dir: string, id: string, to: "applied" | "closed"): ChangeOrder {
  const p = coPath(dir, id);
  if (!fs.existsSync(p)) throw new Error(`change order not found: ${id}`);
  const co = readYamlFile<ChangeOrder>(p)!;
  // 幂等：重复设置同一状态（CLI 重放）直接返回，不重复追加 task 记录
  if (co.status === to) return co;
  // 迁移校验（P1）：proposed→closed 直跳、closed 再动均拒绝
  if (!CHANGE_ORDER_TRANSITIONS[co.status].includes(to)) {
    throw new Error(`change order transition not allowed: ${co.status} → ${to}`);
  }
  co.status = to;
  if (to === "applied") {
    co.applied_at = new Date().toISOString();
    // DoD (18 phase G): the change updates the in-flight task — record it on
    // task.yaml so the squad sees the new requirement without losing work.
    const tp = path.join(dir, "tasks", co.task_id, "task.yaml");
    if (fs.existsSync(tp)) {
      const task = readYamlFile<{ change_orders?: Array<{ co_id: string; summary: string; applied_at: string }> }>(tp)!;
      const list = task.change_orders ?? [];
      // 幂等（P1）：同一 co 重复 apply 不重复追加
      if (!list.some((c) => c.co_id === co.id)) {
        list.push({ co_id: co.id, summary: co.summary, applied_at: co.applied_at });
        task.change_orders = list;
        writeYamlFile(tp, task);
      }
    }
  } else {
    co.closed_at = new Date().toISOString();
  }
  writeYamlFile(p, co);
  return co;
}

/** Park an unapproved work brief draft (draft_idle_policy: park). */
export function parkDraft(dir: string, taskId: string): { status: string; parked_at: string } {
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) throw new Error(`brief not found: ${taskId}`);
  const brief = readYamlFile<Record<string, unknown>>(p)!;
  if (brief.status === "approved") throw new Error(`brief already approved: ${taskId}`);
  const parked = { status: "parked", parked_at: new Date().toISOString() };
  writeYamlFile(p, { ...brief, ...parked });
  return parked;
}

/** Summarize a task's decisions into docs/knowledge/<task_id>.md (L2 knowledge ingest). */
export function ingestTaskKnowledge(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
): string {
  const tpath = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(tpath)) throw new Error(`task not found: ${taskId}`);
  const task = readYamlFile<{
    id: string;
    chunk_id?: string;
    status: string;
    write_paths?: string[];
    acceptance?: Array<{ id: string; type: string; spec: string }>;
  }>(tpath)!;
  const acc = (task.acceptance ?? []).map((a) => `- [${a.type}] ${a.spec}`).join("\n");
  const md =
    `# Knowledge — ${taskId}\n\n` +
    `> L2 knowledge ingest (18 phase G). Source: task.yaml + evidence.\n\n` +
    `- status: ${task.status}\n` +
    `- chunk: ${task.chunk_id ?? ""}\n` +
    `- write_paths: ${(task.write_paths ?? []).join(", ")}\n\n` +
    `## Acceptance\n\n${acc || "- (none)"}\n`;
  const out = path.join(repoRoot, config.paths.knowledge_root, `${taskId}.md`);
  ensureDir(path.dirname(out));
  writeAtomic(out, md);
  return out;
}
