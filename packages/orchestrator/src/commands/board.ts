import { buildBoard, renderBoard } from "../board.js";
import type { Command, CommandContext } from "./types.js";

export const boardCommands: Command[] = [
  {
    domain: "board",
    path: ["board"],
    summary: "看板视图（只读派生：Backlog→分块→双门闩→进行中→验证→交接→完成）",
    usage: "picode board --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      const board = buildBoard(ctx.dir!);
      console.log(renderBoard(board));
    },
  },
];
