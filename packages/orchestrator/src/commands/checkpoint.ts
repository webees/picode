import { ErrorCode, PicodeError } from "@picode/core";
import type { Command, CommandContext } from "./types.js";
import { need } from "./util.js";
import {
  captureTaskCheckpoint,
  listCheckpointTasks,
  listTaskCheckpoints,
  latestTaskCheckpoint,
} from "../checkpoint-store.js";

/**
 * `picode checkpoint` 两个子命令（D082-6 MVP 消费面）：
 *   - capture：显式捕获 task 会话 checkpoint（快照只读、不可变落盘）
 *   - status：只读查询（--task 时列该 task 概览 + 最新；缺省列全部有 checkpoint 的 task）
 */
export const checkpointCommands: Command[] = [
  {
    domain: "checkpoint",
    path: ["checkpoint", "capture"],
    summary: "捕获 task 会话 checkpoint（快照只读、不可变落盘，D082）",
    usage: "picode checkpoint capture --repo <path> --run <id> --task <task_id> [--boundary manual]",
    run: async (ctx: CommandContext) => {
      const taskId = need(ctx, "--task");
      const r = captureTaskCheckpoint(ctx.dir!, taskId, {
        boundary: ctx.arg("--boundary") ?? undefined,
      });
      if (r === null) {
        throw new PicodeError(ErrorCode.NOT_FOUND, `task not found: ${taskId}`);
      }
      console.log(JSON.stringify({ file: r.file, checkpoint: r.checkpoint }, null, 2));
    },
  },
  {
    domain: "checkpoint",
    path: ["checkpoint", "status"],
    summary: "只读列出 task checkpoint（最新在前）或全部有 checkpoint 的 task",
    usage: "picode checkpoint status --repo <path> --run <id> [--task <task_id>]",
    run: async (ctx: CommandContext) => {
      const taskId = ctx.arg("--task");
      if (taskId) {
        const all = listTaskCheckpoints(ctx.dir!, taskId);
        const latest = latestTaskCheckpoint(ctx.dir!, taskId);
        console.log(JSON.stringify({ task_id: taskId, count: all.length, latest }, null, 2));
      } else {
        console.log(JSON.stringify({ tasks: listCheckpointTasks(ctx.dir!) }, null, 2));
      }
    },
  },
];
