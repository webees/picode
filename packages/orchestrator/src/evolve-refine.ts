import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { branchName, ensureDir, readYamlFile, writeAtomic, type PicodeConfig } from "@picode/core";
import { readEvidence, type EvidenceState } from "./closure.js";

/**
 * E6 auto-refine (19 §5 / P3, run-lead 决策): distill lesson drafts from a
 * run's task evidence — tasks/<id>/task.yaml, tasks/<id>/evidence/evidence.yaml
 * and git log — then append them to docs/knowledge/evolve/<run_id>.md under a
 * "## Lessons（auto-refine 草稿）" section.
 *
 * Approval gate (default `--require-approval`): without `--approve` the drafts
 * are returned but never written; with `--approve` they land in the file.
 * Rule-based and deterministic — no LLM, so tests can pin exact behaviour.
 */

export interface LessonDraft {
  task_id: string;
  status: string;
  /** evidence 结论: pass / fail / missing（无 evidence.yaml） */
  evidence: "pass" | "fail" | "missing";
  commands: string[];
  commits: string[];
  write_paths: string[];
  /** 提炼出的 lesson 文本（P07 证据链语义）。 */
  lesson: string;
}

const LESSONS_HEADING = "## Lessons（auto-refine 草稿）";

/** Deterministic evidence → lesson distillation (P07/T07 semantics). */
export function distillLesson(taskId: string, ev: EvidenceState | null): string {
  if (!ev) {
    return `反例：${taskId} 无 evidence——无证据 MUST NOT 进入 handoff/dissolve 成功路径（T07）`;
  }
  const cmds = ev.commands.map((c) => `${c.cmd} (exit=${c.exit_code})`).join("、");
  if (ev.result === "fail") {
    return `反例：${taskId} 验证失败（evidence fail）：${cmds || "无命令"}——需修复后重提证据（P07）`;
  }
  return `正例：${taskId} 证据链闭合（evidence pass）：${cmds || "无命令"}——验证命令 + log_ref 配套可复用（P07）`;
}

/** Commits on the task branch (base..branch); absent branch/range ⇒ none. */
function gitLogForTask(
  repoRoot: string,
  config: PicodeConfig,
  runId: string,
  taskId: string,
): string[] {
  try {
    const branch = branchName(config, runId, taskId);
    const out = execFileSync(
      "git",
      ["log", `--format=%h %s`, `${config.git.base_branch}..${branch}`],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.split("\n").filter(Boolean).slice(0, 10);
  } catch {
    return [];
  }
}

/** Distill lesson drafts from every task under <run>/tasks. */
export function extractLessons(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
): LessonDraft[] {
  const tasksDir = path.join(dir, "tasks");
  if (!fs.existsSync(tasksDir)) return [];
  const runId = path.basename(dir);
  const lessons: LessonDraft[] = [];
  for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const taskId = entry.name;
    const tpath = path.join(tasksDir, taskId, "task.yaml");
    if (!fs.existsSync(tpath)) continue;
    const task = readYamlFile<{ id: string; status: string; write_paths?: string[] }>(tpath);
    if (!task) continue;
    const ev = readEvidence(dir, taskId);
    lessons.push({
      task_id: taskId,
      status: task.status,
      evidence: ev ? ev.result : "missing",
      commands: ev ? ev.commands.map((c) => c.cmd) : [],
      commits: gitLogForTask(repoRoot, config, runId, taskId),
      write_paths: task.write_paths ?? [],
      lesson: distillLesson(taskId, ev),
    });
  }
  return lessons.sort((a, b) => a.task_id.localeCompare(b.task_id));
}

/** Render the "## Lessons（auto-refine 草稿）" markdown section. */
export function renderLessonsSection(lessons: LessonDraft[]): string {
  const lines = [
    LESSONS_HEADING,
    "",
    "> 自动提炼自 tasks/<id>/task.yaml、evidence.yaml、git log；`--approve` 前仅草稿。",
    "",
  ];
  if (lessons.length === 0) {
    lines.push("（无任务证据）", "");
    return lines.join("\n");
  }
  for (const l of lessons) {
    lines.push(`### ${l.task_id}`, "");
    lines.push(`- status: ${l.status}`);
    lines.push(`- evidence: ${l.evidence}`);
    if (l.commands.length) lines.push(`- commands: ${l.commands.join("、")}`);
    if (l.commits.length) lines.push(`- commits: ${l.commits.join(", ")}`);
    lines.push(`- write_paths: ${l.write_paths.join(", ")}`);
    lines.push("");
    lines.push(l.lesson, "");
  }
  return lines.join("\n");
}

/** Replace (or append) the auto-refine Lessons section in the file. */
export function upsertLessonsSection(md: string, section: string): string {
  const idx = md.indexOf(LESSONS_HEADING);
  if (idx === -1) {
    return md.replace(/\s+$/, "") + "\n\n" + section;
  }
  return md.slice(0, idx).replace(/\s+$/, "") + "\n\n" + section;
}

/** Append/upsert lessons into docs/knowledge/evolve/<run_id>.md; returns path. */
export function appendLessonsToEvolveLog(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  lessons: LessonDraft[],
): string {
  const runId = path.basename(dir);
  const outDir = path.join(repoRoot, config.paths.knowledge_root, "evolve");
  ensureDir(outDir);
  const out = path.join(outDir, `${runId}.md`);
  const section = renderLessonsSection(lessons);
  let md: string;
  if (fs.existsSync(out)) {
    md = fs.readFileSync(out, "utf8");
  } else {
    md = `# Evolve ${runId}\n\n`;
  }
  writeAtomic(out, upsertLessonsSection(md, section));
  return out;
}

/**
 * E6 auto-refine entry: extract lessons and enforce the approval gate.
 * `--approve` (approve=true) writes into the file; otherwise drafts only.
 */
export function refineEvolveKnowledge(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  opts: { approve: boolean },
): { lessons: LessonDraft[]; approved: boolean; written: string | null } {
  const lessons = extractLessons(repoRoot, dir, config);
  if (!opts.approve) {
    return { lessons, approved: false, written: null };
  }
  const written = appendLessonsToEvolveLog(repoRoot, dir, config, lessons);
  return { lessons, approved: true, written };
}
