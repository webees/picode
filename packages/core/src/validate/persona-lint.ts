/**
 * Persona lint (C2): validate `.picode/agents/*.md` role templates.
 *
 * Two checks in one pass:
 *   1. frontmatter completeness — name/description + REQUIRED_PERSONA_DIMENSIONS
 *      (16 §5.1) + optional `success_metrics` (must be a non-empty string[] when
 *      present), name ↔ file-stem consistency.
 *   2. registry consistency — every agents/*.md stem must map to a
 *      config.roles[].id and every enabled role must have a template, modulo
 *      explicit exceptions (default: `sponsor`, the human seat, 17 §10).
 *
 * Data-first design: bad frontmatter / drift never throws a raw error — it
 * returns a structured `PersonaLintResult` so the CLI and CI can branch on
 * stable codes. One file provides both the library entry (`checkPersonasDir`)
 * and the CLI (runs only when this module is the process entry point).
 *
 * Input: pass the repo root (`<repo>`) or the agents dir directly
 * (`<repo>/.picode/agents`); both are resolved to the same result.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { REQUIRED_PERSONA_DIMENSIONS } from "../persona.js";
import { loadConfig } from "../loader.js";

/** Stable machine-readable codes (CI/CLI branch without parsing message text). */
export const PersonaLintCode = {
  AGENTS_DIR_MISSING: "AGENTS_DIR_MISSING",
  FM_MISSING: "FM_MISSING",
  FM_INVALID_YAML: "FM_INVALID_YAML",
  FM_NOT_OBJECT: "FM_NOT_OBJECT",
  FM_FIELD_MISSING: "FM_FIELD_MISSING",
  FM_FIELD_INVALID: "FM_FIELD_INVALID",
  NAME_MISMATCH: "NAME_MISMATCH",
  AGENT_NOT_REGISTERED: "AGENT_NOT_REGISTERED",
  ROLE_WITHOUT_AGENT: "ROLE_WITHOUT_AGENT",
  REGISTRY_LOAD_FAILED: "REGISTRY_LOAD_FAILED",
  REGISTRY_UNAVAILABLE: "REGISTRY_UNAVAILABLE",
} as const;

export type PersonaLintSeverity = "error" | "warning";

export interface PersonaLintProblem {
  code: string;
  severity: PersonaLintSeverity;
  /** agents/*.md file name (when the problem is file-scoped). */
  file?: string;
  /** Frontmatter field involved (when the problem is field-scoped). */
  field?: string;
  message: string;
}

export interface PersonaLintResult {
  ok: boolean;
  problems: PersonaLintProblem[];
  /** .md files checked (relative names under the agents dir). */
  files: string[];
}

export interface PersonaLintOptions {
  /** Explicit role-id registry; bypasses config.yaml discovery (tests). */
  roles?: readonly string[];
  /** Role ids allowed to lack an agent file. Default `["sponsor"]` (human seat). */
  allowRolesWithoutAgent?: readonly string[];
}

/** Persona fields whose YAML shape is a non-empty array of strings. */
const ARRAY_FIELDS = new Set([
  "scope_in",
  "scope_out",
  "skills",
  "write_paths",
  "must_read_refs",
  "forbidden",
]);

type FieldKind = "string" | "string[]";

/** Field → expected YAML shape; `success_metrics` is the optional extra. */
const FIELD_KIND: Record<string, FieldKind> = {};
for (const field of ["name", "description", ...REQUIRED_PERSONA_DIMENSIONS]) {
  FIELD_KIND[field] = ARRAY_FIELDS.has(field) ? "string[]" : "string";
}
FIELD_KIND["success_metrics"] = "string[]";

/** Human seat: no role-template file by design (17 §10 sponsor is always human). */
export const DEFAULT_ROLES_WITHOUT_AGENT = ["sponsor"];

export function checkPersonasDir(dir: string, options: PersonaLintOptions = {}): PersonaLintResult {
  const { agentsDir, repoRoot } = resolveInput(dir);
  const problems: PersonaLintProblem[] = [];

  if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
    problems.push({
      code: PersonaLintCode.AGENTS_DIR_MISSING,
      severity: "error",
      file: agentsDir,
      message: "agents directory not found",
    });
    return { ok: false, problems, files: [] };
  }

  const files = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  for (const file of files) {
    checkAgentFile(path.join(agentsDir, file), problems);
  }

  const registry = resolveRegistry(repoRoot, options.roles, problems);
  if (registry) {
    const allowWithout = options.allowRolesWithoutAgent ?? DEFAULT_ROLES_WITHOUT_AGENT;
    checkRegistryConsistency(
      files.map((f) => f.slice(0, -3)),
      registry,
      allowWithout,
      problems,
    );
  }

  const ok = !problems.some((p) => p.severity === "error");
  return { ok, problems, files };
}

/** Resolve the repo root and the agents dir from either form of input. */
function resolveInput(dir: string): { agentsDir: string; repoRoot: string | null } {
  if (fs.existsSync(path.join(dir, ".picode", "config.yaml"))) {
    return { agentsDir: path.join(dir, ".picode", "agents"), repoRoot: dir };
  }
  const asRepo = path.join(dir, ".picode", "agents");
  if (fs.existsSync(asRepo) && fs.statSync(asRepo).isDirectory()) {
    return { agentsDir: asRepo, repoRoot: dir };
  }
  return { agentsDir: dir, repoRoot: findRepoRoot(dir) };
}

