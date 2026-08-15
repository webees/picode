import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRun, resolveRunDir } from "./run-store.js";
import { compressRunWindows, windowStatus, readWindowArchive } from "./window-store.js";
import { writeYamlFile } from "@picode/core";
import { RoomStore } from "@picode/bus";

function at(hour: number, minute = 0): string {
  return new Date(2026, 7, 9, hour, minute, 0).toISOString();
}

test("compressRunWindows writes run-level archive and windowStatus is read-only", async () => {
  const repo = tmpGitRepo({
    prefix: "picode-winstore-",
    name: "picode-test",
    readme: "# t\n",
  });
  const { runId } = createRun(repo, { title: "win" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new RoomStore(dir);
  // leadership members exist from createRun; post into a past window
  // (30 msgs > default min_keep=20, so folding triggers)
  for (let i = 0; i < 30; i++) {
    await store.post("leadership", "run-lead", { type: "chat", body: `old-${i}`, refs: [] });
  }
  const busFile = path.join(dir, "bus", "leadership.jsonl");
  const patched = fs
    .readFileSync(busFile, "utf8")
    .trim()
    .split("\n")
    .map((l, i) => {
      const m = JSON.parse(l);
      m.ts = at(9, i);
      return JSON.stringify(m);
    });
  fs.writeFileSync(busFile, patched.join("\n") + "\n");

  const now = new Date(2026, 7, 10, 15, 0, 0); // current window = 2026-08-10-pm
  const archive = await compressRunWindows(dir, config, { rooms: ["leadership"], now });
  assert.equal(archive.window, "2026-08-10-pm");
  assert.ok(archive.total_folded >= 2);
  assert.ok(fs.existsSync(archive.archive_path));

  // re-run is idempotent (folded windows already rolled up)
  const again = await compressRunWindows(dir, config, { rooms: ["leadership"], now });
  assert.equal(again.total_folded, 0);

  // archive readable + status shows current window
  const read = readWindowArchive(dir);
  assert.equal(read?.window, "2026-08-10-pm");
  // windowStatus defaults to the real wall clock — pin `now` so the assertion
  // is immune to the machine date (the test fixes "today" = 2026-08-10).
  const st = windowStatus(dir, config, { now });
  assert.equal(st.current_window, "2026-08-10-pm");
  const lead = st.rooms.find((r) => r.room === "leadership");
  assert.ok(lead && lead.messages > 0);
});

test("window archive: summary defaults to null, summary_due latch defaults false, both survive re-compress", async () => {
  const repo = tmpGitRepo({
    prefix: "picode-winstore-",
    name: "picode-test",
    readme: "# t\n",
  });
  const { runId } = createRun(repo, { title: "win-sem" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new RoomStore(dir);
  for (let i = 0; i < 30; i++) {
    await store.post("leadership", "run-lead", { type: "chat", body: `old-${i}`, refs: [] });
  }
  const busFile = path.join(dir, "bus", "leadership.jsonl");
  const patched = fs
    .readFileSync(busFile, "utf8")
    .trim()
    .split("\n")
    .map((l, i) => {
      const m = JSON.parse(l);
      m.ts = at(9, i);
      return JSON.stringify(m);
    });
  fs.writeFileSync(busFile, patched.join("\n") + "\n");

  const now = new Date(2026, 7, 10, 15, 0, 0); // current window = 2026-08-10-pm
  const first = await compressRunWindows(dir, config, { rooms: ["leadership"], now });
  // summary 缺省 null;summary_due 门闩默认 false
  assert.equal(first.summary, null);
  assert.equal(first.summary_due, false);

  // 语义摘要层(P2)写入 summary + 置位门闩
  const archived = readWindowArchive(dir)!;
  writeYamlFile(archived.archive_path, {
    ...archived,
    summary: "semantic summary for 2026-08-10-am",
    summary_due: true,
  });

  // 重压缩幂等:机械折叠不再触发,且不覆盖已写入的 summary / 门闩
  const again = await compressRunWindows(dir, config, { rooms: ["leadership"], now });
  assert.equal(again.total_folded, 0);
  assert.equal(again.summary, "semantic summary for 2026-08-10-am");
  assert.equal(again.summary_due, true);

  const read = readWindowArchive(dir)!;
  assert.equal(read.summary, "semantic summary for 2026-08-10-am");
  assert.equal(read.summary_due, true);
});
