import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { baseEnv, call, loadExtension, makeRun, tmpRepo } from "./extension-harness.js";

test("run_allowlisted enforces token-boundary allowlist (13 §6.1)", async () => {
  const repo = tmpRepo();
  // keep baseEnv's agent id (engineer@task-a) so the issued token passes auth
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_TOOL_PROFILE: "implement.sdet", // sdet MAY run_allowlisted (spec 09)
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const denied = await call(tools, "run_allowlisted", { cmd: "rm -rf /" });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "COMMAND_NOT_ALLOWLISTED");
  // bypass attempt: `npm test-ci` must NOT match allowlist entry `npm test`
  // (no whitespace after the entry → boundary violation)
  const bypass = await call(tools, "run_allowlisted", { cmd: "npm test-ci" });
  assert.equal(bypass.code, "COMMAND_NOT_ALLOWLISTED");
  // `npm test -- --x` IS allowed by 13 §6.1 ("entry + whitespace prefix"):
  // it runs npm with extra args (and fails here only because the tmp repo has
  // no package.json)
  const withArgs = await call(tools, "run_allowlisted", { cmd: "npm test -- --x" });
  assert.equal(withArgs.code, "COMMAND_FAILED");
  // allowed token-boundary form (npm test will fail to find package.json — fine)
  const ran = await call(tools, "run_allowlisted", { cmd: "npm test" });
  assert.equal(ran.ok, false);
  assert.equal(ran.code, "COMMAND_FAILED");
});

test("state_read whitelists state files and denies others", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  // secret.txt is not in the state whitelist → STATE_DENIED
  const secret = await call(tools, "state_read", { rel: "secret.txt" });
  assert.equal(secret.ok, false);
  assert.equal(secret.code, "STATE_DENIED");
  const bad = await call(tools, "state_read", { rel: "../secret.txt" });
  assert.equal(bad.code, "STATE_DENIED");
  const goals = await call(tools, "state_read", { rel: "goal.yaml" });
  assert.ok(goals.code === "NOT_FOUND" || goals.ok === true);
  // brief files under tasks/<id>/brief/* are whitelisted
  const brief = await call(tools, "state_read", { rel: "tasks/task-a/brief/WORK_BRIEF.md" });
  assert.ok(brief.code === "NOT_FOUND" || brief.ok === true);
});

test("session_wake from a non-sess-mgr agent is rejected (COMMAND_FROM_DENIED, D028)", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  // sess-mgr profile (has session_wake) but the token belongs to engineer@task-a
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_ID: "engineer@task-a",
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "governance.sess-mgr",
  });
  const r = await call(tools, "session_wake", { agent_id: "ind-res", reason: "research" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "COMMAND_FROM_DENIED");
  const queue = path.join(runsRoot, runId, "session_commands.jsonl");
  assert.ok(!fs.existsSync(queue), "no command queued for non-sess-mgr");
});

test("sess-mgr session_wake appends to the command queue", async () => {
  const { runsRoot, runId, token } = makeRun("sess-mgr");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_ID: "sess-mgr",
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "governance.sess-mgr",
  });
  const r = await call(tools, "session_wake", { agent_id: "ind-res", reason: "intake" });
  assert.equal(r.ok, true);
  const queued = (r as unknown as { queued: { from: string; action: string } }).queued;
  assert.equal(queued.from, "sess-mgr");
  assert.equal(queued.action, "wake");
  const lines = fs
    .readFileSync(path.join(runsRoot, runId, "session_commands.jsonl"), "utf8")
    .trim()
    .split("\n");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('"from":"sess-mgr"'));
});
