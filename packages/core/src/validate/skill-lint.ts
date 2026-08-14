/**
 * Skill lint (D082): validate every SKILL.md file under the skills root
 * (recursively, any depth).
 *
 * Data-first design mirrors persona-lint: bad frontmatter never throws — it
 * returns a structured `SkillLintResult` so the CLI and CI can branch on
 * stable codes. One file provides both the library entry (`checkSkillsDir`)
 * and the CLI (runs only when this module is the process entry point).
 *
 * Checks per SKILL.md:
 *   · frontmatter block present, valid YAML, YAML mapping
 *   · `name` required, matches SAFE_ID_RE (lowercase letters/digits/hyphen,
 *     leading letter) and equals the containing directory name
 *   · `description` required non-empty (> 1024 chars is a warning, matching
 *     agentskills' advisory cap — existing ponytail seed is 826 chars)
 *   · unknown frontmatter keys are warnings (whitelist: license, allowed-tools,
 *     compatibility, metadata, argument-hint — the experimental agentskills set)
 *   · `allowed-tools` / `license` / `compatibility` / `argument-hint` when
 *     present must have the declared shape (string / string[] per field)
 *
 * Input: pass the repo root (`<repo>`) — the skills root is resolved from
 * `paths.skills_root` in config — or the skills dir directly; both resolve to
 * the same result.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { SAFE_ID_RE } from "../config.js";
import { loadConfig } from "../loader.js";

/** Stable machine-readable codes (CI/CLI branch without parsing message text). */
export const SkillLintCode = {
  SKILLS_DIR_MISSING: "SKILLS_DIR_MISSING",
  FM_MISSING: "FM_MISSING",
  FM_INVALID_YAML: "FM_INVALID_YAML",
  FM_NOT_OBJECT: "FM_NOT_OBJECT",
  NAME_MISSING: "NAME_MISSING",
  NAME_INVALID: "NAME_INVALID",
  NAME_MISMATCH: "NAME_MISMATCH",
  DESCRIPTION_MISSING: "DESCRIPTION_MISSING",
  DESCRIPTION_EMPTY: "DESCRIPTION_EMPTY",
  DESCRIPTION_TOO_LONG: "DESCRIPTION_TOO_LONG",
  UNKNOWN_KEY: "UNKNOWN_KEY",
  FIELD_INVALID: "FIELD_INVALID",
  CONFIG_LOAD_FAILED: "CONFIG_LOAD_FAILED",
} as const;

export type SkillLintSeverity = "error" | "warning";

export interface SkillLintProblem {
  code: string;
  severity: SkillLintSeverity;
  /** SKILL.md path relative to the skills root (when file-scoped). */
  file?: string;
  /** Frontmatter field involved (when the problem is field-scoped). */
  field?: string;
  message: string;
}

export interface SkillLintResult {
  ok: boolean;
  problems: SkillLintProblem[];
  /** SKILL.md files checked (relative names under the skills root). */
  files: string[];
}

export interface SkillLintOptions {
  /** Advisory description-length cap; longer is a warning (default 1024). */
  descriptionMax?: number;
}

/** agentskills advisory cap (spec): descriptions should stay under ~1024 chars. */
export const DEFAULT_DESCRIPTION_MAX = 1024;

/** Allowed frontmatter keys (agentskills spec: name/description + optional). */
const KNOWN_KEYS = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "compatibility",
  "metadata",
  "argument-hint",
]);

/** Optional keys whose YAML shape is a non-empty array of strings. */
const STRING_ARRAY_KEYS = new Set(["allowed-tools", "compatibility"]);

/** Optional keys whose YAML shape is a single non-empty string. */
const STRING_KEYS = new Set(["license", "argument-hint"]);

export function checkSkillsDir(dir: string, options: SkillLintOptions = {}): SkillLintResult {
  const { skillsDir, loadError } = resolveInput(dir);
  const problems: SkillLintProblem[] = [];
  const descriptionMax = options.descriptionMax ?? DEFAULT_DESCRIPTION_MAX;

  if (loadError) {
    problems.push({
      code: SkillLintCode.CONFIG_LOAD_FAILED,
      severity: "error",
      message: `failed to resolve skills root from config: ${loadError}`,
    });
    return { ok: false, problems, files: [] };
  }
  if (!skillsDir || !fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) {
    problems.push({
      code: SkillLintCode.SKILLS_DIR_MISSING,
      severity: "error",
      file: skillsDir ?? dir,
      message: "skills root not found",
    });
    return { ok: false, problems, files: [] };
  }

  const files: string[] = [];
  walkSkillFiles(skillsDir, skillsDir, files);
  files.sort();

  for (const file of files) {
    checkSkillFile(path.join(skillsDir, file), file, descriptionMax, problems);
  }

  const ok = !problems.some((p) => p.severity === "error");
  return { ok, problems, files };
}

