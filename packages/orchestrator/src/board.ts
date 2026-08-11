/**
 * Kanban view (run-lead 规划 P1 + 甲方需求): read-only projection of run state.
 *
 * 数据全部派生自现有状态文件（不新增状态）:
 *   - requests/intake/*.yaml          → Backlog（甲方待办需求卡）
 *   - chunks.yaml                     → 分块状态
 *   - tasks/<id>/task.yaml            → 卡片、triad（负责人）、brief/staffing 双门闩
 *   - sessions/<agent>.yaml           → 各席 awake/sleeping（"人在岗"）
 *   - tasks/<id>/progress.json        → 阶段、blocked
 *   - merge_queue.jsonl               → 合并状态（done 判定）
 *   - goal.yaml / run.yaml            → 板头
 */
import fs from "node:fs";
import path from "node:path";
import { readYamlFile } from "@picode/core";

export interface BoardCard {
  id: string;
  kind: "task" | "intake" | "chunk";
  title: string;
  column: BoardColumn;
  owner: string;
  blocked: boolean;
  detail: string;
}

export type BoardColumn =
  | "Backlog"
  | "分块"
  | "双门闩中"
  | "进行中"
  | "验证中"
  | "交接中"
  | "已完成";

export const BOARD_COLUMNS: BoardColumn[] = [
  "Backlog",
  "分块",
  "双门闩中",
  "进行中",
  "验证中",
  "交接中",
  "已完成",
];

interface TaskState {
  id: string;
  chunk_id: string;
  status: string;
  write_paths: string[];
  triad?: Record<string, string>;
}

/** Read the double-latch status for a task (brief.yaml + staffing.yaml). */
function latchStatus(dir: string, taskId: string): { brief: string; staffing: string } {
  const brief = readYamlFile<{ status?: string }>(
    path.join(dir, "tasks", taskId, "brief", "brief.yaml"),
  );
  const staffing = readYamlFile<{ status?: string }>(
    path.join(dir, "tasks", taskId, "staffing", "staffing.yaml"),
  );
  return { brief: brief?.status ?? "-", staffing: staffing?.status ?? "-" };
}

/** Build the board for a run dir. Pure derivation — no writes, no locks. */
export function buildBoard(dir: string): { run: string; cards: BoardCard[] } {
  const runYaml = readYamlFile<{ run_id?: string }>(path.join(dir, "run.yaml"));
  const run = runYaml?.run_id ?? path.basename(dir);

  const awake = new Set<string>();
  const sessionsDir = path.join(dir, "sessions");
  if (fs.existsSync(sessionsDir)) {
    for (const f of fs.readdirSync(sessionsDir)) {
      if (!f.endsWith(".yaml")) continue;
      const s = readYamlFile<{ state?: string }>(path.join(sessionsDir, f));
      if (s?.state === "awake") awake.add(f.replace(/\.yaml$/, ""));
    }
  }

  const mergedTasks = new Set<string>();
  const mqPath = path.join(dir, "merge_queue.jsonl");
  if (fs.existsSync(mqPath)) {
    for (const line of fs.readFileSync(mqPath, "utf8").split("\n").filter(Boolean)) {
      try {
        const m = JSON.parse(line) as { task_id?: string; status?: string };
        if (m.task_id && m.status === "merged") mergedTasks.add(m.task_id);
      } catch {
        /* skip malformed line */
      }
    }
  }

  const cards: BoardCard[] = [];

  // Backlog: intake requests not yet decided/started
  const intakeDir = path.join(dir, "requests", "intake");
  if (fs.existsSync(intakeDir)) {
    for (const f of fs.readdirSync(intakeDir).filter((x) => x.endsWith(".yaml"))) {
      const r = readYamlFile<{ id?: string; raw?: string; status?: string; decision?: string }>(
        path.join(intakeDir, f),
      );
      if (r && r.status !== "done") {
        cards.push({
          id: r.id ?? f,
          kind: "intake",
          title: (r.raw ?? f).slice(0, 60),
          column: "Backlog",
          owner: "甲方",
          blocked: false,
          detail: `decision: ${r.decision ?? "待决策"}`,
        });
      }
    }
  }

  // Chunks → tasks
  const chunksPath = path.join(dir, "chunks.yaml");
  const chunks = fs.existsSync(chunksPath)
    ? (readYamlFile<{ chunks: Array<{ id: string; write_paths: string[]; status?: string }> }>(
        chunksPath,
      )?.chunks ?? [])
    : [];

  const tasksDir = path.join(dir, "tasks");
  const taskIds = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter((d) => fs.existsSync(path.join(tasksDir, d, "task.yaml")))
    : [];

  for (const tid of taskIds) {
    const t = readYamlFile<TaskState>(path.join(tasksDir, tid, "task.yaml"));
    if (!t) continue;
    const triad = t.triad ? Object.values(t.triad) : [];
    const owners = triad.join(", ") || "待招聘";
    const latch = latchStatus(dir, tid);
    const briefOk = latch.brief === "approved";
    const staffOk = latch.staffing === "approved";

    // blocked: progress.json flagged
    const progress = readYamlFile<{ blocked?: boolean }>(
      path.join(tasksDir, tid, "progress.json"),
    );
    const blocked = progress?.blocked === true;

    let column: BoardColumn;
    if (mergedTasks.has(tid)) column = "已完成";
    else if (triad.length === 0) column = "分块";
    else if (!briefOk || !staffOk) column = "双门闩中";
    else if (awake.has(`squad-lead@${tid}`) || awake.has(`engineer@${tid}`)) column = "进行中";
    else column = "验证中";

    cards.push({
      id: tid,
      kind: "task",
      title: t.chunk_id ?? tid,
      column,
      owner: owners,
      blocked,
      detail: `brief:${latch.brief} staffing:${latch.staffing} | ${t.write_paths.join(" ")}`,
    });
  }

  // Chunks with no task yet → 分块
  const withTask = new Set(
    taskIds.map(
      (t) => readYamlFile<TaskState>(path.join(tasksDir, t, "task.yaml"))?.chunk_id ?? "",
    ),
  );
  for (const c of chunks) {
    if (!withTask.has(c.id)) {
      cards.push({
        id: c.id,
        kind: "chunk",
        title: c.id,
        column: "分块",
        owner: "-",
        blocked: false,
        detail: c.write_paths.join(" "),
      });
    }
  }

  cards.sort((a, b) => BOARD_COLUMNS.indexOf(a.column) - BOARD_COLUMNS.indexOf(b.column));
  return { run, cards };
}

/** Render the board as plain text (CLI 视图，界面后续按此数据层开发). */
export function renderBoard(board: { run: string; cards: BoardCard[] }): string {
  const lines: string[] = [];
  lines.push(`# Kanban — ${board.run}`);
  lines.push("");
  for (const col of BOARD_COLUMNS) {
    const cards = board.cards.filter((c) => c.column === col);
    lines.push(`## ${col} (${cards.length})`);
    for (const c of cards) {
      const flag = c.blocked ? " ⚠BLOCKED" : "";
      lines.push(`  - [${c.id}] ${c.title} | 负责人: ${c.owner}${flag}`);
      lines.push(`      ${c.detail}`);
    }
    if (cards.length === 0) lines.push("  (空)");
    lines.push("");
  }
  return lines.join("\n");
}
