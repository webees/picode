import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ErrorCode, PicodeError, ensureDir, withFileLock, writeAtomic } from "@picode/core";
import { groupByWindow, windowIdOf } from "./window.js";

export type Access = "post" | "read";

/**
 * Message types catalog (spec 10 §2). Every bus message MUST use one of these;
 * extensions must register new types in spec 10 before posting them.
 */
export const BUS_MESSAGE_TYPES: readonly string[] = [
  "chat",
  "progress",
  "status",
  "blocked",
  "ready",
  "objection",
  "handoff_notice",
  "handoff_ack",
  "request_info",
  "info_delivered",
  "request_cross_room",
  "cross_room_granted",
  "cross_room_revoked",
  "research_brief",
  "drift",
  "alert",
  "ingest",
  "intake_triaged",
  "doc_issue",
  "change_order",
  "work_brief_ready",
  "work_brief_revised",
  "memory_brief",
  "staffing_request",
  "staffing_propose",
  "staffing_approved",
  "cell_done",
  "check_signoff",
  "merge_ready",
  "window_rollup",
  "system",
  "error.report",
  "error.digest",
] as const;

export interface Member {
  id: string;
  access: Access;
  post_types_allow?: string[];
}

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

/** room id safe-name pattern: becomes path segments under rooms/ and bus/. */
const SAFE_ROOM_RE = /^[A-Za-z0-9_-]+$/;

export class RoomStore {
  constructor(private runDir: string) {}

  private assertSafeRoom(room: string): void {
    // 路径安全汇聚点：room 直接拼入 rooms/<room>/ 与 bus/<room>.jsonl，
    // 非法值（含 `../`）拒绝，防逃逸 runDir 读写任意路径（P1）。
    if (!SAFE_ROOM_RE.test(room)) {
      throw new PicodeError(
        ErrorCode.BAD_ARGS,
        `room "${room}" is not safe (letters/digits/_/- only)`,
      );
    }
  }

  private membersPath(room: string): string {
    this.assertSafeRoom(room);
    return path.join(this.runDir, "rooms", room, "members.yaml");
  }

  private busPath(room: string): string {
    this.assertSafeRoom(room);
    return path.join(this.runDir, "bus", `${room}.jsonl`);
  }

  private lockPath(room: string): string {
    this.assertSafeRoom(room);
    return path.join(this.runDir, "bus", `.${room}.lock`);
  }

  loadMembers(room: string): Member[] {
    const jsonPath = path.join(this.runDir, "rooms", room, "members.json");
    const yamlPath = this.membersPath(room);
    const p = fs.existsSync(jsonPath) ? jsonPath : yamlPath;
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    try {
      // 按扩展名分流：members.json → JSON；members.yaml → YAML（旧实现用
      // JSON.parse 解析 YAML 必然失败并静默返回 []，损坏态被当成"空成员表"）。
      const data = p.endsWith(".yaml") ? YAML.parse(raw) : JSON.parse(raw);
      return (data?.members ?? data) as Member[];
    } catch {
      throw new PicodeError(
        ErrorCode.CONFIG_INVALID,
        `members file corrupt (${p}) — ACL fail-closed, fix the file`,
      );
    }
  }

  saveMembers(room: string, members: Member[]): void {
    const p = path.join(this.runDir, "rooms", room, "members.json");
    ensureDir(path.dirname(p));
    writeAtomic(p, JSON.stringify({ room_id: room, members }, null, 2));
  }

  canPost(room: string, agentId: string, type?: string): boolean {
    const m = this.loadMembers(room).find((x) => x.id === agentId);
    if (!m || m.access !== "post") return false;
    if (m.post_types_allow && type && !m.post_types_allow.includes(type)) return false;
    return true;
  }

  canRead(room: string, agentId: string): boolean {
    const m = this.loadMembers(room).find((x) => x.id === agentId);
    return !!m && (m.access === "read" || m.access === "post");
  }

  async post(
    room: string,
    agentId: string,
    msg: Omit<BusMessage, "ts" | "id" | "from" | "room">,
  ): Promise<BusMessage> {
    // spec 10 §1: every message MUST use a cataloged type
    if (!BUS_MESSAGE_TYPES.includes(msg.type)) {
      throw new PicodeError(
        ErrorCode.BUS_TYPE_DENIED,
        `unknown bus message type: ${msg.type}`,
      );
    }
    if (!this.canPost(room, agentId, msg.type)) {
      throw new PicodeError(ErrorCode.ROOM_POST_DENIED, `post denied for ${agentId} in room ${room}`);
    }
    const full: BusMessage = {
      ts: new Date().toISOString(),
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: agentId,
      room,
      type: msg.type,
      body: msg.body,
      refs: msg.refs ?? [],
      reply_to: msg.reply_to ?? null,
      meta: msg.meta,
    };
    const file = this.busPath(room);
    ensureDir(path.dirname(file));
    await withFileLock(this.lockPath(room), () => {
      fs.appendFileSync(file, JSON.stringify(full) + "\n", "utf8");
    });
    return full;
  }

