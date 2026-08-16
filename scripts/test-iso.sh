#!/usr/bin/env bash
# test-iso.sh —— 隔离环境全量测试：mktemp HOME + 先 tsc -b（防 stale dist 假红）+ 全量测试透传
#
# 用途：根治 R16 两类假红
#   1) HOME 未隔离：真实 ~/.picode/config.yaml（opencode.enabled=true）导致不隔离直接
#      node --test 出现 15-24 个假红——本脚本 mktemp 隔离 HOME，所有包级测试在隔离 HOME 下运行
#   2) stale dist 假红：dist 滞后 src（R16 实测滞后 1.5 天致 9 项假失败）——本脚本固定
#      先 tsc -b（根 typecheck）重建 dist，再跑测试
#
# 本脚本同时是根 package.json test 脚本的执行体（编排：包级并行 + dashboard vitest 并入），
# 保证「npm test = 隔离 + 重建 + 全量」一条命令达成。
#
# usage:
#   bash scripts/test-iso.sh              # 全量（tsc -b + 隔离 HOME + 包级并行 + dashboard vitest run）
#   bash scripts/test-iso.sh --no-build   # 跳过 tsc -b（仅隔离 + 测试）
#   bash scripts/test-iso.sh --keep-home  # 保留隔离 HOME 目录（默认 trap 清理）
#   bash scripts/test-iso.sh -- args...   # 透传参数给包级测试（npm run test -w -- args...）
#   bash scripts/test-iso.sh -h|--help    # 帮助
#
# 退出码：0=全量通过；非 0=失败（tsc -b 失败或任一包测试失败，不吞退出码）
set -euo pipefail

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

NO_BUILD=0
KEEP_HOME=0
EXTRA_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --no-build) NO_BUILD=1; shift ;;
    --keep-home) KEEP_HOME=1; shift ;;
    --) shift; EXTRA_ARGS=("$@"); break ;;
    -*) echo "错误：未知参数 $1（见 --help）" >&2; exit 2 ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---- 隔离 HOME ----
TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/picode-test-home.XXXXXX")"
export HOME="$TEST_HOME"
echo "[test-iso] 隔离 HOME: $HOME"

cleanup() {
  if [ "$KEEP_HOME" = "1" ]; then
    echo "[test-iso] 保留隔离 HOME: $HOME"
  else
    rm -rf "$HOME" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---- 先 tsc -b（防 stale dist 假红，顺序固定） ----
if [ "$NO_BUILD" = "1" ]; then
  echo "[test-iso] 跳过 tsc -b（--no-build）"
else
  echo "[test-iso] 阶段 1/2：清理 tsbuildinfo + tsc -b（重建 dist，防 stale 假红）"
  find packages -name "*.tsbuildinfo" -delete
  npm run typecheck
fi

# ---- 全量测试：包级并行 + dashboard vitest 并入 ----
echo "[test-iso] 阶段 2/2：全量测试（包级并行 + dashboard vitest run）"
PKGS=(@picode/core @picode/bus @picode/orchestrator @picode/pi-extension @picode/mcp-server @picode/dashboard-server)
pids=()

for pkg in "${PKGS[@]}"; do
  (
    HOME="$TEST_HOME" npm run test -w "$pkg" -- "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
  ) &
  pids+=($!)
  echo "[test-iso] 启动: npm run test -w $pkg (pid $!)"
done

# dashboard：独立 pnpm 工程，直调 .bin/vitest（规避 pnpm 在软链 node_modules 下 abort），run 模式防挂起
if [ -x "packages/dashboard/node_modules/.bin/vitest" ]; then
  (
    cd packages/dashboard
    HOME="$TEST_HOME" ./node_modules/.bin/vitest run "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
  ) &
  dp_pid=$!
  pids+=("$dp_pid")
  echo "[test-iso] 启动: packages/dashboard vitest run (pid $dp_pid)"
else
  echo "[test-iso] 警告: packages/dashboard/node_modules/.bin/vitest 不存在，跳过 dashboard 测试" >&2
  echo "[test-iso] 修复提示: 先运行 worktree-setup.sh（自链 dashboard node_modules）" >&2
fi

fail=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    echo "[test-iso] 失败: pid $pid" >&2
    fail=1
  fi
done

if [ "$fail" = "0" ]; then
  echo "[test-iso] 全量测试通过（exit 0）"
  exit 0
fi
echo "[test-iso] 存在失败项（exit 1）" >&2
exit 1
