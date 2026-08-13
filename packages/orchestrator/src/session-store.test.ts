import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ErrorCode, PicodeError } from "@picode/core";
import { SessionStore } from "./session-store.js";

function freshStore(): SessionStore {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-run-"));
  return new SessionStore(runDir);
}

function expectCode(e: unknown, code: ErrorCode): void {
  assert.ok(e instanceof PicodeError, `expected PicodeError, got ${String(e)}`);
  assert.equal(e.code, code);
}

test("register sponsor throws coded SESSION_HUMAN_ONLY", () => {
  assert.throws(() => freshStore().register("sponsor"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_HUMAN_ONLY);
    return true;
  });
});

test("duplicate register throws coded SESSION_ALREADY_REGISTERED", () => {
  const store = freshStore();
  store.register("pm");
  assert.throws(() => store.register("pm"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_ALREADY_REGISTERED);
    return true;
  });
});

test("setError on a missing session throws coded SESSION_NOT_FOUND", async () => {
  await assert.rejects(() => freshStore().setError("ghost", "x"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_NOT_FOUND);
    return true;
  });
});

test("setError records the error without changing state", async () => {
  const store = freshStore();
  store.register("run-lead", { initialState: "sleeping" });
  const rec = await store.setError("run-lead", "pi died");
  assert.equal(rec.error, "pi died");
  assert.equal(rec.state, "sleeping");
  assert.equal(store.get("run-lead")!.error, "pi died");
  // a later successful wake clears… no: error survives until terminate (D032 contract)
  const w = await store.wake("run-lead", "retry");
  assert.equal(w.error, "pi died");
});

test("C1: register seeds budget.turns=0 and each wake increments it", async () => {
  const store = freshStore();
  const registered = store.register("pm", { initialState: "sleeping" });
  assert.equal(registered.budget?.turns, 0);
  await store.wake("pm", "a");
  await store.sleep("pm", "a");
  await store.wake("pm", "b");
  assert.equal(store.get("pm")!.budget?.turns, 2, "wake 次数即 turn 数");
});

test("C1: register seeds budget.continuations=0 and recordContinuation increments it", async () => {
  const store = freshStore();
  const registered = store.register("pm", { initialState: "sleeping" });
  assert.equal(registered.budget?.continuations, 0);
  await store.recordContinuation("pm");
  assert.equal(store.get("pm")!.budget?.continuations, 1);
  await store.recordContinuation("pm");
  assert.equal(store.get("pm")!.budget?.continuations, 2);
});

test("C1: wake/sleep preserves the continuation counter (N3 持久化)", async () => {
  const store = freshStore();
  store.register("pm", { initialState: "sleeping" });
  await store.wake("pm", "a");
  await store.recordContinuation("pm");
  await store.sleep("pm", "a");
  await store.wake("pm", "b");
  const rec = store.get("pm")!;
  assert.equal(rec.budget?.turns, 2);
  assert.equal(rec.budget?.continuations, 1, "重 wake 不得重置续跑计数");
});

test("C1: recordContinuation on a missing session throws coded SESSION_NOT_FOUND", async () => {
  await assert.rejects(() => freshStore().recordContinuation("ghost"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_NOT_FOUND);
    return true;
  });
});

test("attachPiSession requires awake state (coded ILLEGAL_STATE)", async () => {
  const store = freshStore();
  store.register("pm", { initialState: "sleeping" });
  await assert.rejects(
    () => store.attachPiSession("pm", "pid-1"),
    (e: unknown) => {
      expectCode(e, ErrorCode.ILLEGAL_STATE);
      return true;
    },
  );
  await store.wake("pm", "intake");
  const rec = await store.attachPiSession("pm", "pid-99");
  assert.equal(rec.pi_session_id, "pid-99");
  assert.equal(store.get("pm")!.pi_session_id, "pid-99");
});

test("transition on a missing session throws coded SESSION_NOT_FOUND", async () => {
  const store = freshStore();
  await assert.rejects(() => store.wake("ghost", "x"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_NOT_FOUND);
    return true;
  });
  await assert.rejects(() => store.sleep("ghost", "x"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_NOT_FOUND);
    return true;
  });
  await assert.rejects(() => store.terminate("ghost", "x"), (e: unknown) => {
    expectCode(e, ErrorCode.SESSION_NOT_FOUND);
    return true;
  });
});

test("A4: concurrent transitions serialize under the session lock", async () => {
  const store = freshStore();
  store.register("tpm", { initialState: "sleeping" });
  // 8 racing wake() calls: exactly one wins, the rest see awake->awake (illegal)
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.wake("tpm", "race")),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1, "exactly one wake wins the race");
  assert.equal(rejected.length, 7);
  for (const r of rejected) {
    assert.ok(
      (r as PromiseRejectedResult).reason instanceof PicodeError,
      "losers get coded errors, not torn state",
    );
    assert.equal((r as PromiseRejectedResult).reason.code, ErrorCode.ILLEGAL_TRANSITION);
  }
  // the on-disk record is a valid, parseable awake session (no interleaved write)
  const rec = store.get("tpm")!;
  assert.equal(rec.state, "awake");
  assert.equal(rec.schema_version, "1");
  assert.equal(store.awake().length, 1);
});

test("A4: concurrent setError + wake leaves a consistent record", async () => {
  const store = freshStore();
  store.register("run-lead", { initialState: "sleeping" });
  const settled = await Promise.allSettled([
    store.wake("run-lead", "intake_start"),
    store.setError("run-lead", "boom"),
    store.wake("run-lead", "sponsor_message"),
    store.setError("run-lead", "boom2"),
  ]);
  // no thrown error escapes the lock machinery itself
  for (const r of settled) {
    if (r.status === "rejected") {
      assert.ok(r.reason instanceof PicodeError, "only coded errors allowed");
    }
  }
  const rec = store.get("run-lead")!;
  // the file always parses to a full record — never a half-written one
  assert.equal(rec.agent_id, "run-lead");
  assert.ok(["awake", "sleeping"].includes(rec.state));
});
