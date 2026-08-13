#!/bin/bash
# R3 批量投喂三三角（A: idle-clock, B: continuation-gate, C: continuation-telemetry）
cd /Users/x/Desktop/iOS/picode/scripts/supervise

feed_triad() {
  local task=$1 sid=$2 eid=$3 did=$4
  local plan="docs/plans/run-2026-08-13T09-36-28-520Z-plan.md"
  node feed.mjs ask --session $sid --text "【R3 · squad-lead@$task】
你是三角组长，负责 $task（见 /private/tmp/picode-dogfood/$plan 的 (b) 对应 chunk + tasks/$task/task.yaml）。注意：工作目录是 /private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T09-36-28-520Z/$task（worktree），文件写入绝对路径要在 worktree 内；若 cwd 不对，cd 到该 worktree。engineer 主实现、sdet 独立验证（验收 a~e）、你协调评审。完成后 evidence → handoff → merge。回我一句话摘要。" --timeout 600000 > /tmp/r3-$task-squad.log 2>&1 &
  node feed.mjs ask --session $eid --text "【R3 · engineer@$task】
实施 $task（见 /private/tmp/picode-dogfood/$plan 的 (b) chunk：write_paths/public_contract/验收 + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T09-36-28-520Z/$task（cd 过去再操作）。只改 write_paths 内文件，commit 到 worktree 分支，跑 npm run build && npm test，回我一句话摘要。" --timeout 600000 > /tmp/r3-$task-engineer.log 2>&1 &
  node feed.mjs ask --session $did --text "【R3 · sdet@$task】
独立验证 $task 的验收口径（见 /private/tmp/picode-dogfood/$plan 的 (b) chunk a~e + tasks/$task/task.yaml）。工作目录：/private/tmp/picode-dogfood/.picode/worktrees/run-2026-08-13T09-36-28-520Z/$task（cd 过去）。审查 engineer 实现 + 补 verify_commands + evidence。发现缺陷与 squad-lead 沟通。回我一句话摘要（验证结论+测试计数）。" --timeout 600000 > /tmp/r3-$task-sdet.log 2>&1 &
}

feed_triad task-idle-clock \
  oc-ses_005278976ffeV4UEaNaO0g9zGF oc-ses_0052788feffeIpe5PO6CtXOLuY oc-ses_005278882ffe8EXAC2pJOpmJbv
feed_triad task-continuation-gate \
  oc-ses_00527880affe41dR1NP6sWkm6C oc-ses_005278794ffekLSdRexwUnc7HV oc-ses_005278719ffeX5Kj2Q6fFt0AFt
feed_triad task-continuation-telemetry \
  oc-ses_005278697ffegpLHaqwhWRTYMB oc-ses_005278622ffeWVB5cUk2TgkJi9 oc-ses_0052785abffeyfplFqU5wIiUUW

echo "9 feeds launched"
wait
echo "ALL DONE"
