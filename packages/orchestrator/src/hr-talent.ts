import path from "node:path";
import { assertSafeName, ensureDir, readYamlFile, withFileLock, writeYamlFile, type PicodeConfig } from "@picode/core";
import type { Seat } from "./staffing.js";

/**
 * Talent pool + identity ledger (16-hr-cell §9 · docs/knowledge/hr).
 *
 * Two machine-maintained knowledge files close the HR identity loop:
 *
 *   1. `<knowledge_root>/hr/talent.yaml` — the talent pool (人才库主档).
 *      One record per (run_id, task_id, seat), written by `staffing score`
 *      (P07 dissolve) with the persona score, a quality grade and the skills
 *      wanted from the staffing request. This is the "产出质量等级由评分流程
 *      回写" promise of docs/knowledge/hr/talent.md (TC-11).
 *
 *   2. `<knowledge_root>/hr/name-ledger.yaml` — the identity ledger.
 *      Every codename and team_name locked by `staffing approve` is recorded
 *      per run. Recruitment consults it so same-run names never collide
 *      (16 §8 + codename-ledger.md): a taken name is auto-suffixed `-rN`
 *      (e.g. 鸣沙 → 鸣沙-r2). This is the cross-task identity registry
 *      (TC-03) that future runs query before hiring (TC-12).
 *
 * The human-readable seeds (talent.md / codename-ledger.md) stay as pointers;
 * the machine records live in these YAML files.
 */

/** Quality grade derived from the 0–100 persona score (TC-11). */
export type Grade = "S" | "A" | "B" | "C" | "D";

export interface TalentRecord {
  at: string;
  run_id: string;
  task_id: string;
  team_name: string;
  seat: Seat;
  codename: string;
  /** Skills wanted from the staffing request (16 §4.1 skills_wanted). */
  skills: string[];
  score: number;
  grade: Grade;
  /** Task end state: dissolved | failed | cancelled. */
  result: string;
}

export interface SeatSummary {
  count: number;
  avg: number;
}

export interface TalentSummary {
  count: number;
  avg: number;
  by_grade: Record<Grade, number>;
  by_seat: Record<string, SeatSummary>;
}

export interface TalentPool {
  schema_version: "1";
  updated_at: string;
  records: TalentRecord[];
  summary: TalentSummary;
}

export interface LedgerEntry {
  kind: "codename" | "team_name";
  name: string;
  run_id: string;
  task_id: string;
  seat: Seat | null;
  first_used_at: string;
}

export interface NameLedger {
  schema_version: "1";
  updated_at: string;
  entries: LedgerEntry[];
}

/** Grade thresholds (S ≥85 · A ≥70 · B ≥55 · C ≥40 · D <40). */
export function gradeFor(score: number): Grade {
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}

function talentPoolPath(repoRoot: string, config: PicodeConfig): string {
  return path.join(repoRoot, config.paths.knowledge_root, "hr", "talent.yaml");
}

function nameLedgerPath(repoRoot: string, config: PicodeConfig): string {
  return path.join(repoRoot, config.paths.knowledge_root, "hr", "name-ledger.yaml");
}

export function readTalentPool(repoRoot: string, config: PicodeConfig): TalentPool {
  return (
    readYamlFile<TalentPool>(talentPoolPath(repoRoot, config)) ?? {
      schema_version: "1",
      updated_at: "",
      records: [],
      summary: { count: 0, avg: 0, by_grade: { S: 0, A: 0, B: 0, C: 0, D: 0 }, by_seat: {} },
    }
  );
}


/** C4 流程项（评分-招聘回路消费侧）：只读查询人才池。grade 优先级 S>A>B>C>D；
 *  filter: { grades?, seats?, skills? } 均为可选数组过滤（skills 为 AND 语义）；
 *  返回按 grade 降序、score 降序；纯函数不修改入参池。 */
