import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ensureDir,
  writeAtomic,
  type EvolveLayer,
  type PicodeConfig,
} from "@picode/core";
import { readGoal } from "./run-store.js";

/**
 * Self-evolution run integration (spec/19-self-evolution.md E-series).
 * Pure orchestration: verify gate (E4), knowledge log (E6), persona guard (E7).
 */

export function isEvolveRun(dir: string): boolean {
  try {
    return readGoal(dir).kind === "self_evolve";
  } catch {
    // state file unreadable (e.g. checkout churn) — treat as delivery, don't
    // let an evolve check break a mechanical merge
    return false;
  }
}

export function hasEvolveLayer(dir: string, layer: EvolveLayer): boolean {
  try {
    return readGoal(dir).evolve?.layers.includes(layer) ?? false;
  } catch {
    return false;
  }
}

export function evolveSpecOf(dir: string): ReturnType<typeof readGoal>["evolve"] {
  return readGoal(dir).evolve;
}

/** E4: run self_evolve.verify_commands before merge; throws on non-zero. */
export function runVerifyCommands(
  repoRoot: string,
  config: PicodeConfig,
): { ok: boolean; output: string } {
  const commands = config.self_evolve.verify_commands;
  const chunks: string[] = [];
  for (const cmd of commands) {
    try {
      const out = execFileSync(cmd, { cwd: repoRoot, shell: true, encoding: "utf8" });
      chunks.push(`$ ${cmd}\n${out}`);
    } catch (e) {
      const err = e instanceof Error ? (e as { stdout?: string; stderr?: string; status?: unknown }).stdout ?? String(e) : String(e);
      chunks.push(`$ ${cmd}\n${err}`);
      return { ok: false, output: chunks.join("\n") };
    }
  }
  return { ok: true, output: chunks.join("\n") };
}

/** E6: knowledge/evolve/<run_id>.md — intent, diff summary, tests, risks. */
export function writeEvolveKnowledgeLog(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  opts: { summary: string; diffSummary?: string; tests?: string; risks?: string },
): string {
  const goal = readGoal(dir);
  const outDir = path.join(
    repoRoot,
    config.paths.knowledge_root,
    "evolve",
  );
  ensureDir(outDir);
  const runId = path.basename(dir);
  const out = path.join(outDir, `${runId}.md`);
  const md =
    `# Evolve ${runId}\n\n` +
    `- goal: ${goal.title}\n` +
    `- kind: ${goal.kind}\n` +
    `- target_repo: ${goal.target_repo ?? ""}\n` +
    `- layers: ${goal.evolve?.layers.join(", ") ?? ""}\n` +
    `- risk: ${goal.evolve?.risk ?? ""}\n` +
    `- baseline: ${goal.evolve?.baseline_ref ?? ""}\n\n` +
    `## Intent\n\n${opts.summary}\n\n` +
    (opts.diffSummary ? `## Diff summary\n\n${opts.diffSummary}\n\n` : "") +
    (opts.tests ? `## Verification\n\n${opts.tests}\n\n` : "") +
    (opts.risks ? `## Remaining risks\n\n${opts.risks}\n` : "");
  writeAtomic(out, md);
  return out;
}
