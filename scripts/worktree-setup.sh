#!/usr/bin/env bash
#
# worktree-setup.sh —— 任务工作房一键初始化/修复（R17 工具链 C-1，task-chunk-toolchain）
#
# 功能：
#   1. git worktree add（未建时创建；已存在则复用，幂等不重建）
#   2. node_modules 自链（根治 R16 断链假红，策略详见下）
#   3. tsbuildinfo 清理（防 stale 增量构建信息）
#   4. 冒烟验证：node -v && git rev-parse --show-toplevel
#   5. 失败时给出明确错误与修复提示（不静默）
#
# node_modules 自链策略（为什么这样设计——R16 实测踩坑）：
#   * R16 坑一：worktree 内 node_modules 断链（悬空 symlink）→ 跨包解析落主仓旧 dist →
#     假红/TS 伪错。本脚本不整体软链根 node_modules，而是：
#       - 根 node_modules = 工作房独立目录，依赖条目（除 @picode/.bin 外）逐条软链主仓
#         node_modules 对应目录（只读复用依赖，不写主仓）；
#       - @picode/* = 本地链接指向**工作房** packages/*（关键：跨包 import 落工作房
#         dist，tsc -b 构建到哪、解析就落哪，杜绝「读主仓旧 dist」假红）；
#       - packages/*/node_modules = 软链主仓对应目录（主仓有 package-local 依赖的包）。
#   * 为什么不能整体软链根 node_modules 后改 @picode：node_modules 是软链时
#     rm/mkdir 会透过软链写坏主仓 node_modules/@picode（R16 教训），故根 node_modules
#     必须是独立目录。
#
# pnpm 软链特例（packages/dashboard，packageManager pnpm@11.20.0）：
#   * dashboard 的 node_modules 是 pnpm 结构（.pnpm/ 虚拟存储 + 顶层符号链接），
#     整目录软链即可复用（.pnpm 内相对链接跟随软链解析，实测通过）。
#   * 但在软链 node_modules 上运行 `pnpm install/link` 会 abort
#     （ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY：pnpm 检测 node_modules 为符号链接
#     拒绝操作，防破坏宿主 store）。处理：dashboard 相关命令用
#     node_modules/.bin 直调（如 packages/dashboard/node_modules/.bin/vitest run），
#     或 pnpm --offline（离线不改结构时可放行）。本仓根测试编排已用
#     `bash scripts/test-iso.sh` 直调 dashboard/.bin/vitest（实测 59 tests 通过）。
#
# usage:
#   scripts/worktree-setup.sh                       # 对当前目录（须为已注册 worktree）自链 + 冒烟
#   scripts/worktree-setup.sh <worktree-path>       # 对指定 worktree 自链 + 冒烟
#   scripts/worktree-setup.sh --new <name> --run <run-id> [--base <ref>]
#                                                   # 在 <repo>/.picode/worktrees/<name> 新建 worktree 并自链
#   scripts/worktree-setup.sh --repo <repo-root>    # 显式指定主仓根（默认：脚本位置推导）
#   scripts/worktree-setup.sh --no-link             # 跳过 node_modules 自链
#   scripts/worktree-setup.sh --no-smoke            # 跳过冒烟验证
#   scripts/worktree-setup.sh -h|--help             # 帮助
#
# 退出码：0=成功；非 0=失败（详情见 stderr，含修复提示）。
# 幂等：worktree 已注册 → 复用；软链已正确指向 → 跳过；重复运行零副作用。
set -euo pipefail

usage() {
  sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# ---- 参数解析 ----
NEW_NAME=""
RUN_ID=""
BASE_REF=""
TARGET=""
REPO_ROOT=""
DO_LINK=1
DO_SMOKE=1

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --new) NEW_NAME="${2:-}"; shift 2 ;;
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --base) BASE_REF="${2:-}"; shift 2 ;;
    --repo) REPO_ROOT="${2:-}"; shift 2 ;;
    --no-link) DO_LINK=0; shift ;;
    --no-smoke) DO_SMOKE=0; shift ;;
    -*) echo "错误：未知参数 $1（见 --help）" >&2; exit 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done

# 主仓根：--repo 显式 > 脚本位置推导（scripts/ 上一级）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

# 校验主仓
if [ ! -f "$REPO_ROOT/package.json" ] || [ ! -d "$REPO_ROOT/.git" ]; then
  echo "错误：主仓根无效：$REPO_ROOT（缺少 package.json 或 .git）" >&2
  echo "修复提示：--repo <主仓绝对路径>" >&2
  exit 1
fi

