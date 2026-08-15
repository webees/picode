import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ErrorCode,
  PicodeError,
  errorCodeOf,
  formatPicodeError,
} from "./errors.js";

test("ErrorCode registry values are stable strings", () => {
  assert.equal(ErrorCode.BUS_TYPE_DENIED, "BUS_TYPE_DENIED");
  assert.equal(ErrorCode.CONFIG_INVALID, "CONFIG_INVALID");
  assert.equal(ErrorCode.COMMAND_NOT_ALLOWLISTED, "COMMAND_NOT_ALLOWLISTED");
  // every code is a non-empty uppercase snake string
  for (const [k, v] of Object.entries(ErrorCode)) {
    assert.equal(k, v, `key ${k} must equal its string value`);
    assert.match(v, /^[A-Z][A-Z0-9_]+$/);
  }
});

test("C3: 沙箱/审批/读前编辑错误码已注册（E1-E3 域）", () => {
  // 沙箱三态与越界拒绝（E1）
  assert.equal(ErrorCode.SANDBOX_MODE_INVALID, "SANDBOX_MODE_INVALID");
  assert.equal(ErrorCode.SANDBOX_DENIED, "SANDBOX_DENIED");
  // 一次性升级审批（E2）
  assert.equal(ErrorCode.ESCALATION_MALFORMED, "ESCALATION_MALFORMED");
  assert.equal(ErrorCode.SANDBOX_ESCALATION_INVALID, "SANDBOX_ESCALATION_INVALID");
  assert.equal(ErrorCode.APPROVAL_POLICY_INVALID, "APPROVAL_POLICY_INVALID");
  assert.equal(ErrorCode.APPROVAL_PENDING, "APPROVAL_PENDING");
  assert.equal(ErrorCode.APPROVAL_DENIED, "APPROVAL_DENIED");
  assert.equal(ErrorCode.APPROVAL_REJECTED, "APPROVAL_REJECTED");
  assert.equal(ErrorCode.APPROVAL_NOT_FOUND, "APPROVAL_NOT_FOUND");
  assert.equal(ErrorCode.APPROVAL_ALREADY_DECIDED, "APPROVAL_ALREADY_DECIDED");
  assert.equal(ErrorCode.APPROVAL_ALREADY_USED, "APPROVAL_ALREADY_USED");
  // read-before-edit 守卫（E3）
  assert.equal(ErrorCode.FS_NOT_OBSERVED, "FS_NOT_OBSERVED");
});

test("C4: 子代理深度围栏错误码已注册（I3 域，wakeAgent 结构化拒绝）", () => {
  assert.equal(ErrorCode.SUBAGENT_DEPTH_EXCEEDED, "SUBAGENT_DEPTH_EXCEEDED");
});

test("PicodeError carries a stable code and message", () => {
  const e = new PicodeError(ErrorCode.BUS_TYPE_DENIED, "unknown bus message type: x");
  assert.ok(e instanceof Error);
  assert.ok(e instanceof PicodeError);
  assert.equal(e.code, "BUS_TYPE_DENIED");
  assert.equal(e.message, "unknown bus message type: x");
  assert.equal(e.name, "PicodeError");
});

test("errorCodeOf extracts codes from PicodeError, plain coded objects, and null for plain errors", () => {
  assert.equal(errorCodeOf(new PicodeError(ErrorCode.NO_RUN, "no run")), "NO_RUN");
  // legacy shape: plain Error with a `code` property
  const legacy = Object.assign(new Error("legacy"), { code: "ROOM_POST_DENIED" });
  assert.equal(errorCodeOf(legacy), "ROOM_POST_DENIED");
  assert.equal(errorCodeOf(new Error("plain")), null);
  assert.equal(errorCodeOf("not an error"), null);
  assert.equal(errorCodeOf(null), null);
});

test("formatPicodeError renders the uniform [picode] ERROR prefix (E3)", () => {
  assert.equal(
    formatPicodeError(new PicodeError(ErrorCode.MAX_AWAKE_EXCEEDED, "over limit")),
    "[picode] ERROR: MAX_AWAKE_EXCEEDED: over limit",
  );
  assert.equal(formatPicodeError(new Error("boom")), "[picode] ERROR: boom");
});
