#!/usr/bin/env bash
# merge-gate.sh —— 合并门一键检查：evidence 齐 + diff ⊆ write_paths + lint + 测试绿
#
# 用途：把 R9 合并门固化成命令（plan §5）——run-lead/release-eng 在合并某 task 分支前
#   一条命令完成全部门禁检查，输出 PASS/FAIL 清单。本脚本在目标 task 的工作房内运行
#   （cwd = worktree 根），从分支名 picode/<run-id>/<task-id> 自动推导 task/run。
#
# 检查项：
#   [1] evidence 齐：handoff/ 含 evidence.yaml + summary.md + artifact_index.md
#       + known_issues.md + diff_scope.md（brief.yaml write_paths 权威来源）
#   [2] diff ⊆ write_paths：git diff --name-only <base>...HEAD 逐文件对照该 task 的
#       write_paths（读取 tasks/<task_id>/brief/brief.yaml，与 merge-gate 门闩语义一致）
#   [3] lint：npm run check（persona/skill/decision 三 lint）退出码 0
#   [4] 测试绿：bash scripts/test-iso.sh（HOME 隔离 + 先 tsc -b 防 stale 假红）退出码 0
#
# usage:
#   bash scripts/merge-gate.sh                 # cwd=worktree 根，task/run 从分支名推导
#   bash scripts/merge-gate.sh --task <id> [--run <run-id>] [--base <ref>] [--worktree <path>]
#   bash scripts/merge-gate.sh -h|--help
#
# 输出：逐项 PASS/FAIL 清单；退出码 0=全 PASS（可合并），非 0=存在 FAIL（不可合并）
set -uo pipefail

usage() {
  sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

TASK_ID=""
RUN_ID=""
BASE_REF="main"
WORKTREE=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 主仓定位：本脚本既可能在主仓 scripts/ 下运行，也可能在任务工作房 scripts/ 下运行
# （merge-gate 的常态 = 在 task 工作房内执行）——用 git-common-dir 定位主仓，勿用脚本位置推导
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
RUNS_ROOT="$REPO_ROOT/.picode/runs"

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --task) TASK_ID="${2:-}"; shift 2 ;;
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --base) BASE_REF="${2:-}"; shift 2 ;;
    --worktree) WORKTREE="${2:-}"; shift 2 ;;
    -*) echo "错误：未知参数 $1（见 --help）" >&2; exit 2 ;;
    *) echo "错误：多余参数 $1（见 --help）" >&2; exit 2 ;;
  esac
done

WORKTREE="${WORKTREE:-$(pwd)}"
WORKTREE="$(cd "$WORKTREE" 2>/dev/null && pwd || echo "$WORKTREE")"
if [ ! -d "$WORKTREE/.git" ] && [ ! -f "$WORKTREE/.git" ]; then
  echo "错误：$WORKTREE 不是 git 工作目录（merge-gate 需在 task 工作房内运行）" >&2
  exit 1
fi

# 从分支名推导：picode/<run-id>/<task-id>
BRANCH="$(git -C "$WORKTREE" branch --show-current 2>/dev/null || true)"
if [ -z "$TASK_ID" ] || [ -z "$RUN_ID" ]; then
  if [[ "$BRANCH" =~ ^picode/([^/]+)/([^/]+)$ ]]; then
    RUN_ID="${RUN_ID:-${BASH_REMATCH[1]}}"
    TASK_ID="${TASK_ID:-${BASH_REMATCH[2]}}"
  fi
fi
if [ -z "$TASK_ID" ]; then
  echo "错误：无法推导 task id（分支名非 picode/<run>/<task>），请用 --task 指定" >&2
  exit 2
fi

TASK_DIR="$RUNS_ROOT/$RUN_ID/tasks/$TASK_ID"
if [ ! -d "$TASK_DIR" ]; then
  echo "错误：task 目录不存在：$TASK_DIR（检查 --run/--task 或 run 目录）" >&2
  exit 1
fi

