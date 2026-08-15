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
