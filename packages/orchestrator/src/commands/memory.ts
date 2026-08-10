import {
  createChangeOrder,
  ingestTaskKnowledge,
  parkDraft,
  readChangeOrders,
  transitionChangeOrder,
} from "../memory.js";
import {
  ackMemoryBrief,
  listMemoryBriefs,
  writeMemoryBrief,
} from "../docs-memory.js";
import { parkGoal, unparkGoal } from "../run-store.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

export const memoryCommands: Command[] = [
  {
    domain: "memory",
    path: ["change-order", "create"],
    summary: "创建需求变更（P12）",
    usage: 'picode change-order create --repo <path> --run <id> --task <task_id> --summary "..." [--by run-lead]',
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const summary = need(ctx, "--summary");
      console.log(
        JSON.stringify(
          await createChangeOrder(ctx.dir!, taskId, summary, ctx.arg("--by") ?? "run-lead"),
          null,
          2,
        ),
      );
    },
  },
  {
    domain: "memory",
    path: ["change-order", "apply"],
    summary: "应用变更（proposed→applied）",
    usage: "picode change-order apply --repo <path> --run <id> --id <co_id>",
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      console.log(JSON.stringify(transitionChangeOrder(ctx.dir!, id, "applied"), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["change-order", "close"],
    summary: "关闭变更（→closed）",
    usage: "picode change-order close --repo <path> --run <id> --id <co_id>",
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      console.log(JSON.stringify(transitionChangeOrder(ctx.dir!, id, "closed"), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["change-order", "list"],
    summary: "列出全部变更",
    usage: "picode change-order list --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(readChangeOrders(ctx.dir!), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["memory", "brief", "write"],
    summary: "docs-lead 写 Memory Brief（L1/L2，I14）",
    usage: 'picode memory brief write --repo <path> --run <id> --summary "..." [--l2 a.md,b.md] [--risk "r"] [--by docs-lead]',
    run: async (ctx: CommandContext) => {
      const summary = need(ctx, "--summary");
      const l2 = (ctx.arg("--l2") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const risks = (ctx.arg("--risk") ?? "").split(";").map((s) => s.trim()).filter(Boolean);
      console.log(
        JSON.stringify(
          writeMemoryBrief(ctx.dir!, {
            l1_summary: summary,
            l2_paths: l2,
            risks,
            by: ctx.arg("--by") ?? "docs-lead",
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    domain: "memory",
    path: ["memory", "brief", "ack"],
    summary: "run-lead 签收 Memory Brief",
    usage: "picode memory brief ack --repo <path> --run <id> --id <mb_id> [--by run-lead]",
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      console.log(JSON.stringify(ackMemoryBrief(ctx.dir!, id, ctx.arg("--by") ?? "run-lead"), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["memory", "brief", "list"],
    summary: "列出 Memory Brief",
    usage: "picode memory brief list --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(listMemoryBriefs(ctx.dir!), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["draft", "park"],
    summary: "停放 task draft",
    usage: "picode draft park --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      console.log(JSON.stringify(parkDraft(ctx.dir!, taskId), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["draft", "park-goal"],
    summary: "停放 goal draft（别名）",
    usage: "picode draft park-goal --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(parkGoal(ctx.dir!), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["draft", "unpark"],
    summary: "解除 goal 停放（别名）",
    usage: "picode draft unpark --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(unparkGoal(ctx.dir!), null, 2));
    },
  },
  {
    domain: "memory",
    path: ["knowledge", "ingest"],
    summary: "task 知识入库（<knowledge_root>/<task_id>.md，D038）",
    usage: "picode knowledge ingest --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      console.log(
        JSON.stringify({ written: ingestTaskKnowledge(ctx.repo, ctx.dir!, ctx.config!, taskId) }, null, 2),
      );
    },
  },
];
