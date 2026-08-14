/**
 * Decision lint (D090): validate the DECISIONS ledger numbering integrity.
 *
 * Data-first design mirrors persona-lint / skill-lint: damaged input never
 * throws — it returns a structured `DecisionLintResult` so the CLI and CI can
 * branch on stable codes. One file provides both the library entry
 * (`checkDecisions`) and the CLI (runs only when this module is the process
 * entry point).
 *
 * Checks (D090-1):
 *   1. table row numbers in `docs/DECISIONS.md` are unique (DUP_TABLE, error)
 *   2. detail section numbers are unique (DUP_SECTION, error)
 *   3. every detail section has a matching table row (TABLE_SECTION_MISMATCH,
 *      error) — a section without a row is an orphan detail
 *   4. numbers are consistent with `docs/decisions/watermark.yaml`
 *      (WATERMARK_DRIFT, error): max table number must be ≤ next_number - 1
 *   5. every `D0xx` reference in `docs/**` resolves to a DECISIONS number or a
 *      watermark reservation (REF_UNRESOLVED, warning — history debt must not
 *      block)
 *   6. watermark reservations are idempotent / disjoint: no reserved number
 *      collides with an existing DECISIONS number and no two reservations
 *      overlap (RESERVATION_COLLISION, error)
 *
 * `--plan <file>` precheck mode: also scans the plan file's `D0xx` references
 * against the same resolvable set (DECISIONS ∪ reservations), so run-lead can
 * block collisions before writing the plan (D090-2).
 *
 * watermark.yaml schema v1 (C1 output): `next_number` + `reservations[]`;
 * each reservation has a `run` id and a number range (`start`/`end`,
 * `start`/`count`, or explicit `numbers[]`), plus optional `status`
 * (`reserved` | `landed`). Landed reservations are already consumed into
 * DECISIONS, so they are exempt from the collision-with-DECISIONS check.
 *
 * Input: pass the repo root (`<repo>`) or the DECISIONS.md path directly; both
 * resolve to the same result.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

/** Stable machine-readable codes (CI/CLI branch without parsing message text). */
export const DecisionLintCode = {
  DECISIONS_MISSING: "DECISIONS_MISSING",
  DUP_TABLE: "DUP_TABLE",
  DUP_SECTION: "DUP_SECTION",
  TABLE_SECTION_MISMATCH: "TABLE_SECTION_MISMATCH",
  WATERMARK_MISSING: "WATERMARK_MISSING",
  WATERMARK_INVALID: "WATERMARK_INVALID",
  WATERMARK_DRIFT: "WATERMARK_DRIFT",
  RESERVATION_COLLISION: "RESERVATION_COLLISION",
  REF_UNRESOLVED: "REF_UNRESOLVED",
  PLAN_MISSING: "PLAN_MISSING",
} as const;

export type DecisionLintSeverity = "error" | "warning";

export interface DecisionLintProblem {
  code: string;
  severity: DecisionLintSeverity;
  /** File the problem was found in (relative path where known). */
  file?: string;
  /** Field involved (when the problem is field-scoped, e.g. watermark keys). */
  field?: string;
  /** Decision number involved, zero-padded like `D063`. */
  number?: string;
  message: string;
}

export interface DecisionLintResult {
  ok: boolean;
  problems: DecisionLintProblem[];
  /** Files checked (DECISIONS.md, watermark.yaml, docs/** scanned, plan). */
  files: string[];
}

export interface DecisionLintOptions {
  /** `--plan` precheck mode: scan this file's D0xx refs against DECISIONS ∪ reservations. */
  planFile?: string;
}

/** Watermark reservation range (schema v1, C1). */
interface WatermarkReservation {
  run: string;
  numbers: number[];
  status: string;
}

interface Watermark {
  nextNumber: number;
  reservations: WatermarkReservation[];
}

