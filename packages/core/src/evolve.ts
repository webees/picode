import fs from "node:fs";
import path from "node:path";
import type { EvolveLayer, EvolveGoalSpec, PicodeConfig } from "./config.js";
import { writeAtomic } from "./atomic.js";
import { PicodeError, type ErrorCode } from "./errors.js";

/**
 * C2 write-guard conflict code. Deliberately a module-local constant instead of
 * a registry entry: the ErrorCode registry (errors.ts) lives outside this
 * chunk's write_paths, and the code is only ever thrown by this one function.
 */
const EVOLVE_WRITE_CONFLICT = "EVOLVE_WRITE_CONFLICT" as ErrorCode;

/**
 * Self-evolution helpers (spec/19-self-evolution.md).
 * Pure functions + config-driven write_paths policy; orchestrator owns the
 * run integration (merge gate, knowledge log, people-qa).
 */

/** Layer → write globs (19 §2). Extensible via config; defaults follow spec. */
export function evolveLayerGlobs(layer: EvolveLayer): string[] {
  switch (layer) {
    case "knowledge":
      return ["docs/knowledge/**", "skills/**"];
    case "prompts":
      return [".picode/agents/**", ".picode/prompts/**"];
    case "docs":
      return ["docs/**", "!docs/knowledge/**", "!docs/reference/schemas/**"];
    case "tests":
      return ["packages/**/*.test.*", "packages/**/test/**", "scripts/e2e/**"];
    case "code":
      return ["packages/**", "tsconfig*.json", "package.json"];
    case "policy":
      return ["packages/core/src/config.ts", "docs/reference/decision-catalog.md"];
  }
}

/** Effective layers for a goal: goal.evolve.layers ∩ config.allowed_layers (E2). */
export function effectiveLayers(
  config: PicodeConfig,
  evolve: EvolveGoalSpec,
): EvolveLayer[] {
  const allowed = new Set(config.self_evolve.allowed_layers);
  return evolve.layers.filter((l) => allowed.has(l));
}

/** Split `!`-prefixed exclusion globs from the include globs (P1: 排除语义). */
export function splitEvolveGlobs(globs: string[]): { includes: string[]; excludes: string[] } {
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const g of globs) {
    if (g.startsWith("!")) excludes.push(g.slice(1));
    else includes.push(g);
  }
  return { includes, excludes };
}

/**
 * Write paths generated from goal.evolve.layers (P13 / 19 §4).
 * `!`-prefixed entries and forbidden_paths are EXCLUSIONS: a write path
 * matching any exclusion is refused even when an include glob matches.
 */
export function evolveWritePaths(config: PicodeConfig, evolve: EvolveGoalSpec): string[] {
  const out = new Set<string>();
  for (const layer of effectiveLayers(config, evolve)) {
    for (const glob of evolveLayerGlobs(layer)) out.add(glob);
  }
  // forbidden_paths are exclusion globs — normalize to `!`-prefixed form so
  // every consumer applies the same exclusion semantics (was: literal delete).
  for (const f of evolve.forbidden_paths) {
    out.add(f.startsWith("!") ? f : `!${f}`);
  }
  return [...out];
}

/** E2: every write path must be inside at least one allowed-layer glob and outside every exclusion. */
export function assertEvolveWritePathAllowed(
  config: PicodeConfig,
  evolve: EvolveGoalSpec,
  writePath: string,
): void {
  const allowed = evolveWritePaths(config, evolve);
  const normalized = writePath.replace(/\\/g, "/");
  const { includes, excludes } = splitEvolveGlobs(allowed);
  // 排除优先：命中任一排除 glob（!docs/knowledge/**、forbidden_paths）即拒绝
  for (const ex of excludes) {
    if (simpleGlobMatch(ex.replace(/\/$/, ""), normalized)) {
      throw new Error(`E2: write path "${writePath}" excluded by evolve layer (!${ex})`);
    }
  }
  for (const inc of includes) {
    if (simpleGlobMatch(inc.replace(/\/$/, ""), normalized)) return;
  }
  throw new Error(
    `E2: write path "${writePath}" not inside any evolve layer (${allowed.join(", ") || "none"})`,
  );
}

/** Minimal glob match: `**` (any depth) and `*` (within a segment). */
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

/** 19 §4 MUST: a self_evolve target must be the picode (or declared platform) repo. */
export function assertEvolveTargetRoot(
  repoRoot: string,
  config: PicodeConfig,
): void {
  const markers = config.self_evolve.platform_root_markers;
  if (!markers.length) return;
  const ok = markers.some((marker) => {
    const p = path.join(repoRoot, marker);
    if (!fs.existsSync(p)) return false;
    if (path.basename(marker) === "package.json") {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8")) as { name?: string };
        if (typeof pkg.name === "string" && pkg.name !== "picode") return false;
      } catch {
        return false;
      }
    }
    return true;
  });
  if (!ok) {
    throw new Error(
      "19 §4 MUST: self_evolve target_repo must be the picode monorepo " +
        `(missing platform marker: ${markers.join(", ")})`,
    );
  }
}

/** Risk from layers (19 §4: code/policy ⇒ high). */
export function evolveRisk(evolve: EvolveGoalSpec): "low" | "medium" | "high" {
  if (evolve.layers.includes("policy")) return "high";
  if (evolve.layers.includes("code")) return "high";
  return evolve.risk;
}

/**
 * C2 write-guard (19 E6): guarded write for the shared `knowledge/evolve/`
 * log. Compare-and-swap over writeAtomic — capture the file's current content
 * as baseline, and if the caller's `expectedBaseline` no longer matches (a
 * concurrent writer changed the file in between) reject with
 * EVOLVE_WRITE_CONFLICT *before* writing. On conflict nothing is touched, so
 * the pre-existing file survives intact (rollback by construction); only a
 * matching baseline gets atomically replaced via temp+rename.
 */
export function withEvolveWriteGuard(
  filePath: string,
  content: string,
  opts: { expectedBaseline?: string } = {},
): void {
  const baseline = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (opts.expectedBaseline !== undefined && baseline !== opts.expectedBaseline) {
    throw new PicodeError(
      EVOLVE_WRITE_CONFLICT,
      `E6 write conflict (EVOLVE_WRITE_CONFLICT) on ${filePath}: ` +
        "current content ≠ expectedBaseline — another writer changed the file; " +
        "write aborted, original content intact",
    );
  }
  writeAtomic(filePath, content);
}
