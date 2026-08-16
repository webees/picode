import fs from "node:fs";
import path from "node:path";

/**
 * bus JSONL 解析纯函数层（D113 聊天室读面）。
 *
 * dashboard 是系统观测者（无 agent 身份）→ 读面走 fs 直读、不套 ACL
 * （apiGates / statusSnapshot 行计数直读先例，sysarch §1.3）。本模块只做
 * 解析纯函数，不含任何写侧逻辑——写统一经 @picode/bus RoomStore.post 校验链
 * （D114 写代理，ACL fail-closed）。
 *
 * 消息文件：runs/<id>/bus/<room>.jsonl，每行一条 JSON BusMessage。
 * 房间名在拼接 bus/<room>.jsonl 路径前须过 SAFE_ROOM_RE 校验（防路径逃逸）。
 */

export interface BusMessage {
  ts: string;
  id: string;
  from: string;
  room: string;
  type: string;
  body: string;
  refs: string[];
  reply_to?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * room id safe-name pattern（镜像 @picode/bus room-store.ts SAFE_ROOM_RE，
 * 服务层只读参照；成为路径段，非法值含 `../` 拒绝，防逃逸 runDir）。
 */
export const SAFE_ROOM_RE = /^[A-Za-z0-9_-]+$/;

/** 消息流默认 limit（?limit= 缺省/非法回退值，取最近 N 条）。 */
export const DEFAULT_BUS_LIMIT = 50;

export function isSafeRoom(room: string): boolean {
  return SAFE_ROOM_RE.test(room);
}

function assertSafeRoom(room: string): void {
  if (!isSafeRoom(room)) {
    throw new Error(`room "${room}" is not safe (letters/digits/_/- only)`);
  }
}

/**
 * 逐行解析：损坏/空行 → null（容错跳过，room-store readBus 先例 P1-6；
 * 崩溃残留的半行不炸掉整个房间历史）。
 */
export function parseBusLine(line: string): BusMessage | null {
  if (!line) return null;
  try {
    return JSON.parse(line) as BusMessage;
  } catch {
    return null;
  }
}

export interface ReadBusOpts {
  /** 取最近 N 条；默认 DEFAULT_BUS_LIMIT；非正整数回退默认。 */
  limit?: number;
}

/**
 * 读 bus/<room>.jsonl 消息流：逐行容错跳过损坏行；limit 切片取最近 N 条；
 * 房间名拼接路径前 SAFE_ROOM_RE 校验（防路径逃逸）。
 */
export function readBusMessages(
  dir: string,
  room: string,
  opts: ReadBusOpts = {},
): BusMessage[] {
  assertSafeRoom(room);
  const file = path.join(dir, "bus", `${room}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const all: BusMessage[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = parseBusLine(line);
    if (m) all.push(m);
  }
  const limit =
    typeof opts.limit === "number" && Number.isInteger(opts.limit) && opts.limit > 0
      ? opts.limit
      : DEFAULT_BUS_LIMIT;
  return all.slice(-limit);
}

export interface BusRoomCount {
  room: string;
  messages: number;
}

/**
 * 房间列表：扫描 bus/*.jsonl 行计数（与 statusSnapshot.rooms 同源口径，
 * status.ts 行计数直读先例——含损坏行的原始行数），按消息数降序。
 */
export function listBusRooms(dir: string): BusRoomCount[] {
  const busDir = path.join(dir, "bus");
  if (!fs.existsSync(busDir)) return [];
  const out: BusRoomCount[] = [];
  for (const f of fs.readdirSync(busDir)) {
    if (!f.endsWith(".jsonl")) continue;
    const room = f.slice(0, -".jsonl".length);
    const n = fs
      .readFileSync(path.join(busDir, f), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean).length;
    out.push({ room, messages: n });
  }
  out.sort((a, b) => b.messages - a.messages || a.room.localeCompare(b.room));
  return out;
}
