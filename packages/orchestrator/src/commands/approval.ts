/**
 * approval 域命令（chunk-c3-sandbox-approval 单写者域）：升级审批观测与决策。
 *
 *   picode approval list   [--status pending|approved|rejected|used]
 *   picode approval decide --id <id> --approve|--reject [--note <note>]
 *
 * 审计落盘 runs/<id>/approvals/pending-<id>.json（asked+decided 同文件成对）；
 * answerer=run-lead 代批（policy 层动作走 sponsor 人工）；allowed-once 由
 * repo_write 消费（used 后重试再验拒绝）。D071：审批观测走 run 目录文件，
 * 不进 dashboard 面板。
 */
import { ApprovalStore, ErrorCode, PicodeError } from "@picode/core";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

export const approvalCommands: Command[] = [
  {
    domain: "approval",
    path: ["approval", "list"],
    summary: "列出 run 的升级审批（approvals/pending-*.json 成对审计）",
    usage: "picode approval list [--status pending|approved|rejected|used]",
    run: (ctx: CommandContext) => {
      const status = ctx.arg("--status");
      const store = new ApprovalStore(ctx.dir!);
      const all = store.list();
      const rows = status ? all.filter((r) => r.status === status) : all;
      console.log(JSON.stringify(rows, null, 2));
    },
  },
  {
    domain: "approval",
    path: ["approval", "decide"],
    summary: "代批/拒绝升级审批（answerer=run-lead）",
    usage: "picode approval decide --id <id> --approve|--reject [--note <note>]",
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      const approve = ctx.has("--approve");
      const reject = ctx.has("--reject");
      if (approve === reject) {
        throw new PicodeError(
          ErrorCode.USAGE,
          "exactly one of --approve|--reject is required — see: picode approval decide --help",
        );
      }
      const store = new ApprovalStore(ctx.dir!);
      const rec = await store.decide(id, {
        decision: approve ? "approved" : "rejected",
        by: "run-lead", // answerer=run-lead 代批（policy 层动作走 sponsor 人工）
        note: ctx.arg("--note"),
      });
      console.log(JSON.stringify(rec, null, 2));
    },
  },
];
