/**
 * 监督者脚本共享模块（审计 P1 去重：feed/supervise/launch-run 各自实现
 * picode()/flag()/BASE/REPO）。setup-tasks.mjs 因在并行 run 使用中暂未收敛。
 */
import { execSync } from "node:child_process";

/** opencode serve 地址（可用 SERVE_URL 覆盖）。 */
export const BASE = process.env.SERVE_URL ?? "http://127.0.0.1:7788";

// P1-5（R17 修复波）：主仓根用 git-common-dir 推导（主仓或工作房内运行均准确），
// 替代已迁移失效的历史硬编码路径（P1-5）。
import path from "node:path";
const HERE = new URL(".", import.meta.url).pathname;
export const REPO_ROOT = process.env.PICODE_REPO_ROOT ?? (() => {
  try {
    const common = execSync("git rev-parse --path-format=absolute --git-common-dir", {
      cwd: HERE, encoding: "utf8",
    }).trim();
    // common = <主仓>/.git → 主仓根 = 其父目录
    return path.posix.resolve(common, "..");
  } catch {
    return new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  }
})();

/** orchestrator CLI 入口（可用 PICODE_CLI 覆盖；默认 REPO_ROOT 派生，P1-5）。 */
export const PICODE = process.env.PICODE_CLI ?? `${REPO_ROOT}/packages/orchestrator/dist/cli.js`;

/** dogfood 仓库（可用 PICODE_REPO 覆盖；默认回退主仓，P1-5）。 */
export const REPO = process.env.PICODE_REPO ?? REPO_ROOT;

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
    { encoding: "utf8", cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  ));
}
