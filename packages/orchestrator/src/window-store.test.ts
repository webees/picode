import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir } from "./run-store.js";
import { compressRunWindows, windowStatus, readWindowArchive } from "./window-store.js";
import { RoomStore } from "@picode/bus";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-winstore-", name: "picode-test" });
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

function at(hour: number, minute = 0): string {
  return new Date(2026, 7, 9, hour, minute, 0).toISOString();
}

test("compressRunWindows writes run-level archive and windowStatus is read-only", async () => {
  const repo = tmpGitRepo();
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
