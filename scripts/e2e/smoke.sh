#!/usr/bin/env bash
# picode 真实 LLM 端到端冒烟（E2E smoke）
#
# 前置条件：
#   1. `npm run build` 已执行（dist 最新）
#   2. opencode serve 正在运行（默认 127.0.0.1:7788，可用 SERVE_URL 覆盖），
#      且已注入 LLM 凭据：
#        export OPENCODE_GO_API_KEY=<key>
#        ~/.opencode/bin/opencode serve --port 7788
#      （key 只存在于 serve 进程环境，本脚本不接触 key）
#      E2E 建议用独立实例避免与其他流程排队：
#        SERVE_URL=http://127.0.0.1:7799 ~/.opencode/bin/opencode serve --port 7799
#   3. 用户全局 ~/.picode/config.yaml 或业务仓 .picode/config.yaml 已启用
#      opencode.enabled: true（13 §2 第 2 层）
#
# 行为：在临时 git 仓跑完整交付闭环：init → 产品口径 → active → chunk →
# brief（双门闩一）→ staffing 真招聘（双门闩二，规则引擎经 opencode 真实唤醒三角）→
# 真实会话对话 → sleep（服务端 DELETE）→ evidence/handoff → dissolve →
# worktree 交付 → 串行 merge → status。失败即退出非零。
#
# 注意：真实模型调用较慢（每次 wake 一次 LLM 调用），全流程约 3–12 分钟。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="node $REPO_ROOT/packages/orchestrator/dist/cli.js"
# SERVE_URL 可覆盖（如为 E2E 起独立 serve 实例避免与其他流程排队）
SERVE_URL="${SERVE_URL:-http://127.0.0.1:7788}"

# ---- 前置检查 ----
echo "== 前置检查 =="
if ! curl -s -m 3 "$SERVE_URL/" -o /dev/null; then
  echo "ERROR: opencode serve 未运行于 $SERVE_URL"
  echo "  启动方法："
  echo "    export OPENCODE_GO_API_KEY=<key>"
  echo "    ~/.opencode/bin/opencode serve --port 7788"
  exit 1
fi
echo "  serve: OK"

