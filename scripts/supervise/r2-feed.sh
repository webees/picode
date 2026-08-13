#!/bin/bash
# R2 批量投喂三个三角（A: merge-terminal, B: continuation-bounded, C: guardian-reload-signal）
cd /Users/x/Desktop/iOS/picode/scripts/supervise

feed_triad() {
  local task=$1 sid=$2 eid=$3 did=$4
  local plan="docs/plans/run-2026-08-13T01-15-17-073Z-plan-r2.md"
  node feed.mjs ask --session $sid --text "【R2 · squad-lead@$task】
你是三角组长，负责 $task（见 $plan 的 (b) 对应 chunk + tasks/$task/task.yaml）。engineer 主实现、sdet 独立验证（验收口径 a~d）、你协调评审。完成后 evidence → handoff → merge。回我一句话摘要。" --timeout 600000 > /tmp/r2-$task-squad.log 2>&1 &
  node feed.mjs ask --session $eid --text "【R2 · engineer@$task】
实施 $task（见 $plan 的 (b) chunk：write_paths/public_contract/验收 + tasks/$task/task.yaml + brief/）。只改 write_paths 内文件，commit 到 worktree 分支，跑 npm run build && npm test，回我一句话摘要。" --timeout 600000 > /tmp/r2-$task-engineer.log 2>&1 &
  node feed.mjs ask --session $did --text "【R2 · sdet@$task】
独立验证 $task 的验收口径（见 $plan 的 (b) chunk a~d + tasks/$task/task.yaml）。审查 engineer 实现 + 补 verify_commands + evidence。发现缺陷与 squad-lead 沟通。回我一句话摘要（验证结论+测试计数）。" --timeout 600000 > /tmp/r2-$task-sdet.log 2>&1 &
}

feed_triad task-merge-terminal \
  oc-ses_006f8f83dffeIztvuSvtBUSbVZ oc-ses_006f8f816ffeR8OXpxC2KbsH1n oc-ses_006f8f7f2ffedL7rZGSMpQ5gxY
feed_triad task-continuation-bounded \
  oc-ses_006f8f529ffeMaXh6j4HpmjdsS oc-ses_006f8f501ffezD1jQj0krw8u9h oc-ses_006f8f4d7ffejOaL10s7ZBxbeq
feed_triad task-guardian-reload-signal \
  oc-ses_006f8f20bffeybx6y36sgB14h4 oc-ses_006f8f1e5ffestwxBCv60lAxPx oc-ses_006f8f1bfffelYxmfK7sHtl6I9

echo "9 feeds launched"
wait
echo "ALL DONE"
