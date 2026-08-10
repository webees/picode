import { compressRunWindows, windowStatus } from "../window-store.js";
import type { Command, CommandContext } from "./types.js";

export const windowCommands: Command[] = [
  {
    domain: "window",
    path: ["window", "compress"],
    summary: "旧窗口消息压缩（D043：折叠 1-ratio，归档原文）",
    usage: "picode window compress --repo <path> --run <id> [--rooms a,b]",
    run: async (ctx: CommandContext) => {
      const rooms = (ctx.arg("--rooms") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const r of rooms) {
        if (!/^[A-Za-z0-9_-]+$/.test(r)) {
          throw new Error(`invalid room id: "${r}" (allowed: [A-Za-z0-9_-])`);
        }
      }
      console.log(JSON.stringify(await compressRunWindows(ctx.dir!, ctx.config!, { rooms }), null, 2));
    },
  },
  {
    domain: "window",
    path: ["window", "status"],
    summary: "窗口只读快照（当前窗 / 房间消息数 / 上次归档）",
    usage: "picode window status --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(windowStatus(ctx.dir!, ctx.config!), null, 2));
    },
  },
];
