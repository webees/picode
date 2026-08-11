import { assertSafeName } from "@picode/core";
import {
  approveStaffing,
  checkPersonas,
  createStaffingRequest,
  draftPersonas,
  SEATS,
  type Seat,
} from "../staffing.js";
import { readScores, scoreTask } from "../hr-score.js";
import type { Command, CommandContext } from "./types.js";
import { need, unknownSub } from "./util.js";

export const staffingCommands: Command[] = [
  {
    domain: "staffing",
    path: ["staffing", "request"],
    summary: "run-lead 用工单 → people（16 P04）",
    usage: "picode staffing request --repo <path> --run <id> --task <task_id> [--skills a,b] [--notes <n>] [--team-name <n>] [--codename seat:name]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const skills = (ctx.arg("--skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      // repeated `--codename seat:name` (16 §8 naming overrides)
      const codenameOverrides: Record<string, string> = {};
      const args = ctx.args;
      for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === "--codename") {
          const m = args[i + 1].match(/^([a-z-]+):(.+)$/);
          if (!m) {
            throw new Error(`invalid --codename "${args[i + 1]}"; expected seat:name`);
          }
          if (!SEATS.includes(m[1] as Seat)) {
            throw new Error(
              `unknown seat "${m[1]}" in --codename; expect ${SEATS.join("|")}`,
            );
          }
          assertSafeName(m[2], "codename");
          codenameOverrides[m[1]] = m[2];
          i++;
        }
      }
      const r = await createStaffingRequest(ctx.dir!, ctx.config!, taskId, {
        skills,
        notes: ctx.arg("--notes"),
        teamName: ctx.arg("--team-name"),
        codenameOverrides:
          Object.keys(codenameOverrides).length > 0 ? codenameOverrides : undefined,
      });
      console.log(JSON.stringify(r, null, 2));
    },
  },
  {
    domain: "staffing",
    path: ["staffing", "draft-personas"],
    summary: "机械起草多维人设（recruiter 会话可覆盖同结构）",
    usage: "picode staffing draft-personas --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      console.log(JSON.stringify(draftPersonas(ctx.repo, ctx.dir!, ctx.config!, taskId), null, 2));
    },
  },
  {
    domain: "staffing",
    path: ["staffing", "check"],
    summary: "people-qa 校验人设维度（T19）",
    usage: "picode staffing check --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const issues = checkPersonas(ctx.dir!, ctx.config!, taskId);
      console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    },
  },
  {
    domain: "staffing",
    path: ["staffing", "approve"],
    summary: "run-lead 批准 → 锁 staffing.yaml + 注册三角会话（D030）",
    usage: "picode staffing approve --repo <path> --run <id> --task <task_id> [--by run-lead]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const r = await approveStaffing(ctx.dir!, ctx.config!, taskId, ctx.arg("--by") ?? "run-lead");
      console.log(JSON.stringify(r, null, 2));
      // D058: wake failures are visible, not silent — the event engine is
      // best-effort, but the operator must see rejections at the call site.
      for (const e of r.wokeErrors) {
        console.error(`[picode] WARN: 唤醒失败 ${e.agent_id}: ${e.reason}（可稍后 session wake 重试）`);
      }
    },
  },
  {
    domain: "staffing",
    path: ["staffing", "score"],
    summary: "task 结束后文件事实评分（16 §9）",
    usage: "picode staffing score --repo <path> --run <id> --task <task_id> [--by people-qa] [--note \"...\"]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const r = scoreTask(ctx.repo, ctx.dir!, ctx.config!, taskId, {
        by: ctx.arg("--by"),
        note: ctx.arg("--note"),
      });
      console.log(JSON.stringify(r, null, 2));
    },
  },
  {
    domain: "staffing",
    path: ["staffing", "scores"],
    summary: "读取评分档案",
    usage: "picode staffing scores --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const s = readScores(ctx.dir!, taskId);
      if (!s) {
        console.log(JSON.stringify({ error: `no scores yet for ${taskId}` }, null, 2));
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(s, null, 2));
    },
  },
];

export function staffingFallback(ctx: CommandContext): never {
  return unknownSub("staffing", ctx.args[1]);
}
