#!/bin/bash
# Dashboard 投喂（C1 server + C2 scaffold，C3 等合并后）
cd /Users/x/Desktop/iOS/picode/scripts/supervise

feed_triad() {
  local task=$1 sid=$2 eid=$3 did=$4 plan=$5
  node feed.mjs ask --session $sid --text "【Dashboard · squad-lead@$task】
你是三角组长，负责 $task（见 /private/tmp/picode-dogfood/docs/plans/run-2026-08-13T12-16-26-548Z-plan.md 的 (b) $task chunk + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T12-16-26-548Z/$task（cd 过去）。engineer 主实现、sdet 独立验证（验收 a~e）、你协调评审。完成后 evidence → handoff → merge。回我一句话摘要。" --timeout 600000 > /tmp/dash-$task-squad.log 2>&1 &
  node feed.mjs ask --session $eid --text "【Dashboard · engineer@$task】
实施 $task（见 /private/tmp/picode-dogfood/docs/plans/run-2026-08-13T12-16-26-548Z-plan.md 的 (b) $task chunk：write_paths/public_contract/验收 + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T12-16-26-548Z/$task（cd 过去再操作）。
$plan
只改 write_paths 内文件（超界找 run-lead 追加），commit 到 worktree 分支，跑验证命令（server 任务：npm run build && npm test；scaffold 任务：cd packages/dashboard && pnpm install && pnpm build），回我一句话摘要。" --timeout 600000 > /tmp/dash-$task-engineer.log 2>&1 &
  node feed.mjs ask --session $did --text "【Dashboard · sdet@$task】
独立验证 $task 的验收口径（见 /private/tmp/picode-dogfood/docs/plans/run-2026-08-13T12-16-26-548Z-plan.md 的 (b) $task chunk a~e + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T12-16-26-548Z/$task（cd 过去）。审查 engineer 实现 + 补 verify_commands + evidence（server 含 curl 冒烟 8788）。回我一句话摘要。" --timeout 600000 > /tmp/dash-$task-sdet.log 2>&1 &
}

# C1 dashboard-server
feed_triad task-dashboard-server \
  oc-ses_004d9520affe7YBVSQmahLmvgZ oc-ses_004d9518effeUNz5fADcDLfE8S oc-ses_004d95109ffeC1nHlJ6kUetFNT \
  "复用 @picode/orchestrator 只读投影（statusSnapshot/buildBoard/readMergeQueue 等）；node:http 零依赖；--repo 定位 runs_root；9 端点只读；serve 代理 /api/live/:runId/:agent（oc- 剥离 + info.tokens.total）"

# C2 dashboard-scaffold
feed_triad task-dashboard-scaffold \
  oc-ses_004d9508effeSejj0JHQOUew1k oc-ses_004d95013ffe22srcvUY3Krx2z oc-ses_004d94f9affe4bM7VbcMCMtX0D \
  "vendor 模板源：/private/tmp/shadcn-vue-admin（复制到 packages/dashboard，改名 @picode/dashboard，保留 pnpm-workspace；删除演示页 auth/marketing/apps/users/tasks/ai-talk/prop-components/billing/help-center/errors/settings；navData 换 picode 分区；vite proxy /api → 127.0.0.1:8788；骨架页 /dashboard + /dashboard/runs/[runId]）"

echo "6 feeds launched"
wait
echo "ALL DONE"
