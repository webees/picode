/**
 * Config loading layer (方向 B1): file I/O + layered merge.
 *
 * Kept separate from `config.js` so the schema/types/defaults/validation core
 * stays pure (no node:fs / yaml side effects) — testable in isolation and
 * reusable in non-filesystem environments. `loadConfig` performs the layered
 * merge (13 §2: DEFAULTS → project → profile → run override) and validates
 * the *final* merged result, so a run-level override can never downgrade a
 * v1-fixed value (D3).
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { DEFAULTS, deepMerge, validateConfig, type PicodeConfig } from "./config.js";

function loadYamlFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return {};
  return YAML.parse(fs.readFileSync(filePath, "utf8")) ?? {};
}

export function loadConfig(repoRoot: string, runId?: string): PicodeConfig {
  const project = loadYamlFile(path.join(repoRoot, ".picode", "config.yaml"));
  let merged = deepMerge(DEFAULTS, project) as PicodeConfig;

  const profile = merged.active_profile;
  if (profile && profile !== "default") {
    const p = loadYamlFile(path.join(repoRoot, ".picode", "profiles", `${profile}.yaml`));
    merged = deepMerge(merged, p) as PicodeConfig;
  }

  if (runId) {
    const o = loadYamlFile(
      path.join(repoRoot, merged.paths.runs_root, runId, "config.override.yaml"),
    );
    merged = deepMerge(merged, o) as PicodeConfig;
  }

  validateConfig(merged);
  return merged;
}
