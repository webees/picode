import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ApprovalStore } from "@picode/core";
import { baseEnv, call, loadExtension, makeRun, tmpRepo } from "./extension-harness.js";

function setup(over: Record<string, string> = {}) {
  const repo = tmpRepo();
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_CWD: repo,
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
    PICODE_TASK_ID: "task-a",
    ...over,
  });
  return { repo, runsRoot, runId, tools };
}

function approvalsDir(runsRoot: string, runId: string): string {
  return path.join(runsRoot, runId, "approvals");
}

function pendingFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^pending-.*\.json$/.test(f));
}

test("E1: read-only 拒一切写（含 write_paths 内）— SANDBOX_DENIED 含生效 mode", async () => {
  const { repo, tools } = setup({ PICODE_SANDBOX_MODE: "read-only" });
  const before = fs.readFileSync(path.join(repo, "src", "a.ts"), "utf8");
  const r = await call(tools, "repo_write", { path: "src/a.ts", content: "export const a = 2;\n" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SANDBOX_DENIED");
  assert.equal(r.mode, "read-only", "结构化拒绝携带生效 mode");
  assert.ok(String(r.message).includes("[sandbox: file access denied under read-only mode]"));
  assert.equal(fs.readFileSync(path.join(repo, "src", "a.ts"), "utf8"), before, "文件未被改动");
});

test("E4: workspace-write（默认）白名单内新建文件可写 — 语义不变", async () => {
  const { repo, tools } = setup();
  const r = await call(tools, "repo_write", { path: "src/new.ts", content: "export const n = 1;\n" });
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(path.join(repo, "src", "new.ts")));
});

test("E1: 越界写无授权 → WRITE_PATH_DENIED 结构化拒绝（含生效 mode + 升级提示）", async () => {
  const { tools } = setup();
  const r = await call(tools, "repo_write", { path: "outside.txt", content: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "WRITE_PATH_DENIED");
  assert.equal(r.mode, "workspace-write", "拒绝携带生效 mode");
  assert.ok(String(r.message).includes("[sandbox: file access denied under workspace-write mode]"));
  assert.ok(String(r.message).includes("sandbox_permissions"));
});

test("E2: 无理由升级 → ESCALATION_MALFORMED（结构化 malformed 拒绝）", async () => {
  const { tools } = setup();
  // 只给 permission 不给 justification
  const r1 = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
  });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, "ESCALATION_MALFORMED");
  // 只给 justification 不给 permission
  const r2 = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    justification: "please",
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.code, "ESCALATION_MALFORMED");
  // 空白理由
  const r3 = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "   ",
  });
  assert.equal(r3.ok, false);
  assert.equal(r3.code, "ESCALATION_MALFORMED");
});

test("E2: 非法/非更宽升级目标 → 结构化拒绝", async () => {
  const { tools } = setup();
  // 非法 mode 值
  const r1 = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "banana",
    justification: "need it",
  });
  assert.equal(r1.code, "ESCALATION_MALFORMED");
  // 非严格更宽（workspace-write → workspace-write 不变更宽）
  const r2 = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "workspace-write",
    justification: "need it",
  });
  assert.equal(r2.code, "SANDBOX_ESCALATION_INVALID");
});

test("E2: policy never（fail-closed）→ APPROVAL_DENIED 且不落请求", async () => {
  const { runsRoot, runId, tools } = setup({ PICODE_APPROVAL_POLICY: "never" });
  const r = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need it",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "APPROVAL_DENIED");
  assert.equal(pendingFiles(approvalsDir(runsRoot, runId)).length, 0, "never 不落请求文件");
});

