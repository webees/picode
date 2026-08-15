/**
 * Execution surface tests: the 20 pi-extension tools exposed over MCP keep
 * the ACL stack intact — token verification, profile matrix, room ACL,
 * write-path globs, sess-mgr command queue.
 */
import { test } from "node:test";
import { tmpGitRepo, toMcpError } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allTools } from "./registry.js";
import type { ServerEnv } from "./context.js";

async function call(
  name: string,
  params: Record<string, unknown>,
  env: ServerEnv,
): Promise<Record<string, unknown>> {
  const t = allTools().find((x) => x.name === name);
  assert.ok(t, `tool not found: ${name}`);
  try {
    const r = await t!.run(params, env);
    return (r ?? {}) as Record<string, unknown>;
  } catch (e) {
    return toMcpError(e) as unknown as Record<string, unknown>;
  }
}

async function makeRunEnv(title = "exec"): Promise<{ env: ServerEnv; runId: string }> {
  const repo = tmpGitRepo({
    prefix: "picode-mcp-exec-",
    files: { "src/a.ts": "export const a = 1;\n" },
    add: "-A",
  });
  const env: ServerEnv = { repo };
  const init = await call("init_run", { title }, env);
  return { env, runId: String(init.runId) };
}

test("bus_post as run-lead to leadership room succeeds (token auto-issued)", async () => {
  const { env, runId } = await makeRunEnv();
  const res = await call(
    "bus_post",
    {
      _run_id: runId,
      _agent_id: "run-lead",
      room: "leadership",
      type: "chat",
      body: "hello from mcp",
    },
    env,
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  const hist = await call(
    "bus_history",
    { _run_id: runId, _agent_id: "run-lead", room: "leadership", limit: 5 },
    env,
  );
  assert.equal(hist.ok, true);
  const msgs = hist.messages as Array<{ body: string }>;
  assert.ok(msgs.some((m) => m.body === "hello from mcp"), "message landed in bus");
});

test("TOKEN_INVALID: forged token rejected", async () => {
  const { env, runId } = await makeRunEnv();
  const res = await call(
    "bus_post",
    {
      _run_id: runId,
      _agent_id: "run-lead",
      _token: "run-lead.forged.signature",
      room: "leadership",
      type: "chat",
      body: "forged",
    },
    env,
  );
  assert.equal(res.ok, false);
  assert.equal(res.code, "TOKEN_INVALID");
});

test("WRITE_PATH_DENIED: repo_write outside write_paths rejected", async () => {
  const { env, runId } = await makeRunEnv();
  const res = await call(
    "repo_write",
    {
      _run_id: runId,
      _agent_id: "engineer@task-a",
      _write_paths: ["src/**"],
      path: "outside.txt",
      content: "x",
    },
    env,
  );
  assert.equal(res.ok, false);
  assert.equal(res.code, "WRITE_PATH_DENIED");
});

test("repo_write inside write_paths lands on disk (worktree semantics)", async () => {
  const { env, runId } = await makeRunEnv();
  const res = await call(
    "repo_write",
    {
      _run_id: runId,
      _agent_id: "engineer@task-a",
      _write_paths: ["src/**"],
      path: "src/new.ts",
      content: "export const b = 2;\n",
    },
    env,
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(fs.existsSync(path.join(env.repo, "src", "new.ts")), "file written under cwd");
});

test("COMMAND_FROM_DENIED: session_wake from non-sess-mgr rejected", async () => {
  const { env, runId } = await makeRunEnv();
  const res = await call(
    "session_wake",
    {
      _run_id: runId,
      _agent_id: "run-lead",
      _tool_profile: "governance.sess-mgr",
      agent_id: "engineer@task-a",
      reason: "test",
    },
    env,
  );
  assert.equal(res.ok, false);
  assert.equal(res.code, "COMMAND_FROM_DENIED");
});

test("session_wake as sess-mgr queues a command", async () => {
  const { env, runId } = await makeRunEnv();
  const res = await call(
    "session_wake",
    {
      _run_id: runId,
      _agent_id: "sess-mgr",
      _tool_profile: "governance.sess-mgr",
      agent_id: "engineer@task-a",
      reason: "test",
    },
    env,
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal((res.queued as { action: string }).action, "wake");
});

test("state_read whitelist: goal.yaml readable, secret.txt denied", async () => {
  const { env, runId } = await makeRunEnv();
  const goal = await call("state_read", { _run_id: runId, _agent_id: "run-lead", rel: "goal.yaml" }, env);
  assert.equal(goal.ok, true);
  const secret = await call("state_read", { _run_id: runId, _agent_id: "run-lead", rel: "secret.txt" }, env);
  assert.equal(secret.ok, false);
  assert.equal(secret.code, "STATE_DENIED");
});

test("run_allowlisted: allowlisted entry runs; non-allowlisted denied", async () => {
  const { env, runId } = await makeRunEnv();
  const denied = await call(
    "run_allowlisted",
    {
      _run_id: runId,
      _agent_id: "sdet@task-a",
      _tool_profile: "implement.sdet",
      _run_allowlist: ["npm test"],
      cmd: "rm -rf /",
    },
    env,
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "COMMAND_NOT_ALLOWLISTED");

  const allowed = await call(
    "run_allowlisted",
    {
      _run_id: runId,
      _agent_id: "sdet@task-a",
      _tool_profile: "implement.sdet",
      _run_allowlist: ["true"],
      cmd: "true",
    },
    env,
  );
  assert.equal(allowed.ok, true, JSON.stringify(allowed));
});
