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
  fs.mkdirSync(path.join(run, "intake"), { recursive: true });
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
    path.join(run, "intake", "feed-1.yaml"),
    'schema_version: "1"\nid: intake-1\nfrom: sponsor\nts: 2026-08-11T00:00:00Z\ntype: request\nbody: 甲方新需求\nstatus: open\nassigned_to: null\ntriaged_at: null\nclosed_at: null\n',
  );
  fs.writeFileSync(path.join(run, "merge_queue.jsonl"), "");
  return run;
}

test("board: intake → Backlog, chunk w/o task → 分块, triad awake → 进行中, merged → 已完成", async () => {
  const run = tmpRun();
  const b = buildBoard(run);
  const byId = new Map(b.cards.map((c) => [c.id, c]));

  assert.equal(byId.get("intake-1")?.column, "Backlog");
  assert.equal(byId.get("intake-1")?.owner, "sponsor");
  assert.equal(byId.get("chunk-b")?.column, "分块");
  assert.equal(byId.get("task-a")?.column, "进行中");
  assert.equal(byId.get("task-a")?.owner, "squad-lead@task-a, engineer@task-a, sdet@task-a");
});

test("board: merged task lands in 已完成", async () => {
  const run = tmpRun();
  fs.writeFileSync(
    path.join(run, "merge_queue.jsonl"),
    JSON.stringify({ task_id: "task-a", status: "merged" }) + "\n",
  );
  const b = buildBoard(run);
  assert.equal(b.cards.find((c) => c.id === "task-a")?.column, "已完成");
});

test("board: blocked progress flags the card", async () => {
  const run = tmpRun();
  fs.writeFileSync(
    path.join(run, "tasks", "task-a", "progress.json"),
    JSON.stringify({ blocked: true }),
  );
  const b = buildBoard(run);
  assert.equal(b.cards.find((c) => c.id === "task-a")?.blocked, true);
});

test("board: render includes all columns in order", async () => {
  const run = tmpRun();
  const text = renderBoard(buildBoard(run));
  let last = -1;
  for (const col of BOARD_COLUMNS) {
    const i = text.indexOf(`## ${col}`);
    assert.ok(i > last, `column ${col} present in order`);
    last = i;
  }
});

test("board: intake/ feed with status=open lands in Backlog; triaged/done excluded", async () => {
  const run = tmpRun();
  const intake = path.join(run, "intake");
  fs.mkdirSync(intake, { recursive: true });
  fs.writeFileSync(
    path.join(intake, "feed-open.yaml"),
    "id: feed-open\nfrom: sponsor\nts: 2026-08-13T00:00:00Z\ntype: 需求\nbody: 随时投喂需求\nstatus: open\n",
  );
  fs.writeFileSync(
    path.join(intake, "feed-triaged.yaml"),
    "id: feed-triaged\nfrom: sponsor\nts: 2026-08-13T00:00:01Z\ntype: 研究\nbody: 已分诊\nstatus: triaged\nassigned_to: ind-res\n",
  );
  fs.writeFileSync(
    path.join(intake, "feed-done.yaml"),
    "id: feed-done\nfrom: sponsor\nts: 2026-08-13T00:00:02Z\ntype: 文档\nbody: 已完成\nstatus: done\n",
  );
  const b = buildBoard(run);

  const open = b.cards.find((c) => c.id === "feed-open");
  assert.equal(open?.column, "Backlog");
  assert.equal(open?.kind, "intake");
  assert.equal(open?.owner, "sponsor");
  assert.equal(open?.blocked, false);
  assert.ok(open?.title.startsWith("需求"), "title prefixes the feed type");

  assert.equal(b.cards.some((c) => c.id === "feed-triaged"), false);
  assert.equal(b.cards.some((c) => c.id === "feed-done"), false);
});

const WRITE_APIS = [
  "writeFileSync",
  "writeFile",
  "appendFileSync",
  "appendFile",
  "mkdirSync",
  "mkdir",
  "rmSync",
  "rm",
  "rmdirSync",
  "rmdir",
  "renameSync",
  "rename",
  "copyFileSync",
  "copyFile",
  "unlinkSync",
  "unlink",
  "writeSync",
  "write",
  "createWriteStream",
];

test("board: 源码零写路径（静态断言）", async () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "board.ts"), "utf8");
  for (const api of WRITE_APIS) {
    assert.ok(!src.includes(`fs.${api}`), `board.ts must not use fs.${api}`);
  }
});

test("board: buildBoard 不修改 run 目录（运行时断言）", async () => {
  const run = tmpRun();
  const snapshot = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (p: string) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) walk(full);
        else out.push(`${path.relative(run, full)}:${fs.statSync(full).size}`);
      }
    };
    walk(dir);
    return out.sort();
  };

  const before = snapshot(run);
  buildBoard(run);
  assert.deepEqual(snapshot(run), before);
});