test("E2: policy ask — 升级请求落 pending-<id>.json（asked 记录），approval_id 返回", async () => {
  const { runsRoot, runId, tools } = setup();
  const r = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need to write generated fixture",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "APPROVAL_PENDING");
  assert.ok(r.approval_id, "返回 approval_id 供重试");
  const files = pendingFiles(approvalsDir(runsRoot, runId));
  assert.equal(files.length, 1);
  const onDisk = JSON.parse(
    fs.readFileSync(path.join(approvalsDir(runsRoot, runId), files[0]), "utf8"),
  ) as { id: string; status: string; asked: Record<string, unknown> };
  assert.equal(onDisk.id, r.approval_id);
  assert.equal(onDisk.status, "pending");
  assert.equal(onDisk.asked.from_agent, "engineer@task-a");
  assert.equal(onDisk.asked.task_id, "task-a");
  assert.equal(onDisk.asked.path, "outside.txt");
  assert.equal(onDisk.asked.mode, "danger-full-access");
  assert.equal(onDisk.asked.reason, "need to write generated fixture");
  // pending 未决策时重试不放行
  const retry = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need to write generated fixture",
    approval_id: r.approval_id,
  });
  assert.equal(retry.code, "APPROVAL_PENDING");
  assert.ok(!fs.existsSync(path.join(process.cwd(), "outside.txt")), "未授权不写");
});

test("E2: 升级→run-lead 批准→单次放行（allowed-once），重试再验拒绝", async () => {
  const { repo, runsRoot, runId, tools } = setup();
  // 1) ask：请求落盘
  const ask = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "payload",
    sandbox_permissions: "danger-full-access",
    justification: "write generated fixture outside write_paths",
  });
  assert.equal(ask.code, "APPROVAL_PENDING");
  const approvalId = String(ask.approval_id);
  // 2) run-lead 代批（answerer 决策落盘，成对审计）
  const store = new ApprovalStore(path.join(runsRoot, runId));
  const decided = await store.decide(approvalId, {
    decision: "approved",
    by: "run-lead",
    note: "E5 实测：同意一次性放行",
  });
  assert.equal(decided.status, "approved");
  // 3) 重试同一 escalation 参数 + approval_id → 单次放行写入
  const ok = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "payload",
    sandbox_permissions: "danger-full-access",
    justification: "write generated fixture outside write_paths",
    approval_id: approvalId,
  });
  assert.equal(ok.ok, true, "approved 后单次放行");
  assert.equal(fs.readFileSync(path.join(repo, "outside.txt"), "utf8"), "payload");
  // 4) 再重试同一 approval_id → APPROVAL_ALREADY_USED（allowed-once 重试再验）
  const again = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "payload2",
    sandbox_permissions: "danger-full-access",
    justification: "write generated fixture outside write_paths",
    approval_id: approvalId,
  });
  assert.equal(again.ok, false);
  assert.equal(again.code, "APPROVAL_ALREADY_USED");
  // 审计同文件：asked+decided 成对 + used_at
  const files = pendingFiles(approvalsDir(runsRoot, runId));
  assert.equal(files.length, 1);
  const audit = JSON.parse(
    fs.readFileSync(path.join(approvalsDir(runsRoot, runId), files[0]), "utf8"),
  ) as { status: string; decided: { by: string }; used_at: string };
  assert.equal(audit.status, "used");
  assert.equal(audit.decided.by, "run-lead");
  assert.ok(audit.used_at, "used_at 记录消费");
});

test("E2: 升级被拒 → 重试 APPROVAL_REJECTED（fail-closed）", async () => {
  const { runsRoot, runId, tools } = setup();
  const ask = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need it",
  });
  const approvalId = String(ask.approval_id);
  const store = new ApprovalStore(path.join(runsRoot, runId));
  await store.decide(approvalId, { decision: "rejected", by: "run-lead", note: "拒绝" });
  const retry = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need it",
    approval_id: approvalId,
  });
  assert.equal(retry.ok, false);
  assert.equal(retry.code, "APPROVAL_REJECTED");
});