/** Walk up from `from` until a `.picode/config.yaml` is found. */
function findRepoRoot(from: string): string | null {
  let cur = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(cur, ".picode", "config.yaml"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/** Build the role registry: explicit option > config.yaml > unavailable. */
function resolveRegistry(
  repoRoot: string | null,
  explicit: readonly string[] | undefined,
  problems: PersonaLintProblem[],
): Set<string> | null {
  if (explicit) return new Set(explicit);
  if (!repoRoot) {
    problems.push({
      code: PersonaLintCode.REGISTRY_UNAVAILABLE,
      severity: "warning",
      message: "no .picode/config.yaml found up the tree; registry drift check skipped",
    });
    return null;
  }
  try {
    const roles = loadConfig(repoRoot).roles
      .filter((r) => r.enabled !== false)
      .map((r) => r.id);
    return new Set(roles);
  } catch (e) {
    problems.push({
      code: PersonaLintCode.REGISTRY_LOAD_FAILED,
      severity: "error",
      message: `failed to load config roles: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
}

function checkAgentFile(filePath: string, problems: PersonaLintProblem[]): void {
  const file = path.basename(filePath);
  const stem = file.slice(0, -3);
  const raw = fs.readFileSync(filePath, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?[\s\S]*$/);
  if (!m) {
    problems.push({
      code: PersonaLintCode.FM_MISSING,
      severity: "error",
      file,
      message: "no YAML frontmatter block",
    });
    return;
  }
  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(m[1]);
  } catch (e) {
    problems.push({
      code: PersonaLintCode.FM_INVALID_YAML,
      severity: "error",
      file,
      message: `frontmatter YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
    problems.push({
      code: PersonaLintCode.FM_NOT_OBJECT,
      severity: "error",
      file,
      message: "frontmatter must be a YAML mapping",
    });
    return;
  }
  const record = frontmatter as Record<string, unknown>;

  for (const [field, kind] of Object.entries(FIELD_KIND)) {
    const required = field !== "success_metrics";
    checkField(file, field, kind, required, record[field], problems);
  }

  const name = record.name;
  if (typeof name === "string" && name.trim().length > 0 && name !== stem) {
    problems.push({
      code: PersonaLintCode.NAME_MISMATCH,
      severity: "error",
      file,
      field: "name",
      message: `frontmatter name "${name}" does not match file stem "${stem}"`,
    });
  }
}

function checkField(
  file: string,
  field: string,
  kind: FieldKind,
  required: boolean,
  value: unknown,
  problems: PersonaLintProblem[],
): void {
  if (value === undefined || value === null) {
    if (required) {
      problems.push({
        code: PersonaLintCode.FM_FIELD_MISSING,
        severity: "error",
        file,
        field,
        message: `required field "${field}" missing`,
      });
    }
    return;
  }
  if (kind === "string") {
    if (typeof value === "string" && value.trim().length > 0) return;
    if (typeof value === "string") {
      problems.push({
        code: PersonaLintCode.FM_FIELD_MISSING,
        severity: "error",
        file,
        field,
        message: `required field "${field}" is empty`,
      });
    } else {
      problems.push({
        code: PersonaLintCode.FM_FIELD_INVALID,
        severity: "error",
        file,
        field,
        message: `field "${field}" must be a non-empty string`,
      });
    }
    return;
  }
  // string[]
  if (Array.isArray(value)) {
    if (value.length === 0) {
      problems.push({
        code: required ? PersonaLintCode.FM_FIELD_MISSING : PersonaLintCode.FM_FIELD_INVALID,
        severity: "error",
        file,
        field,
        message: required
          ? `required field "${field}" is empty`
          : `optional field "${field}" must be a non-empty array of strings when present`,
      });
      return;
    }
    if (value.every((x) => typeof x === "string")) return;
  }
  problems.push({
    code: PersonaLintCode.FM_FIELD_INVALID,
    severity: "error",
    file,
    field,
    message: `field "${field}" must be an array of strings`,
  });
}

/** Drift checks: agents dir ↔ role registry, both directions. */
function checkRegistryConsistency(
  stems: string[],
  registry: Set<string>,
  allowWithout: readonly string[],
  problems: PersonaLintProblem[],
): void {
  for (const stem of stems) {
    if (!registry.has(stem)) {
      problems.push({
        code: PersonaLintCode.AGENT_NOT_REGISTERED,
        severity: "error",
        file: `${stem}.md`,
        message: `agent file has no matching config.roles[].id "${stem}"`,
      });
    }
  }
  for (const role of registry) {
    if (allowWithout.includes(role)) continue;
    if (!stems.includes(role)) {
      problems.push({
        code: PersonaLintCode.ROLE_WITHOUT_AGENT,
        severity: "error",
        message: `config role "${role}" has no .picode/agents/${role}.md`,
      });
    }
  }
}

function runCli(argv: string[]): number {
  const target = argv[2] ?? ".";
  const result = checkPersonasDir(target);
  for (const p of result.problems) {
    const loc = [p.file, p.field].filter(Boolean).join(" · ");
    process.stdout.write(
      `[persona-lint] ${p.severity.toUpperCase()}: ${p.code}: ${loc ? `${loc}: ` : ""}${p.message}\n`,
    );
  }
  const errors = result.problems.filter((p) => p.severity === "error").length;
  if (result.problems.length === 0) {
    process.stdout.write(`[persona-lint] OK: ${result.files.length} agent file(s) checked\n`);
  } else {
    process.stdout.write(
      `[persona-lint] ${result.problems.length} problem(s), ${errors} error(s) over ${result.files.length} file(s)\n`,
    );
  }
  return errors > 0 ? 1 : 0;
}

// CLI entry: only when this module is executed directly (not when imported).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli(process.argv));
}
