import fs from "node:fs";

/**
 * Read a JSONL file line by line, tolerating corrupt lines (crash leftovers,
 * partial appends): a bad line is skipped, never allowed to break the whole
 * read. Missing file → `[]`. Every orchestrator JSONL read should go through
 * this helper so one corrupt byte cannot take down a whole drain/merge sweep.
 */
export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(filePath, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      continue; // 容错：损坏行跳过，不影响其余行
    }
  }
  return out;
}
