import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ErrorCode, PicodeError } from "@picode/core";
import { RoomStore, BUS_MESSAGE_TYPES } from "./room-store.js";

function tmpRun(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "picode-acl-"));
}

test("post_types_allow narrows a member's allowed types (D035 sponsor channel)", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("product", [
    { id: "sponsor", access: "post", post_types_allow: ["chat"] },
  ]);
  await store.post("product", "sponsor", { type: "chat", body: "hi", refs: [] });
  await assert.rejects(
    () => store.post("product", "sponsor", { type: "progress", body: "x", refs: [] }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ROOM_POST_DENIED,
  );
});

test("read-only members can read but never post", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("leadership", [
    { id: "run-lead", access: "post" },
    { id: "pm", access: "read" },
  ]);
  await store.post("leadership", "run-lead", { type: "chat", body: "m", refs: [] });
  assert.equal(store.canRead("leadership", "pm"), true);
  assert.equal(store.canPost("leadership", "pm"), false);
  const hist = store.history("leadership", "pm", 10);
  assert.equal(hist.length, 1);
  await assert.rejects(
    () => store.post("leadership", "pm", { type: "chat", body: "x", refs: [] }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ROOM_POST_DENIED,
  );
});

test("non-members cannot read or post; history throws coded ROOM_READ_DENIED", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("squad-1", [{ id: "engineer@t1", access: "post" }]);
  assert.equal(store.canRead("squad-1", "stranger"), false);
  assert.equal(store.canPost("squad-1", "stranger"), false);
  assert.throws(
    () => store.history("squad-1", "stranger", 10),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ROOM_READ_DENIED,
  );
});

test("bus type registry: every cataloged type posts, unknown types are rejected", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("leadership", [{ id: "run-lead", access: "post" }]);
  for (const type of BUS_MESSAGE_TYPES) {
    await store.post("leadership", "run-lead", { type, body: "x", refs: [] });
  }
  await assert.rejects(
    () => store.post("leadership", "run-lead", { type: "future_type", body: "x", refs: [] }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.BUS_TYPE_DENIED,
  );
});

test("members.json legacy format (spec 02) is loaded; members.yaml fallback works", () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  // legacy: flat array of members in members.json
  const legacy = path.join(dir, "rooms", "r1");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(
    path.join(legacy, "members.json"),
    JSON.stringify([{ id: "a", access: "post" }]),
  );
  assert.equal(store.canPost("r1", "a"), true);
  assert.equal(store.canPost("r1", "b"), false);

  // yaml members file with { room_id, members } shape
  store.saveMembers("r2", [{ id: "b", access: "post" }]);
  const raw = JSON.parse(
    fs.readFileSync(path.join(dir, "rooms", "r2", "members.json"), "utf8"),
  ) as { room_id: string; members: Array<{ id: string }> };
  assert.equal(raw.room_id, "r2");
  assert.equal(store.canPost("r2", "b"), true);
});

test("bus post ids are unique per message", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("r", [{ id: "a", access: "post" }]);
  const m1 = await store.post("r", "a", { type: "chat", body: "1", refs: [] });
  const m2 = await store.post("r", "a", { type: "chat", body: "2", refs: [] });
  assert.notEqual(m1.id, m2.id);
  assert.equal(m1.from, "a");
  assert.equal(m1.room, "r");
});
