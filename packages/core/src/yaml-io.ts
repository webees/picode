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
import YAML from "yaml";
import { writeAtomic } from "./atomic.js";

/** Read a YAML state file; `null` when the file does not exist. */
export function readYamlFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return YAML.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/** Atomic YAML write (temp + rename, I10). */
export function writeYamlFile(filePath: string, data: unknown): void {
  writeAtomic(filePath, YAML.stringify(data));
}
