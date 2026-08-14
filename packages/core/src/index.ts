/**
 * @picode/core — public API surface (方向 B3: export governance).
 *
 * Only the documented public API is re-exported here; internal helpers that
 * other packages need are the exception (marked below). Everything else in
 * `src/` (DEFAULTS, deepMerge, isPlainObject, …) stays module-private.
 */
// config schema / defaults / validation / display
export * from "./config.js";
// config loading layer (file I/O + layered merge, 13 §2)
export * from "./loader.js";
// paths & worktree helpers
export * from "./paths.js";
// atomic writes + flock (used by every store)
export * from "./atomic.js";
// YAML state-file helpers (store pattern, 方向 B2)
export * from "./yaml-io.js";
// unified error registry (方向 A2)
export * from "./errors.js";
// tool profiles (09 matrix)
export * from "./tool-profiles.js";
// session state machine (17 §4)
export * from "./session.js";
// persona schema + people-qa dimensions (17 §6)
export * from "./persona.js";
// persona/triad naming (16 §8)
export * from "./naming.js";
// self-evolution write-path policy (19)
export * from "./evolve.js";
// skill harness core (D082): skills_root discovery/index/persona declarations
export * from "./skills.js";
// decision ledger lint (D090): DECISIONS numbering integrity + watermark consistency
export * from "./validate/decision-lint.js";