test("E2: 升级重试 approval_id 与请求 path/mode 不符 → 结构化拒绝", async () => {
  const { runsRoot, runId, tools } = setup();
  const ask = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need it",
  });
  const approvalId = String(ask.approval_id);
  const store = new ApprovalStore(path.join(runsRoot, runId));
  await store.decide(approvalId, { decision: "approved", by: "run-lead" });
  // 换路径重试同一 approval_id
  const badPath = await call(tools, "repo_write", {
    path: "other.txt",
    content: "x",
    sandbox_permissions: "danger-full-access",
    justification: "need it",
    approval_id: approvalId,
  });
  assert.equal(badPath.ok, false);
  assert.equal(badPath.code, "SANDBOX_ESCALATION_INVALID");
  // 换 mode 重试同一 approval_id
  const badMode = await call(tools, "repo_write", {
    path: "outside.txt",
    content: "x",
    sandbox_permissions: "workspace-write",
    justification: "need it",
    approval_id: approvalId,
  });
  assert.equal(badMode.ok, false);
  assert.equal(badMode.code, "SANDBOX_ESCALATION_INVALID");
});

test("E1: danger-full-access — 越界写直接放行（工作房内）", async () => {
  const { repo, tools } = setup({ PICODE_SANDBOX_MODE: "danger-full-access" });
  const r = await call(tools, "repo_write", { path: "outside.txt", content: "full" });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(repo, "outside.txt"), "utf8"), "full");
});

test("E3: read-before-edit — 已存在文件未读 → FS_NOT_OBSERVED；repo_read 后放行", async () => {
  const { repo, tools } = setup();
  // 未读直接编辑已存在文件 → 拒绝
  const r1 = await call(tools, "repo_write", { path: "src/a.ts", content: "export const a = 9;\n" });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, "FS_NOT_OBSERVED");
  assert.ok(String(r1.message).includes("read"), "提示先读");
  // repo_read 记录 observed
  const rd = await call(tools, "repo_read", { path: "src/a.ts" });
  assert.equal(rd.ok, true);
  // 已读后编辑放行
  const r2 = await call(tools, "repo_write", { path: "src/a.ts", content: "export const a = 9;\n" });
  assert.equal(r2.ok, true);
  assert.equal(fs.readFileSync(path.join(repo, "src", "a.ts"), "utf8"), "export const a = 9;\n");
});

test("E3: read-before-edit — 新建文件无需先读（createIfAbsent 语义）", async () => {
  const { repo, tools } = setup();
  const r = await call(tools, "repo_write", { path: "src/brand-new.ts", content: "export const b = 1;\n" });
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(path.join(repo, "src", "brand-new.ts")));
});

test("E3: read-before-edit 可关（PICODE_READ_BEFORE_EDIT=0）", async () => {
  const { repo, tools } = setup({ PICODE_READ_BEFORE_EDIT: "0" });
  const r = await call(tools, "repo_write", { path: "src/a.ts", content: "export const a = 7;\n" });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(repo, "src", "a.ts"), "utf8"), "export const a = 7;\n");
});

test("E3: observed 集按会话隔离 — 新实例（新会话）守卫重新武装", async () => {
  const repo = tmpRepo();
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const load = () =>
    loadExtension({
      ...baseEnv,
      PICODE_CWD: repo,
      PICODE_RUNS_ROOT: runsRoot,
      PICODE_RUN_ID: runId,
      PICODE_AGENT_TOKEN: token,
    });
  // 会话 A：读取后编辑放行
  const a = load();
  await call(a, "repo_read", { path: "src/a.ts" });
  const okA = await call(a, "repo_write", { path: "src/a.ts", content: "export const a = 3;\n" });
  assert.equal(okA.ok, true);
  // 会话 B：全新进程，未读即编辑 → 拒绝（observed 不跨会话泄漏）
  const b = load();
  const denied = await call(b, "repo_write", { path: "src/a.ts", content: "export const a = 4;\n" });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "FS_NOT_OBSERVED");
});

test("E1: 越界升级在 read-only 下同样按 read-only 拒绝（mode 围栏先于白名单）", async () => {
  const { tools } = setup({ PICODE_SANDBOX_MODE: "read-only" });
  const r = await call(tools, "repo_write", {
    path: "src/a.ts",
    content: "x",
    sandbox_permissions: "workspace-write",
    justification: "need to edit",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SANDBOX_DENIED");
  assert.equal(r.mode, "read-only");
});
