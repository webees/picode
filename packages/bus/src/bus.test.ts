import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RoomStore } from "./room-store.js";
import { issueToken, verifyToken } from "./token.js";
test("token roundtrip", () => {
  const t = issueToken("engineer@task-a", "secret");
  assert.equal(verifyToken(t, "engineer@task-a", "secret"), true);
  assert.equal(verifyToken(t, "other", "secret"), false);
});

test("bus post ACL", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-bus-"));
  const store = new RoomStore(dir);
  store.saveMembers("squad-1", [
    { id: "squad-lead@t1", access: "post" },
    { id: "proc-audit", access: "read" },
  ]);
  await store.post("squad-1", "squad-lead@t1", { type: "progress", body: "ok", refs: [] });
  await assert.rejects(
    () => store.post("squad-1", "proc-audit", { type: "chat", body: "no", refs: [] }),
    /ROOM_POST_DENIED/,
  );
  const hist = store.history("squad-1", "proc-audit", 10);
  assert.equal(hist.length, 1);
});

test("bus post rejects uncataloged message types (10 §1)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-bus-"));
  const store = new RoomStore(dir);
  store.saveMembers("leadership", [{ id: "run-lead", access: "post" }]);
  await assert.rejects(
    () => store.post("leadership", "run-lead", { type: "made_up_type", body: "x", refs: [] }),
    (e: unknown) => (e as { code?: string }).code === "BUS_TYPE_DENIED",
  );
  // cataloged type passes
  await store.post("leadership", "run-lead", { type: "chat", body: "hi", refs: [] });
});