echo "== merge-gate: task=$TASK_ID run=$RUN_ID base=$BASE_REF worktree=$WORKTREE =="
FAILS=0

pass()  { printf '  [PASS] %s\n' "$1"; }
fail()  { printf '  [FAIL] %s\n' "$1"; FAILS=$((FAILS+1)); }

# ---- [1] evidence 齐 ----
echo "---- [1] evidence 齐 ----"
EVIDENCE_OK=1
for f in evidence.yaml summary.md artifact_index.md known_issues.md diff_scope.md; do
  if [ -f "$TASK_DIR/handoff/$f" ]; then
    pass "handoff/$f"
  else
    fail "handoff/$f 缺失"
    EVIDENCE_OK=0
  fi
done

# ---- [2] diff ⊆ write_paths ----
echo "---- [2] diff ⊆ write_paths（对照 brief.yaml）----"
BRIEF_YAML="$TASK_DIR/brief/brief.yaml"
if [ ! -f "$BRIEF_YAML" ]; then
  fail "brief.yaml 缺失：$BRIEF_YAML（无法取得权威 write_paths）"
  DIFF_OK=0
else
  # 提取 write_paths（yaml 列表：- "path"）——用临时文件（进程替换 <() 在 sh -n 下语法错误，禁）
  WP_TMP="$(mktemp "${TMPDIR:-/tmp}/merge-gate-wp.XXXXXX")"
  trap 'rm -f "$WP_TMP"' EXIT
  awk '/^write_paths:/{f=1; next} f && /^[[:space:]]*- /{sub(/^[[:space:]]*-[[:space:]]*/, ""); gsub(/["'"'"']/, ""); print}' "$BRIEF_YAML" > "$WP_TMP"
  WP=()
  while IFS= read -r w; do
    [ -n "$w" ] && WP+=("$w")
  done < "$WP_TMP"
  DIFF_OK=1
  changed=0
  DIFF_TMP="$(mktemp "${TMPDIR:-/tmp}/merge-gate-diff.XXXXXX")"
  trap 'rm -f "$WP_TMP" "$DIFF_TMP"' EXIT
  git -C "$WORKTREE" diff --name-only "$BASE_REF"...HEAD 2>/dev/null > "$DIFF_TMP" || true
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    changed=$((changed+1))
    in_wp=0
    for wp in "${WP[@]}"; do
      if [ "$f" = "$wp" ]; then in_wp=1; break; fi
    done
    if [ "$in_wp" = "1" ]; then
      pass "diff 文件 $f ∈ write_paths"
    else
      fail "diff 越界：$f 不在 write_paths（$BRIEF_YAML）"
      DIFF_OK=0
    fi
  done < "$DIFF_TMP"
  if [ "$changed" = "0" ]; then
    fail "无 diff（$BASE_REF...HEAD 为空——分支无提交？）"
    DIFF_OK=0
  fi
fi

# ---- [3] lint ----
echo "---- [3] lint（npm run check：persona/skill/decision 三 lint）----"
if (cd "$WORKTREE" && npm run check >/tmp/merge-gate-check.log 2>&1); then
  pass "npm run check 三 lint（log: /tmp/merge-gate-check.log）"
else
  fail "npm run check 非 0（log: /tmp/merge-gate-check.log）"
fi

# ---- [4] 测试绿 ----
echo "---- [4] 测试绿（test-iso.sh：HOME 隔离 + 先 tsc -b）----"
if (cd "$WORKTREE" && bash scripts/test-iso.sh >/tmp/merge-gate-test.log 2>&1); then
  pass "test-iso.sh 全量测试（log: /tmp/merge-gate-test.log）"
else
  fail "test-iso.sh 非 0（log: /tmp/merge-gate-test.log）"
fi

echo "----------------------------------------"
if [ "$FAILS" = "0" ]; then
  echo "== merge-gate: PASS（全部通过，可合并）=="
  exit 0
fi
echo "== merge-gate: FAIL（$FAILS 项未通过，不可合并）=="
exit 1
