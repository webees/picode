import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { readWatermark, reserve, land, status } from "./reserve.mjs";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watermark-"));
  return path.join(dir, "watermark.yaml");
}

test("readWatermark 返回初始状态（无文件时）", () => {
  const wm = readWatermark(tmpFile());
  assert.equal(wm.schema_version, "1");
  assert.equal(wm.next_number, 90);
  assert.deepEqual(wm.reservations, []);
});

test("reserve 领取连续编号并推进水位", async () => {
  const file = tmpFile();
  const res = await reserve(file, "run-a", 3);
  assert.equal(res.from, 90);
  assert.deepEqual(res.numbers, [90, 91, 92]);
  assert.equal(res.idempotent, false);
  const wm = readWatermark(file);
  assert.equal(wm.next_number, 93);
  assert.equal(wm.reservations.length, 1);
});

test("同一 run 重复 reserve 幂等返回既有预留，不推进水位", async () => {
  const file = tmpFile();
  const first = await reserve(file, "run-a", 3);
  const second = await reserve(file, "run-a", 3);
  assert.equal(second.from, first.from);
  assert.deepEqual(second.numbers, first.numbers);
  assert.equal(second.idempotent, true);
  const wm = readWatermark(file);
  assert.equal(wm.next_number, 93);
  assert.equal(wm.reservations.length, 1);
});

test("两个 run 领取的编号区间不重叠", async () => {
  const file = tmpFile();
  const a = await reserve(file, "run-a", 2);
  const b = await reserve(file, "run-b", 3);
  assert.deepEqual(a.numbers, [90, 91]);
  assert.deepEqual(b.numbers, [92, 93, 94]);
});

test("flock 串行化并发 claim，编号无重复", async () => {
  const file = tmpFile();
  const runs = Array.from({ length: 5 }, (_, i) => `run-${i}`);
  const results = await Promise.all(runs.map((r, i) => reserve(file, r, 2)));
  const all = results.flatMap((r) => r.numbers);
  assert.equal(new Set(all).size, all.length);
  const wm = readWatermark(file);
  assert.equal(wm.next_number, 90 + 10);
});

test("land 标记预留为已占用；重复 land 幂等", async () => {
  const file = tmpFile();
  await reserve(file, "run-a", 2);
  const landed = await land(file, "run-a");
  assert.equal(landed.status, "landed");
  assert.equal(landed.idempotent, false);
  const again = await land(file, "run-a");
  assert.equal(again.idempotent, true);
  const wm = readWatermark(file);
  assert.equal(wm.reservations[0].status, "landed");
});

test("land 无预留的 run 抛错", async () => {
  const file = tmpFile();
  await assert.rejects(() => land(file, "ghost-run"), /无预留/);
});

test("status 只读快照含水位与预留", async () => {
  const file = tmpFile();
  await reserve(file, "run-a", 3);
  const snap = await status(file);
  assert.equal(snap.next_number, 93);
  assert.equal(snap.reservations.length, 1);
  assert.deepEqual(
    YAML.parse(fs.readFileSync(file, "utf8")),
    snap,
  );
});

test("损坏水位文件抛错而非静默回退", () => {
  const file = tmpFile();
  fs.writeFileSync(file, "schema_version: '2'\n");
  assert.throws(() => readWatermark(file), /schema 不符/);
});
