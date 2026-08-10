import { statusSnapshot } from "../status.js";
import { sweepProgress } from "../progress.js";
import { sweepDraftPark } from "../run-store.js";
import type { Command, CommandContext } from "./types.js";

export const statusCommands: Command[] = [
  {
    domain: "status",
    path: ["status"],
    summary: "run 只读快照（18 阶段 H / U12）",
    usage: "picode status --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(statusSnapshot(ctx.dir!, ctx.config!), null, 2));
    },
  },
  {
    domain: "status",
    path: ["progress", "check"],
    summary: "进度巡检：draft park 清扫 + stale 检查（无 daemon）",
    usage: "picode progress check --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      const parked = sweepDraftPark(ctx.dir!, ctx.config!);
      const res = await sweepProgress(ctx.dir!, ctx.config!);
      console.log(JSON.stringify({ ...res, draft_parked: parked?.parked_at ?? null }, null, 2));
    },
  },
  {
    domain: "status",
    path: ["progress", "sweep"],
    summary: "stale 进度 → progress_due → wake squad-lead（D037）",
    usage: "picode progress sweep --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      const res = await sweepProgress(ctx.dir!, ctx.config!);
      console.log(JSON.stringify(res, null, 2));
    },
  },
];
