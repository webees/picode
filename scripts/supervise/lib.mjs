/**
 * 监督者脚本共享模块（审计 P1 去重：feed/supervise/launch-run 各自实现
 * picode()/flag()/BASE/REPO）。setup-tasks.mjs 因在并行 run 使用中暂未收敛。
 */
import { execSync } from "node:child_process";

/** opencode serve 地址（可用 SERVE_URL 覆盖）。 */
export const BASE = process.env.SERVE_URL ?? "http://127.0.0.1:7788";

/** orchestrator CLI 入口（可用 PICODE_CLI 覆盖）。 */
export const PICODE = process.env.PICODE_CLI ?? "/Users/x/Desktop/iOS/picode/packages/orchestrator/dist/cli.js";

/** dogfood 仓库（可用 PICODE_REPO 覆盖）。 */
export const REPO = process.env.PICODE_REPO ?? "/tmp/picode-dogfood";

/** 取 `--name` 参数值；缺省返回 null。 */
export function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

/** 调用 orchestrator CLI（JSON 解析；失败抛错由调用方处理）。 */
export function picode(args, opts = {}) {
  const repo = opts.repo ?? REPO;
  const run = opts.run;
  return JSON.parse(execSync(
    `node ${PICODE} ${args} --repo ${repo}${run ? ` --run ${run}` : ""}`,
    { encoding: "utf8", cwd: "/Users/x/Desktop/iOS/picode", stdio: ["ignore", "pipe", "pipe"] },
  ));
}
