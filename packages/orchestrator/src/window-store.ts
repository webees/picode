import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ensureDir, writeAtomic, type PicodeConfig } from "@picode/core";
import { RoomStore, windowIdOf } from "@picode/bus";

/**
 * 上/下午窗口压缩(run 级入口 + 会话/记忆归档)。
 *
 * - 对每个房间 bus 执行 `RoomStore.compressWindow`(保留最近 ratio=0.8,
 *   折叠最老 20% 为 window_rollup)。
 * - 结果汇总到 run 级归档 `runs/<id>/windows/<current-window>.yaml`,作为
 *   会话/记忆压缩产物:唤醒的会话(尤其 docs-lead / sess-mgr)可把归档路径
 *   加入 must_read_refs,不必重读全部历史。
 */

export interface RoomCompressResult {
  room: string;
  folded: number;
  kept: number;
  folded_windows: string[];
  archived: string[];
}

export interface RunWindowArchive {
  schema_version: "1";
  window: string;
  at: string;
  split_hour: number;
  ratio: number;
  rooms: RoomCompressResult[];
  total_folded: number;
  total_kept: number;
  archive_path: string;
}

export async function compressRunWindows(
  dir: string,
  config: PicodeConfig,
  opts: { rooms?: string[]; now?: Date } = {},
): Promise<RunWindowArchive> {
  const now = opts.now ?? new Date();
  const { split_hour, compression } = config.windows;
  const rooms =
    opts.rooms && opts.rooms.length > 0
      ? opts.rooms
      : config.rooms.map((r) => r.id);
  const store = new RoomStore(dir);
  const results: RoomCompressResult[] = [];
  for (const room of rooms) {
    const r = await store.compressWindow(room, {
      splitHour: split_hour,
      ratio: compression.ratio,
      minKeep: compression.min_keep,
      now,
    });
    results.push({
      room,
      folded: r.folded,
      kept: r.kept,
      folded_windows: r.folded_windows,
      archived: r.archived,
    });
  }
  const windowId = windowIdOf(now, split_hour).id;
  const archivePath = path.join(dir, "windows", `${windowId}.yaml`);
  const archive: RunWindowArchive = {
    schema_version: "1",
    window: windowId,
    at: now.toISOString(),
    split_hour,
    ratio: compression.ratio,
    rooms: results,
    total_folded: results.reduce((s, r) => s + r.folded, 0),
    total_kept: results.reduce((s, r) => s + r.kept, 0),
    archive_path: archivePath,
  };
  ensureDir(path.dirname(archivePath));
  writeAtomic(archivePath, YAML.stringify(archive));
  return archive;
}

/** Read the latest window archive (memory/session compression note). */
export function readWindowArchive(dir: string): RunWindowArchive | null {
  const d = path.join(dir, "windows");
  if (!fs.existsSync(d)) return null;
  const files = fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".yaml"))
    .sort();
  if (files.length === 0) return null;
  return YAML.parse(
    fs.readFileSync(path.join(d, files[files.length - 1]), "utf8"),
  ) as RunWindowArchive;
}

/** Window status: current window + per-room message counts (read-only). */
export function windowStatus(dir: string, config: PicodeConfig): {
  current_window: string;
  split_hour: number;
  compression: { ratio: number; min_keep: number };
  rooms: Array<{ room: string; messages: number }>;
  last_archive: string | null;
} {
  const now = new Date();
  const { split_hour, compression } = config.windows;
  const store = new RoomStore(dir);
  const rooms = config.rooms.map((r) => r.id).map((room) => {
    const file = path.join(dir, "bus", `${room}.jsonl`);
    const messages = fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).length
      : 0;
    return { room, messages };
  });
  const last = readWindowArchive(dir);
  return {
    current_window: windowIdOf(now, split_hour).id,
    split_hour,
    compression,
    rooms,
    last_archive: last?.archive_path ?? null,
  };
}
