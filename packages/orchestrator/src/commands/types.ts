/**
 * CLI command registry types (方向 B4/E1/E2).
 *
 * Every subcommand is declared as a `Command` in `commands/*.ts`; `cli.ts`
 * only dispatches. Declarative metadata drives:
 *   - `picode --help` grouped by domain (E2)
 *   - `picode <cmd> <sub> --help` per-command usage (E1)
 *   - uniform `[picode] ERROR: <code>: <message>` rendering (E3)
 */
import type { PicodeConfig } from "@picode/core";

export interface CommandContext {
  /** Absolute repo root (--repo or cwd). */
  repo: string;
  /** Raw argv after the command name. */
  args: string[];
  /** runId (absent only for `init`). */
  runId?: string;
  /** Run directory (resolved for every non-init command). */
  dir?: string;
  /** Merged + validated config. */
  config?: PicodeConfig;
  /** True when the flag is present in args. */
  has: (name: string) => boolean;
  /** Value of `--name <value>` (or the flag with `=value`), else undefined. */
  arg: (name: string) => string | undefined;
}

export interface Command {
  /** Domain group for `--help` (run / goal / session / staffing / …). */
  domain: string;
  /** Command path, e.g. ["goal", "set-status"]. First element is the top-level verb. */
  path: string[];
  /** One-line description for the grouped help. */
  summary: string;
  /** Full usage line shown on `--help` and missing-argument errors. */
  usage: string;
  /** True when the command runs without a resolved run (currently only `init`). */
  noRun?: boolean;
  run: (ctx: CommandContext) => Promise<void> | void;
}
