import {
  blockGoal,
  disarmGoal,
  parkGoal,
  readGoal,
  resumeGoal,
  setGoalStatus,
  setProductAcceptance,
  unparkGoal,
} from "../run-store.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";
import { closeRun } from "../self-drive.js";

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
      // C1-run-close: goal 进入终态（completed/cancelled）即收尾 —— 补发
      // TASK_DISSOLVED + 休眠平台席（best-effort，不残留 awake 占 max_awake）。
      const close =
        status === "completed" || status === "cancelled"
          ? await closeRun(ctx.dir!, ctx.config!)
          : null;
      console.log(
        JSON.stringify(close ? { goal, close } : goal, null, 2),
      );
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
  {
    domain: "goal",
    path: ["goal", "resume"],
    summary: "goal 级激活授权：清除 blocker 回 active 且置 armed（guardian 续跑恢复）",
    usage: "picode goal resume --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(resumeGoal(ctx.dir!), null, 2));
    },
  },
  {
    domain: "goal",
    path: ["goal", "disarm"],
    summary: "解除 goal 续跑授权（activation=disarmed；guardian 零投喂）",
    usage: "picode goal disarm --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(disarmGoal(ctx.dir!), null, 2));
    },
  },
  {
    domain: "goal",
    path: ["goal", "block"],
    summary: "blocked 带政策码 + 解释（GOAL_TRANSITIONS 围栏内；如 round-limit/provider-limit）",
    usage: "picode goal block --repo <path> --run <id> --code <code> [--message msg]",
    run: async (ctx: CommandContext) => {
      const code = need(ctx, "--code");
      console.log(
        JSON.stringify(blockGoal(ctx.dir!, code, ctx.arg("--message") ?? ""), null, 2),
      );
    },
  },
  {
    domain: "goal",
    path: ["goal", "status"],
    summary: "goal 状态（含 rounds/activation/blocked/revision）",
    usage: "picode goal status --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(readGoal(ctx.dir!), null, 2));
    },
  },
];
