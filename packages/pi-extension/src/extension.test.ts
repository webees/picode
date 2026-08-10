import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { issueToken } from "@picode/bus";
import picodeExtension from "./index.js";

interface Tool {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Create a fake run dir with a real secret and return env vars. */
function makeRun(agentId: string): { runsRoot: string; runId: string; secret: string; token: string } {
  const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-runs-"));
  const runId = "run-test";
  const secret = "test-secret";
  fs.mkdirSync(path.join(runsRoot, runId), { recursive: true });
  fs.writeFileSync(path.join(runsRoot, runId, "secret.txt"), secret, "utf8");
  const token = issueToken(agentId, secret);
  return { runsRoot, runId, secret, token };
}

/** Load the extension against a fake Pi API, capturing registered tools. */
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

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# repo\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
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

test("all 20 spec-09 tools are registered", () => {
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
  ];
  for (const name of expected) assert.ok(tools.has(name), `${name} registered`);
  assert.equal(tools.size, expected.length);
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
  // `**/*.md` does not match top-level files in the current glob semantics,
  // so README.md stays excluded (only write/read paths are visible)
  assert.ok(!matches.includes("README.md"), "README.md outside write/read paths excluded");
});

test("run_allowlisted enforces token-boundary allowlist", async () => {
  const repo = tmpRepo();
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
  const bypass = await call(tools, "run_allowlisted", { cmd: "npm test-ci" });
  assert.equal(bypass.code, "COMMAND_NOT_ALLOWLISTED");
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

test("web_fetch refuses non-http(s) and private hosts", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_TOOL_PROFILE: "research.ind-res",
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const file = await call(tools, "web_fetch", { url: "file:///etc/passwd" });
  assert.equal(file.ok, false);
  assert.equal(file.code, "BAD_URL");
  const loopback = await call(tools, "web_fetch", { url: "http://localhost:8080/x" });
  assert.equal(loopback.code, "URL_BLOCKED");
  const privateIp = await call(tools, "web_fetch", { url: "http://169.254.169.254/latest" });
  assert.equal(privateIp.code, "URL_BLOCKED");
  // bypass variants: IPv4 shorthand, integer form, IPv6 loopback, trailing dot
  const v4short = await call(tools, "web_fetch", { url: "http://127.1/x" });
  assert.equal(v4short.code, "URL_BLOCKED");
  const v4int = await call(tools, "web_fetch", { url: "http://2130706433/x" });
  assert.equal(v4int.code, "URL_BLOCKED");
  const v6 = await call(tools, "web_fetch", { url: "http://[::1]/x" });
  assert.equal(v6.code, "URL_BLOCKED");
  const dot = await call(tools, "web_fetch", { url: "http://localhost./x" });
  assert.equal(dot.code, "URL_BLOCKED");
  // v4-mapped hex form, IPv6 ULA + link-local
  const mappedHex = await call(tools, "web_fetch", { url: "http://[::ffff:7f00:1]/x" });
  assert.equal(mappedHex.code, "URL_BLOCKED");
  const ula = await call(tools, "web_fetch", { url: "http://[fc00::1]/x" });
  assert.equal(ula.code, "URL_BLOCKED");
  const linkLocal = await call(tools, "web_fetch", { url: "http://[fe80::1]/x" });
  assert.equal(linkLocal.code, "URL_BLOCKED");
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

test("T05: repo_write outside write_paths is rejected", async () => {
  const repo = tmpRepo();
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  // write_paths is ["src/**"] → writing outside is denied, no file created
  const out = await call(tools, "repo_write", { path: "out.txt", content: "x" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "WRITE_PATH_DENIED");
  assert.ok(!fs.existsSync(path.join(repo, "out.txt")));
  // traversal attempt is denied too
  const escape = await call(tools, "repo_write", { path: "../escape.txt", content: "x" });
  assert.equal(escape.code, "WRITE_PATH_DENIED");
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
