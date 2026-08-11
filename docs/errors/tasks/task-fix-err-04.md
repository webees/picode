id: task-fix-err-04
title: 修复 serve 重启上下文丢失（E-CTX）
source_error: ERR-20260812-04
severity: P1
status: triaged
priority: 4
assignee: sess-mgr / orchestrator
root_cause_hypothesis:
  - serve 重启后会话内存态不可恢复，未 commit 工作丢失
  - 缺 checkpoint / 持久化（对话+未 commit 变更）
fix_scope: 供分派参考（先经 triage 确认）
acceptance:
  - 重启前自动 checkpoint 会话与未 commit 工作（backup_ref / WIP commit）
  - 重启后可恢复或明确可续跑
linked_errors: [ERR-20260812-04]
created_at: 2026-08-12
