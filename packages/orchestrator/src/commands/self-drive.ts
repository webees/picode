import { guardianTick, runGuardian, deriveEvents } from "../self-drive.js";
import type { Command, CommandContext } from "./types.js";
import { unknownSub } from "./util.js";

function intArg(ctx: CommandContext, name: string, fallback: number): number {
  const raw = ctx.arg(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const selfDriveCommands: Command[] = [
  {
    domain: "self-drive",
    path: ["self-drive", "tick"],
    summary: "自驱守护：机械执行一次状态推导（derive→drain→sweep→apply）",
    usage: "picode self-drive tick --repo <path> --run <id> [--idle-sleep]",
    run: async (ctx: CommandContext) => {
      const res = await guardianTick(ctx.dir!, ctx.config!, {
        idleSleep: ctx.has("--idle-sleep"),
      });
      console.log(JSON.stringify(res, null, 2));
    },
  },
  {
    domain: "self-drive",
    path: ["self-drive", "events"],
    summary: "预览：当前 run 状态会推导出哪些规则事件（只读，不 apply）",
    usage: "picode self-drive events --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      const events = deriveEvents(ctx.dir!, ctx.config!);
      console.log(JSON.stringify({ count: events.length, events }, null, 2));
    },
  },
  {
    domain: "self-drive",
    path: ["self-drive", "run"],
    summary: "自驱守护循环：按间隔持续 tick，直到 max-ticks/halt 文件/SIGTERM",
    usage:
      "picode self-drive run --repo <path> --run <id> [--interval-ms <n>] [--max-ticks <n>] [--halt-file <path>] [--idle-sleep]",
    run: async (ctx: CommandContext) => {
      const haltFile = ctx.arg("--halt-file");
      const summary = await runGuardian(ctx.dir!, ctx.config!, {
        intervalMs: intArg(ctx, "--interval-ms", 60_000),
        maxTicks: intArg(ctx, "--max-ticks", Number.MAX_SAFE_INTEGER),
        haltFile,
        idleSleep: ctx.has("--idle-sleep"),
      });
      console.log(JSON.stringify(summary, null, 2));
    },
  },
  {
    domain: "self-drive",
    path: ["self-drive", "halt"],
    summary: "写入 halt 文件，停止正在运行的守护循环",
    usage: "picode self-drive halt --repo <path> --run <id> [--halt-file <path>]",
    run: async (ctx: CommandContext) => {
      const file = ctx.arg("--halt-file") ?? `${ctx.dir}/guardian.halt`;
      const fs = await import("node:fs");
      fs.writeFileSync(file, new Date().toISOString());
      console.log(JSON.stringify({ halted: true, halt_file: file }, null, 2));
    },
  },
];

/** Fallback handler for unknown `self-drive <sub>` (parity with other domains). */
export function selfDriveFallback(ctx: CommandContext): never {
  return unknownSub("self-drive", ctx.args[1]);
}
