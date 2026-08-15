import { test } from "node:test";
import { gitInit } from "../test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ApprovalStore } from "@picode/core";
import { createRun, resolveRunDir } from "../run-store.js";
import { approvalCommands } from "./approval.js";
import type { Command, CommandContext } from "./types.js";

function setupRun() {
  const repo = gitInit({ prefix: "picode-approval-cli-" });
  fs.writeFileSync(path.join(repo, "README.md"), "# t\n");
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  return { repo, runId, dir, config };
}

function cmd(pathKey: string): Command {
  const c = approvalCommands.find((x) => x.path.join(" ") === pathKey);
  assert.ok(c, `${pathKey} 必须注册`);
  return c!;
}

/** 模拟 CLI ctx：args 直接透传，has/arg 从 args 推导。 */
function ctxFor(dir: string, args: string[]) {
  const has = (name: string) => args.includes(name);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  return { args, has, arg, dir } as unknown as CommandContext;
}

function captureLog<T>(fn: () => T): Promise<{ ret: Awaited<T>; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  return Promise.resolve(fn())
    .then((ret) => ({ ret, logs }))
    .finally(() => {
      console.log = orig;
    });
}

async function requestOne(dir: string) {
  const store = new ApprovalStore(dir);
  return store.request({
    fromAgent: "engineer@task-a",
    taskId: "task-a",
    path: "outside/x.txt",
    mode: "danger-full-access",
    reason: "write generated fixture",
  });
}

test("approval list 空 run → 空数组", async () => {
  const { dir, repo } = setupRun();
  const { logs } = await captureLog(() => cmd("approval list").run(ctxFor(dir, ["approval", "list"])));
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), []);
  void repo;
});

test("approval list 显示 pending 记录（asked 字段 from_agent/task/path/mode/reason）", async () => {
  const { dir } = setupRun();
  const rec = await requestOne(dir);
  const { logs } = await captureLog(() => cmd("approval list").run(ctxFor(dir, ["approval", "list"])));
  const rows = JSON.parse(logs[0]) as Array<{
    id: string;
    status: string;
    asked: { from_agent: string; task_id: string; path: string; mode: string; reason: string };
  }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, rec.id);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].asked.from_agent, "engineer@task-a");
  assert.equal(rows[0].asked.task_id, "task-a");
  assert.equal(rows[0].asked.path, "outside/x.txt");
  assert.equal(rows[0].asked.mode, "danger-full-access");
  assert.equal(rows[0].asked.reason, "write generated fixture");
});

test("approval list --status 过滤", async () => {
  const { dir } = setupRun();
  const store = new ApprovalStore(dir);
  const a = await store.request({
    fromAgent: "engineer@task-a",
    taskId: "task-a",
    path: "a/1.txt",
    mode: "danger-full-access",
    reason: "r1",
  });
  const b = await store.request({
    fromAgent: "engineer@task-b",
    taskId: "task-b",
    path: "b/2.txt",
    mode: "danger-full-access",
    reason: "r2",
  });
  await store.decide(a.id, { decision: "approved", by: "run-lead" });
  void b;
  const { logs } = await captureLog(() =>
    cmd("approval list").run(ctxFor(dir, ["approval", "list", "--status", "approved"])),
  );
  const rows = JSON.parse(logs[0]) as Array<{ id: string; status: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, a.id);
  assert.equal(rows[0].status, "approved");
});

test("approval decide --approve → approved + answerer=run-lead + 同文件成对审计", async () => {
  const { dir } = setupRun();
  const rec = await requestOne(dir);
  const { logs } = await captureLog(() =>
    cmd("approval decide").run(
      ctxFor(dir, ["approval", "decide", "--id", rec.id, "--approve", "--note", "同意"]),
    ),
  );
  const out = JSON.parse(logs[0]) as {
    status: string;
    decided: { by: string; decision: string; note: string };
  };
  assert.equal(out.status, "approved");
  assert.equal(out.decided.by, "run-lead", "answerer=run-lead 代批");
  assert.equal(out.decided.decision, "approved");
  assert.equal(out.decided.note, "同意");
  // 同文件：asked 保留 + status approved（审计成对）
  const file = path.join(dir, "approvals", `pending-${rec.id}.json`);
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as {
    status: string;
    asked: { from_agent: string };
    decided: { by: string };
  };
  assert.equal(onDisk.status, "approved");
  assert.equal(onDisk.asked.from_agent, "engineer@task-a");
  assert.equal(onDisk.decided.by, "run-lead");
});

test("approval decide --reject → rejected", async () => {
  const { dir } = setupRun();
  const rec = await requestOne(dir);
  const { logs } = await captureLog(() =>
    cmd("approval decide").run(ctxFor(dir, ["approval", "decide", "--id", rec.id, "--reject"])),
  );
  const out = JSON.parse(logs[0]) as { status: string; decided: { decision: string; by: string } };
  assert.equal(out.status, "rejected");
  assert.equal(out.decided.decision, "rejected");
  assert.equal(out.decided.by, "run-lead");
});

test("approval decide 未知 id → APPROVAL_NOT_FOUND", async () => {
  const { dir } = setupRun();
  await assert.rejects(
    async () => {
      await cmd("approval decide").run(
        ctxFor(dir, ["approval", "decide", "--id", "appr-nope", "--approve"]),
      );
    },
    (e: unknown) => (e as { code?: string }).code === "APPROVAL_NOT_FOUND",
  );
});

test("approval decide 二次决策 → APPROVAL_ALREADY_DECIDED", async () => {
  const { dir } = setupRun();
  const rec = await requestOne(dir);
  await cmd("approval decide").run(ctxFor(dir, ["approval", "decide", "--id", rec.id, "--approve"]));
  await assert.rejects(
    async () => {
      await cmd("approval decide").run(
        ctxFor(dir, ["approval", "decide", "--id", rec.id, "--reject"]),
      );
    },
    (e: unknown) => (e as { code?: string }).code === "APPROVAL_ALREADY_DECIDED",
  );
});

test("approval decide 缺 --id → USAGE", async () => {
  const { dir } = setupRun();
  await assert.rejects(
    async () => {
      await cmd("approval decide").run(ctxFor(dir, ["approval", "decide", "--approve"]));
    },
    (e: unknown) => (e as { code?: string }).code === "USAGE",
  );
});

test("approval decide --approve 与 --reject 并存 → USAGE（恰好其一）", async () => {
  const { dir } = setupRun();
  const rec = await requestOne(dir);
  await assert.rejects(
    async () => {
      await cmd("approval decide").run(
        ctxFor(dir, ["approval", "decide", "--id", rec.id, "--approve", "--reject"]),
      );
    },
    (e: unknown) => (e as { code?: string }).code === "USAGE",
  );
});
