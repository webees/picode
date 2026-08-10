import { enqueueMerge, mergeNext } from "../merge.js";
import type { Command, CommandContext } from "./types.js";
import { need, unknownSub } from "./util.js";

export const mergeCommands: Command[] = [
  {
    domain: "merge",
    path: ["merge", "enqueue"],
    summary: "入队 merge（release-eng）",
    usage: "picode merge enqueue --repo <path> --run <id> --task <task_id> [--by release-eng]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      console.log(
        JSON.stringify(await enqueueMerge(ctx.dir!, taskId, ctx.arg("--by") ?? "release-eng"), null, 2),
      );
    },
  },
  {
    domain: "merge",
    path: ["merge", "process"],
    summary: "串行合并下一队（merge.lock；拓扑 + abort，D045）",
    usage: "picode merge process --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(await mergeNext(ctx.repo, ctx.dir!, ctx.config!), null, 2));
    },
  },
  {
    domain: "merge",
    path: ["merge", "request"],
    summary: "入队 merge（等价 enqueue，兼容旧命令名）",
    usage: "picode merge request --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const req = await enqueueMerge(ctx.dir!, taskId);
      console.log(JSON.stringify(req, null, 2));
    },
  },
  {
    domain: "merge",
    path: ["merge", "next"],
    summary: "串行合并下一队（等价 process，兼容旧命令名）",
    usage: "picode merge next --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      const res = await mergeNext(ctx.repo, ctx.dir!, ctx.config!);
      console.log(JSON.stringify(res, null, 2));
    },
  },
];

export function mergeFallback(ctx: CommandContext): never {
  return unknownSub("merge", ctx.args[1]);
}
