import fs from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock, writeAtomic } from "@picode/core";

export type Access = "post" | "read";

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

export class RoomStore {
  constructor(private runDir: string) {}

  private membersPath(room: string): string {
    return path.join(this.runDir, "rooms", room, "members.yaml");
  }

  private busPath(room: string): string {
    return path.join(this.runDir, "bus", `${room}.jsonl`);
  }

  private lockPath(room: string): string {
    return path.join(this.runDir, "bus", `.${room}.lock`);
  }

  loadMembers(room: string): Member[] {
    const jsonPath = path.join(this.runDir, "rooms", room, "members.json");
    const yamlPath = this.membersPath(room);
    const p = fs.existsSync(jsonPath) ? jsonPath : yamlPath;
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    try {
      const data = JSON.parse(raw);
      return (data.members ?? data) as Member[];
    } catch {
      return [];
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
    if (!this.canPost(room, agentId, msg.type)) {
      throw Object.assign(new Error("ROOM_POST_DENIED"), {
        code: "ROOM_POST_DENIED",
      });
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
      throw Object.assign(new Error("ROOM_READ_DENIED"), {
        code: "ROOM_READ_DENIED",
      });
    }
    const file = this.busPath(room);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => JSON.parse(l) as BusMessage);
  }
}
