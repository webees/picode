import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { assertSafeName, ensureDir, writeAtomic, type PicodeConfig } from "@picode/core";
import {
  HANDOFF_FILES,
  handoffDir,
  readAcceptance,
  readEvidence,
  type AcceptanceState,
  type EvidenceState,
} from "./closure.js";
import { parsePersonaFile, readStaffing, readStaffingRequest, type Seat } from "./staffing.js";
import { appendTalentRecords, gradeFor, type TalentRecord } from "./hr-talent.js";

/**
 * HR scoring (16-hr-cell §9 评分).
 *
 * After a task dissolves, the people cell scores the run: one score per
 * persona (codename) and one score for the triad (team name). Scores are
 * derived from objective file facts (evidence, handoff package, acceptance
 * ack, task status/retries) — no LLM involved — and written both to
 * `tasks/<id>/staffing/scores.yaml` and aggregated into the knowledge base
 * (`<knowledge_root>/hr/personas/<codename>.yaml` and
 * `<knowledge_root>/hr/teams/<team_name>.yaml`) so future runs can optimize
 * personas and team compositions (16 §7 pool_reuse / 19 self-evolution).
 *
 * Scale: 0–100, every score is base 50 plus explainable deltas.
 */

export interface ScoreBreakdown {
  base: number;
  evidence: number;
  status: number;
  handoff: number;
  ack: number;
  retries: number;
  seat: number;
}

