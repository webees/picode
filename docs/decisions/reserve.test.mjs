import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { readWatermark, reserve, land, status, planCheck } from "./reserve.mjs";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watermark-"));
  return path.join(dir, "watermark.yaml");
}

/** 建一个最小仓库 fixture（docs/DECISIONS.md + docs/decisions/watermark.yaml）。 */
function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
  fs.mkdirSync(path.join(dir, "docs", "decisions"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "docs", "DECISIONS.md"),
    "# 决策日志（现行有效）\n\n|ID|现行意图|\n|----|----------|\n|D001|决策一|\n|D002|决策二|\n\n## D001 — 决策一\n- 内容\n\n## D002 — 决策二\n- 内容\n",
  );
  return dir;
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
  assert.equal(res.start, 90);
  assert.deepEqual(res.numbers, [90, 91, 92]);
  assert.equal(res.idempotent, false);
  const wm = readWatermark(file);
  assert.equal(wm.next_number, 93);
  assert.equal(wm.reservations.length, 1);
  assert.equal(wm.reservations[0].start, 90);
  assert.equal(wm.reservations[0].count, 3);
  assert.equal(wm.reservations[0].status, "reserved");
  assert.ok(!("from" in wm.reservations[0]), "reservation must not write legacy `from` field");
});

test("同一 run 重复 reserve 幂等返回既有预留，不推进水位", async () => {
  const file = tmpFile();
  const first = await reserve(file, "run-a", 3);
  const second = await reserve(file, "run-a", 3);
  assert.equal(second.start, first.start);
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

test("reserve 写入的 watermark 被 decision-lint 接受（领号→lint 闭环，C2）", async () => {
  const dir = tmpRepo();
  const wmFile = path.join(dir, "docs", "decisions", "watermark.yaml");
  await reserve(wmFile, "run-loop", 2);
  const { checkDecisions } = await import("@picode/core");
  const result = checkDecisions(dir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.ok(
    !result.problems.some((p) => p.code === "WATERMARK_INVALID"),
    JSON.stringify(result.problems),
  );
});

test("--plan 预检：预留编号可解析、未预留 D0xx 报 REF_UNRESOLVED（与 lint 对齐）", () => {
  const dir = tmpRepo();
  const wmFile = path.join(dir, "docs", "decisions", "watermark.yaml");
  writeWm(wmFile, { next: 8, reservations: [{ run: "run-p", start: 5, count: 2, status: "reserved" }] });
  fs.writeFileSync(path.join(dir, "plan.md"), "本 run 决策：D005（预留）、D007（未预留）、D099（未预留）\n");
  const result = planCheck(wmFile, path.join(dir, "plan.md"));
  assert.equal(result.ok, true, "REF_UNRESOLVED 仅 warning，不阻断");
  assert.ok(
    !result.problems.some((p) => p.code === "WATERMARK_INVALID"),
    JSON.stringify(result.problems),
  );
  assert.ok(
    result.problems.some((p) => p.code === "REF_UNRESOLVED" && p.number === "D007"),
    JSON.stringify(result.problems),
  );
  assert.ok(
    !result.problems.some((p) => p.number === "D005"),
    "reserved number must not be flagged: " + JSON.stringify(result.problems),
  );
});

test("--plan 预检：plan 文件缺失 → PLAN_MISSING error", () => {
  const dir = tmpRepo();
  const wmFile = path.join(dir, "docs", "decisions", "watermark.yaml");
  writeWm(wmFile, { next: 8, reservations: [] });
  const result = planCheck(wmFile, path.join(dir, "nope.md"));
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.code === "PLAN_MISSING" && p.severity === "error"),
    JSON.stringify(result.problems),
  );
});

function writeWm(file, { next, reservations }) {
  fs.writeFileSync(file, `schema_version: "1"\nnext_number: ${next}\nreservations:\n${YAML.stringify(reservations).replace(/^/gm, "  ")}`);
}
