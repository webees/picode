#!/usr/bin/env node
/**
 * 决策编号全局分配器（watermark allocator）。
 *
 * 并行 run 各自向 DECISIONS 追加决策时，直接数「当前最大编号 + 1」会撞号
 * （D084-D089 曾因 skill docs 与 checkpoint docs 并行合并而冲突重排）。
 * 本脚本通过 docs/decisions/watermark.yaml（schema v1）在 flock 临界区下
 * 原子地领取编号区间：`--reserve` 为某 run 领取 N 个连续编号并推进水位，
 * `--land` 把该 run 的预留标记为已落地（编号已占用），`--status` 只读快照。
 *
 * 用法:
 *   node docs/decisions/reserve.mjs --reserve --run <run-id> --count N [--watermark <path>]
 *   node docs/decisions/reserve.mjs --land --run <run-id>      [--watermark <path>]
 *   node docs/decisions/reserve.mjs --status                    [--watermark <path>]
 *
 * 复用 @picode/core 的 withFileLock + writeAtomic（读改写全程持锁），claim 幂等：
 * 同一 run 重复 --reserve 返回既有预留，不再推进水位。
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { withFileLock, writeAtomic } from "@picode/core";

const DEFAULT_WATERMARK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "watermark.yaml",
);

const SCHEMA_VERSION = "1";
const DEFAULT_STATE = { schema_version: SCHEMA_VERSION, next_number: 90, reservations: [] };

/** 读取水位文件；不存在时返回初始状态（next_number=90，D089 之后）。 */
export function readWatermark(file = DEFAULT_WATERMARK) {
  if (!fs.existsSync(file)) return structuredClone(DEFAULT_STATE);
  const parsed = YAML.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || parsed.schema_version !== SCHEMA_VERSION) {
    throw new Error(`watermark 文件损坏或 schema 不符: ${file}`);
  }
  return parsed;
}

/** 在 flock 临界区下领取 count 个决策编号；同一 run 幂等返回既有预留。 */
export async function reserve(file, run, count) {
  if (!run) throw new Error("--run 必填");
  if (!Number.isInteger(count) || count < 1) throw new Error("--count 必须为正整数");
  const lockPath = `${file}.lock`;
  return withFileLock(lockPath, () => {
    const wm = readWatermark(file);
    const existing = wm.reservations.find((r) => r.run === run);
    if (existing) {
      return {
        run,
        from: existing.from,
        count: existing.count,
        numbers: range(existing.from, existing.count),
        status: existing.status,
        idempotent: true,
      };
    }
    const from = wm.next_number;
    wm.reservations.push({ run, from, count, status: "reserved" });
    wm.next_number = from + count;
    writeAtomic(file, YAML.stringify(wm));
    return { run, from, count, numbers: range(from, count), status: "reserved", idempotent: false };
  });
}

/** 把某 run 的预留标记为 landed（编号已占用）；已 landed 视为幂等成功。 */
export async function land(file, run) {
  if (!run) throw new Error("--run 必填");
  const lockPath = `${file}.lock`;
  return withFileLock(lockPath, () => {
    const wm = readWatermark(file);
    const entry = wm.reservations.find((r) => r.run === run);
    if (!entry) throw new Error(`run ${run} 无预留，无法 land`);
    if (entry.status === "landed") return { run, status: "landed", idempotent: true };
    entry.status = "landed";
    writeAtomic(file, YAML.stringify(wm));
    return { run, status: "landed", idempotent: false };
  });
}

/** 只读快照：水位 + 全部预留。 */
export async function status(file = DEFAULT_WATERMARK) {
  return readWatermark(file);
}

function range(from, count) {
  return Array.from({ length: count }, (_, i) => from + i);
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function print(obj) {
  process.stdout.write(`${YAML.stringify(obj)}\n`);
}

async function main(argv) {
  const watermark = flag(argv, "watermark") ?? DEFAULT_WATERMARK;
  const run = flag(argv, "run");
  if (argv.includes("--reserve")) {
    const count = Number(flag(argv, "count"));
    if (!Number.isInteger(count)) throw new Error("--reserve 需要 --count N");
    print(await reserve(watermark, run, count));
  } else if (argv.includes("--land")) {
    print(await land(watermark, run));
  } else if (argv.includes("--status")) {
    print(await status(watermark));
  } else {
    process.stderr.write(
      "用法: node docs/decisions/reserve.mjs --reserve --run <id> --count N | --land --run <id> | --status\n",
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`reserve.mjs: ${err.message}\n`);
    process.exitCode = 1;
  });
}
