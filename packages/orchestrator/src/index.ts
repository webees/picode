/**
 * @picode/orchestrator — public API surface (export governance, 方向 B3).
 *
 * Only the documented public API is re-exported here; internal helpers stay
 * module-private. The full store/mechanism layer is exported so programmatic
 * consumers (the MCP server, scripts, tests) can call state functions
 * directly — locks and atomic writes are built into every store.
 *
 * Exported groups:
 *   - run lifecycle: run-store (goal/run/chunks/secret/rooms), task pipeline
 *   - sessions: session-store + unified wake/sleep/terminate (pi-adapter)
 *   - gates: closure (evidence/handoff/dissolve), merge, staffing, hr-score
 *   - memory: memory.ts (change orders / knowledge), docs-memory (briefs)
 *   - mechanics: rules-engine, self-drive, evolve-run, board, status,
 *     progress, window-store
 */
// run lifecycle
export * from "./run-store.js";
export * from "./task.js";
// sessions
export * from "./session-store.js";
export * from "./pi-adapter.js";
// transcription (P4)
export * from "./transcript-store.js";
// gates
export * from "./closure.js";
export * from "./merge.js";
export * from "./staffing.js";
export * from "./hr-score.js";
export * from "./hr-talent.js";
// memory
export * from "./memory.js";
export * from "./docs-memory.js";
// mechanics
export * from "./rules-engine.js";
export * from "./self-drive.js";
export * from "./evolve-run.js";
export * from "./board.js";
export * from "./status.js";
export * from "./progress.js";
export * from "./window-store.js";