# ---- 模式一：创建新 worktree ----
if [ -n "$NEW_NAME" ]; then
  if [ -z "$RUN_ID" ]; then
    echo "错误：--new 需要 --run <run-id>（用于分支命名 picode/<run-id>/<name>）" >&2
    exit 2
  fi
  WT_ROOT="$REPO_ROOT/.picode/worktrees"
  TARGET="$WT_ROOT/$NEW_NAME"
  BRANCH="picode/$RUN_ID/$NEW_NAME"
  if [ -d "$TARGET/.git" ] || [ -f "$TARGET/.git" ]; then
    echo "信息：worktree 目录已存在，进入复用模式：$TARGET"
  else
    mkdir -p "$WT_ROOT"
    # 已在既有 worktree 注册（如并行重跑）则复用，否则 add
    if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "worktree $TARGET"; then
      echo "信息：worktree 已注册，复用：$TARGET"
    else
      # 分支已存在（上次 add 后 worktree 被删）→ 复用分支 add，不重复建分支
      if git -C "$REPO_ROOT" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null 2>&1; then
        echo "信息：分支 $BRANCH 已存在，复用该分支 add"
        git -C "$REPO_ROOT" worktree add "$TARGET" "$BRANCH" \
          || { echo "错误：git worktree add 失败（复用分支）。修复提示：分支 $BRANCH 可能损坏，或改 --new 名换分支。" >&2; exit 1; }
      else
        echo "创建 worktree：git worktree add -b $BRANCH $TARGET ${BASE_REF:-HEAD}"
        git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$TARGET" "${BASE_REF:-HEAD}" \
          || { echo "错误：git worktree add 失败。修复提示：分支 $BRANCH 可能已存在（换 --new 名），或 ${BASE_REF:-HEAD} 不存在（用 --base 指定）。" >&2; exit 1; }
      fi
    fi
  fi
fi

# ---- 目标解析与校验 ----
if [ -z "$TARGET" ]; then
  TARGET="$(pwd)"
fi
TARGET="$(cd "$TARGET" 2>/dev/null && pwd || echo "$TARGET")"

if [ ! -d "$TARGET" ]; then
  echo "错误：目标目录不存在：$TARGET" >&2
  echo "修复提示：先建 worktree，或使用 --new 创建" >&2
  exit 1
fi

# 必须是 git 仓库且是 worktree（非主仓）
if ! git -C "$TARGET" rev-parse --git-dir >/dev/null 2>&1; then
  echo "错误：$TARGET 不是 git 仓库" >&2
  echo "修复提示：git worktree add 或 worktree-setup.sh --new" >&2
  exit 1
fi
if [ "$(cd "$TARGET" && git rev-parse --show-toplevel)" = "$REPO_ROOT" ]; then
  echo "错误：$TARGET 是主仓本身，不是 worktree。请传入 worktree 路径（.picode/worktrees/ 下）" >&2
  exit 1
fi
if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -q "worktree $TARGET"; then
  echo "错误：$TARGET 未在 git worktree list 注册（.git 文件缺失或路径不符）" >&2
  echo "修复提示：git -C $REPO_ROOT worktree add -b <branch> $TARGET，或 worktree-setup.sh --new" >&2
  exit 1
fi

