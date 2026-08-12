import fs from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "@picode/core";

/**
 * 转录归档（P4）：orchestrator 侧捕获「投喂给 agent 的消息文本」与
 * 「服务端响应 parts」，追加落盘为 runs/<id>/transcripts/<agent>.jsonl。
 *
 * 与其它状态文件同一风格（session_commands.jsonl）：每行一个 JSON 对象，
 * 带 schema_version + type 字段；写入走 withFileLock 防并发交错。
 * transcripts/ 目录同时是 buildPiEnv 注入给 agent 的
 * PICODE_TRANSCRIPT_DIR —— agent 自写文件与 orchestrator 的
 * <agent>.jsonl 共存不冲突（agent 文件名不同）。
 *
 * 消费方：wakeWithOpencode 重 spawn 时用 historySummary 生成历史要点，
 * 追加进 ready 消息（P4 断点续跑）。
 */

export const TRANSCRIPT_SCHEMA_VERSION = "1";

export type TranscriptEntryType = "outgoing" | "incoming";

export interface TranscriptEntry {
  schema_version: "1";
  type: TranscriptEntryType;
  ts: string;
  agent_id: string;
  /** type=outgoing：投喂给 agent 的完整消息文本。 */
  text?: string;
  /** type=incoming：服务端返回的响应 parts。 */
  parts?: Array<{ type: string; text?: string }>;
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

export class TranscriptStore {
  constructor(private runDir: string) {}

  private transcriptsDir(): string {
    return path.join(this.runDir, "transcripts");
  }

  private path(agentId: string): string {
    return path.join(this.transcriptsDir(), `${agentId}.jsonl`);
  }

  private lockPath(): string {
    return path.join(this.transcriptsDir(), ".lock");
  }

  /** 追加一条转录记录（outgoing / incoming）。 */
  async append(
    agentId: string,
    entry: Omit<TranscriptEntry, "schema_version" | "ts" | "agent_id">,
  ): Promise<TranscriptEntry> {
    const full: TranscriptEntry = {
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      agent_id: agentId,
      ...entry,
    };
    ensureDir(this.transcriptsDir());
    await withFileLock(this.lockPath(), () => {
      fs.appendFileSync(this.path(agentId), JSON.stringify(full) + "\n", "utf8");
    });
    return full;
  }

  /** 记录一次投喂的 ready 消息文本。 */
  async recordOutgoing(agentId: string, text: string): Promise<TranscriptEntry> {
    return this.append(agentId, { type: "outgoing", text });
  }

  /** 记录一次服务端响应 parts。 */
  async recordResponse(
    agentId: string,
    parts: Array<{ type: string; text?: string }>,
  ): Promise<TranscriptEntry> {
    return this.append(agentId, { type: "incoming", parts });
  }

  /** 按时间顺序读取全部转录；文件不存在返回 []。 */
  read(agentId: string): TranscriptEntry[] {
    const p = this.path(agentId);
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as TranscriptEntry);
  }

  /**
   * 生成历史要点摘要（确定性启发式，无 LLM）：给出条数统计 + 最近
   * maxEntries 条的可读要点。空转录 / 文件损坏返回 null（best-effort）。
   */
  historySummary(
    agentId: string,
    opts: { maxEntries?: number } = {},
  ): string | null {
    let entries: TranscriptEntry[];
    try {
      entries = this.read(agentId);
    } catch {
      return null;
    }
    if (entries.length === 0) return null;
    const max = opts.maxEntries ?? 20;
    const recent = entries.slice(-max);
    const outgoing = entries.filter((e) => e.type === "outgoing").length;
    const incoming = entries.filter((e) => e.type === "incoming").length;
    const lines: string[] = [
      `历史转录共 ${entries.length} 条（outgoing ${outgoing} / incoming ${incoming}），最近 ${recent.length} 条要点：`,
    ];
    for (const e of recent) {
      if (e.type === "outgoing") {
        lines.push(`- [${e.ts}] 投喂: ${truncate(e.text ?? "", 120)}`);
      } else {
        const texts = (e.parts ?? [])
          .filter((p) => typeof p.text === "string" && p.text.trim().length > 0)
          .map((p) => truncate(p.text as string, 120));
        if (texts.length > 0) {
          lines.push(`- [${e.ts}] 响应: ${texts.join(" | ")}`);
        } else {
          lines.push(`- [${e.ts}] 响应: ${(e.parts ?? []).length} parts`);
        }
      }
    }
    return lines.join("\n");
  }
}
