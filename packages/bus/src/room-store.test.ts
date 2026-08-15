import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ErrorCode, PicodeError } from "@picode/core";
import { RoomStore } from "./room-store.js";

function tmpRun(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "picode-owner-"));
}

/** Write a run-roster session record (I3 shape) directly as file truth. */
function registerSession(
  dir: string,
  agentId: string,
  opts: { depth?: number; parent?: string } = {},
): void {
  const sessionsDir = path.join(dir, "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  const lines = [
    "schema_version: '1'",
    `agent_id: ${agentId}`,
    "role_id: engineer",
    "state: awake",
    "pi_session_id: null",
    "last_wake_at: null",
    "last_sleep_at: null",
    "wake_reason: null",
    "persona_path: null",
    "error: null",
  ];
  if (opts.depth !== undefined) lines.push(`delegation_depth: ${opts.depth}`);
  if (opts.parent !== undefined) lines.push(`parent_session: ${opts.parent}`);
  lines.push("");
  fs.writeFileSync(path.join(sessionsDir, `${agentId}.yaml`), lines.join("\n"));
}

test("I5 owner fence: only the parent may post to a subagent session room (others → ROOM_POST_DENIED)", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  const sub = "subagent@task-child";
  const parent = "engineer@task-parent";
  registerSession(dir, sub, { depth: 1, parent });
  store.saveMembers("sub-room", [
    { id: parent, access: "post" },
    { id: "stranger", access: "post" },
  ]);
  store.setRoomOwner("sub-room", sub);
  assert.equal(store.roomOwner("sub-room"), sub);
  // parent (owner) → allowed
  await store.post("sub-room", parent, { type: "chat", body: "hi", refs: [] });
  // non-parent member with post access → denied by the owner fence
  await assert.rejects(
    () => store.post("sub-room", "stranger", { type: "chat", body: "x", refs: [] }),
    (e: unknown) =>
      e instanceof PicodeError &&
      e.code === ErrorCode.ROOM_POST_DENIED &&
      /owner fence/.test(e.message) &&
      /only parent engineer@task-parent may post/.test(e.message),
  );
});

test("I5 owner fence: nested chain — only the immediate parent may post", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  const grandchild = "subagent@task-grandchild";
  const child = "subagent@task-child"; // itself a subagent of engineer@task-parent
  const parent = "engineer@task-parent";
  registerSession(dir, grandchild, { depth: 2, parent: child });
  registerSession(dir, child, { depth: 1, parent });
  store.saveMembers("sub-room", [
    { id: child, access: "post" },
    { id: parent, access: "post" },
    { id: "stranger", access: "post" },
  ]);
  store.setRoomOwner("sub-room", grandchild);
  await store.post("sub-room", child, { type: "chat", body: "steer", refs: [] });
  await assert.rejects(
    () => store.post("sub-room", "stranger", { type: "chat", body: "x", refs: [] }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ROOM_POST_DENIED,
  );
});

test("I5 问人禁令: a subagent cannot directly post to the sponsor room (must relay via parent)", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  const sub = "subagent@task-child";
  const parent = "engineer@task-parent";
  registerSession(dir, sub, { depth: 1, parent });
  store.saveMembers("product", [
    { id: "sponsor", access: "post", post_types_allow: ["chat"] },
    { id: "pm", access: "post" },
  ]);
  // not a member → members ACL is the backstop (04 §1.2)
  await assert.rejects(
    () => store.post("product", sub, { type: "chat", body: "question to sponsor", refs: [] }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ROOM_POST_DENIED,
  );
  // even if misconfigured into the member list, the subagent relay fence still
  // denies: a subagent may only speak where its parent could speak.
  store.saveMembers("product", [
    { id: "sponsor", access: "post", post_types_allow: ["chat"] },
    { id: "pm", access: "post" },
    { id: sub, access: "post" },
  ]);
  await assert.rejects(
    () => store.post("product", sub, { type: "chat", body: "question to sponsor", refs: [] }),
    (e: unknown) =>
      e instanceof PicodeError &&
      e.code === ErrorCode.ROOM_POST_DENIED &&
      /subagent may only post where parent/.test(e.message),
  );
});

test("I5 relay: a subagent may post where its parent could post (parent's squad room)", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  const sub = "subagent@task-child";
  const parent = "engineer@task-parent";
  registerSession(dir, sub, { depth: 1, parent });
  store.saveMembers("squad-task-parent", [
    { id: parent, access: "post" },
    { id: sub, access: "post" },
  ]);
  await store.post("squad-task-parent", sub, { type: "chat", body: "progress report", refs: [] });
  const hist = store.history("squad-task-parent", parent, 10);
  assert.equal(hist.length, 1);
  assert.equal(hist[0]!.from, sub);
});

test("I5 regression: a room owned by a top-level session is not fenced (owner fence is subagent-only)", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  registerSession(dir, "engineer@task-a"); // top-level: no depth/parent
  store.saveMembers("meeting-1", [
    { id: "engineer@task-a", access: "post" },
    { id: "squad-lead@task-a", access: "post" },
  ]);
  store.setRoomOwner("meeting-1", "engineer@task-a");
  // another member (not the owner) posts — ACL governs, no owner fence
  await store.post("meeting-1", "squad-lead@task-a", { type: "chat", body: "x", refs: [] });
});

test("I5 regression: rooms without owner metadata keep ACL-only semantics (非子代理房间零变更)", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("leadership", [
    { id: "run-lead", access: "post" },
    { id: "pm", access: "read" },
  ]);
  await store.post("leadership", "run-lead", { type: "chat", body: "m", refs: [] });
  assert.equal(store.canRead("leadership", "pm"), true);
  await assert.rejects(
    () => store.post("leadership", "pm", { type: "chat", body: "x", refs: [] }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ROOM_POST_DENIED,
  );
  // top-level sessions are never fenced
  registerSession(dir, "engineer@task-a");
  store.saveMembers("squad-task-a", [{ id: "engineer@task-a", access: "post" }]);
  await store.post("squad-task-a", "engineer@task-a", { type: "chat", body: "x", refs: [] });
});
