/**
 * Command registry (方向 B4): every CLI subcommand declared declaratively,
 * grouped by domain. `cli.ts` only dispatches; the metadata drives the
 * grouped `--help` (E2) and per-command usage (E1).
 */
import type { Command, CommandContext } from "./types.js";
import { runCommands } from "./run.js";
import { boardCommands } from "./board.js";
import { goalCommands } from "./goal.js";
import { sessionCommands, sessionFallback } from "./session.js";
import { staffingCommands, staffingFallback } from "./staffing.js";
import { taskCommands } from "./task.js";
import { mergeCommands, mergeFallback } from "./merge.js";
import { memoryCommands } from "./memory.js";
import { evolveCommands } from "./evolve.js";
import { windowCommands } from "./window.js";
import { statusCommands } from "./status.js";
import { intakeCommands } from "./intake.js";
import { selfDriveCommands, selfDriveFallback } from "./self-drive.js";

export type { Command, CommandContext } from "./types.js";

export const COMMANDS: Command[] = [
  ...runCommands,
  ...boardCommands,
  ...goalCommands,
  ...sessionCommands,
  ...staffingCommands,
  ...taskCommands,
  ...mergeCommands,
  ...memoryCommands,
  ...evolveCommands,
  ...windowCommands,
  ...statusCommands,
  ...intakeCommands,
  ...selfDriveCommands,
];

/** Domain ordering for the grouped help (E2). */
export const DOMAIN_ORDER = [
  "run",
  "goal",
  "status",
  "session",
  "staffing",
  "task",
  "merge",
  "memory",
  "evolve",
  "window",
  "intake",
  "self-drive",
];

/**
 * Resolve a command by the argv prefix, e.g. ["goal", "set-status"] or
 * ["status"]. Falls back to the domain's fallback handler (unknown subcommand)
 * so `picode merge foo` errors with a helpful message instead of a bare usage.
 */
export function findCommand(args: string[]): Command | null {
  const byPath = new Map(COMMANDS.map((c) => [c.path.join(" "), c]));
  // exact path match first (longest), then verb-only match
  for (let len = Math.min(args.length, 3); len >= 1; len--) {
    const key = args.slice(0, len).join(" ");
    const cmd = byPath.get(key);
    if (cmd) return cmd;
  }
  return null;
}

/** Fallback handlers for unknown subcommands of domain verbs. */
export function fallbackFor(verb: string): ((ctx: CommandContext) => never) | null {
  switch (verb) {
    case "session":
      return sessionFallback;
    case "staffing":
      return staffingFallback;
    case "merge":
      return mergeFallback;
    case "self-drive":
      return selfDriveFallback;
    default:
      return null;
  }
}
