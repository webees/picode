import { test } from "node:test";
import assert from "node:assert/strict";
import { allTools } from "./registry.js";

test("tool surface: >=55 tools, unique names, well-shaped schemas", () => {
  const tools = allTools();
  const names = new Set(tools.map((t) => t.name));
  assert.equal(names.size, tools.length, "tool names must be unique");
  assert.ok(tools.length >= 55, `expected >= 55 tools, got ${tools.length}`);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 0, `${t.name}: description required`);
    assert.equal(t.inputSchema.type, "object", `${t.name}: inputSchema type=object`);
    const props = (t.inputSchema.properties ?? {}) as Record<string, unknown>;
    assert.ok(Object.keys(props).length > 0, `${t.name}: at least one property`);
  }
});

test("management surface covers the lifecycle verbs", () => {
  const names = new Set(allTools().map((t) => t.name));
  for (const n of [
    "init_run", "board_view", "run_status",
    "goal_set_status", "goal_set_product_acceptance",
    "chunk_add", "brief_draft", "brief_approve",
    "staffing_request", "staffing_draft_personas", "staffing_check", "staffing_approve", "staffing_scores",
    "task_prepare", "task_dissolve",
    "session_roster", "session_register", "session_wake_direct", "session_sleep_direct", "session_terminate",
    "evidence_submit", "handoff_package", "handoff_ack",
    "merge_enqueue", "merge_process",
    "memory_brief_write", "memory_brief_ack", "change_order_create", "knowledge_ingest",
    "evolve_write_paths", "evolve_log",
    "self_drive_tick", "self_drive_events", "progress_sweep",
  ]) {
    assert.ok(names.has(n), `management tool missing: ${n}`);
  }
});

test("execution surface carries the 20 spec-09 tools", () => {
  const names = new Set(allTools().map((t) => t.name));
  for (const n of [
    "bus_post", "bus_history", "repo_read", "repo_write", "repo_glob", "repo_grep",
    "git_status", "git_diff", "git_log", "git_commit", "run_allowlisted",
    "web_search", "web_fetch", "request_info", "request_cross_room",
    "progress_report", "state_read", "session_wake", "session_sleep", "session_list",
  ]) {
    assert.ok(names.has(n), `execution tool missing: ${n}`);
  }
});

test("execution tools accept transport params (_run_id/_agent_id/...)", () => {
  const busPost = allTools().find((t) => t.name === "bus_post");
  assert.ok(busPost, "bus_post present");
  const props = (busPost!.inputSchema.properties ?? {}) as Record<string, unknown>;
  for (const k of ["_run_id", "_agent_id", "_token", "_tool_profile", "_cwd", "_write_paths"]) {
    assert.ok(k in props, `bus_post transport param missing: ${k}`);
  }
  const required = (busPost!.inputSchema.required ?? []) as string[];
  assert.ok(required.includes("_agent_id"), "bus_post requires _agent_id");
  assert.ok(required.includes("room"), "bus_post keeps tool params required");
});
