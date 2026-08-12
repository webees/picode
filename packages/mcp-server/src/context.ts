/**
 * Server-level context: which repo the MCP server operates on, plus an
 * optional default run id. Both come from the server process env so the same
 * server binary serves any picode repo:
 *   PICODE_REPO   — repo root (default: process.cwd())
 *   PICODE_RUN_ID — optional default run (management tools still accept an
 *                   explicit run_id param, which wins).
 */
import path from "node:path";
import { loadConfig } from "@picode/core";
import { resolveRunDir } from "@picode/orchestrator";
import { PicodeError, ErrorCode } from "@picode/core";

export interface ServerEnv {
  repo: string;
  runId?: string;
}

export function resolveServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const repo = env.PICODE_REPO ? path.resolve(env.PICODE_REPO) : process.cwd();
  return { repo, runId: env.PICODE_RUN_ID || undefined };
}

export interface RunContext {
  repo: string;
  dir: string;
  config: ReturnType<typeof loadConfig>;
}

/** Resolve a run context for a management tool call (USAGE when missing). */
export function requireRun(env: ServerEnv, runId: string | undefined): RunContext {
  if (!runId) {
    throw new PicodeError(
      ErrorCode.USAGE,
      "run_id required (or set server env PICODE_RUN_ID)",
    );
  }
  const { dir, config } = resolveRunDir(env.repo, runId);
  return { repo: env.repo, dir, config };
}

/** Runs root (default `.picode/runs`) — mirrors core `runDir` layout. */
export function runsRootOf(env: ServerEnv, runId: string): string {
  const config = loadConfig(env.repo, runId);
  return path.join(env.repo, config.paths.runs_root);
}