export function checkDecisions(dir: string, options: DecisionLintOptions = {}): DecisionLintResult {
  const { decisionsFile, repoRoot } = resolveInput(dir);
  const problems: DecisionLintProblem[] = [];
  const files: string[] = [];

  if (!decisionsFile || !fs.existsSync(decisionsFile)) {
    problems.push({
      code: DecisionLintCode.DECISIONS_MISSING,
      severity: "error",
      message: "docs/DECISIONS.md not found (pass the repo root or the DECISIONS.md path)",
    });
    return { ok: false, problems, files };
  }

  files.push(toPosix(path.relative(repoRoot ?? dir, decisionsFile)));

  const content = fs.readFileSync(decisionsFile, "utf8");
  const { table, sections } = parseDecisions(content);

  const tableSet = new Set(table);
  const sectionSet = new Set(sections);

  // ① table row uniqueness
  for (const dup of findDuplicates(table)) {
    problems.push({
      code: DecisionLintCode.DUP_TABLE,
      severity: "error",
      file: toPosix(path.relative(repoRoot ?? dir, decisionsFile)),
      number: pad(dup),
      message: `table row ${pad(dup)} appears more than once`,
    });
  }
  // ② detail section uniqueness
  for (const dup of findDuplicates(sections)) {
    problems.push({
      code: DecisionLintCode.DUP_SECTION,
      severity: "error",
      file: toPosix(path.relative(repoRoot ?? dir, decisionsFile)),
      number: pad(dup),
      message: `detail section ${pad(dup)} appears more than once`,
    });
  }
  // ③ table ↔ detail: every section must have a table row
  for (const s of sections) {
    if (!tableSet.has(s)) {
      problems.push({
        code: DecisionLintCode.TABLE_SECTION_MISMATCH,
        severity: "error",
        file: toPosix(path.relative(repoRoot ?? dir, decisionsFile)),
        number: pad(s),
        message: `detail section ${pad(s)} has no matching table row`,
      });
    }
  }

  // watermark-backed checks (④ drift, ⑥ reservations)
  const watermarkFile = repoRoot
    ? path.join(repoRoot, "docs", "decisions", "watermark.yaml")
    : null;
  const watermark = loadWatermark(watermarkFile, problems, files, repoRoot ?? dir);
  if (watermark) {
    // ④ watermark drift: max table number must be ≤ next_number - 1
    const maxTable = table.length > 0 ? Math.max(...table) : 0;
    if (maxTable >= watermark.nextNumber) {
      problems.push({
        code: DecisionLintCode.WATERMARK_DRIFT,
        severity: "error",
        file: toPosix(path.relative(repoRoot ?? dir, decisionsFile)),
        number: pad(maxTable),
        message: `max table number ${pad(maxTable)} is not below next_number ${watermark.nextNumber} (must be ≤ ${watermark.nextNumber - 1})`,
      });
    }
    // ⑥ reservations: disjoint + no collision with DECISIONS
    checkReservations(watermark.reservations, tableSet, sectionSet, problems);
  }

  // ⑤ docs/** D0xx references must resolve to DECISIONS ∪ reservations
  const resolvable = new Set<number>([...table, ...sections]);
  for (const res of watermark?.reservations ?? []) {
    for (const n of res.numbers) resolvable.add(n);
  }
  const docsDir = repoRoot ? path.join(repoRoot, "docs") : path.join(dir, "docs");
  if (fs.existsSync(docsDir)) {
    scanDocsRefs(docsDir, docsDir, resolvable, problems, files, repoRoot ?? dir, decisionsFile);
  }

  // `--plan` precheck: plan file refs must resolve too (C2-c)
  if (options.planFile) {
    const planPath = path.resolve(options.planFile);
    if (!fs.existsSync(planPath)) {
      problems.push({
        code: DecisionLintCode.PLAN_MISSING,
        severity: "error",
        file: toPosix(options.planFile),
        message: "plan file not found",
      });
    } else {
      const rel = repoRoot ? toPosix(path.relative(repoRoot, planPath)) : toPosix(planPath);
      if (!files.includes(rel)) files.push(rel);
      scanFileRefs(planPath, rel, resolvable, problems);
    }
  }

  files.sort();
  const ok = !problems.some((p) => p.severity === "error");
  return { ok, problems, files };
}

