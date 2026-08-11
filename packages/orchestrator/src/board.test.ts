import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildBoard, renderBoard, BOARD_COLUMNS } from "./board.js";

function tmpRun(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-board-"));
  const run = path.join(dir, ".picode", "runs", "run-board-test");
  const tasks = path.join(run, "tasks", "task-a");
  fs.mkdirSync(path.join(tasks, "brief"), { recursive: true });
  fs.mkdirSync(path.join(tasks, "staffing"), { recursive: true });
  fs.mkdirSync(path.join(run, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(run, "requests", "intake"), { recursive: true });
  fs.writeFileSync(
    path.join(run, "run.yaml"),
    "run_id: run-board-test\ncreated_at: 2026-08-11T00:00:00Z\n",
  );
  fs.writeFileSync(
    path.join(run, "goal.yaml"),
    "kind: delivery\nstatus: active\nscale: S\n",
  );
  fs.writeFileSync(
    path.join(run, "chunks.yaml"),
    "chunks:\n  - id: chunk-a\n    write_paths: [packages/**]\n    status: ready\n    task_id: task-a\n  - id: chunk-b\n    write_paths: [docs/**]\n    status: ready\n",
  );
  fs.writeFileSync(
    path.join(tasks, "task.yaml"),
    "id: task-a\nchunk_id: chunk-a\nstatus: assigned\nwrite_paths: [packages/**]\ntriad:\n  squad-lead: squad-lead@task-a\n  engineer: engineer@task-a\n  sdet: sdet@task-a\n",
  );
  fs.writeFileSync(path.join(tasks, "brief", "brief.yaml"), "status: approved\n");
  fs.writeFileSync(path.join(tasks, "staffing", "staffing.yaml"), "status: approved\n");
  fs.writeFileSync(
    path.join(run, "sessions", "engineer@task-a.yaml"),
    "state: awake\nrole_id: engineer\n",
  );
  fs.writeFileSync(
    path.join(run, "requests", "intake", "board.yaml"),
    "id: intake-1\nraw: 甲方新需求\nstatus: received\n",
  );
  fs.writeFileSync(path.join(run, "merge_queue.jsonl"), "");
  return run;
}

test("board: intake → Backlog, chunk w/o task → 分块, triad awake → 进行中, merged → 已完成", () => {
  const run = tmpRun();
  const b = buildBoard(run);
  const byId = new Map(b.cards.map((c) => [c.id, c]));

  assert.equal(byId.get("intake-1")?.column, "Backlog");
  assert.equal(byId.get("intake-1")?.owner, "甲方");
  assert.equal(byId.get("chunk-b")?.column, "分块");
  assert.equal(byId.get("task-a")?.column, "进行中");
  assert.equal(byId.get("task-a")?.owner, "squad-lead@task-a, engineer@task-a, sdet@task-a");
});

test("board: merged task lands in 已完成", () => {
  const run = tmpRun();
  fs.writeFileSync(
    path.join(run, "merge_queue.jsonl"),
    JSON.stringify({ task_id: "task-a", status: "merged" }) + "\n",
  );
  const b = buildBoard(run);
  assert.equal(b.cards.find((c) => c.id === "task-a")?.column, "已完成");
});

test("board: blocked progress flags the card", () => {
  const run = tmpRun();
  fs.writeFileSync(
    path.join(run, "tasks", "task-a", "progress.json"),
    JSON.stringify({ blocked: true }),
  );
  const b = buildBoard(run);
  assert.equal(b.cards.find((c) => c.id === "task-a")?.blocked, true);
});

test("board: render includes all columns in order", () => {
  const run = tmpRun();
  const text = renderBoard(buildBoard(run));
  let last = -1;
  for (const col of BOARD_COLUMNS) {
    const i = text.indexOf(`## ${col}`);
    assert.ok(i > last, `column ${col} present in order`);
    last = i;
  }
});
