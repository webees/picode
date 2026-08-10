/**
 * Shared helpers for command handlers (方向 B4/E1).
 */
import { ErrorCode, PicodeError } from "@picode/core";
import type { Command, CommandContext } from "./types.js";

/** Throw a coded USAGE error when a required flag is missing. */
export function need(ctx: CommandContext, flag: string): string {
  const v = ctx.arg(flag);
  if (v === undefined) {
    throw new PicodeError(
      ErrorCode.USAGE,
      `missing required flag ${flag} — see: picode ${ctx.args.slice(0, 2).join(" ")} --help`,
    );
  }
  return v;
}

/** Throw a coded USAGE error for an unknown subcommand of a domain verb. */
export function unknownSub(verb: string, sub: string | undefined): never {
  throw new PicodeError(
    ErrorCode.USAGE,
    `unknown ${verb} subcommand "${sub ?? "(none)"}" — see: picode --help`,
  );
}

/** Render one command's usage for help output. */
export function usageLine(cmd: Command): string {
  return `  ${cmd.usage.padEnd(78)}${cmd.summary}`;
}
