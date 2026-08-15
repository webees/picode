import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { baseEnv, call, loadExtension, makeRun, tmpRepo } from "./extension-harness.js";

test("all 21 spec-09 tools are registered", () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const expected = [
    "bus_post", "bus_history", "repo_read", "repo_write", "repo_glob", "repo_grep",
    "git_status", "git_diff", "git_log", "git_commit", "run_allowlisted",
    "web_search", "web_fetch", "request_info", "request_cross_room",
    "progress_report", "state_read", "session_wake", "session_sleep", "session_list",
    "skill_load",
  ];
  for (const name of expected) assert.ok(tools.has(name), `${name} registered`);
  assert.equal(tools.size, expected.length);
});

test("T03: bus post without a valid token is rejected", async () => {
  const { runsRoot, runId } = makeRun("engineer@task-a");
  // token missing entirely → TOKEN_INVALID (not silently accepted)
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: "",
  });
  const r = await call(tools, "bus_post", {
    room: "leadership",
    type: "chat",
    body: "hi",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "TOKEN_INVALID");
});

test("T09: web_fetch is denied to non-research profiles", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_TOOL_PROFILE: "implement.engineer", // no web in 09 matrix
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const r = await call(tools, "web_fetch", { url: "https://example.com/x" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "TOOL_DENIED");
});

test("tools outside the profile are denied with TOOL_DENIED (09 matrix)", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  // proc-audit profile has no run_allowlisted / web tools
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "governance.proc-audit",
  });
  const r = await call(tools, "run_allowlisted", { cmd: "npm test" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "TOOL_DENIED");
});

test("repo_glob only lists files inside write/read paths", async () => {
  const repo = tmpRepo();
  fs.writeFileSync(path.join(repo, "out.txt"), "x\n"); // outside src/**
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const r = await call(tools, "repo_glob", { pattern: "**/*" });
  assert.equal(r.ok, true);
  const matches = (r as unknown as { matches: string[] }).matches;
  assert.ok(matches.includes("src/a.ts"), "src/a.ts matched");
  assert.ok(!matches.includes("out.txt"), "out.txt outside write_paths excluded");
  // `**/*.md` matches root-level files under standard glob semantics (P1 统一) —
  // 文档必读，README.md 属于允许读集
  assert.ok(matches.includes("README.md"), "README.md matches **/*.md (unified glob semantics)");
});
