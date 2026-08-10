import { test } from "node:test";
import assert from "node:assert/strict";
import { issueToken, verifyToken } from "./token.js";

test("token roundtrip: valid agent+secret passes, wrong agent/secret fails", () => {
  const t = issueToken("engineer@task-a", "s3cret");
  assert.equal(verifyToken(t, "engineer@task-a", "s3cret"), true);
  assert.equal(verifyToken(t, "squad-lead@task-a", "s3cret"), false);
  assert.equal(verifyToken(t, "engineer@task-a", "wrong-secret"), false);
});

test("timingSafeEqual branch: tampered signature of the same length fails", () => {
  const t = issueToken("run-lead", "k");
  const [agent, nonce, sig] = t.split(".");
  // flip the first hex nibble — same length, different bytes
  const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
  assert.equal(verifyToken(`${agent}.${nonce}.${flipped}`, "run-lead", "k"), false);
});

test("timingSafeEqual length-mismatch branch: wrong-length sig returns false, not throw", () => {
  const t = issueToken("run-lead", "k");
  const [agent, nonce] = t.split(".");
  // short signature (length mismatch) hits the try/catch in verifyToken
  assert.equal(verifyToken(`${agent}.${nonce}.deadbeef`, "run-lead", "k"), false);
  // empty signature
  assert.equal(verifyToken(`${agent}.${nonce}.`, "run-lead", "k"), false);
});

test("malformed tokens are rejected before any crypto work", () => {
  for (const bad of ["", "one", "a.b", "a.b.c.d", "a.b.c.d.e"]) {
    assert.equal(verifyToken(bad, "run-lead", "k"), false, JSON.stringify(bad));
  }
});

test("nonce is randomized: two tokens for the same agent differ", () => {
  const a = issueToken("pm", "k");
  const b = issueToken("pm", "k");
  assert.notEqual(a, b);
});
