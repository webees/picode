#!/usr/bin/env node
/**
 * picode CLI — dispatcher (方向 B4).
 *
 * All commands live in `commands/*.ts` as declarative entries; this file only
 * resolves the run context, dispatches, and renders errors uniformly (E3):
 *   [picode] ERROR: <CODE>: <message>
 *
 * `picode --help` prints the registry grouped by domain (E2); every command
 * also answers `picode <cmd> <sub> --help`.
 */
import path from "node:path";
import { ErrorCode, PicodeError, formatPicodeError } from "@picode/core";
import { resolveRunDir } from "./run-store.js";
import { COMMANDS, DOMAIN_ORDER, fallbackFor, findCommand } from "./commands/index.js";
import { usageLine } from "./commands/util.js";
import type { Command, CommandContext } from "./commands/types.js";

function arg(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function helpFlag(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/** Grouped help (E2), driven by the command registry. */
function printHelp(): void {
  console.log(`picode CLI — 多智能体编码运行时（v1）

用法: picode <command> [subcommand] --repo <path> --run <id> [flags]
      picode <command> <subcommand> --help   每命令详细用法
      picode init --repo <path> --goal-title <title>

命令（按域）:
`);
  const groups = new Map<string, Command[]>();
  for (const domain of DOMAIN_ORDER) {
    groups.set(domain, COMMANDS.filter((c) => c.domain === domain));
  }
  for (const [domain, cmds] of groups) {
    console.log(`  ${domain}:`);
    for (const c of cmds) console.log(usageLine(c));
    console.log();
  }
  console.log("常用示例: picode init / goal set-status / session list / staffing approve / merge process / status");
}

/** Per-command usage for `picode <cmd> [<sub>] --help` (E1). */
function printCommandHelp(cmd: Command): void {
  console.log(`${cmd.usage}\n\n  ${cmd.summary}`);
}

function usageError(cmd: Command): never {
  throw new PicodeError(ErrorCode.USAGE, `missing --run <id> — see: ${cmd.usage}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const first = args[0];

  if (!first || first === "--help" || first === "-h" || first === "help") {
    printHelp();
    return;
  }

  // per-command help: `picode <verb> [<sub>] --help`
  if (helpFlag(args)) {
    const cmd = findCommand(args);
    if (cmd) {
      printCommandHelp(cmd);
      return;
    }
  }

  const repo = path.resolve(arg("--repo", args) ?? process.cwd());

  const ctxBase: CommandContext = {
    repo,
    args,
    has: (name) => args.includes(name),
    arg: (name) => arg(name, args),
  };

  const cmd = findCommand(args);
  if (!cmd) {
    const verb = args[0] ?? "";
    const fallback = fallbackFor(verb);
    if (fallback) {
      await fallback(ctxBase as never);
      return; // unreachable (fallback always throws)
    }
    throw new PicodeError(
      ErrorCode.USAGE,
      `unknown command "${args.join(" ")}" — see: picode --help`,
    );
  }

  if (cmd.noRun) {
    await cmd.run(ctxBase);
    return;
  }

  const runId = arg("--run", args);
  if (!runId) usageError(cmd);
  const { dir, config } = resolveRunDir(repo, runId);
  await cmd.run({ ...ctxBase, runId, dir, config });
}

main().catch((e) => {
  console.error(formatPicodeError(e));
  process.exit(1);
});