cleanup() {
  # 只删除本次 E2E 创建的会话：从临时仓 sessions/*.yaml 解析 pi_session_id（oc-*），
  # 逐条 DELETE。绝不批量删 picode:*（serve 是共享的，可能有其他流程的会话）。
  if [ -n "${TMP_REPO:-}" ] && [ -d "$TMP_REPO/.picode/runs" ]; then
    for f in "$TMP_REPO"/.picode/runs/*/sessions/*.yaml; do
      [ -f "$f" ] || continue
      SID="$(python3 -c "
import yaml,sys
try:
    r = yaml.safe_load(open('$f'))
    ps = r.get('pi_session_id') or ''
    print(ps[3:] if ps.startswith('oc-') else '')
except Exception:
    pass
")"
      [ -n "$SID" ] && curl -s -m 10 -X DELETE "$SERVE_URL/session/$SID" -o /dev/null || true
    done
  fi
  rm -rf "${TMP_REPO:-}"
}
trap cleanup EXIT

TMP_REPO="$(mktemp -d /tmp/picode-e2e.XXXXXX)"
cd "$TMP_REPO"
git init -q -b main .
git config user.email e2e@picode
git config user.name "picode-e2e"
mkdir -p src
echo 'export const a = 1;' > src/a.ts
git add -A && git commit -qm init

# SERVE_URL 非默认（独立 serve 实例）时，用临时 HOME + 生成全局配置，
# 让 CLI 的 opencode.base_url 也指向同一实例（用户全局 ~/.picode/config.yaml 不受影响）
if [ "$SERVE_URL" != "http://127.0.0.1:7788" ]; then
  HOME="$(mktemp -d /tmp/picode-e2e-home.XXXXXX)"
  export HOME
  mkdir -p "$HOME/.picode"
  cat > "$HOME/.picode/config.yaml" <<EOF
opencode:
  enabled: true
  base_url: "$SERVE_URL"
  provider_id: opencode-go
  model_id: deepseek-v4-flash
EOF
  echo "  E2E 隔离配置: HOME=$HOME, base_url=$SERVE_URL"
fi

step() { echo; echo "== $1 =="; }

step "1/11 init（delivery run）"
RUN="$($CLI init --repo "$TMP_REPO" --goal-title "E2E smoke" | python3 -c "import sys,json;print(json.load(sys.stdin)['runId'])")"
echo "  runId=$RUN"

step "2/11 产品口径 + goal active（P01 门闩）"
$CLI goal set-product-acceptance --repo "$TMP_REPO" --run "$RUN" --acceptance "编译通过" >/dev/null
$CLI goal set-status --repo "$TMP_REPO" --run "$RUN" --status active >/dev/null
echo "  goal: active"

step "3/11 chunk add"
TASK="$($CLI chunk add --repo "$TMP_REPO" --run "$RUN" --id chunk-a --write "src/**" | python3 -c "import sys,json;print(json.load(sys.stdin)['taskId'])")"
echo "  taskId=$TASK"

step "4/11 brief draft + approve（双门闩之一）"
$CLI brief draft --repo "$TMP_REPO" --run "$RUN" --task "$TASK" >/dev/null
$CLI brief approve --repo "$TMP_REPO" --run "$RUN" --task "$TASK" --by run-lead >/dev/null
echo "  brief: approved"

step "5/11 staffing 真招聘（request → personas → check → approve）"
$CLI staffing request --repo "$TMP_REPO" --run "$RUN" --task "$TASK" --skills "typescript" >/dev/null
$CLI staffing draft-personas --repo "$TMP_REPO" --run "$RUN" --task "$TASK" >/dev/null
$CLI staffing check --repo "$TMP_REPO" --run "$RUN" --task "$TASK" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['ok'], d; print('  people-qa: ok')"
$CLI staffing approve --repo "$TMP_REPO" --run "$RUN" --task "$TASK" --by run-lead \
  | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['staffing']['status']=='approved';print('  staffing: approved, wokeSquad:',d['wokeSquad'])"

step "6/11 断言：三角会话经 opencode 真实唤醒（pi_session_id = oc-*）"
for seat in "squad-lead@$TASK" "engineer@$TASK" "sdet@$TASK"; do
  $CLI session list --repo "$TMP_REPO" --run "$RUN" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=next(x for x in d['sessions'] if x['agent_id']=='$seat')
assert s['state']=='awake', s
assert s['pi_session_id'] and s['pi_session_id'].startswith('oc-'), s
print('  $seat: awake', s['pi_session_id'])
"
done

step "7/11 真实会话对话（engineer 产出代码，模型真实调用）"
SID="$($CLI session list --repo "$TMP_REPO" --run "$RUN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=next(x for x in d['sessions'] if x['agent_id']=='engineer@$TASK')
print(s['pi_session_id'].replace('oc-',''))
")"
# 必须带 model 对象（{providerID, modelID}）：serve v1.18 的模型在消息级指定，
# 不带则回退 serve 默认模型（本机曾出现 gpt-5.6-luna → 403 region 不可用）
REPLY="$(curl -s -m 300 "$SERVE_URL/session/$SID/message" -X POST -H "Content-Type: application/json" \
  -d '{"model":{"providerID":"opencode-go","modelID":"deepseek-v4-flash"},"parts":[{"type":"text","text":"输出最小 TypeScript add(a,b) 函数，只回代码。"}]}' \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
info=d.get('info',{})
err=info.get('error')
if err:
    print('MODEL_ERROR: '+(err.get('data',{}).get('message') or str(err))[:200]); sys.exit(0)
text=''.join(p.get('text','') for p in d.get('parts',[]) if p.get('type')=='text')
print(text.strip()[:200])
")"
echo "  模型产出: ${REPLY:0:80}..."
case "$REPLY" in
  MODEL_ERROR:*) echo "  ❌ 上游模型错误: ${REPLY#MODEL_ERROR: }"; exit 1;;
  "") echo "  ❌ 空响应"; exit 1;;
  *) echo "  对话: OK";;
esac

step "8/11 task prepare + 模拟 engineer 交付（worktree 提交）"
PREP="$($CLI task prepare --repo "$TMP_REPO" --run "$RUN" --task "$TASK")"
WT="$(echo "$PREP" | python3 -c "import sys,json;print(json.load(sys.stdin)['worktree'])")"
cat > "$WT/src/add.ts" <<'EOF'
export function add(a: number, b: number): number {
  return a + b;
}
EOF
(cd "$WT" && git add -A && git commit -qm "feat: add()")
echo "  worktree 交付已提交"

step "9/11 会话收尾 + 任务解散（evidence → handoff → dissolve）"
for seat in "squad-lead@$TASK" "engineer@$TASK" "sdet@$TASK"; do
  $CLI session sleep --repo "$TMP_REPO" --run "$RUN" --agent "$seat" --reason "e2e-done" >/dev/null
done
echo "  三角已 sleep（服务端会话已 DELETE）"
$CLI evidence submit --repo "$TMP_REPO" --run "$RUN" --task "$TASK" --cmd "npm test" --exit-code 0 --log-ref "$WT/src/add.ts" >/dev/null
$CLI handoff package --repo "$TMP_REPO" --run "$RUN" --task "$TASK" >/dev/null
$CLI handoff ack --repo "$TMP_REPO" --run "$RUN" --task "$TASK" --by docs-lead >/dev/null
$CLI task dissolve --repo "$TMP_REPO" --run "$RUN" --task "$TASK" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  dissolved:',d.get('task_id'))"

step "10/11 串行 merge（真实 git 合并到 main）"
$CLI merge enqueue --repo "$TMP_REPO" --run "$RUN" --task "$TASK" >/dev/null
$CLI merge process --repo "$TMP_REPO" --run "$RUN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['merged'] and d['merged']['status']=='merged', d;print('  merged:',d['merged']['task_id'])"
[ -f "$TMP_REPO/src/add.ts" ] && echo "  main 上存在交付文件: OK"

step "11/11 status 快照"
$CLI status --repo "$TMP_REPO" --run "$RUN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['goal']['status']=='active', d
print('  goal:', d['goal']['status'], '| sessions total:', d['sessions']['total'], '| awake:', len(d['sessions']['awake']))
"

echo
echo "✅ E2E PASS — 全链路（含真实 LLM 会话与串行 merge）"
