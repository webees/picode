import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApprovalStore, type ApprovalRecord } from "./approval.js";
import { ErrorCode, PicodeError } from "./errors.js";
import type { SandboxMode } from "./sandbox.js";

function tmpRunDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "picode-approval-"));
}

function asked(opts: { path?: string; mode?: SandboxMode; reason?: string } = {}) {
  return {
    fromAgent: "engineer@task-a",
    taskId: "task-a",
    path: opts.path ?? "outside/x.txt",
    mode: (opts.mode ?? "danger-full-access") as SandboxMode,
    reason: opts.reason ?? "need to fix generated fixture",
  };
}

function request(
  store: ApprovalStore,
  over: Partial<Parameters<ApprovalStore["request"]>[0]> = {},
): Promise<ApprovalRecord> {
  return store.request({ ...asked(), ...over });
}

test("E2: request 落 runs/<id>/approvals/pending-<id>.json（asked 记录）", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  assert.equal(rec.status, "pending");
  assert.ok(rec.id.startsWith("appr-"), `id prefix: ${rec.id}`);
  const file = path.join(dir, "approvals", `pending-${rec.id}.json`);
  assert.ok(fs.existsSync(file), "pending 文件存在");
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as ApprovalRecord;
  assert.equal(onDisk.id, rec.id);
  assert.equal(onDisk.status, "pending");
  assert.equal(onDisk.asked.from_agent, "engineer@task-a");
  assert.equal(onDisk.asked.task_id, "task-a");
  assert.equal(onDisk.asked.path, "outside/x.txt");
  assert.equal(onDisk.asked.mode, "danger-full-access");
  assert.equal(onDisk.asked.reason, "need to fix generated fixture");
  assert.equal(onDisk.decided, null);
  assert.equal(onDisk.used_at, null);
  assert.ok(onDisk.asked.at, "asked 时间戳存在");
  // 审计落盘在 run 目录 approvals/ 下（D071：观测走 run 目录文件，不进面板）
  assert.equal(path.dirname(file), path.join(dir, "approvals"));
});

test("E2: get — 未知 id 返回 null；已落盘可读回", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  const got = store.get(rec.id);
  assert.ok(got);
  assert.equal(got!.id, rec.id);
  assert.equal(store.get("appr-does-not-exist"), null);
});

test("E2: list — 按 asked.at 升序返回全部记录", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  await request(store, { path: "a/1.txt" });
  await request(store, { path: "b/2.txt" });
  const all = store.list();
  assert.equal(all.length, 2);
  // 两条记录均在列；同毫秒 at 时排序由 id 决胜（路径顺序不确定），只断集合与单调性
  assert.deepEqual(
    all.map((r) => r.asked.path).sort(),
    ["a/1.txt", "b/2.txt"].sort(),
  );
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i].asked.at >= all[i - 1].asked.at, "list 按 asked.at 升序");
  }
  const pend = store.pending();
  assert.equal(pend.length, 2);
});

test("E2: decide approve — 同文件成对审计（asked+decided status approved）", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  const decided = await store.decide(rec.id, {
    decision: "approved",
    by: "run-lead",
    note: "同意一次性修复",
  });
  assert.equal(decided.status, "approved");
  assert.ok(decided.decided);
  assert.equal(decided.decided!.by, "run-lead");
  assert.equal(decided.decided!.decision, "approved");
  assert.equal(decided.decided!.note, "同意一次性修复");
  assert.ok(decided.decided!.at);
  // 同文件：asked 记录保留 + decided 同文件 status（审计成对）
  const file = path.join(dir, "approvals", `pending-${rec.id}.json`);
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as ApprovalRecord;
  assert.equal(onDisk.asked.from_agent, "engineer@task-a", "asked 记录同文件保留");
  assert.equal(onDisk.status, "approved");
  assert.equal(onDisk.decided!.by, "run-lead");
  assert.equal(onDisk.used_at, null);
});

test("E2: decide reject — status rejected，成对审计仍在", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  const decided = await store.decide(rec.id, { decision: "rejected", by: "run-lead" });
  assert.equal(decided.status, "rejected");
  assert.equal(decided.decided!.decision, "rejected");
  const file = path.join(dir, "approvals", `pending-${rec.id}.json`);
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as ApprovalRecord;
  assert.equal(onDisk.status, "rejected");
});

test("E2: decide 二次决策 → APPROVAL_ALREADY_DECIDED", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  await store.decide(rec.id, { decision: "approved", by: "run-lead" });
  await assert.rejects(
    () => store.decide(rec.id, { decision: "rejected", by: "run-lead" }),
    (e: unknown) => {
      assert.ok(e instanceof PicodeError);
      assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_ALREADY_DECIDED);
      return true;
    },
  );
});

test("E2: decide 未知 id → APPROVAL_NOT_FOUND", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  await assert.rejects(
    () => store.decide("appr-nope", { decision: "approved", by: "run-lead" }),
    (e: unknown) => {
      assert.ok(e instanceof PicodeError);
      assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_NOT_FOUND);
      return true;
    },
  );
});

test("E2: allowed-once — approved 后 consumeOnce 授单次放行并置 used", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  await store.decide(rec.id, { decision: "approved", by: "run-lead" });
  const used = await store.consumeOnce(rec.id);
  assert.equal(used.status, "used");
  assert.ok(used.used_at);
  assert.equal(store.get(rec.id)!.status, "used");
});

test("E2: allowed-once — 重试再验（used 后再次 consume → APPROVAL_ALREADY_USED）", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  await store.decide(rec.id, { decision: "approved", by: "run-lead" });
  await store.consumeOnce(rec.id);
  await assert.rejects(
    () => store.consumeOnce(rec.id),
    (e: unknown) => {
      assert.ok(e instanceof PicodeError);
      assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_ALREADY_USED);
      return true;
    },
  );
});

test("E2: consumeOnce 状态机 fail-closed — pending/rejected/unknown 均拒绝", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);

  // pending → APPROVAL_PENDING（未决策不可放行）
  const p = await request(store);
  await assert.rejects(
    () => store.consumeOnce(p.id),
    (e: unknown) => {
      assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_PENDING);
      return true;
    },
  );

  // rejected → APPROVAL_REJECTED（拒绝不可放行）
  const r = await request(store);
  await store.decide(r.id, { decision: "rejected", by: "run-lead" });
  await assert.rejects(
    () => store.consumeOnce(r.id),
    (e: unknown) => {
      assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_REJECTED);
      return true;
    },
  );

  // unknown → APPROVAL_NOT_FOUND
  await assert.rejects(
    () => store.consumeOnce("appr-missing"),
    (e: unknown) => {
      assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_NOT_FOUND);
      return true;
    },
  );
});

test("E2: 并发 request 经文件锁落盘不串写（与 C1 CAS 同源 withFileLock）", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const n = 8;
  await Promise.all(
    Array.from({ length: n }, (_, i) => request(store, { path: `f/${i}.txt` })),
  );
  const all = store.list();
  assert.equal(all.length, n);
  // 每份记录完整可解析且 id 唯一
  const ids = new Set(all.map((r) => r.id));
  assert.equal(ids.size, n);
  for (const rec of all) {
    const file = path.join(dir, "approvals", `pending-${rec.id}.json`);
    const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as ApprovalRecord;
    assert.equal(onDisk.id, rec.id);
  }
});

test("E2: 审批记录模式常量（kind）", async () => {
  const dir = tmpRunDir();
  const store = new ApprovalStore(dir);
  const rec = await request(store);
  assert.equal(rec.kind, "sandbox_escalation");
});
