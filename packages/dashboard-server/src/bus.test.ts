import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_BUS_LIMIT,
  isSafeRoom,
  listBusRooms,
  parseBusLine,
  readBusMessages,
} from "./bus.js";

/** 临时 run 目录（bus/ 子目录就绪），模拟 runs/<id>/ 文件真相。 */
function tmpRunDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dash-bus-pure-"));
  fs.mkdirSync(path.join(dir, "bus"), { recursive: true });
  return dir;
}

function msg(id: string, ts: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts,
    id,
    from: "run-lead",
    room: "leadership",
    type: "chat",
    body: `body-${id}`,
    refs: [],
    reply_to: null,
    ...extra,
  });
}

test("parseBusLine: 合法行 → BusMessage 字段原样透传", () => {
  const line = JSON.stringify({
    ts: "2026-08-13T00:00:01.000Z",
    id: "m-1",
    from: "sponsor",
    room: "leadership",
    type: "chat",
    body: "开工",
    refs: ["a", "b"],
    reply_to: "m-0",
    meta: { kind: "kickoff", n: 1 },
  });
  assert.deepStrictEqual(parseBusLine(line), {
    ts: "2026-08-13T00:00:01.000Z",
    id: "m-1",
    from: "sponsor",
    room: "leadership",
    type: "chat",
    body: "开工",
    refs: ["a", "b"],
    reply_to: "m-0",
    meta: { kind: "kickoff", n: 1 },
  });
});

test("parseBusLine: 损坏行/空行 → null（逐行容错跳过，room-store readBus 先例）", () => {
  assert.strictEqual(parseBusLine(""), null);
  assert.strictEqual(parseBusLine("{broken, no closing brace"), null);
  assert.strictEqual(parseBusLine("not json at all"), null);
  assert.strictEqual(parseBusLine('{"ts": "unterminated'), null);
});

test("readBusMessages: 损坏行跳过 + limit 取最近 N 条 + 字段原样", () => {
  const dir = tmpRunDir();
  fs.writeFileSync(
    path.join(dir, "bus", "leadership.jsonl"),
    [
      msg("m-1", "2026-08-13T00:00:01.000Z"),
      "{corrupt line from crash}",
      msg("m-2", "2026-08-13T00:00:02.000Z", { from: "sponsor", meta: { kind: "kickoff" } }),
      msg("m-3", "2026-08-13T00:00:03.000Z", { reply_to: "m-1" }),
      "",
    ].join("\n"),
  );
  const all = readBusMessages(dir, "leadership");
  assert.deepStrictEqual(all.map((m) => m.id), ["m-1", "m-2", "m-3"], "损坏行被跳过");
  assert.strictEqual(all[1].from, "sponsor");
  assert.deepStrictEqual(all[1].meta, { kind: "kickoff" }, "meta 字段原样");
  assert.strictEqual(all[2].reply_to, "m-1");
  const last2 = readBusMessages(dir, "leadership", { limit: 2 });
  assert.deepStrictEqual(last2.map((m) => m.id), ["m-2", "m-3"], "limit 取最近 N 条");
});

test("readBusMessages: limit 默认 50，超过 50 条取最近 50；非正整数回退默认", () => {
  const dir = tmpRunDir();
  const lines = Array.from({ length: 60 }, (_, i) =>
    msg(`m-${i}`, `2026-08-13T00:00:${String(i).padStart(2, "0")}.000Z`),
  );
  fs.writeFileSync(path.join(dir, "bus", "leadership.jsonl"), lines.join("\n") + "\n");
  const msgs = readBusMessages(dir, "leadership");
  assert.strictEqual(msgs.length, DEFAULT_BUS_LIMIT);
  assert.strictEqual(msgs[0].id, "m-10");
  assert.strictEqual(msgs[msgs.length - 1].id, "m-59");
  assert.strictEqual(readBusMessages(dir, "leadership", { limit: 0 }).length, DEFAULT_BUS_LIMIT);
  assert.strictEqual(readBusMessages(dir, "leadership", { limit: -3 }).length, DEFAULT_BUS_LIMIT);
  assert.strictEqual(readBusMessages(dir, "leadership", { limit: 1000 }).length, 60, "limit 超总量 → 全量");
});

test("readBusMessages: 房间名路径逃逸拒绝（SAFE_ROOM_RE，拼接 bus/<room>.jsonl 前校验）", () => {
  const dir = tmpRunDir();
  fs.writeFileSync(path.join(dir, "secret.txt"), "top-secret");
  for (const bad of ["../secret", "a/b", "..", "", "a b", "leadership/../../secret"]) {
    assert.throws(() => readBusMessages(dir, bad), /not safe/, `room "${bad}" 应被拒绝`);
  }
  assert.ok(isSafeRoom("leadership"));
  assert.ok(isSafeRoom("squad-eng-1"));
  assert.ok(!isSafeRoom("../../etc"));
  assert.ok(!isSafeRoom("a/b"));
  assert.ok(!isSafeRoom(""));
});

test("readBusMessages: 不存在的房间 → 空数组（不 500）", () => {
  const dir = tmpRunDir();
  assert.deepStrictEqual(readBusMessages(dir, "ghost"), []);
});

test("listBusRooms: bus/*.jsonl 扫描行计数（与 statusSnapshot.rooms 同源口径，含损坏行）", () => {
  const dir = tmpRunDir();
  fs.writeFileSync(
    path.join(dir, "bus", "leadership.jsonl"),
    '{"ts":"a","id":"1"}\n{corrupt}\n{"ts":"b","id":"2"}\n',
  );
  fs.writeFileSync(path.join(dir, "bus", "product.jsonl"), '{"ts":"a","id":"1"}\n');
  fs.writeFileSync(path.join(dir, "bus", "notes.txt"), "not a bus file\n");
  const rooms = listBusRooms(dir);
  assert.deepStrictEqual(rooms, [
    { room: "leadership", messages: 3 },
    { room: "product", messages: 1 },
  ]);
});

test("listBusRooms: 无 bus 目录 → 空数组", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dash-bus-empty-"));
  assert.deepStrictEqual(listBusRooms(dir), []);
});
