import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ErrorCode, PicodeError } from "@picode/core";
import { RoomStore } from "@picode/bus";
import { addFeed, closeFeed, readFeeds, triageFeed, INTAKE_TYPES } from "./intake.js";

function tmpRunDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-intake-"));
  new RoomStore(dir).saveMembers("leadership", [
    { id: "run-lead", access: "post" },
    { id: "pm", access: "read" },
  ]);
  return dir;
}

test("intake lifecycle: add(open) → triage(triaged+assigned_to+bus) → close(done)", async () => {
  const dir = tmpRunDir();
  const feed = addFeed(dir, { type: "需求", body: "随时投喂一个需求" });

  assert.equal(feed.status, "open");
  assert.equal(feed.from, "sponsor");
  assert.equal(feed.type, "需求");
  assert.ok(feed.id.startsWith("feed-"), `id starts with feed-: ${feed.id}`);
  assert.ok(fs.existsSync(path.join(dir, "intake", `${feed.id}.yaml`)));
  assert.deepEqual(readFeeds(dir).map((f) => f.id), [feed.id]);

  const triaged = await triageFeed(dir, feed.id, "pm");
  assert.equal(triaged.status, "triaged");
  assert.equal(triaged.assigned_to, "pm");
  assert.ok(triaged.triaged_at, "triaged_at recorded");

  const bus = new RoomStore(dir);
  const history = bus.history("leadership", "run-lead", 10);
  assert.ok(
    history.some((m) => m.type === "intake_triaged" && m.meta?.feed_id === feed.id),
    "bus notifies leadership with intake_triaged",
  );
  assert.equal(history.find((m) => m.type === "intake_triaged")?.meta?.assigned_to, "pm");

  const closed = closeFeed(dir, feed.id);
  assert.equal(closed.status, "done");
  assert.ok(closed.closed_at, "closed_at recorded");

  const persisted = readFeeds(dir)[0];
  assert.equal(persisted.status, "done");
});

test("intake: add rejects unknown type (USAGE)", () => {
  const dir = tmpRunDir();
  assert.throws(
    () => addFeed(dir, { type: "bogus", body: "x" }),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.USAGE,
  );
  assert.equal(readFeeds(dir).length, 0);
});

test("intake: triage rejects unknown feed and double-triage", async () => {
  const dir = tmpRunDir();
  await assert.rejects(
    () => triageFeed(dir, "feed-nope", "pm"),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.NOT_FOUND,
  );

  const feed = addFeed(dir, { type: "研究", body: "x" });
  await triageFeed(dir, feed.id, "ind-res");
  await assert.rejects(
    () => triageFeed(dir, feed.id, "pm"),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ILLEGAL_STATE,
  );
});

test("intake: close rejects unknown feed, double-close, and triage-after-done", async () => {
  const dir = tmpRunDir();
  assert.throws(
    () => closeFeed(dir, "feed-nope"),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.NOT_FOUND,
  );

  const feed = addFeed(dir, { type: "文档", body: "x" });
  closeFeed(dir, feed.id);
  assert.throws(
    () => closeFeed(dir, feed.id),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ILLEGAL_STATE,
  );
  await assert.rejects(
    () => triageFeed(dir, feed.id, "docs-lead"),
    (e: unknown) => e instanceof PicodeError && e.code === ErrorCode.ILLEGAL_STATE,
  );
});

test("intake: every cataloged type is accepted; feeds sorted by ts", () => {
  const dir = tmpRunDir();
  for (const type of INTAKE_TYPES) {
    const feed = addFeed(dir, { type, body: `喂一个${type}` });
    assert.equal(feed.status, "open");
  }
  const ids = readFeeds(dir).map((f) => f.id);
  assert.equal(ids.length, INTAKE_TYPES.length);
  assert.equal(new Set(ids).size, INTAKE_TYPES.length, "feed ids unique");
});
