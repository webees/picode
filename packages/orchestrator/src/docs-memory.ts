import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ensureDir, writeAtomic } from "@picode/core";

/**
 * Memory Brief (18 phase G / 08-invariants I14): the docs lead (docs-lead)
 * reports the L1/L2 memory surface to the engineering lead (run-lead), who
 * must ack it before the memory face can be closed (11 playbook DoD).
 * Knowledge ingest lives in memory.ts (ingestTaskKnowledge).
 */
export interface MemoryBrief {
  schema_version: "1";
  id: string;
  status: "delivered" | "acked";
  l1_summary: string;
  l2_paths: string[];
  risks: string[];
  by: string;
  created_at: string;
  acked_by: string | null;
  acked_at: string | null;
}

function briefsDir(dir: string): string {
  return path.join(dir, "memory_briefs");
}

export function writeMemoryBrief(
  dir: string,
  opts: { l1_summary: string; l2_paths?: string[]; risks?: string[]; by?: string },
): MemoryBrief {
  const brief: MemoryBrief = {
    schema_version: "1",
    id: `mb-${Date.now()}`,
    status: "delivered",
    l1_summary: opts.l1_summary,
    l2_paths: opts.l2_paths ?? [],
    risks: opts.risks ?? [],
    by: opts.by ?? "docs-lead",
    created_at: new Date().toISOString(),
    acked_by: null,
    acked_at: null,
  };
  ensureDir(briefsDir(dir));
  writeAtomic(path.join(briefsDir(dir), `${brief.id}.yaml`), YAML.stringify(brief));
  return brief;
}

/** run-lead acknowledges the memory surface (idempotent). */
export function ackMemoryBrief(dir: string, id: string, by = "run-lead"): MemoryBrief {
  const p = path.join(briefsDir(dir), `${id}.yaml`);
  if (!fs.existsSync(p)) throw new Error(`memory brief not found: ${id}`);
  const brief = YAML.parse(fs.readFileSync(p, "utf8")) as MemoryBrief;
  if (brief.status === "acked") return brief;
  const next: MemoryBrief = {
    ...brief,
    status: "acked",
    acked_by: by,
    acked_at: new Date().toISOString(),
  };
  writeAtomic(p, YAML.stringify(next));
  return next;
}

export function listMemoryBriefs(dir: string): MemoryBrief[] {
  const d = briefsDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => YAML.parse(fs.readFileSync(path.join(d, f), "utf8")) as MemoryBrief)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
