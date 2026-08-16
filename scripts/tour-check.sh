#!/usr/bin/env bash
# tour-check.sh —— 巡检三查：progress 增量 / 工作房 git status 或分支提交 / sdet evidence 或 BLOCKED
#
# 用途：R17 执行纪律「巡检三查」的工具化（plan §5），替代 R16 不可靠的 commit subject 扫描
#   （R16 教训：靠 commit subject 扫描 2 次误报 + 误接管 1 次——本脚本只用
#   「分支相对基线有提交 / git status 非空」作为产出信号，绝不解析 commit message）。
#
# 三查（对每个 task）：
#   1) progress 增量：tasks/<task_id>/progress/progress.md 存在且非空
#   2) 产出信号：工作房 .picode/worktrees/squad-<task_id> 存在，且
#      git status --porcelain 非空，或分支相对基线（merge-base main..HEAD）有提交
#   3) sdet evidence：tasks/<task_id>/handoff/evidence.yaml 存在，或 progress.md 含 BLOCKED
#
# usage:
#   bash scripts/tour-check.sh <run-dir>     # 如 .picode/runs/run-2026-08-16T09-30-00-EFFICIENCY
#   bash scripts/tour-check.sh --run <run-id># 自动定位 <repo>/.picode/runs/<run-id>
#   bash scripts/tour-check.sh [--tasks a,b,c] [--base <ref>]
#   bash scripts/tour-check.sh -h|--help
#
# 输出：每 task 一行结论（产出/无产出/异常）+ 三查明细
# 退出码：0=全部正常产出；非 0=存在待关注项（供 run-lead 巡检，非失败裁决）
set -uo pipefail

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

RUN_DIR=""
RUN_ID=""
TASKS_FILTER=""
BASE_REF="main"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 主仓定位：本脚本既可能在主仓 scripts/ 下运行，也可能在任务工作房 scripts/ 下运行
# （R17 常态：tour-check 在任意工作房内执行）——用 git-common-dir 定位主仓，勿用脚本位置推导
locate_repo_root() {
  local script_dir="$1" common
  common="$(git -C "$script_dir" rev-parse --git-common-dir 2>/dev/null || true)"
  case "$common" in
    .git)  echo "$(cd "$script_dir/.." && pwd)" ;;                    # 主仓内运行
    /*)    echo "$(dirname "$common")" ;;                             # worktree 内运行（common 绝对路径指向主仓 .git）
    *)     echo "$(cd "$script_dir/.." && pwd)" ;;                    # 兜底：脚本位置上一级
  esac
}
REPO_ROOT="$(locate_repo_root "$SCRIPT_DIR")"
WORKTREE_ROOT="$REPO_ROOT/.picode/worktrees"

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --tasks) TASKS_FILTER="${2:-}"; shift 2 ;;
    --base) BASE_REF="${2:-}"; shift 2 ;;
    -*) echo "错误：未知参数 $1（见 --help）" >&2; exit 2 ;;
    *) RUN_DIR="$1"; shift ;;
  esac
done

if [ -z "$RUN_DIR" ]; then
  if [ -n "$RUN_ID" ]; then
    RUN_DIR="$REPO_ROOT/.picode/runs/$RUN_ID"
  else
    echo "错误：缺少 run 目录参数（见 --help）" >&2
    exit 2
  fi
fi
RUN_DIR="$(cd "$RUN_DIR" 2>/dev/null && pwd || echo "$RUN_DIR")"
if [ ! -d "$RUN_DIR/tasks" ]; then
  echo "错误：run 目录无效或无 tasks 子目录：$RUN_DIR" >&2
  exit 1
fi

has_progress() {
  local t="$1" f="$RUN_DIR/tasks/$t/progress/progress.md"
  [ -s "$f" ] && [ "$(wc -l < "$f" | tr -d ' ')" -gt 0 ]
}

has_blocked() {
  local t="$1" f="$RUN_DIR/tasks/$t/progress/progress.md"
  [ -s "$f" ] && grep -q "BLOCKED" "$f"
}

has_evidence() {
  local t="$1"
  [ -f "$RUN_DIR/tasks/$t/handoff/evidence.yaml" ]
}

git_has_output() {
  local wt="$1"
  # 产出信号：status 非空 或 分支相对基线有提交（merge-base 法，不依赖 main 前进）
  local status_out
  status_out="$(git -C "$wt" status --porcelain 2>/dev/null || true)"
  if [ -n "$status_out" ]; then
    echo "status(非空)"
    return 0
  fi
  local mb commits
  mb="$(git -C "$wt" merge-base "$BASE_REF" HEAD 2>/dev/null || true)"
  if [ -z "$mb" ]; then
    echo "no-merge-base"
    return 1
  fi
  commits="$(git -C "$wt" rev-list --count "$mb..HEAD" 2>/dev/null || echo 0)"
  if [ "$commits" -gt 0 ]; then
    echo "commits($commits)"
    return 0
  fi
  echo "none"
  return 1
}

overall=0
declare -a tasks
if [ -n "$TASKS_FILTER" ]; then
  IFS=',' read -r -a tasks <<< "$TASKS_FILTER"
else
  tasks=("$RUN_DIR"/tasks/*/)
  tasks=("${tasks[@]%/}")
  tasks=("${tasks[@]##*/}")
fi

echo "== 巡检：$RUN_DIR（base=$BASE_REF）=="
for t in "${tasks[@]}"; do
  [ -n "$t" ] || continue
  p_ok=1; has_progress "$t" || p_ok=0
  b_ok=0; blk=0
  if has_blocked "$t"; then blk=1; fi
  e_ok=0; has_evidence "$t" && e_ok=1

  wt="$WORKTREE_ROOT/squad-$t"
  g_out="worktree-missing"
  if [ -d "$wt" ] && git -C "$wt" rev-parse --git-dir >/dev/null 2>&1; then
    g_out="$(git_has_output "$wt")" && b_ok=1
  fi

  verdict="异常"
  if [ "$p_ok" = "1" ] && [ "$b_ok" = "1" ] && { [ "$e_ok" = "1" ] || [ "$blk" = "1" ]; }; then
    if [ "$blk" = "1" ]; then
      verdict="异常(BLOCKED)"
    else
      verdict="产出"
    fi
  elif [ "$p_ok" = "0" ] && [ "$b_ok" = "0" ] && [ "$e_ok" = "0" ]; then
    verdict="无产出"
  fi
  if [ "$verdict" != "产出" ]; then
    overall=1
  fi

  echo "---- task: $t ----"
  printf '  结论: %s\n' "$verdict"
  printf '  [查1] progress 增量: %s\n' "$([ "$p_ok" = "1" ] && echo OK || echo MISSING)"
  printf '  [查2] 工作房产出信号: %s（%s）\n' "$([ "$b_ok" = "1" ] && echo OK || echo MISSING)" "$g_out"
  if [ "$e_ok" = "1" ]; then
    printf '  [查3] sdet evidence: OK\n'
  elif [ "$blk" = "1" ]; then
    printf '  [查3] sdet evidence: 无，但 progress 标 BLOCKED（人工研判）\n'
  else
    printf '  [查3] sdet evidence: MISSING\n'
  fi
done

if [ "$overall" = "0" ]; then
  echo "== 巡检结论：全部 task 正常产出（exit 0）=="
  exit 0
fi
echo "== 巡检结论：存在待关注项（exit 1，供 run-lead 巡检，非失败裁决）=="
exit 1
