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

/**
 * Single glob engine for the whole codebase (P1: 原 matchGlob/simpleGlobMatch
 * 两套实现语义分歧 — 双星号前缀须匹配根级文件，标准 glob 语义）。
 *
 * `**` = any depth (0..n segments), `*` = within one segment.
 */
export function simpleGlobMatch(pattern: string, value: string): boolean {
  const p = pattern.replace(/\/\*\*/g, "/__ALL__").replace(/\*\*\//g, "__ALL__/");
  const segments = p.split("/");
  const parts: RegExp[] = segments.map((seg) => {
    if (seg === "__ALL__") return /(?:.*)?/;
    return new RegExp(
      "^" + seg.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    );
  });
  const valueSegs = value.split("/");
  // try to match greedily from the start; `**` can span many segments
  const matches = (vi: number, pi: number): boolean => {
    if (pi === parts.length) return vi === valueSegs.length;
    if (parts[pi].source === "(?:.*)?") {
      for (let k = vi; k <= valueSegs.length; k++) {
        if (matches(k, pi + 1)) return true;
      }
      return false;
    }
    if (vi >= valueSegs.length) return false;
    if (!parts[pi].test(valueSegs[vi])) return false;
    return matches(vi + 1, pi + 1);
  };
  return matches(0, 0);
}

export function matchGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((p) => simpleGlobMatch(p, normalized));
}
