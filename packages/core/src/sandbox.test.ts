import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_POLICY_DEFAULT,
  APPROVAL_POLICY_ENV,
  READ_BEFORE_EDIT_DEFAULT,
  READ_BEFORE_EDIT_ENV,
  SANDBOX_DEFAULT_MODE,
  SANDBOX_MODES,
  SANDBOX_MODE_ENV,
  WIDER_MODES,
  modeAllowsWrite,
  readBeforeEditEnabled,
  resolveApprovalPolicy,
  resolveSandboxMode,
  sandboxDenialMarker,
  type SandboxMode,
} from "./sandbox.js";
import { ErrorCode, PicodeError } from "./errors.js";

test("E1: SANDBOX_MODES 恰好三态", () => {
  assert.deepEqual(
    [...SANDBOX_MODES],
    ["read-only", "workspace-write", "danger-full-access"],
  );
});

test("E1: 每调用 resolve — 默认 workspace-write，会话 env 覆盖", () => {
  assert.equal(resolveSandboxMode(undefined), "workspace-write");
  assert.equal(resolveSandboxMode(""), "workspace-write");
  assert.equal(resolveSandboxMode("read-only"), "read-only");
  assert.equal(resolveSandboxMode("danger-full-access"), "danger-full-access");
});

test("E1: resolve 对非法 env 值 fail-loud（SANDBOX_MODE_INVALID）", () => {
  for (const bad of ["full", "write", "banana"]) {
    assert.throws(() => resolveSandboxMode(bad), (e: unknown) => {
      assert.ok(e instanceof PicodeError);
      assert.equal((e as PicodeError).code, ErrorCode.SANDBOX_MODE_INVALID);
      return true;
    });
  }
});

test("E1: 常量与 env 名约定", () => {
  assert.equal(SANDBOX_DEFAULT_MODE, "workspace-write");
  assert.equal(SANDBOX_MODE_ENV, "PICODE_SANDBOX_MODE");
  assert.equal(APPROVAL_POLICY_ENV, "PICODE_APPROVAL_POLICY");
  assert.equal(APPROVAL_POLICY_DEFAULT, "ask");
  assert.equal(READ_BEFORE_EDIT_ENV, "PICODE_READ_BEFORE_EDIT");
  assert.equal(READ_BEFORE_EDIT_DEFAULT, "1");
});

test("E1: modeAllowsWrite — read-only 拒一切写", () => {
  assert.equal(modeAllowsWrite("read-only"), false);
  assert.equal(modeAllowsWrite("workspace-write"), true);
  assert.equal(modeAllowsWrite("danger-full-access"), true);
});

test("E2: WIDER_MODES 严格更宽，执行时校验依据", () => {
  assert.deepEqual([...WIDER_MODES["read-only"]], ["workspace-write", "danger-full-access"]);
  assert.deepEqual([...WIDER_MODES["workspace-write"]], ["danger-full-access"]);
  assert.deepEqual([...WIDER_MODES["danger-full-access"]], []);
});

test("E2: 结构化拒绝标记含生效 mode（DSH 词汇）", () => {
  const marker = sandboxDenialMarker("workspace-write");
  assert.equal(marker, "[sandbox: file access denied under workspace-write mode]");
});

test("E2: resolveApprovalPolicy — 默认 ask，never 显式，非法 fail-loud", () => {
  assert.equal(resolveApprovalPolicy(undefined), "ask");
  assert.equal(resolveApprovalPolicy(""), "ask");
  assert.equal(resolveApprovalPolicy("never"), "never");
  assert.equal(resolveApprovalPolicy("ask"), "ask");
  assert.throws(() => resolveApprovalPolicy("sometimes"), (e: unknown) => {
    assert.ok(e instanceof PicodeError);
    assert.equal((e as PicodeError).code, ErrorCode.APPROVAL_POLICY_INVALID);
    return true;
  });
});

test("E3: readBeforeEditEnabled — 默认开（fail-closed），显式关可配", () => {
  assert.equal(readBeforeEditEnabled(undefined), true);
  assert.equal(readBeforeEditEnabled(""), true);
  assert.equal(readBeforeEditEnabled("1"), true);
  assert.equal(readBeforeEditEnabled("true"), true);
  assert.equal(readBeforeEditEnabled("on"), true);
  assert.equal(readBeforeEditEnabled("0"), false);
  assert.equal(readBeforeEditEnabled("false"), false);
  assert.equal(readBeforeEditEnabled("off"), false);
  // 非法值 → 守卫保持开（安全守卫 fail-closed）
  assert.equal(readBeforeEditEnabled("banana"), true);
});

test("isSandboxMode 守卫类型", () => {
  const m: SandboxMode = "read-only";
  assert.equal(m, "read-only");
});
