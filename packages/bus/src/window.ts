/**
 * 上/下午窗口 (morning/afternoon windows) for context compression.
 *
 * A day is split into two windows at `split_hour` (default 12 = noon):
 *   - morning: 00:00 ≤ hour < split_hour
 *   - afternoon: split_hour ≤ hour < 24
 *
 * Compression keeps the newest `ratio` of a window's messages verbatim and
 * folds the oldest `1 - ratio` into a single `window_rollup` summary message
 * (kept in the room bus), archiving the folded originals for auditability.
 */

export interface WindowInfo {
  /** Stable window id, e.g. "2026-08-10-am" / "2026-08-10-pm". */
  id: string;
  /** "am" | "pm" */
  half: "am" | "pm";
  /** Local date "YYYY-MM-DD". */
  date: string;
}

/**
 * Run-level window rollup record (`windows/<window>.yaml`, 语义压缩层 P2).
 *
 * The mechanical fold produces the mechanical `window_rollup` bus message;
 * this record is the run archive shape that carries the *semantic* summary
 * layer: `summary` (model-written) and `summary_due` (latch). Both default to
 * unset/null on a mechanical fold and must survive subsequent mechanical
 * re-compression untouched.
 */
export interface WindowRollup {
  /** Window id, e.g. "2026-08-10-pm". */
  window: string;
  /** Archive file path (windows/<window>.yaml). */
  archive_path: string;
  /** Semantic summary (P2: docs cell model summary); null when not yet written. */
  summary?: string | null;
  /** Semantic-summary latch: true = a summary is due for this window. */
  summary_due?: boolean;
}

export function windowIdOf(isoTs: string | Date, splitHour: number): WindowInfo {
  const d = typeof isoTs === "string" ? new Date(isoTs) : isoTs;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const half = d.getHours() < splitHour ? "am" : "pm";
  return { id: `${date}-${half}`, half, date };
}

/** Group messages by their window id, oldest first. */
export function groupByWindow<T extends { ts: string }>(
  messages: T[],
  splitHour: number,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const m of messages) {
    const w = windowIdOf(m.ts, splitHour).id;
    const arr = map.get(w);
    if (arr) arr.push(m);
    else map.set(w, [m]);
  }
  return map;
}
