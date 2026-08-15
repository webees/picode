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

// ---------------------------------------------------------------------------
// B 按需 skill 加载（C2）：loadSkill —— 按 discoverSkills 索引解析 SKILL.md 完整
// body + 健康校验 + 体积上限/截断。双轨明界：加载结果仅回调用方（工具结果），
// 绝不注入 persona 系统提示（与 persona skills[] 声明并存、不重复注入）。
// 错误为工具内联结构化 code（SkillLoadCode），不进 ErrorCode 枚举（errors.ts 归 C3）。
// ---------------------------------------------------------------------------

/** 单次加载 body 默认上限（字符数；env PICODE_SKILL_MAX_BYTES 可覆盖，无 config 键）。 */
export const DEFAULT_SKILL_MAX_BYTES = 64 * 1024;

/** loadSkill 结构化错误码（工具内联，不进 ErrorCode 枚举）。 */
export const SkillLoadCode = {
  SKILL_NOT_FOUND: "SKILL_NOT_FOUND",
  SKILL_PATH_DENIED: "SKILL_PATH_DENIED",
  SKILL_MD_MISSING: "SKILL_MD_MISSING",
  SKILL_BAD_FRONTMATTER: "SKILL_BAD_FRONTMATTER",
} as const;

export type SkillLoadCode = (typeof SkillLoadCode)[keyof typeof SkillLoadCode];

/** 结构化加载错误：code 为 SkillLoadCode（字符串），skillName 为请求的技能名。 */
export class SkillLoadError extends Error {
  readonly code: SkillLoadCode;
  readonly skillName: string;

  constructor(code: SkillLoadCode, skillName: string, message: string) {
    super(message);
    this.name = "SkillLoadError";
    this.code = code;
    this.skillName = skillName;
  }
}

export interface LoadSkillOptions {
  /** 路径围栏：meta.path 必须落在该目录内（防索引条目逃逸 root）；缺省不做限制。 */
  cwd?: string;
  /** body 上限（字符）；0 = 不限；缺省 DEFAULT_SKILL_MAX_BYTES。 */
  maxBytes?: number;
}

export interface LoadedSkill {
  /** 索引名（与请求 name 匹配）。 */
  name: string;
  /** SKILL.md 完整 body（含 frontmatter；超限时截断为 head 并标注 truncated）。 */
  body: string;
  /** 是否因超限被截断。 */
  truncated: boolean;
  /** 实际生效的上限（字符）。 */
  maxBytes: number;
  /** 截断前的原始 body 字节数。 */
  bytes: number;
  /** SKILL.md 绝对路径。 */
  path: string;
  /** SKILL.md 相对 skills root 路径（posix）。 */
  relPath: string;
}

/**
 * 按 discoverSkills 索引解析单个技能的 SKILL.md 完整 body（单次单技能）。
 * 健康校验：未知名 → SKILL_NOT_FOUND；meta.path 逃逸 cwd → SKILL_PATH_DENIED；
 * 文件缺失/不可读 → SKILL_MD_MISSING；frontmatter 缺失/坏 → SKILL_BAD_FRONTMATTER。
 * 体积上限：超过 maxBytes 截断到 head 并置 truncated=true（byte 感知，不劈多字节字符）。
 */
export function loadSkill(
  name: string,
  metas: SkillMeta[],
  options: LoadSkillOptions = {},
): LoadedSkill {
  const target = String(name ?? "").trim();
  const meta = metas.find((m) => m.name === target);
  if (!meta) {
    throw new SkillLoadError(
      SkillLoadCode.SKILL_NOT_FOUND,
      target,
      `skill not found in index: ${target || "(empty)"}`,
    );
  }
  if (options.cwd !== undefined) {
    const root = path.resolve(options.cwd);
    if (meta.path !== root && !meta.path.startsWith(root + path.sep)) {
      throw new SkillLoadError(
        SkillLoadCode.SKILL_PATH_DENIED,
        target,
        `skill path escapes cwd: ${meta.path}`,
      );
    }
  }
  let raw: string;
  try {
    raw = fs.readFileSync(meta.path, "utf8");
  } catch {
    throw new SkillLoadError(
      SkillLoadCode.SKILL_MD_MISSING,
      target,
      `SKILL.md missing or unreadable: ${meta.path}`,
    );
  }
  if (!parseFrontmatter(raw)) {
    throw new SkillLoadError(
      SkillLoadCode.SKILL_BAD_FRONTMATTER,
      target,
      `SKILL.md has missing or invalid YAML frontmatter: ${meta.path}`,
    );
  }
  const maxBytes =
    options.maxBytes === undefined
      ? DEFAULT_SKILL_MAX_BYTES
      : Math.max(0, Math.floor(options.maxBytes));
  const bytes = Buffer.byteLength(raw, "utf8");
  let body = raw;
  let truncated = false;
  if (maxBytes > 0 && bytes > maxBytes) {
    body = truncateToMaxBytes(raw, maxBytes);
    truncated = true;
  }
  return {
    name: meta.name,
    body,
    truncated,
    maxBytes,
    bytes,
    path: meta.path,
    relPath: meta.relPath,
  };
}

/** 按字节上限截断字符串，回退到不劈断多字节字符的边界。 */
function truncateToMaxBytes(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString("utf8");
}
