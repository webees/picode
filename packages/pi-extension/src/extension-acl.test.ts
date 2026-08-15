import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issueToken } from "@picode/bus";
import { baseEnv, call, loadExtension, makeRun } from "./extension-harness.js";

/** 本仓工作树根（dist 测试文件上溯三级），内含 skills/engineering/ponytail/SKILL.md。 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("bus_post outside the member ACL is rejected (T04)", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  // a fresh run dir has no members.yaml → no one can post
  const r = await call(tools, "bus_post", { room: "leadership", type: "chat", body: "hi" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "ROOM_POST_DENIED");
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

test("repo_read only reads files inside read/write paths (READ_PATH_DENIED)", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-rw-"));
  fs.writeFileSync(path.join(repo, "secret.txt"), "s3cret\n");
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  // write_paths = ["src/**"] → secret.txt at repo root is outside
  const r = await call(tools, "repo_read", { path: "secret.txt" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "READ_PATH_DENIED");
});

test("repo_write traversal via .. is denied and creates nothing (I7)", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-traverse-"));
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  const r = await call(tools, "repo_write", { path: "../outside.txt", content: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "WRITE_PATH_DENIED");
  assert.ok(!fs.existsSync(path.join(path.dirname(repo), "outside.txt")));
});

// ---- B 按需 skill 加载：skill_load 工具（C2）----

test("skill_load ponytail 返回完整 body（implement.engineer 授权，B1/B3）", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repoRoot,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "implement.engineer",
  });
  const r = await call(tools, "skill_load", { name: "ponytail" });
  assert.equal(r.ok, true);
  const skill = r.skill as { name: string; truncated: boolean; body: string };
  assert.equal(skill.name, "ponytail");
  assert.equal(skill.truncated, false);
  assert.ok(skill.body.includes("# Ponytail"), "full body returned");
  assert.ok(skill.body.includes("The shortest path to done is the right path."));
});

test("skill_load 未授权画像 → TOOL_DENIED（implement.sdet 无 skill_load，B1）", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repoRoot,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "implement.sdet",
  });
  const r = await call(tools, "skill_load", { name: "ponytail" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "TOOL_DENIED");
});

test("skill_load 未知名技能 → SKILL_NOT_FOUND 工具内联 code（不进 ErrorCode 枚举，B1）", async () => {
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repoRoot,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
    PICODE_TOOL_PROFILE: "implement.engineer",
  });
  const r = await call(tools, "skill_load", { name: "ghost-skill" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SKILL_NOT_FOUND");
});
