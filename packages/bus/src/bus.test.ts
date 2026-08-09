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
