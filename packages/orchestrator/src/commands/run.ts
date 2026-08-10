import type { EvolveGoalSpec } from "@picode/core";
import { createRun } from "../run-store.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

export const runCommands: Command[] = [
  {
    domain: "run",
    path: ["init"],
    summary: "初始化 run（goal intake）",
    usage: "picode init --repo <path> --goal-title <title> [--scale S|M|L] [--kind delivery|self_evolve] [--target-repo <path>] [--evolve-layers a,b] [--evolve-risk low|medium|high]",
    noRun: true,
    run: async (ctx: CommandContext) => {
      const title = need(ctx, "--goal-title");
      const scale = (ctx.arg("--scale") as "S" | "M" | "L" | undefined) ?? "S";
      const kind = ctx.arg("--kind") as "delivery" | "self_evolve" | undefined;
      const layers = (ctx.arg("--evolve-layers") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as EvolveGoalSpec["layers"];
      const { runId, dir } = createRun(ctx.repo, {
        title,
        scale,
        kind,
        targetRepo: ctx.arg("--target-repo"),
        evolveLayers: layers.length ? layers : undefined,
        evolveRisk: ctx.arg("--evolve-risk") as EvolveGoalSpec["risk"] | undefined,
      });
      console.log(JSON.stringify({ runId, dir }, null, 2));
    },
  },
];
