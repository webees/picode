import { guardianTick, runGuardian, deriveEvents } from "../self-drive.js";
import { deriveContinuationTargets, feedContinuation } from "../continuation.js";
import { ErrorCode, PicodeError } from "@picode/core";
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
  {
    domain: "self-drive",
    path: ["self-drive", "continuation"],
    summary: "续跑：--status 只读预览候选（不投喂）；--feed <agent> 手动单次投喂并计数",
    usage:
      "picode self-drive continuation --repo <path> --run <id> [--status] | [--feed <agent_id>]",
    run: async (ctx: CommandContext) => {
      if (ctx.has("--feed")) {
        const agentId = ctx.arg("--feed");
        // 守卫：缺值或 `--feed` 后紧跟其它 flag（如 `--feed --repo …`）时，
        // arg("--feed") 会取到 "--repo" —— 必须拒绝而非把它当 agent 投喂。
        if (!agentId || agentId.startsWith("--")) {
          throw new PicodeError(
            ErrorCode.USAGE,
            "self-drive continuation --feed 需要 <agent_id> — see: picode self-drive continuation --help",
          );
        }
        const res = await feedContinuation(ctx.dir!, ctx.config!, agentId);
        if (!res) {
          console.log(
            JSON.stringify(
              { fed: false, agent_id: agentId, reason: "not-awake-or-not-opencode-session" },
              null,
              2,
            ),
          );
          return;
        }
        console.log(JSON.stringify({ fed: true, ...res }, null, 2));
        return;
      }
      // 默认 / --status：只读派生候选，不投喂、不写状态
      const targets = deriveContinuationTargets(ctx.dir!, ctx.config!);
      console.log(JSON.stringify({ count: targets.length, targets }, null, 2));
    },
  },
];

/** Fallback handler for unknown `self-drive <sub>` (parity with other domains). */
export function selfDriveFallback(ctx: CommandContext): never {
  return unknownSub("self-drive", ctx.args[1]);
}
