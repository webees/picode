import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { issueToken } from "@picode/bus";
import picodeExtension from "./index.js";

interface Tool {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

function makeRun(agentId: string): { runsRoot: string; runId: string; token: string } {
  const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-runs-"));
  const runId = "run-test";
  const secret = "test-secret";
  fs.mkdirSync(path.join(runsRoot, runId), { recursive: true });
  fs.writeFileSync(path.join(runsRoot, runId, "secret.txt"), secret, "utf8");
  return { runsRoot, runId, token: issueToken(agentId, secret) };
}

function loadExtension(env: Record<string, string>): Map<string, Tool> {
  const tools = new Map<string, Tool>();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    picodeExtension({
      registerTool: (t: { name: string }) => tools.set(t.name, t as unknown as Tool),
    } as never);
  } finally {
    process.env = saved;
  }
  return tools;
}

async function call(
  tools: Map<string, Tool>,
  name: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; code?: string; [k: string]: unknown }> {
  const tool = tools.get(name);
  assert.ok(tool, `tool ${name} registered`);
  const res = await tool.execute("test-call", params);
  return JSON.parse(res.content[0].text);
}

const baseEnv = {
  PICODE_RUN_ID: "run-test",
  PICODE_RUNS_ROOT: "/tmp",
  PICODE_AGENT_ID: "engineer@task-a",
  PICODE_AGENT_TOKEN: "x",
  PICODE_TOOL_PROFILE: "implement.engineer",
  PICODE_CWD: "",
  PICODE_WRITE_PATHS: JSON.stringify(["src/**"]),
  PICODE_READ_PATHS: JSON.stringify([]),
  PICODE_RUN_ALLOWLIST: JSON.stringify(["npm test"]),
};

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
  const r = await call(tools, "session_wake", {
    agent_id: "ind-res",
    reason: "research",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "COMMAND_FROM_DENIED");
  // nothing was appended to the command queue
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

test("bus_post outside the member ACL is rejected (T04)", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  // leadership members come from createRun; a fresh run dir has no members.yaml
  const r = await call(tools, "bus_post", { room: "leadership", type: "chat", body: "hi" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "ROOM_POST_DENIED");
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

test("repo_write path escape beyond cwd is denied (T05)", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-wt-"));
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const r = await call(tools, "repo_write", { path: "sub/../../escape.txt", content: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "WRITE_PATH_DENIED");
  assert.ok(!fs.existsSync(path.join(path.dirname(repo), "escape.txt")));
});

test("missing PICODE_RUN_ID/RUNS_ROOT yields NO_RUN instead of crashing", async () => {
  // no run dir configured → the extension falls back to "dev-secret"; the token
  // must be valid against it so we pass auth and reach the NO_RUN branch
  const token = issueToken("engineer@task-a", "dev-secret");
  const tools = loadExtension({
    PICODE_AGENT_ID: "engineer@task-a",
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "implement.engineer",
  });
  const r = await call(tools, "bus_post", { room: "leadership", type: "chat", body: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "NO_RUN");
});