# ---- node_modules 自链（幂等；--no-link 跳过） ----
if [ "$DO_LINK" = "1" ]; then
  MAIN_NM="$REPO_ROOT/node_modules"
  WT_NM="$TARGET/node_modules"
  if [ ! -d "$MAIN_NM" ]; then
    echo "错误：主仓依赖目录不存在：$MAIN_NM" >&2
    echo "修复提示：先在主仓 $REPO_ROOT 执行 npm install（dashboard 等 pnpm 工程执行 pnpm install）" >&2
    exit 1
  fi

  # ensure_link <src> <dst> <label>：软链缺失/悬空/指向错误 → 重建；dst 为真实目录 → 跳过（不破坏）
  ensure_link() {
    local src="$1" dst="$2" label="$3"
    if [ -L "$dst" ]; then
      if [ "$(readlink "$dst")" = "$src" ]; then
        return 0   # 已正确指向，跳过（幂等）
      fi
      echo "重建（指向错误/悬空软链）：$label → $dst（原指向 $(readlink "$dst")）"
      rm "$dst"
    elif [ -e "$dst" ]; then
      echo "跳过（$dst 是真实目录/文件，不覆盖既有安装）：$label" >&2
      return 0
    fi
    ln -s "$src" "$dst" || { echo "错误：软链失败 $label（$src → $dst）" >&2; exit 1; }
  }

  # 2.1 根 node_modules：独立目录 + 依赖逐条软链（绝不整体软链——整体软链下 @picode 落主仓，
  #     且透过软链改 @picode 会写坏主仓；见文件头「为什么」）
  if [ -L "$WT_NM" ]; then
    # 旧版整体软链残留 → 升级为独立目录（rm 软链本身，安全，不触碰主仓）
    echo "检测到整体软链 node_modules（旧版策略），升级为独立目录 + @picode 本地链接"
    rm "$WT_NM"
  fi
  mkdir -p "$WT_NM/@picode"
  for entry in "$MAIN_NM"/*; do
    [ -e "$entry" ] || continue
    base="$(basename "$entry")"
    case "$base" in
      @picode|.bin) continue ;;   # 单独处理
    esac
    ensure_link "$entry" "$WT_NM/$base" "root dep $base"
  done
  mkdir -p "$WT_NM/.bin"
  for entry in "$MAIN_NM"/.bin/*; do
    [ -e "$entry" ] || continue
    ensure_link "$entry" "$WT_NM/.bin/$(basename "$entry")" "bin $(basename "$entry")"
  done

  # 2.2 @picode/* 本地链接 → 指向**工作房** packages/*（跨包解析落工作房 dist，根治假红）
  #     以工作房 packages/*/package.json 的 name 为准（覆盖主仓 @picode 缺失项，如 dashboard-server）
  for pkg_dir in "$TARGET"/packages/*/; do
    [ -d "$pkg_dir" ] || continue
    [ -f "$pkg_dir/package.json" ] || continue
    pkg_name="$(grep -m1 '"name"' "$pkg_dir/package.json" | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
    [ -n "$pkg_name" ] || continue
    pkg_short="${pkg_name#@picode/}"   # name 可能含 @picode/ 前缀，链接目录名只取短名
    ensure_link "${pkg_dir%/}" "$WT_NM/@picode/$pkg_short" "@picode/$pkg_short"
  done

  # 2.3 packages/*/node_modules 软链主仓对应目录
  #     —— pnpm 特例（packages/dashboard）：pnpm 结构 node_modules 整目录软链即可复用；
  #        软链上跑 pnpm install/link 会 abort，用 .bin 直调或 pnpm --offline（见文件头）
  for pkg_dir in "$REPO_ROOT"/packages/*/; do
    [ -d "$pkg_dir" ] || continue
    pkg_name="$(basename "$pkg_dir")"
    wt_pkg="$TARGET/packages/$pkg_name"
    [ -d "$wt_pkg" ] || continue   # worktree 里没有该包（git 未跟踪）则跳过
    [ -e "${pkg_dir%/}/node_modules" ] || continue   # 主仓无 package-local 依赖（hoist 到根）则跳过
    ensure_link "${pkg_dir%/}/node_modules" "$wt_pkg/node_modules" "packages/$pkg_name/node_modules"
  done

  # 2.4 自检：@picode 链接是否全部指向工作房
  bad=0
  for link in "$WT_NM"/@picode/*; do
    [ -L "$link" ] || continue
    target="$(readlink "$link")"
    case "$target" in
      "$TARGET/packages/"*) ;;
      *) echo "警告：@picode 链接未指向工作房：$link → $target（应指向 $TARGET/packages/）" >&2; bad=1 ;;
    esac
  done
  [ "$bad" = "0" ] || echo "修复提示：删除后重跑本脚本可重建 @picode 链接（rm $WT_NM/@picode/* 然后重跑）" >&2

  echo "node_modules 自链完成（依赖逐条软链 + @picode/* 指向工作房 + packages/* 软链）"
fi

# ---- tsbuildinfo 清理（防 stale 构建增量；幂等） ----
if [ -d "$TARGET/packages" ]; then
  found="$(find "$TARGET/packages" -name "*.tsbuildinfo" -type f 2>/dev/null || true)"
  if [ -n "$found" ]; then
    find "$TARGET/packages" -name "*.tsbuildinfo" -type f -delete
    echo "已清理 tsbuildinfo：$(echo "$found" | wc -l | tr -d ' ') 个文件"
  else
    echo "跳过：无 tsbuildinfo 需清理"
  fi
fi

# ---- 冒烟验证 ----
if [ "$DO_SMOKE" = "1" ]; then
  echo "---- 冒烟验证（$(basename "$TARGET")）----"
  if ! node -v >/dev/null 2>&1; then
    echo "错误：node 不可用（command not found）" >&2
    echo "修复提示：确认 DSH runtime-commands 已配 node 软链（R17 C-0）；env.sh 可复查 PATH" >&2
    exit 1
  fi
  if [ "$DO_LINK" = "1" ] && [ ! -e "$TARGET/node_modules/.bin/tsc" ]; then
    echo "错误：node_modules 链接后仍无 tsc（$TARGET/node_modules/.bin/tsc 不存在）" >&2
    echo "修复提示：主仓 npm install 是否完成？检查 $REPO_ROOT/node_modules/.bin/tsc" >&2
    exit 1
  fi
  (
    cd "$TARGET"
    echo "node: $(node -v)"
    echo "toplevel: $(git rev-parse --show-toplevel)"
    echo "branch: $(git branch --show-current)"
  )
  echo "worktree-setup.sh：冒烟通过"
fi

echo "worktree-setup.sh：完成（$TARGET）"
