id: task-fix-err-01
title: 修复 serve stream 挂起卡死（E-SERVE）
source_error: ERR-20260812-01
severity: P0
status: triaged
priority: 1
assignee: sess-mgr / orchestrator
root_cause_hypothesis:
  - opencode-go stream 无超时/心跳，API 调用挂起不返回
  - 缺 stream 级 watchdog（超时 → 中断 → 重试/告警）
fix_scope: 供分派参考（先经 triage 确认）
acceptance:
  - 长 stream 超过阈值自动中断并告警
  - 全局不被单次挂起阻塞（队列可旁路/取消）
  - 复测：压测长请求不产生全局挂起
linked_errors: [ERR-20260812-01]
created_at: 2026-08-12
status_timeline:
  collected: 2026-08-12
  triaged: 2026-08-12
