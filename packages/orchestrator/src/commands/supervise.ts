import fs from "node:fs";
import path from "node:path";
import { ErrorCode, PicodeError } from "@picode/core";
import { deriveSuperviseObservation, isIdleStopped, type SuperviseObservation } from "../supervise.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `picode supervise`（D093-2）：监控/守护正式化——操作者前台调用，无平台 daemon
 * （D037 不变量延续）。复用 statusSnapshot + live tokens 纯读投影：
 *   --once（默认）单次观测输出 JSON；
 *   --interval <sec> 循环观测，全体 token 连续 3 轮零增长 → STOPPED 退出 0；
 *   --log <path> 每次观测追加 JSONL（与 --once/--interval 均兼容）。
 * POLL_FAIL 会话不计入 total、不参与空闲判定（D093-4）。
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const superviseCommands: Command[] = [
  {
    domain: "supervise",
    path: ["supervise"],
    summary: "run 监督观测（--once 单次 / --interval 循环 + STOPPED 判定）",
    usage: "picode supervise --repo <path> --run <id> [--once] [--interval <sec>] [--log <path>]",
    run: async (ctx: CommandContext) => {
      const logPath = ctx.arg("--log");
      const intervalSec = ctx.arg("--interval");

      const observe = async (): Promise<SuperviseObservation> => {
        const obs = await deriveSuperviseObservation(ctx.dir!, ctx.config!);
        console.log(JSON.stringify(obs, null, 2));
        if (logPath) {
          fs.mkdirSync(path.dirname(logPath), { recursive: true });
          fs.appendFileSync(logPath, JSON.stringify(obs) + "\n");
        }
        return obs;
      };

      if (!intervalSec) {
        await observe();
        return;
      }
      const intervalMs = Number(intervalSec) * 1000;
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new PicodeError(
          ErrorCode.USAGE,
          `invalid --interval "${intervalSec}" (positive seconds expected) — see: picode supervise --help`,
        );
      }
      const history: Array<{ total: number }> = [];
      for (;;) {
        const obs = await observe();
        history.push(obs);
        if (isIdleStopped(history)) {
          console.log(
            JSON.stringify({ stopped: true, rounds: history.length, total: obs.total }, null, 2),
          );
          process.exit(0);
        }
        await sleep(intervalMs);
      }
    },
  },
];
