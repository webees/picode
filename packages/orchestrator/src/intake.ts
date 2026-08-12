/**
 * Sponsor intake (sponsor 核心诉求：随时投喂 → 内部分诊).
 *
 * Feeds are the single external-input channel (information-control discipline):
 *   - `intake add`    → runs/<id>/intake/feed-<ts>.yaml（from=sponsor, status=open）
 *   - `intake triage` → status=triaged + assigned_to + bus 通知 leadership
 *   - `intake close`  → status=done
 * Board projects open feeds to Backlog; triaged/done feeds leave the backlog.
 */
import fs from "node:fs";
import path from "node:path";
import { ErrorCode, PicodeError, ensureDir, readYamlFile, writeYamlFile } from "@picode/core";
import { RoomStore } from "@picode/bus";

export const INTAKE_TYPES = ["需求", "研究", "文档", "问题"] as const;
export type IntakeType = (typeof INTAKE_TYPES)[number];

export interface IntakeFeed {
  schema_version: string;
  id: string;
  from: string;
  ts: string;
  type: IntakeType;
  body: string;
  status: "open" | "triaged" | "done";
  assigned_to: string | null;
  triaged_at: string | null;
  closed_at: string | null;
}

function intakeDir(dir: string): string {
  return path.join(dir, "intake");
}

function feedPath(dir: string, id: string): string {
  return path.join(intakeDir(dir), `${id}.yaml`);
}

function assertIntakeType(type: string): asserts type is IntakeType {
  if (!(INTAKE_TYPES as readonly string[]).includes(type)) {
    throw new PicodeError(
      ErrorCode.USAGE,
      `intake type must be one of ${INTAKE_TYPES.join("|")} (got: ${type})`,
    );
  }
}

/** Sponsor (or by-passing caller) drops a feed; lands as status=open. */
export function addFeed(
  dir: string,
  opts: { type: string; body: string; from?: string },
): IntakeFeed {
  assertIntakeType(opts.type);
  const ts = new Date().toISOString();
  const base = `feed-${ts.replace(/[:.]/g, "-")}`;
  let id = base;
  for (let n = 1; fs.existsSync(feedPath(dir, id)); n++) id = `${base}-${n}`;
  const feed: IntakeFeed = {
    schema_version: "1",
    id,
    from: opts.from ?? "sponsor",
    ts,
    type: opts.type,
    body: opts.body,
    status: "open",
    assigned_to: null,
    triaged_at: null,
    closed_at: null,
  };
  ensureDir(intakeDir(dir));
  writeYamlFile(feedPath(dir, id), feed);
  return feed;
}

export function readFeeds(dir: string): IntakeFeed[] {
  const d = intakeDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readYamlFile<IntakeFeed>(path.join(d, f))!)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

function getFeed(dir: string, id: string): IntakeFeed {
  const p = feedPath(dir, id);
  if (!fs.existsSync(p)) throw new PicodeError(ErrorCode.NOT_FOUND, `intake feed not found: ${id}`);
  return readYamlFile<IntakeFeed>(p)!;
}

/**
 * Run-lead assigns a feed to an agent (internal triage): status → triaged,
 * records assigned_to, and notifies leadership via bus (type intake_triaged).
 */
export async function triageFeed(dir: string, id: string, agent: string): Promise<IntakeFeed> {
  const feed = getFeed(dir, id);
  if (feed.status === "done") {
    throw new PicodeError(ErrorCode.ILLEGAL_STATE, `intake feed already done: ${id}`);
  }
  if (feed.status === "triaged") {
    throw new PicodeError(ErrorCode.ILLEGAL_STATE, `intake feed already triaged: ${id}`);
  }
  feed.status = "triaged";
  feed.assigned_to = agent;
  feed.triaged_at = new Date().toISOString();
  writeYamlFile(feedPath(dir, id), feed);
  const bus = new RoomStore(dir);
  await bus.post("leadership", "run-lead", {
    type: "intake_triaged",
    body: `[${feed.type}] ${feed.body}`.slice(0, 200),
    refs: [path.join("intake", `${id}.yaml`)],
    meta: { feed_id: id, assigned_to: agent, type: feed.type },
  });
  return feed;
}

/** Close a feed once its work is settled (→ done). */
export function closeFeed(dir: string, id: string): IntakeFeed {
  const feed = getFeed(dir, id);
  if (feed.status === "done") {
    throw new PicodeError(ErrorCode.ILLEGAL_STATE, `intake feed already closed: ${id}`);
  }
  feed.status = "done";
  feed.closed_at = new Date().toISOString();
  writeYamlFile(feedPath(dir, id), feed);
  return feed;
}
