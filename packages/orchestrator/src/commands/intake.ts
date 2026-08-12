import { addFeed, closeFeed, triageFeed } from "../intake.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

export const intakeCommands: Command[] = [
  {
    domain: "intake",
    path: ["intake", "add"],
    summary: "sponsor 随时投喂 → 内部分诊入口（status=open）",
    usage: 'picode intake add --repo <path> --run <id> --type <需求|研究|文档|问题> --body "..."',
    run: async (ctx: CommandContext) => {
      const type = need(ctx, "--type");
      const body = need(ctx, "--body");
      const feed = addFeed(ctx.dir!, { type, body });
      console.log(JSON.stringify(feed, null, 2));
    },
  },
  {
    domain: "intake",
    path: ["intake", "triage"],
    summary: "run-lead 内部分诊：指派 agent + bus 通知 leadership",
    usage: "picode intake triage --repo <path> --run <id> --id <feed_id> --to <agent>",
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      const to = need(ctx, "--to");
      const feed = await triageFeed(ctx.dir!, id, to);
      console.log(JSON.stringify(feed, null, 2));
    },
  },
  {
    domain: "intake",
    path: ["intake", "close"],
    summary: "关闭 feed（status=done）",
    usage: "picode intake close --repo <path> --run <id> --id <feed_id>",
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      const feed = closeFeed(ctx.dir!, id);
      console.log(JSON.stringify(feed, null, 2));
    },
  },
];
