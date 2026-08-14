/**
 * YAML state-file helpers (方向 B2 — store pattern).
 *
 * The store convention across packages (SessionStore / RoomStore / run-store /
 * window-store) is: **read-modify-write under `withFileLock`, persisted with
 * `writeAtomic`**. State files are YAML; this module centralizes the
 * read/write half of that pattern so stores don't repeat
 * `YAML.parse(fs.readFileSync(…))` / `writeAtomic(…, YAML.stringify(…))`.
 *
 * Read semantics: missing file → null (caller decides); parse errors still
 * throw (a corrupt state file must never be silently treated as absent).
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { writeAtomic } from "./atomic.js";

/** Read a YAML state file; `null` when the file does not exist. */
export function readYamlFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return YAML.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/** Run secret (runs/<id>/secret.txt); dev-secret fallback matches spawn env. */
export function readRunSecret(runDir: string): string {
  const p = path.join(runDir, "secret.txt");
  if (!fs.existsSync(p)) return "dev-secret";
  return fs.readFileSync(p, "utf8").trim();
}

/** Atomic YAML write (temp + rename, I10). */
export function writeYamlFile(filePath: string, data: unknown): void {
  writeAtomic(filePath, YAML.stringify(data));
}

/**
 * Read every `*.yaml` file in a directory (missing dir → `[]`), optionally
 * sorted by a field. The shared directory-listing pattern across stores
 * (P1 去重：此前各 store 各自 readdirSync+endsWith+read+sort 样板 8+ 份)。
 */
export function readYamlDir<T>(
  dir: string,
  opts: { sortBy?: (a: T) => string } = {},
): T[] {
  if (!fs.existsSync(dir)) return [];
  const rows = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readYamlFile<T>(path.join(dir, f)))
    .filter((x): x is T => x !== null);
  if (opts.sortBy) {
    const key = opts.sortBy;
    rows.sort((a, b) => key(a).localeCompare(key(b)));
  }
  return rows;
}