/** Recursively collect SKILL.md paths (any depth) relative to the skills root. */
function walkSkillFiles(skillsDir: string, dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkillFiles(skillsDir, full, out);
    } else if (entry.name === "SKILL.md") {
      out.push(toPosix(path.relative(skillsDir, full)));
    }
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** Resolve the skills dir from a repo root or use the dir directly. */
function resolveInput(dir: string): { skillsDir: string | null; loadError: string | null } {
  if (fs.existsSync(path.join(dir, ".picode", "config.yaml"))) {
    try {
      const config = loadConfig(dir);
      return { skillsDir: path.resolve(dir, config.paths.skills_root), loadError: null };
    } catch (e) {
      return {
        skillsDir: null,
        loadError: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { skillsDir: dir, loadError: null };
}

function checkSkillFile(
  filePath: string,
  rel: string,
  descriptionMax: number,
  problems: SkillLintProblem[],
): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    problems.push({
      code: SkillLintCode.FM_MISSING,
      severity: "error",
      file: rel,
      message: `unable to read file: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }

  const m = raw.match(/^---\n([\s\S]*?)\n---\n?[\s\S]*$/);
  if (!m) {
    problems.push({
      code: SkillLintCode.FM_MISSING,
      severity: "error",
      file: rel,
      message: "no YAML frontmatter block",
    });
    return;
  }
  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(m[1]);
  } catch (e) {
    problems.push({
      code: SkillLintCode.FM_INVALID_YAML,
      severity: "error",
      file: rel,
      message: `frontmatter YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
    problems.push({
      code: SkillLintCode.FM_NOT_OBJECT,
      severity: "error",
      file: rel,
      message: "frontmatter must be a YAML mapping",
    });
    return;
  }
  const record = frontmatter as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key)) {
      problems.push({
        code: SkillLintCode.UNKNOWN_KEY,
        severity: "warning",
        file: rel,
        field: key,
        message: `unknown frontmatter key "${key}" (allowed: ${[...KNOWN_KEYS].join(", ")})`,
      });
    }
  }

  const name = record.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    problems.push({
      code: SkillLintCode.NAME_MISSING,
      severity: "error",
      file: rel,
      field: "name",
      message: `required field "name" missing`,
    });
  } else if (!SAFE_ID_RE.test(name)) {
    problems.push({
      code: SkillLintCode.NAME_INVALID,
      severity: "error",
      file: rel,
      field: "name",
      message: `name "${name}" must match ${String(SAFE_ID_RE)} (lowercase letters/digits/hyphen, leading letter)`,
    });
  }

  const dirName = path.basename(path.dirname(filePath));
  if (typeof name === "string" && name.trim().length > 0 && name !== dirName) {
    problems.push({
      code: SkillLintCode.NAME_MISMATCH,
      severity: "error",
      file: rel,
      field: "name",
      message: `frontmatter name "${name}" does not match directory name "${dirName}"`,
    });
  }

  const description = record.description;
  if (description === undefined || description === null) {
    problems.push({
      code: SkillLintCode.DESCRIPTION_MISSING,
      severity: "error",
      file: rel,
      field: "description",
      message: `required field "description" missing`,
    });
  } else if (typeof description !== "string" || description.trim().length === 0) {
    problems.push({
      code: SkillLintCode.DESCRIPTION_EMPTY,
      severity: "error",
      file: rel,
      field: "description",
      message: `field "description" must be a non-empty string`,
    });
  } else if (description.length > descriptionMax) {
    problems.push({
      code: SkillLintCode.DESCRIPTION_TOO_LONG,
      severity: "warning",
      file: rel,
      field: "description",
      message: `description is ${description.length} chars (advisory cap ${descriptionMax}; agentskills suggests keeping it short)`,
    });
  }

  for (const key of STRING_ARRAY_KEYS) {
    const v = record[key];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "string")) {
      problems.push({
        code: SkillLintCode.FIELD_INVALID,
        severity: "error",
        file: rel,
        field: key,
        message: `field "${key}" must be a non-empty array of strings`,
      });
    }
  }
  for (const key of STRING_KEYS) {
    const v = record[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" || v.trim().length === 0) {
      problems.push({
        code: SkillLintCode.FIELD_INVALID,
        severity: "error",
        file: rel,
        field: key,
        message: `field "${key}" must be a non-empty string`,
      });
    }
  }
  const metadata = record.metadata;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      problems.push({
        code: SkillLintCode.FIELD_INVALID,
        severity: "error",
        file: rel,
        field: "metadata",
        message: `field "metadata" must be a YAML mapping`,
      });
    }
  }
}

function runCli(argv: string[]): number {
  const target = argv[2] ?? ".";
  const result = checkSkillsDir(target);
  for (const p of result.problems) {
    const loc = [p.file, p.field].filter(Boolean).join(" · ");
    process.stdout.write(
      `[skill-lint] ${p.severity.toUpperCase()}: ${p.code}: ${loc ? `${loc}: ` : ""}${p.message}\n`,
    );
  }
  const errors = result.problems.filter((p) => p.severity === "error").length;
  if (result.problems.length === 0) {
    process.stdout.write(`[skill-lint] OK: ${result.files.length} SKILL.md file(s) checked\n`);
  } else {
    process.stdout.write(
      `[skill-lint] ${result.problems.length} problem(s), ${errors} error(s) over ${result.files.length} file(s)\n`,
    );
  }
  return errors > 0 ? 1 : 0;
}

// CLI entry: only when this module is executed directly (not when imported).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli(process.argv));
}
