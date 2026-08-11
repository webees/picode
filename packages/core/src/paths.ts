import path from "node:path";
import type { PicodeConfig } from "./config.js";

export function runsRoot(repoRoot: string, config: PicodeConfig): string {
  return path.resolve(repoRoot, config.paths.runs_root);
}

export function runDir(repoRoot: string, config: PicodeConfig, runId: string): string {
  return path.join(runsRoot(repoRoot, config), runId);
}

export function worktreePath(
  repoRoot: string,
  config: PicodeConfig,
  runId: string,
  taskId: string,
): string {
  return path.resolve(repoRoot, config.git.worktree_root, runId, taskId);
}

export function branchName(config: PicodeConfig, runId: string, taskId: string): string {
  return config.git.branch_template
    .replaceAll("{run_id}", runId)
    .replaceAll("{task_id}", taskId);
}

export function matchGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((p) => globToRegExp(p).test(normalized));
}

/** Regex metacharacters that must be escaped to match a glob segment literally. */
const GLOB_ESCAPE_RE = /[.+^${}()|[\]\\]/g;
/** Trailing double-glob suffix (`/...` can span any depth). */
const DOUBLE_GLOB_SUFFIX = "/**";
/** Stand-in for `**` so single `*` is expanded first (double-glob must survive it). */
const DOUBLE_GLOB_PLACEHOLDER = "§§";

function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/\\/g, "/");
  if (g.endsWith(DOUBLE_GLOB_SUFFIX)) {
    const base = g.slice(0, -DOUBLE_GLOB_SUFFIX.length).replace(GLOB_ESCAPE_RE, "\\$&");
    return new RegExp(`^${base}(/.*)?$`);
  }
  const escaped = g
    .replace(GLOB_ESCAPE_RE, "\\$&")
    .replace(/\*\*/g, DOUBLE_GLOB_PLACEHOLDER)
    .replace(/\*/g, "[^/]*")
    .replaceAll(DOUBLE_GLOB_PLACEHOLDER, ".*");
  return new RegExp(`^${escaped}$`);
}
