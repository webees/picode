import {
  parkGoal,
  setGoalStatus,
  setProductAcceptance,
  unparkGoal,
} from "../run-store.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

export const goalCommands: Command[] = [
  {
    domain: "goal",
    path: ["goal", "set-status"],
    summary: "迁移 goal 状态（intake→draft→active…；active 走 sponsor 确认）",
    usage: "picode goal set-status --repo <path> --run <id> --status intake|draft|active|blocked|completed|cancelled",
    run: async (ctx: CommandContext) => {
      const status = need(ctx, "--status") as
        | "intake"
        | "draft"
        | "active"
        | "blocked"
        | "completed"
        | "cancelled";
      const goal = setGoalStatus(ctx.dir!, status, {
        clearOpenQuestions: true,
        skipProductAcceptanceCheck: !ctx.config!.product.require_acceptance_before_active,
      });
      console.log(JSON.stringify(goal, null, 2));
    },
  },
  {
    domain: "goal",
    path: ["goal", "set-product-acceptance"],
    summary: "pm 写入产品验收口径 + product/brief.md（P01）",
    usage: 'picode goal set-product-acceptance --repo <path> --run <id> --acceptance "a; b; c"',
    run: async (ctx: CommandContext) => {
      const acceptance = (ctx.arg("--acceptance") ?? "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      if (acceptance.length === 0) {
        throw new Error(
          'missing --acceptance "a; b; c" — see: picode goal set-product-acceptance --help',
        );
      }
      const goal = setProductAcceptance(ctx.dir!, acceptance);
      console.log(
        JSON.stringify({ goal, brief: `${ctx.dir}/product/brief.md` }, null, 2),
      );
    },
  },
  {
    domain: "goal",
    path: ["goal", "park"],
    summary: "停放 draft goal（07 §7）",
    usage: "picode goal park --repo <path> --run <id> [--reason r]",
    run: async (ctx: CommandContext) => {
      console.log(
        JSON.stringify(parkGoal(ctx.dir!, ctx.arg("--reason") ?? "draft-idle"), null, 2),
      );
    },
  },
  {
    domain: "goal",
    path: ["goal", "unpark"],
    summary: "解除 goal 停放（需 sponsor/run-lead 显式操作）",
    usage: "picode goal unpark --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(unparkGoal(ctx.dir!), null, 2));
    },
  },
];