  history(room: string, agentId: string, limit = 50): BusMessage[] {
    if (!this.canRead(room, agentId)) {
      throw new PicodeError(ErrorCode.ROOM_READ_DENIED, `read denied for ${agentId} in room ${room}`);
    }
    return this.readBus(room).slice(-limit);
  }

  /** Read every message in the room (system operation, no ACL). */
  private readBus(room: string): BusMessage[] {
    const file = this.busPath(room);
    if (!fs.existsSync(file)) return [];
    const out: BusMessage[] = [];
    for (const line of fs.readFileSync(file, "utf8").trim().split("\n")) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as BusMessage);
      } catch {
        // 逐行容错：崩溃残留的半行不炸掉整个房间历史（P1-6）
        continue;
      }
    }
    return out;
  }

  private archivePath(room: string, windowId: string): string {
    return path.join(this.runDir, "bus", "archive", `${room}.${windowId}.jsonl`);
  }

  /**
   * 上/下午窗口压缩:keep the newest `ratio` of each *past* window's messages
   * verbatim and fold the oldest `1 - ratio` into one `window_rollup` message
   * (folded originals are archived to `bus/archive/<room>.<window>.jsonl`).
   * The current window is never folded.
   */
  async compressWindow(
    room: string,
    opts: { splitHour: number; ratio: number; minKeep: number; now?: Date },
  ): Promise<{
    room: string;
    current_window: string;
    folded_windows: string[];
    folded: number;
    kept: number;
    archived: string[];
  }> {
    const now = opts.now ?? new Date();
    const current = windowIdOf(now, opts.splitHour).id;
    return withFileLock(this.lockPath(room), () => {
      const all = this.readBus(room);
      if (all.length === 0) {
        return { room, current_window: current, folded_windows: [], folded: 0, kept: 0, archived: [] };
      }
      const byWindow = groupByWindow(all, opts.splitHour);
      const out: BusMessage[] = [];
      const archived: string[] = [];
      const foldedWindows: string[] = [];
      let foldedTotal = 0;
      let keptTotal = 0;

      for (const [wid, msgs] of byWindow) {
        if (wid === current || msgs.length <= opts.minKeep) {
          out.push(...msgs);
          keptTotal += msgs.length;
          continue;
        }
        // Never re-compress a window that already produced a rollup: folding it
        // again would shrink the bus below the promised `ratio` (D043) and
        // would nest rollups. Skip the whole window when one exists.
        const alreadyRolled = msgs.some(
          (m) => m.type === "window_rollup" && m.meta?.window === wid,
        );
        if (alreadyRolled) {
          out.push(...msgs);
          keptTotal += msgs.length;
          continue;
        }
        const keepCount = Math.max(opts.minKeep, Math.ceil(msgs.length * opts.ratio));
        const foldCount = msgs.length - keepCount;
        if (foldCount <= 0) {
          out.push(...msgs);
          keptTotal += msgs.length;
          continue;
        }
        const foldedMsgs = msgs.slice(0, foldCount);
        const keptMsgs = msgs.slice(foldCount);
        // archive folded originals (audit trail), then replace with one rollup
        const archiveFile = this.archivePath(room, wid);
        ensureDir(path.dirname(archiveFile));
        const body =
          foldedMsgs.length > 0
            ? foldedMsgs.map((m) => JSON.stringify(m)).join("\n") + "\n"
            : "";
        fs.appendFileSync(archiveFile, body, "utf8");
        archived.push(archiveFile);

        const froms = [...new Set(foldedMsgs.map((m) => m.from))];
        const typeCounts: Record<string, number> = {};
        for (const m of foldedMsgs) typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1;
        const rollup: BusMessage = {
          // ts must stay inside the folded window (last folded message's ts),
          // otherwise the next pass would attribute the rollup to the current
          // window and re-fold the kept messages (breaks idempotency).
          ts: foldedMsgs[foldedMsgs.length - 1].ts,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: "orchestrator",
          room,
          type: "window_rollup",
          body: `[窗口 ${wid}] 已折叠 ${foldedMsgs.length} 条消息(保留 ${keptMsgs.length} 条)。参与方: ${froms.join(", ") || "-"}。类型分布: ${Object.entries(typeCounts).map(([t, n]) => `${t}×${n}`).join(", ") || "-"}。原文归档: ${archiveFile}`,
          refs: [archiveFile],
          meta: {
            window: wid,
            folded: foldedMsgs.length,
            kept: keptMsgs.length,
            from_agents: froms,
            type_counts: typeCounts,
            archive: archiveFile,
          },
        };
        out.push(rollup, ...keptMsgs);
        foldedWindows.push(wid);
        foldedTotal += foldedMsgs.length;
        keptTotal += keptMsgs.length;
      }

      writeAtomic(this.busPath(room), out.map((m) => JSON.stringify(m)).join("\n") + "\n");
      return {
        room,
        current_window: current,
        folded_windows: foldedWindows,
        folded: foldedTotal,
        kept: keptTotal,
        archived,
      };
    });
  }
}