/** Parse DECISIONS.md into table row numbers and detail section numbers. */
function parseDecisions(content: string): { table: number[]; sections: number[] } {
  const table: number[] = [];
  const sections: number[] = [];
  for (const line of content.split("\n")) {
    const row = line.match(/^\|D(\d{3})\|/);
    if (row) {
      table.push(Number(row[1]));
      continue;
    }
    const sec = line.match(/^#{1,6}\s+D(\d{3})\b/);
    if (sec) sections.push(Number(sec[1]));
  }
  return { table, sections };
}

function findDuplicates(nums: number[]): number[] {
  const seen = new Set<number>();
  const dups = new Set<number>();
  for (const n of nums) {
    if (seen.has(n)) dups.add(n);
    seen.add(n);
  }
  return [...dups].sort((a, b) => a - b);
}

/** Load + validate watermark.yaml; missing → warning, invalid → error. */
function loadWatermark(
  watermarkFile: string | null,
  problems: DecisionLintProblem[],
  files: string[],
  base: string,
): Watermark | null {
  if (!watermarkFile || !fs.existsSync(watermarkFile)) {
    problems.push({
      code: DecisionLintCode.WATERMARK_MISSING,
      severity: "warning",
      message: "docs/decisions/watermark.yaml not found; watermark drift + reservation checks skipped",
    });
    return null;
  }
  const rel = toPosix(path.relative(base, watermarkFile));
  if (!files.includes(rel)) files.push(rel);

  let parsed: unknown;
  try {
    parsed = YAML.parse(fs.readFileSync(watermarkFile, "utf8"));
  } catch (e) {
    problems.push({
      code: DecisionLintCode.WATERMARK_INVALID,
      severity: "error",
      file: rel,
      message: `watermark YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    problems.push({
      code: DecisionLintCode.WATERMARK_INVALID,
      severity: "error",
      file: rel,
      message: "watermark must be a YAML mapping",
    });
    return null;
  }
  const rec = parsed as Record<string, unknown>;
  const nextNumber = rec.next_number;
  if (typeof nextNumber !== "number" || !Number.isInteger(nextNumber) || nextNumber <= 0) {
    problems.push({
      code: DecisionLintCode.WATERMARK_INVALID,
      severity: "error",
      file: rel,
      field: "next_number",
      message: "next_number must be a positive integer",
    });
    return null;
  }

  const reservations: WatermarkReservation[] = [];
  if (rec.reservations !== undefined) {
    if (!Array.isArray(rec.reservations)) {
      problems.push({
        code: DecisionLintCode.WATERMARK_INVALID,
        severity: "error",
        file: rel,
        field: "reservations",
        message: "reservations must be a list",
      });
      return null;
    }
    for (const entry of rec.reservations) {
      const parsedEntry = parseReservationEntry(entry);
      if (!parsedEntry) {
        problems.push({
          code: DecisionLintCode.WATERMARK_INVALID,
          severity: "error",
          file: rel,
          field: "reservations",
          message: `unparseable reservation entry: ${JSON.stringify(entry)} (expected run + start/end | start/count | numbers[])`,
        });
        return null;
      }
      reservations.push(parsedEntry);
    }
  }

  return { nextNumber, reservations };
}

/** Parse a single reservation entry into {run, numbers[], status}. */
function parseReservationEntry(entry: unknown): WatermarkReservation | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const rec = entry as Record<string, unknown>;
  const run = typeof rec.run === "string" ? rec.run : "";
  const status = typeof rec.status === "string" ? rec.status : "reserved";
  const numbers: number[] = [];

  if (Array.isArray(rec.numbers)) {
    for (const n of rec.numbers) {
      if (typeof n === "number" && Number.isInteger(n)) numbers.push(n);
    }
  } else if (typeof rec.start === "number" && Number.isInteger(rec.start)) {
    const start = rec.start;
    let end: number;
    if (typeof rec.end === "number" && Number.isInteger(rec.end)) end = rec.end;
    else if (typeof rec.count === "number" && Number.isInteger(rec.count)) end = start + rec.count - 1;
    else end = start;
    if (end >= start) {
      for (let n = start; n <= end; n++) numbers.push(n);
    }
  } else if (typeof rec.number === "number" && Number.isInteger(rec.number)) {
    numbers.push(rec.number);
  }

  if (numbers.length === 0) return null;
  return { run, numbers, status };
}

/** Reservations must be disjoint and not collide with existing DECISIONS numbers. */
function checkReservations(
  reservations: WatermarkReservation[],
  tableSet: Set<number>,
  sectionSet: Set<number>,
  problems: DecisionLintProblem[],
): void {
  const watermarkRel = "docs/decisions/watermark.yaml";
  const owner = new Map<number, string>();
  const decided = new Set<number>([...tableSet, ...sectionSet]);

  for (const res of reservations) {
    for (const n of res.numbers) {
      // landed reservations are already consumed into DECISIONS — exempt
      if (res.status !== "landed" && decided.has(n)) {
        problems.push({
          code: DecisionLintCode.RESERVATION_COLLISION,
          severity: "error",
          file: watermarkRel,
          number: pad(n),
          message: `reservation ${res.run || "(unnamed)"} covers ${pad(n)}, which already exists in DECISIONS`,
        });
      }
      const prev = owner.get(n);
      if (prev !== undefined && prev !== res.run) {
        problems.push({
          code: DecisionLintCode.RESERVATION_COLLISION,
          severity: "error",
          file: watermarkRel,
          number: pad(n),
          message: `${pad(n)} is claimed by both ${prev || "(unnamed)"} and ${res.run || "(unnamed)"}`,
        });
      }
      owner.set(n, res.run);
    }
  }
}

/** Recursively scan every docs markdown file for D0xx references (skip DECISIONS.md itself). */
function scanDocsRefs(
  docsRoot: string,
  dir: string,
  resolvable: Set<number>,
  problems: DecisionLintProblem[],
  files: string[],
  base: string,
  decisionsFile: string,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDocsRefs(docsRoot, full, resolvable, problems, files, base, decisionsFile);
    } else if (entry.isFile() && entry.name.endsWith(".md") && full !== decisionsFile) {
      const rel = toPosix(path.relative(base, full));
      if (!files.includes(rel)) files.push(rel);
      scanFileRefs(full, rel, resolvable, problems);
    }
  }
}

/** Collect every unique D0xx reference in a file and flag unresolvable ones. */
function scanFileRefs(
  filePath: string,
  rel: string,
  resolvable: Set<number>,
  problems: DecisionLintProblem[],
): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  const seen = new Set<number>();
  for (const m of raw.matchAll(/\bD(\d{3})\b/g)) {
    const n = Number(m[1]);
    if (seen.has(n)) continue;
    seen.add(n);
    if (!resolvable.has(n)) {
      problems.push({
        code: DecisionLintCode.REF_UNRESOLVED,
        severity: "warning",
        file: rel,
        number: pad(n),
        message: `reference ${pad(n)} does not resolve to any DECISIONS entry or watermark reservation`,
      });
    }
  }
}

/** Resolve input into the DECISIONS.md path + repo root (null repo root → use dir). */
function resolveInput(dir: string): { decisionsFile: string | null; repoRoot: string | null } {
  const abs = path.resolve(dir);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    if (path.basename(abs) === "DECISIONS.md") {
      const docsDir = path.dirname(abs);
      return {
        decisionsFile: abs,
        repoRoot: path.basename(docsDir) === "docs" ? path.dirname(docsDir) : null,
      };
    }
    return { decisionsFile: abs, repoRoot: null };
  }
  if (fs.existsSync(path.join(abs, "docs", "DECISIONS.md"))) {
    return { decisionsFile: path.join(abs, "docs", "DECISIONS.md"), repoRoot: abs };
  }
  if (fs.existsSync(path.join(abs, "DECISIONS.md"))) {
    return { decisionsFile: path.join(abs, "DECISIONS.md"), repoRoot: abs };
  }
  return { decisionsFile: null, repoRoot: abs };
}

function pad(n: number): string {
  return `D${String(n).padStart(3, "0")}`;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function runCli(argv: string[]): number {
  let target = ".";
  let planFile: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--plan") {
      planFile = argv[i + 1];
      i++;
    } else if (!argv[i].startsWith("-")) {
      target = argv[i];
    }
  }
  const result = checkDecisions(target, planFile ? { planFile } : {});
  for (const p of result.problems) {
    const loc = [p.file, p.number].filter(Boolean).join(" · ");
    process.stdout.write(
      `[decision-lint] ${p.severity.toUpperCase()}: ${p.code}: ${loc ? `${loc}: ` : ""}${p.message}\n`,
    );
  }
  const errors = result.problems.filter((p) => p.severity === "error").length;
  if (result.problems.length === 0) {
    process.stdout.write(`[decision-lint] OK: ${result.files.length} file(s) checked\n`);
  } else {
    process.stdout.write(
      `[decision-lint] ${result.problems.length} problem(s), ${errors} error(s) over ${result.files.length} file(s)\n`,
    );
  }
  return errors > 0 ? 1 : 0;
}

// CLI entry: only when this module is executed directly (not when imported).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli(process.argv));
}
