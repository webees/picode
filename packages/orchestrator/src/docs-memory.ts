import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ensureDir, writeAtomic, type PicodeConfig } from "@picode/core";

/**
 * Memory & knowledge (18 phase G, I14): the docs cell owns run memory
 * (L1/L2 Memory Brief) and the knowledge base. Implementation triads must
 * not touch the main knowledge index.
 */

// ---------------------------------------------------------------------------
// Memory Brief (docs-lead → run-lead)
// ---------------------------------------------------------------------------

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

export function ackMemoryBrief(dir: string, id: string, by = "run-lead"): MemoryBrief {
  const p = path.join(briefsDir(dir), `${id}.yaml`);
  if (!fs.existsSync(p)) throw new Error(`memory brief not found: ${id}`);
  const brief = YAML.parse(fs.readFileSync(p, "utf8")) as MemoryBrief;
  if (brief.status === "acked") return brief; // idempotent
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

// ---------------------------------------------------------------------------
// Knowledge candidates (docs cell stages; docs-qa approves into the base)
// ---------------------------------------------------------------------------

export function knowledgeDraftPath(config: PicodeConfig, repoRoot: string, id: string): string {
  return path.join(repoRoot, config.paths.knowledge_root, "drafts", `${id}.md`);
}

export function knowledgeFinalPath(config: PicodeConfig, repoRoot: string, id: string): string {
  return path.join(repoRoot, config.paths.knowledge_root, `${id}.md`);
}

/** Stage a knowledge candidate under docs/knowledge/drafts (tech-writer). */
export function stageKnowledge(
  config: PicodeConfig,
  repoRoot: string,
  opts: { id: string; title: string; body: string; by?: string },
): string {
  const p = knowledgeDraftPath(config, repoRoot, opts.id);
  if (fs.existsSync(p)) throw new Error(`knowledge draft already staged: ${opts.id}`);
  ensureDir(path.dirname(p));
  writeAtomic(
    p,
    `---\nid: ${opts.id}\ntitle: "${opts.title}"\nstatus: draft\nstaged_by: ${opts.by ?? "tech-writer"}\nstaged_at: ${new Date().toISOString()}\n---\n\n${opts.body}\n`,
  );
  return p;
}

/** Approve a staged candidate into the knowledge base (docs-qa). */
export function approveKnowledge(
  config: PicodeConfig,
  repoRoot: string,
  id: string,
  by = "docs-qa",
): string {
  const draft = knowledgeDraftPath(config, repoRoot, id);
  if (!fs.existsSync(draft)) throw new Error(`knowledge draft not found: ${id}`);
  const final = knowledgeFinalPath(config, repoRoot, id);
  ensureDir(path.dirname(final));
  let content = fs.readFileSync(draft, "utf8");
  content = content.replace("status: draft", `status: approved\napproved_by: ${by}\napproved_at: ${new Date().toISOString()}`);
  writeAtomic(final, content);
  fs.unlinkSync(draft);
  // append to the main index (docs cell owns it — I14)
  const index = path.join(repoRoot, config.paths.knowledge_root, "README.md");
  ensureDir(path.dirname(index));
  if (!fs.existsSync(index)) {
    writeAtomic(index, "# Knowledge Base\n\n");
  }
  fs.appendFileSync(index, `- [${id}](./${id}.md)\n`);
  return final;
}
