import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RoomStore } from "./room-store.js";
import { groupByWindow, windowIdOf } from "./window.js";

function tmpRun(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "picode-window-"));
}

function at(hour: number, minute = 0, dayOffset = 0): string {
  const d = new Date(2026, 7, 10 + dayOffset, hour, minute, 0);
  return d.toISOString();
}

test("windowIdOf splits morning/afternoon at split_hour", () => {
  assert.equal(windowIdOf(at(9), 12).id, "2026-08-10-am");
  assert.equal(windowIdOf(at(12), 12).half, "pm");
  assert.equal(windowIdOf(at(23), 12).id, "2026-08-10-pm");
  assert.equal(windowIdOf(at(11), 12).half, "am");
  assert.equal(windowIdOf(at(9, 0, 1), 12).id, "2026-08-11-am");
});

test("groupByWindow buckets by window id", () => {
  const msgs = [
    { ts: at(9) },
    { ts: at(10) },
    { ts: at(13) },
    { ts: at(9, 0, 1) },
  ];
  const g = groupByWindow(msgs, 12);
  assert.deepEqual([...g.keys()].sort(), ["2026-08-10-am", "2026-08-10-pm", "2026-08-11-am"]);
});

test("compressWindow folds oldest 20% of past windows, keeps current window", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("leadership", [{ id: "run-lead", access: "post" }]);
  // 10 messages in yesterday-morning window (all past), 5 in current window
  for (let i = 0; i < 10; i++) {
    await store.post("leadership", "run-lead", {
      type: "chat",
      body: `old-${i}`,
      refs: [],
      meta: { ts_override: at(9, i) },
    });
  }
  for (let i = 0; i < 5; i++) {
    await store.post("leadership", "run-lead", {
      type: "progress",
      body: `cur-${i}`,
      refs: [],
    });
  }
  // rewrite ts of the "old" messages by patching the jsonl so window math sees them
  const busFile = path.join(dir, "bus", "leadership.jsonl");
  const lines = fs.readFileSync(busFile, "utf8").trim().split("\n");
  const patched = lines.map((l, i) => {
    const m = JSON.parse(l);
    if (i < 10) m.ts = at(9, i); // yesterday morning (dayOffset 0 = 2026-08-10 09:xx)
    return JSON.stringify(m);
  });
  fs.writeFileSync(busFile, patched.join("\n") + "\n");

  const now = new Date(2026, 7, 10, 15, 0, 0); // same-day afternoon = current window
  const r = await store.compressWindow("leadership", {
    splitHour: 12,
    ratio: 0.8,
    minKeep: 2,
    now,
  });

  // past window had 10 msgs → keep ceil(10*0.8)=8, fold 2
  assert.equal(r.folded, 2);
  assert.equal(r.kept, 8 + 5); // 8 kept past + 5 current
  assert.deepEqual(r.folded_windows, ["2026-08-10-am"]);
  assert.equal(r.archived.length, 1);
  assert.ok(fs.existsSync(r.archived[0]));

  const hist = store.history("leadership", "run-lead", 100);
  const rollups = hist.filter((m) => m.type === "window_rollup");
  assert.equal(rollups.length, 1);
  assert.equal(rollups[0].meta?.window, "2026-08-10-am");
  assert.equal(rollups[0].meta?.folded, 2);
  // archive contains exactly the 2 folded originals
  const archived = fs.readFileSync(r.archived[0], "utf8").trim().split("\n");
  assert.equal(archived.length, 2);
  // current window untouched
  assert.ok(hist.some((m) => m.body === "cur-4"));
  assert.equal(hist.filter((m) => m.body.startsWith("cur-")).length, 5);
  // old-0 / old-1 folded away; old-2..old-9 kept
  assert.ok(!hist.some((m) => m.body === "old-0"));
  assert.ok(!hist.some((m) => m.body === "old-1"));
  assert.ok(hist.some((m) => m.body === "old-9"));
});

test("compressWindow never folds below min_keep and skips small windows", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("r1", [{ id: "a", access: "post" }]);
  for (let i = 0; i < 3; i++) {
    await store.post("r1", "a", { type: "chat", body: `m${i}`, refs: [] });
  }
  const busFile = path.join(dir, "bus", "r1.jsonl");
  const patched = fs
    .readFileSync(busFile, "utf8")
    .trim()
    .split("\n")
    .map((l, i) => {
      const m = JSON.parse(l);
      m.ts = at(9, i); // all in one past window
      return JSON.stringify(m);
    });
  fs.writeFileSync(busFile, patched.join("\n") + "\n");

  const now = new Date(2026, 7, 10, 15, 0, 0);
  // minKeep=5 > 3 messages → nothing folded
  const r = await store.compressWindow("r1", { splitHour: 12, ratio: 0.8, minKeep: 5, now });
  assert.equal(r.folded, 0);
  assert.equal(r.archived.length, 0);
  const hist = store.history("r1", "a", 100);
  assert.equal(hist.filter((m) => m.type === "window_rollup").length, 0);
  assert.equal(hist.length, 3);
});

test("compressWindow is idempotent: an already-folded window is never folded again", async () => {
  const dir = tmpRun();
  const store = new RoomStore(dir);
  store.saveMembers("r2", [{ id: "a", access: "post" }]);
  for (let i = 0; i < 10; i++) {
    await store.post("r2", "a", { type: "chat", body: `old-${i}`, refs: [] });
  }
  const busFile = path.join(dir, "bus", "r2.jsonl");
  const patched = fs
    .readFileSync(busFile, "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const m = JSON.parse(l);
      m.ts = at(9); // all in one past window 2026-08-10-am
      return JSON.stringify(m);
    });
  fs.writeFileSync(busFile, patched.join("\n") + "\n");

  const now = new Date(2026, 7, 10, 15, 0, 0);
  const first = await store.compressWindow("r2", { splitHour: 12, ratio: 0.8, minKeep: 2, now });
  assert.equal(first.folded, 2); // 10 → keep 8, fold 2

  // second pass must NOT fold again: window already has a rollup
  const second = await store.compressWindow("r2", { splitHour: 12, ratio: 0.8, minKeep: 2, now });
  assert.equal(second.folded, 0);
  assert.equal(second.archived.length, 0);

  const hist = store.history("r2", "a", 100);
  assert.equal(hist.filter((m) => m.type === "window_rollup").length, 1); // no nesting
  assert.equal(hist.length, 9); // 1 rollup + 8 kept, unchanged by the second pass
});
