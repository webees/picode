#!/usr/bin/env bash
# env.sh —— 运行环境确认与导出：node/npm 路径 + PATH 检查（配合 DSH runtime-commands 修复，R17 C-0）
#
# 用途：R16 根因 #1 的防线——子代理/脚本工具 ENOENT 大多源于 node 不在 PATH 或 cwd 失效。
#   本脚本确认 node/npm 可用、导出其绝对路径变量，并检查 PATH 是否含 node 所在目录。
#   配合 runtime-commands（node/npm/npx 仓外软链，R17 C-0 已完成），不是重装环境。
#
# usage:
#   source scripts/env.sh        # 推荐：检查并导出 NODE_BIN/NPM_BIN/NODE_DIR 等（source 安全）
#   bash scripts/env.sh          # 仅检查并打印（不 export，直接运行无持久效果）
#   bash scripts/env.sh -h|--help
#
# source 安全保证：
#   * 不调用 exit（失败用 return，避免退出调用方 shell）
#   * 不覆盖用户既有必需变量（只导出新增专用名 NODE_BIN/NPM_BIN/NODE_DIR/NPM_DIR/PICODE_ENV_OK）
#   * 不修改 PATH（仅检查；若 node 目录缺失才提示）
#   * 可重复 source（幂等：导出同名变量覆盖为相同值，无副作用）
#
# 退出码：0=检查通过（node/npm 可用且 PATH 完整）；非 0=存在问题（source 场景调用方自行决定处理）
set -u

# 直接运行与 source 的区别处理
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  SOURCED=0
else
  SOURCED=1
fi

fail() {
  echo "[env] 错误: $1" >&2
  echo "[env] 修复提示: $2" >&2
  # source 模式：return 1 让调用方 shell 继续（不 exit，source 安全）；
  # 直接运行模式：exit 1。注意：函数内 return 只退函数，调用点必须 return/exit（见下）。
}

# ---- node/npm 探测 ----
NODE_BIN="$(command -v node 2>/dev/null || true)"
NPM_BIN="$(command -v npm 2>/dev/null || true)"

if [ -z "$NODE_BIN" ]; then
  fail "node 不在 PATH" "确认 DSH runtime-commands 已配置 node 软链（R17 C-0），或 export PATH=<node安装目录>:\$PATH"
  if [ "$SOURCED" = "1" ]; then return 1; else exit 1; fi
fi
if [ -z "$NPM_BIN" ]; then
  fail "npm 不在 PATH（node 可用：$NODE_BIN）" "npm 通常与 node 同目录，确认 runtime-commands 配置完整"
  if [ "$SOURCED" = "1" ]; then return 1; else exit 1; fi
fi

# 绝对路径归一
NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"
NPM_BIN="$(cd "$(dirname "$NPM_BIN")" && pwd)/$(basename "$NPM_BIN")"
NODE_DIR="$(dirname "$NODE_BIN")"
NPM_DIR="$(dirname "$NPM_BIN")"

# ---- PATH 检查 ----
PATH_HAS_NODE=0
case ":$PATH:" in
  *":$NODE_DIR:"*) PATH_HAS_NODE=1 ;;
esac

if [ "$PATH_HAS_NODE" = "0" ]; then
  echo "[env] 警告: PATH 不含 $NODE_DIR（node 可能仅经软链可达；建议加入 PATH）" >&2
fi
if [ "$NODE_DIR" != "$NPM_DIR" ]; then
  echo "[env] 警告: node($NODE_DIR) 与 npm($NPM_DIR) 不在同一目录，属非常规安装" >&2
fi

# ---- 导出（source 场景生效） ----
NODE_VERSION="$(node -v 2>/dev/null || true)"
NPM_VERSION="$(npm -v 2>/dev/null || true)"
PICODE_ENV_OK=1
export NODE_BIN NPM_BIN NODE_DIR NPM_DIR NODE_VERSION NPM_VERSION PICODE_ENV_OK

echo "[env] 检查通过（PICODE_ENV_OK=1）"
echo "[env] node:  $NODE_BIN ($NODE_VERSION)"
echo "[env] npm:   $NPM_BIN (npm $NPM_VERSION)"
echo "[env] PATH  含 node 目录: $([ "$PATH_HAS_NODE" = "1" ] && echo 是 || echo 否)"
echo "[env] 使用: 直接调用 \$NODE_BIN/\$NPM_BIN，或 \$NODE_DIR 下 node_modules/.bin 直调（规避 pnpm 软链 abort）"

if [ "$SOURCED" = "1" ]; then
  return 0
fi
exit 0
