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

function escapeRegExp(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/\\/g, "/");
  if (g.endsWith("/**")) {
    const base = escapeRegExp(g.slice(0, -3));
    return new RegExp(`^${base}(/.*)?$`);
  }
  const escaped = escapeRegExp(g)
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*");
  return new RegExp(`^${escaped}$`);
}
