#!/bin/bash
# UI 检修投喂（C1 design-system + C2 overview + C3 run-detail）
cd /Users/x/Desktop/iOS/picode/scripts/supervise

feed_triad() {
  local task=$1 sid=$2 eid=$3 did=$4
  local plan="/private/tmp/picode-dogfood/docs/plans/run-2026-08-13T15-08-28-705Z-plan.md"
  node feed.mjs ask --session $sid --text "【UI检修 · squad-lead@$task】
你是三角组长，负责 $task（见 $plan 的 (b) $task chunk + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T15-08-28-705Z/$task（cd 过去）。核心约束：dashboard-server 与 9 端点零改动；只改 write_paths 内文件。engineer 主实现、sdet 独立验证、你协调评审。完成后 evidence → handoff → merge。回一句话摘要。" --timeout 600000 > /tmp/ui-$task-squad.log 2>&1 &
  node feed.mjs ask --session $eid --text "【UI检修 · engineer@$task】
实施 $task（见 $plan 的 (b) $task chunk：write_paths/验收 + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T15-08-28-705Z/$task（cd 过去）。设计参考：/private/tmp/shadcn-vue-admin（模板）+ 既有 shadcn-vue ui 组件库；保持 9 端点契约不变；文案用 @/utils/labels 体系。验证：cd packages/dashboard && pnpm build && pnpm lint。commit 到 worktree 分支，回一句话摘要。" --timeout 600000 > /tmp/ui-$task-engineer.log 2>&1 &
  node feed.mjs ask --session $did --text "【UI检修 · sdet@$task】
独立验证 $task（验收口径见 $plan 的 (b) $task chunk a~e + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T15-08-28-705Z/$task（cd 过去）。审查 engineer 实现（含视觉/文案/契约不变核查）+ 补 verify_commands + evidence。回一句话摘要（验证结论+测试计数）。" --timeout 600000 > /tmp/ui-$task-sdet.log 2>&1 &
}

feed_triad task-design-system \
  oc-ses_0043db7b5ffe4DdCU0SQVCGbmk oc-ses_0043db787ffezHHLjrcMJtEH9c oc-ses_0043db765ffecMW5ofd8zfi34E
feed_triad task-overview \
  oc-ses_0043db415ffey4lE28oP5HVuYM oc-ses_0043db3ecffeFLXqpMuQ0c6PD4 oc-ses_0043db3c6ffe7c6N2dnngVI70F
feed_triad task-run-detail \
  oc-ses_0043db07affepYlfx4sp3U3fAI oc-ses_0043db053ffejZbs5ewqumfpKZ oc-ses_0043db028ffeK1324XLtwEenYW

echo "9 feeds launched"
wait
echo "ALL DONE"
