import { evolveWritePaths, type EvolveGoalSpec } from "@picode/core";
import { readGoal } from "../run-store.js";
import { writeEvolveKnowledgeLog } from "../evolve-run.js";
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
];

// keep the type import referenced for CLI parity checks
export type { EvolveGoalSpec };
