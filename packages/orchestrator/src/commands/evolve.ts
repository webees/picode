import { PicodeError, ErrorCode, evolveWritePaths } from "@picode/core";
import { readGoal } from "../run-store.js";
import { writeEvolveKnowledgeLog } from "../evolve-run.js";
import { refineEvolveKnowledge } from "../evolve-refine.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

export const evolveCommands: Command[] = [
  {
    domain: "evolve",
    path: ["evolve", "write-paths"],
    summary: "输出 self_evolve 写集（19 §4 / D041）",
    usage: "picode evolve write-paths --repo <path> --run <id> [--task <task_id>]",
    run: async (ctx: CommandContext) => {
      const goal = readGoal(ctx.dir!);
      if (goal.kind !== "self_evolve" || !goal.evolve) {
        console.log(JSON.stringify({ write_paths: [] }, null, 2));
        return;
      }
      console.log(JSON.stringify({ write_paths: evolveWritePaths(ctx.config!, goal.evolve) }, null, 2));
    },
  },
  {
    domain: "evolve",
    path: ["evolve", "log"],
    summary: "写进化知识纪要 knowledge/evolve/<run_id>.md（E6）",
    usage: 'picode evolve log --repo <path> --run <id> --summary "..."',
    run: async (ctx: CommandContext) => {
      const summary = need(ctx, "--summary");
      const written = writeEvolveKnowledgeLog(ctx.repo, ctx.dir!, ctx.config!, { summary });
      console.log(JSON.stringify({ written }, null, 2));
    },
  },
  {
    domain: "evolve",
    path: ["evolve", "refine"],
    summary: "从任务证据提炼 lesson；--approve 人工落盘，--auto 按评审门自动落盘（C1）",
    usage: "picode evolve refine --repo <path> --run <id> [--approve|--auto]",
    run: async (ctx: CommandContext) => {
      const approve = ctx.has("--approve");
      const auto = ctx.has("--auto");
      if (approve && auto) {
        throw new PicodeError(
          ErrorCode.USAGE,
          "--approve and --auto are mutually exclusive — see: picode evolve refine --help",
        );
      }
      const result = refineEvolveKnowledge(ctx.repo, ctx.dir!, ctx.config!, {
        approve,
        auto,
      });
      console.log(JSON.stringify(result, null, 2));
    },
  },
];
