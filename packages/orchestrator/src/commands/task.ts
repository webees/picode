import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addChunkAndTask,
  approveBrief,
  draftBrief,
  prepareTask,
  printSpawnEnv,
} from "../task.js";
import { ackHandoff, dissolveTask, gcFailedWorktrees, packageHandoff, submitEvidence } from "../closure.js";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";

/** spawn-print resolves the pi-extension entry relative to this file. */
function extensionPath(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../pi-extension/src/index.ts",
  );
}

export const taskCommands: Command[] = [
  {
    domain: "task",
    path: ["chunk", "add"],
    summary: "P02：分块 + 生成 implement task",
    usage: 'picode chunk add --repo <path> --run <id> --id chunk-a --write "src/**"',
    run: async (ctx: CommandContext) => {
      const id = need(ctx, "--id");
      const write = need(ctx, "--write");
      const { taskId } = await addChunkAndTask(ctx.repo, ctx.dir!, ctx.config!, {
        chunkId: id,
        writePaths: [write],
      });
      console.log(JSON.stringify({ taskId }, null, 2));
    },
  },
  {
    domain: "task",
    path: ["brief", "draft"],
    summary: "起草 work brief（docs 组装）",
    usage: "picode brief draft --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      draftBrief(ctx.dir!, taskId);
      console.log("brief drafted");
    },
  },
  {
    domain: "task",
    path: ["brief", "approve"],
    summary: "run-lead 签发 brief（双门闩之一）",
    usage: "picode brief approve --repo <path> --run <id> --task <task_id> [--by run-lead]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      approveBrief(ctx.dir!, taskId, ctx.arg("--by") ?? "run-lead");
      console.log("brief approved");
    },
  },
  {
    domain: "task",
    path: ["task", "prepare"],
    summary: "双门闩校验 + 建 worktree + 签发 token（P05）",
    usage: "picode task prepare --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const r = prepareTask(ctx.repo, ctx.dir!, ctx.config!, taskId);
      console.log(JSON.stringify(r, null, 2));
    },
  },
  {
    domain: "task",
    path: ["task", "spawn-print"],
    summary: "打印 spawn 环境变量（Pi 启动样板）",
    usage: "picode task spawn-print --repo <path> --run <id> --task <task_id> --seat squad-lead|engineer|sdet",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const seat = need(ctx, "--seat") as "squad-lead" | "engineer" | "sdet";
      console.log(printSpawnEnv(ctx.repo, ctx.dir!, ctx.config!, taskId, seat, extensionPath()));
    },
  },
  {
    domain: "task",
    path: ["task", "dissolve"],
    summary: "解散任务（--force 强解；需 handoff/evidence 门闩）",
    usage: "picode task dissolve --repo <path> --run <id> --task <task_id> [--force] [--status failed|cancelled]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const r = await dissolveTask(ctx.repo, ctx.dir!, ctx.config!, taskId, {
        force: ctx.has("--force"),
        status: ctx.arg("--status") as "failed" | "cancelled" | undefined,
      });
      console.log(JSON.stringify(r, null, 2));
    },
  },
  {
    domain: "task",
    path: ["evidence", "submit"],
    summary: "提交命令证据（pass 需 exit-code=0 + --log-ref，I8）",
    usage: 'picode evidence submit --repo <path> --run <id> --task <task_id> --cmd "..." [--exit-code 0] [--log-ref <path>] [--by sdet@task_id]',
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const cmdText = need(ctx, "--cmd");
      const ev = submitEvidence(ctx.dir!, taskId, {
        cmds: [
          {
            cmd: cmdText,
            exit_code: Number(ctx.arg("--exit-code") ?? "0"),
            log_ref: ctx.arg("--log-ref") ?? null,
          },
        ],
        by: ctx.arg("--by") ?? `sdet@${taskId}`,
      });
      console.log(JSON.stringify(ev, null, 2));
    },
  },
  {
    domain: "task",
    path: ["handoff", "package"],
    summary: "打包交接包（tasks/<id>/handoff/）",
    usage: "picode handoff package --repo <path> --run <id> --task <task_id>",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      console.log(JSON.stringify(packageHandoff(ctx.repo, ctx.dir!, ctx.config!, taskId), null, 2));
    },
  },
  {
    domain: "task",
    path: ["handoff", "ack"],
    summary: "docs/tpm 签收交接（dissolve 前置门闩，I8）",
    usage: "picode handoff ack --repo <path> --run <id> --task <task_id> --by docs-lead|tpm [--notes \"...\"]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const by = need(ctx, "--by");
      console.log(JSON.stringify(ackHandoff(ctx.dir!, taskId, by, ctx.arg("--notes")), null, 2));
    },
  },
  {
    domain: "task",
    path: ["worktree", "gc"],
    summary: "回收 failed worktree（11 阶段 3）",
    usage: "picode worktree gc --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(gcFailedWorktrees(ctx.repo, ctx.dir!, ctx.config!), null, 2));
    },
  },
];