export interface TalentPoolFilter {
  grades?: Grade[];
  seats?: Seat[];
  skills?: string[];
}
export function queryTalentPool(
  pool: TalentPool,
  filter: TalentPoolFilter = {},
): TalentRecord[] {
  const GRADE_ORDER: Grade[] = ["S", "A", "B", "C", "D"];
  return pool.records
    .filter((r) => {
      if (filter.grades && filter.grades.length > 0 && !filter.grades.includes(r.grade))
        return false;
      if (filter.seats && filter.seats.length > 0 && !filter.seats.includes(r.seat))
        return false;
      if (filter.skills && filter.skills.length > 0) {
        const want = filter.skills.map((x) => x.toLowerCase());
        // AND 语义：画像须具备每个请求技能（精确匹配，大小写不敏感）
        if (!want.every((w) => r.skills.some((sk) => sk.toLowerCase() === w))) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) ||
        b.score - a.score,
    );
}

export function readNameLedger(repoRoot: string, config: PicodeConfig): NameLedger {
  return (
    readYamlFile<NameLedger>(nameLedgerPath(repoRoot, config)) ?? {
      schema_version: "1",
      updated_at: "",
      entries: [],
    }
  );
}

function avg(arr: number[]): number {
  return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
}

function computeTalentSummary(records: TalentRecord[]): TalentSummary {
  const byGrade: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  const seatScores = new Map<string, number[]>();
  for (const r of records) {
    byGrade[r.grade]++;
    const arr = seatScores.get(r.seat) ?? [];
    arr.push(r.score);
    seatScores.set(r.seat, arr);
  }
  const bySeat: Record<string, SeatSummary> = {};
  for (const [seat, arr] of seatScores) bySeat[seat] = { count: arr.length, avg: avg(arr) };
  return {
    count: records.length,
    avg: avg(records.map((r) => r.score)),
    by_grade: byGrade,
    by_seat: bySeat,
  };
}

/**
 * Upsert talent records (idempotent, keyed by run_id+task_id+seat — re-scoring
 * a task overwrites its own records) and persist the pool with a fresh summary.
 */
export async function appendTalentRecords(
  repoRoot: string,
  config: PicodeConfig,
  records: TalentRecord[],
): Promise<TalentPool> {
  // 并发安全（P1）：pool 读-改-写持锁，多个进程并发评分不互相覆盖
  const file = talentPoolPath(repoRoot, config);
  return withFileLock(`${file}.lock`, () => {
    const pool = readTalentPool(repoRoot, config);
    const key = (r: TalentRecord) => `${r.run_id}\u0000${r.task_id}\u0000${r.seat}`;
    const seen = new Set(pool.records.map(key));
    for (const rec of records) {
      // codename/team_name double as knowledge file names — never let an override escape.
      assertSafeName(rec.codename, "codename");
      assertSafeName(rec.team_name, "team_name");
      if (seen.has(key(rec))) {
        pool.records[pool.records.findIndex((r) => key(r) === key(rec))] = rec;
      } else {
        pool.records.push(rec);
        seen.add(key(rec));
      }
    }
    pool.records.sort((a, b) => (a.at < b.at ? -1 : 1));
    pool.summary = computeTalentSummary(pool.records);
    pool.updated_at = new Date().toISOString();
    ensureDir(path.dirname(file));
    writeYamlFile(file, pool);
    return pool;
  });
}

/**
 * Upsert ledger entries (idempotent, keyed by kind+name+run_id). Approving the
 * same triad twice must not duplicate its identity records.
 */
export async function appendLedgerEntries(
  repoRoot: string,
  config: PicodeConfig,
  entries: Array<{
    kind: "codename" | "team_name";
    name: string;
    run_id: string;
    task_id: string;
    seat: Seat | null;
  }>,
): Promise<NameLedger> {
  // 并发安全（P1）：ledger 读-改-写持锁
  const file = nameLedgerPath(repoRoot, config);
  return withFileLock(`${file}.lock`, () => {
    const ledger = readNameLedger(repoRoot, config);
    const now = new Date().toISOString();
    const key = (e: LedgerEntry) => `${e.kind}\u0000${e.name}\u0000${e.run_id}`;
    const seen = new Set(ledger.entries.map(key));
    for (const en of entries) {
      assertSafeName(en.name, en.kind === "codename" ? "codename" : "team_name");
      const entry: LedgerEntry = { ...en, first_used_at: now };
      if (seen.has(key(entry))) continue;
      ledger.entries.push(entry);
      seen.add(key(entry));
    }
    ledger.entries.sort((a, b) => (a.first_used_at < b.first_used_at ? -1 : 1));
    ledger.updated_at = now;
    ensureDir(path.dirname(file));
    writeYamlFile(file, ledger);
    return ledger;
  });
}

/**
 * Names already taken in a run (16 §8: same-run codename/team_name must be
 * unique). `excludeTask` skips the current task's own records so re-drafting
 * the same task stays deterministic.
 */
export function namesUsedInRun(
  repoRoot: string,
  config: PicodeConfig,
  runId: string,
  opts: { excludeTask?: string } = {},
): { codenames: Set<string>; team_names: Set<string> } {
  const ledger = readNameLedger(repoRoot, config);
  const codenames = new Set<string>();
  const teamNames = new Set<string>();
  for (const e of ledger.entries) {
    if (e.run_id !== runId) continue;
    if (opts.excludeTask && e.task_id === opts.excludeTask) continue;
    if (e.kind === "codename") codenames.add(e.name);
    else teamNames.add(e.name);
  }
  return { codenames, team_names: teamNames };
}

/** Auto-suffix a taken name with `-r2`, `-r3`, … (codename-ledger rule). */
export function disambiguateName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name}-r${n}`)) n++;
  return `${name}-r${n}`;
}