export interface PersonaScore {
  seat: Seat;
  codename: string;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface TaskScores {
  schema_version: "1";
  task_id: string;
  team_name: string;
  scored_at: string;
  scored_by: string;
  note: string | null;
  team_score: number;
  team_breakdown: ScoreBreakdown;
  persona_scores: PersonaScore[];
}

export interface HrRecord {
  at: string;
  run_id: string;
  task_id: string;
  score: number;
  seat?: string;
  result: string;
  note?: string | null;
}

export interface HrArchive {
  kind: "persona" | "team";
  key: string;
  seat?: string;
  records: HrRecord[];
  summary: { count: number; avg: number; min: number; max: number };
  updated_at: string;
}

function scoresPath(dir: string, taskId: string): string {
  return path.join(dir, "tasks", taskId, "staffing", "scores.yaml");
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

interface ScoreCtx {
  evidence: EvidenceState | null;
  taskStatus: string;
  retries: number;
  missingHandoff: number;
  ackCount: number;
}

/**
 * Shared deltas (base 50):
 *   evidence: pass +30 / fail −30 / missing −20
 *   status:   dissolved +10 / failed −10 / cancelled −5
 *   handoff:  −5 per missing package file
 *   ack:      +5 when at least one handoff ack exists
 *   retries:  −5 per retry, capped at −10
 */
function computeSharedBreakdown(ctx: ScoreCtx): ScoreBreakdown {
  const evidence =
    ctx.evidence === null ? -20 : ctx.evidence.result === "pass" ? 30 : -30;
  const status =
    ctx.taskStatus === "dissolved" ? 10 : ctx.taskStatus === "failed" ? -10 : ctx.taskStatus === "cancelled" ? -5 : 0;
  const handoff = -5 * ctx.missingHandoff;
  const ack = ctx.ackCount >= 1 ? 5 : 0;
  const retries = -Math.min(ctx.retries * 5, 10);
  return { base: 50, evidence, status, handoff, ack, retries, seat: 0 };
}

/** Seat-specific delta on top of the shared signals (16 §9 table). */
function seatDelta(seat: string, ctx: ScoreCtx): number {
  switch (seat) {
    case "squad-lead":
      // 协调闭环：正常解散
      return ctx.taskStatus === "dissolved" ? 5 : 0;
    case "engineer":
      // 实现被验证：evidence pass
      return ctx.evidence?.result === "pass" ? 5 : 0;
    case "sdet":
      // 验证质量：有命令且全绿 +5；evidence fail −5
      if (ctx.evidence === null) return 0;
      const allGreen =
        ctx.evidence.commands.length > 0 &&
        ctx.evidence.commands.every((c) => c.exit_code === 0 && Boolean(c.log_ref));
      if (allGreen) return 5;
      return ctx.evidence.result === "fail" ? -5 : 0;
    default:
      return 0;
  }
}

export function readScores(dir: string, taskId: string): TaskScores | null {
  const p = scoresPath(dir, taskId);
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as TaskScores;
}

/**
 * Compute and persist scores for a finished task. Requires an approved
 * staffing (team_name + personas). Writes scores.yaml and upserts the
 * knowledge-base archives for every codename and the team name.
 */
export function scoreTask(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
  opts: { by?: string; note?: string } = {},
): TaskScores {
  const staffing = readStaffing(dir, taskId);
  if (!staffing || staffing.status !== "approved") {
    throw new Error(`staffing not approved for ${taskId}; cannot score`);
  }
  const task = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "task.yaml"), "utf8"),
  ) as { status: string; retries?: number };
  // 16 §9: score after the task is over (P07 dissolve / P14 force dissolve) —
  // scoring a running task would pollute pool_reuse / self-evolution reference data.
  if (!["dissolved", "failed", "cancelled"].includes(task.status)) {
    throw new Error(`task ${taskId} not finished (status=${task.status}); score after dissolve (P07)`);
  }
  // 16 §8: codename/team_name double as archive file names — never let an
  // override escape the knowledge dir (defense-in-depth beside people-qa).
  assertSafeName(staffing.team_name, "team_name");
  const evidence = readEvidence(dir, taskId);
  const acceptance: AcceptanceState | null = readAcceptance(dir, taskId);
  const hd = handoffDir(dir, taskId);
  const missingHandoff = HANDOFF_FILES.filter((f) => !fs.existsSync(path.join(hd, f))).length;
  const ctx: ScoreCtx = {
    evidence,
    taskStatus: task.status,
    retries: task.retries ?? 0,
    missingHandoff,
    ackCount: acceptance?.accepted_by?.length ?? 0,
  };

  const shared = computeSharedBreakdown(ctx);
  const personaScores: PersonaScore[] = [];
  for (const seat of ["squad-lead", "engineer", "sdet"] as const) {
    const persona = parsePersonaFile(
      path.join(dir, "tasks", taskId, "staffing", "personas", `${seat}.md`),
    ).frontmatter;
    const breakdown: ScoreBreakdown = {
      ...shared,
      seat: seatDelta(seat, ctx),
    };
    personaScores.push({
      seat,
      codename: persona.codename,
      score: clampScore(
        breakdown.base + breakdown.evidence + breakdown.status + breakdown.handoff +
          breakdown.ack + breakdown.retries + breakdown.seat,
      ),
      breakdown,
    });
  }

  const teamScore = clampScore(
    shared.base + shared.evidence + shared.status + shared.handoff + shared.ack + shared.retries,
  );
  const scores: TaskScores = {
    schema_version: "1",
    task_id: taskId,
    team_name: staffing.team_name,
    scored_at: new Date().toISOString(),
    scored_by: opts.by ?? "people-qa",
    note: opts.note ?? null,
    team_score: teamScore,
    team_breakdown: shared,
    persona_scores: personaScores,
  };
  ensureDir(path.dirname(scoresPath(dir, taskId)));
  writeAtomic(scoresPath(dir, taskId), YAML.stringify(scores));

  // Knowledge-base aggregation for later optimization.
  const runId = path.basename(dir);
  const recordBase = {
    at: scores.scored_at,
    run_id: runId,
    task_id: taskId,
    result: task.status,
    note: opts.note,
  };
  for (const ps of personaScores) {
    assertSafeName(ps.codename, "codename");
    upsertArchive(
      path.join(repoRoot, config.paths.knowledge_root, "hr", "personas", `${ps.codename}.yaml`),
      {
        kind: "persona",
        key: ps.codename,
        seat: ps.seat,
        records: [{ ...recordBase, score: ps.score, seat: ps.seat }],
      },
    );
  }
  upsertArchive(
    path.join(repoRoot, config.paths.knowledge_root, "hr", "teams", `${staffing.team_name}.yaml`),
    {
      kind: "team",
      key: staffing.team_name,
      records: [{ ...recordBase, score: teamScore }],
    },
  );

  // Talent pool (16 §9.3 / talent.md): one record per (task, seat) with the
  // score, quality grade and the skills wanted from the staffing request —
  // the "产出质量等级由评分流程回写" promise of the 人才库主档 (TC-11).
  const request = readStaffingRequest(dir, taskId);
  const records: TalentRecord[] = personaScores.map((ps) => ({
    at: scores.scored_at,
    run_id: runId,
    task_id: taskId,
    team_name: staffing.team_name,
    seat: ps.seat,
    codename: ps.codename,
    skills: request?.skills_wanted ?? [],
    score: ps.score,
    grade: gradeFor(ps.score),
    result: task.status,
  }));
  appendTalentRecords(repoRoot, config, records);
  return scores;
}

/** Append one record to an HR archive, recomputing the summary (idempotent per task_id). */
export function upsertArchive(file: string, rec: Pick<HrArchive, "kind" | "key" | "seat"> & { records: HrRecord[] }): HrArchive {
  const existing = fs.existsSync(file)
    ? (YAML.parse(fs.readFileSync(file, "utf8")) as HrArchive)
    : null;
  const records = existing?.records ?? [];
  const recToAdd = rec.records[0];
  const idx = records.findIndex((r) => r.task_id === recToAdd.task_id && r.seat === recToAdd.seat);
  if (idx >= 0) records[idx] = recToAdd;
  else records.push(recToAdd);
  const scoresArr = records.map((r) => r.score);
  const archive: HrArchive = {
    kind: rec.kind,
    key: rec.key,
    ...(rec.seat ? { seat: rec.seat } : {}),
    records,
    summary: {
      count: scoresArr.length,
      avg: scoresArr.length ? Math.round((scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length) * 10) / 10 : 0,
      min: scoresArr.length ? Math.min(...scoresArr) : 0,
      max: scoresArr.length ? Math.max(...scoresArr) : 0,
    },
    updated_at: new Date().toISOString(),
  };
  ensureDir(path.dirname(file));
  writeAtomic(file, YAML.stringify(archive));
  return archive;
}
