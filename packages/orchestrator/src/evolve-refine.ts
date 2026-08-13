import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { branchName, ensureDir, readYamlFile, writeAtomic, type PicodeConfig } from "@picode/core";
import type { AutoRefineGateConfig } from "@picode/core";
import { readEvidence, type EvidenceState } from "./closure.js";

/**
 * E6 auto-refine (19 §5 / P3, run-lead 决策): distill lesson drafts from a
 * run's task evidence — tasks/<id>/task.yaml, tasks/<id>/evidence/evidence.yaml
 * and git log — then append them to docs/knowledge/evolve/<run_id>.md under a
 * "## Lessons（auto-refine 草稿）" section.
 *
 * Approval gate (default `--require-approval`): without `--approve` the drafts
 * are returned but never written; with `--approve` they land in the file.
 *
 * C1 auto-refine review gate (Q2 / refinement.ts): every lesson draft is
 * reviewed by a rule-based gate BEFORE it may be distilled — evidence must
 * actually contain evidence (exit_code / log_ref / changed files), otherwise
 * noise and empty trajectories are rejected. Configurable via
 * `self_evolve.refine_gate` (mode: heuristic | none). `--auto` skips the manual
 * `--approve` and lands only the approved lessons per the review result.
 * Rule-based and deterministic — no LLM, so tests can pin exact behaviour.
 */

export interface LessonReview {
  decision: "approved" | "rejected";
  reason: string;
}

export const DEFAULT_REFINE_GATE: AutoRefineGateConfig = {
  mode: "heuristic",
  require_evidence: true,
  reject_noise: true,
};

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
  /** C1 auto-refine gate 评审结果（approved/rejected + reason）。 */
  review: LessonReview;
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

/**
 * C1 heuristic review (Q2): the trajectory counts as useful evidence when it
 * contains exit_code / log_ref / changed files (commits). Empty trajectories
 * (no evidence.yaml) and noise (evidence with no commands, no log_ref, no
 * commits) are rejected so one-off noise never becomes a lesson.
 */
export function reviewLesson(
  commits: string[],
  ev: EvidenceState | null,
  gate: AutoRefineGateConfig,
): LessonReview {
  if (gate.mode === "none") {
    return { decision: "approved", reason: "gate mode=none：评审门关闭，全部放行" };
  }
  const hasExec = ev !== null && ev.commands.length > 0;
  const hasLog = ev !== null && ev.commands.some((c) => Boolean(c.log_ref));
  const hasChanges = commits.length > 0;
  if (!hasExec && !hasLog && !hasChanges) {
    // 无任何证据信号: 空轨迹（无 evidence.yaml）由 require_evidence 把关，
    // 噪音（有 evidence 但无命令/log_ref/变更文件）由 reject_noise 把关。
    if (!ev) {
      return gate.require_evidence
        ? { decision: "rejected", reason: "空轨迹：无 evidence.yaml、无变更文件——无证据 MUST NOT 提炼（T07）" }
        : { decision: "approved", reason: "gate.require_evidence=false：空轨迹放行" };
    }
    return gate.reject_noise
      ? { decision: "rejected", reason: "噪音轨迹：无命令、无 log_ref、无变更文件——拒绝提炼" }
      : { decision: "approved", reason: "gate.reject_noise=false：噪音轨迹放行" };
  }
  const parts: string[] = [];
  if (hasExec) parts.push(`${ev!.commands.length} 条命令 exit_code 已记录`);
  if (hasLog) parts.push("log_ref 验证物");
  if (hasChanges) parts.push(`${commits.length} 个 commit（变更文件）`);
  return { decision: "approved", reason: `证据充分：${parts.join(" + ")}` };
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
  gate: AutoRefineGateConfig = DEFAULT_REFINE_GATE,
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
    const commits = gitLogForTask(repoRoot, config, runId, taskId);
    lessons.push({
      task_id: taskId,
      status: task.status,
      evidence: ev ? ev.result : "missing",
      commands: ev ? ev.commands.map((c) => c.cmd) : [],
      commits,
      write_paths: task.write_paths ?? [],
      lesson: distillLesson(taskId, ev),
      review: reviewLesson(commits, ev, gate),
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
    lines.push(`- review: ${l.review.decision}（${l.review.reason}）`);
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
 * E6 auto-refine entry: extract lessons, run the C1 auto-refine review gate,
 * and enforce the approval gate.
 *
 *   - `--approve` (approve=true): manual approval writes every draft into the
 *     file (human judgment overrides the rule-based gate).
 *   - `--auto` (auto=true): skip the manual `--approve`; land ONLY the lessons
 *     the review gate approved, rejected noise/empty trajectories stay out.
 *   - neither: drafts only, nothing written.
 *
 * `--auto` and `--approve` together is a usage error (mutually exclusive).
 */
export interface RefineEvolveOptions {
  approve?: boolean;
  auto?: boolean;
}

export interface RefineResult {
  lessons: LessonDraft[];
  /** 是否落盘: --approve，或 --auto 且至少一条 approved。 */
  approved: boolean;
  /** 落盘文件路径（未落盘为 null）。 */
  written: string | null;
  /** 生效的评审门配置。 */
  gate: AutoRefineGateConfig;
  /** --auto 是否开启。 */
  auto: boolean;
}

export function refineEvolveKnowledge(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  opts: RefineEvolveOptions = {},
): RefineResult {
  const gate: AutoRefineGateConfig = config.self_evolve.refine_gate ?? DEFAULT_REFINE_GATE;
  const lessons = extractLessons(repoRoot, dir, config, gate);
  const auto = opts.auto === true;
  if (auto) {
    const approvedLessons = lessons.filter((l) => l.review.decision === "approved");
    if (approvedLessons.length === 0) {
      return { lessons, approved: false, written: null, gate, auto };
    }
    const written = appendLessonsToEvolveLog(repoRoot, dir, config, approvedLessons);
    return { lessons, approved: true, written, gate, auto };
  }
  if (!opts.approve) {
    return { lessons, approved: false, written: null, gate, auto };
  }
  const written = appendLessonsToEvolveLog(repoRoot, dir, config, lessons);
  return { lessons, approved: true, written, gate, auto };
}
