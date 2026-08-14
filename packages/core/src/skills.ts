/**
 * Skill harness core (D082): `paths.skills_root` activation + discovery + index.
 *
 * Pure-ish module: directory walking and SKILL.md frontmatter parsing only —
 * no side effects beyond fs reads. Provides the pieces C2 (persona skills[]
 * wiring) consumes:
 *   · resolveSkillsRoot(repoRoot, config)  — resolve paths.skills_root
 *   · discoverSkills(root)                 — scan for SKILL.md → SkillMeta[]
 *   · buildSkillIndex(metas, opts)         — metadata-layer text (name: desc (path))
 *   · personaDeclaredSkills(file, metas)   — parse persona frontmatter skills[]
 *
 * The metadata layer is bounded (buildSkillIndex max truncation) so the
 * startup system prompt carries a compact directory, never SKILL.md bodies
 * (D082-4 progressive disclosure: metadata → instructions → resources).
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { PicodeConfig } from "./config.js";

/** A discovered skill: metadata extracted from one SKILL.md under the root. */
export interface SkillMeta {
  /** frontmatter `name`; falls back to the skill directory name when absent. */
  name: string;
  /** frontmatter `description`; empty when absent. */
  description: string;
  /** Absolute path to the SKILL.md file. */
  path: string;
  /** SKILL.md path relative to the skills root (posix separators). */
  relPath: string;
  /** Name of the directory containing SKILL.md. */
  dir: string;
}

/** A skill declared in a persona frontmatter, reconciled against a catalog. */
export interface SkillDeclaration {
  /** Declared skill name (persona frontmatter skills[] entry). */
  name: string;
  /** True when a matching skill directory exists in the catalog. */
  available: boolean;
  /** Absolute SKILL.md path when available; null for unknown names. */
  path: string | null;
}

/** Regex used to extract the YAML frontmatter block (mirrors persona-lint). */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?[\s\S]*$/;

/** True when the input looks like an absolute or escaping path. */
export function isUnsafePath(p: string): boolean {
  if (p.trim() === "") return true;
  if (/^[\\/]/.test(p)) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.split(/[\\/]+/).includes("..")) return true;
  return false;
}

/** Resolve the skills root from a repo root and config (paths.skills_root). */
export function resolveSkillsRoot(repoRoot: string, config: PicodeConfig): string {
  return path.resolve(repoRoot, config.paths.skills_root);
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return null;
  try {
    const v = YAML.parse(m[1]);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse `name`/`description` from a SKILL.md frontmatter (best effort). */
function readSkillSummary(skillMdPath: string): Pick<SkillMeta, "name" | "description"> {
  const dir = path.basename(path.dirname(skillMdPath));
  let raw = "";
  try {
    raw = fs.readFileSync(skillMdPath, "utf8");
  } catch {
    return { name: dir, description: "" };
  }
  const fm = parseFrontmatter(raw);
  const name = fm && typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : dir;
  const description =
    fm && typeof fm.description === "string" ? fm.description.trim() : "";
  return { name, description };
}

/**
 * Scan `root` recursively for SKILL.md files (any depth) and build a
 * metadata catalog. Missing/empty roots yield []. Results sorted by path.
 */
export function discoverSkills(root: string): SkillMeta[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const out: SkillMeta[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "SKILL.md") {
        const { name, description } = readSkillSummary(full);
        out.push({
          name,
          description,
          path: full,
          relPath: toPosix(path.relative(root, full)),
          dir: path.basename(path.dirname(full)),
        });
      }
    }
  };
  walk(root);
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export interface SkillIndexOptions {
  /** Max catalog entries to include; 0 = unlimited. */
  max?: number;
}

/**
 * Render the metadata-layer text: one line per skill
 * `name: description (relPath)`. `max` truncates (progressive disclosure:
 * startup prompt gets a bounded directory). An ellipsis line reports the
 * number of omitted entries.
 */
export function buildSkillIndex(metas: SkillMeta[], opts: SkillIndexOptions = {}): string {
  const max = opts.max ?? 0;
  const shown = max > 0 ? metas.slice(0, max) : metas;
  const lines = shown.map((m) => `${m.name}: ${m.description} (${m.relPath})`);
  if (max > 0 && metas.length > max) {
    lines.push(`… and ${metas.length - max} more skill(s)`);
  }
  return lines.join("\n");
}

/**
 * Parse `skills[]` declared in a persona file's frontmatter (instance persona
 * `tasks/<id>/personas/<seat>.md`, or platform seats' `.picode/agents/<role>.md`),
 * then reconcile each declared name against the discovered catalog. Unknown
 * names are marked `available: false` (never throw). Missing file → [].
 */
export function personaDeclaredSkills(
  personaFile: string,
  metas: SkillMeta[] = [],
): SkillDeclaration[] {
  if (!fs.existsSync(personaFile)) return [];
  let raw = "";
  try {
    raw = fs.readFileSync(personaFile, "utf8");
  } catch {
    return [];
  }
  const fm = parseFrontmatter(raw);
  const rawSkills = fm?.skills;
  const declared: string[] = [];
  if (typeof rawSkills === "string" && rawSkills.trim()) {
    declared.push(rawSkills.trim());
  } else if (Array.isArray(rawSkills)) {
    for (const s of rawSkills) {
      if (typeof s === "string" && s.trim()) declared.push(s.trim());
    }
  }
  if (declared.length === 0) return [];
  const byName = new Map<string, SkillMeta>();
  for (const m of metas) byName.set(m.name, m);
  return declared.map((name) => {
    const hit = byName.get(name);
    return hit
      ? { name, available: true, path: hit.path }
      : { name, available: false, path: null };
  });
}
