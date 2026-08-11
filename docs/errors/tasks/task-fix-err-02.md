id: task-fix-err-02
title: 修复 curl 超时断连后会话 loop 停止（E-CURL）
source_error: ERR-20260812-02
severity: P1
status: triaged
priority: 2
assignee: sess-mgr / 客户端 loop
root_cause_hypothesis:
  - loop 依赖单次 curl 成功，断连即退出无重试
  - 断连后无会话恢复/续跑逻辑
fix_scope: 供分派参考（先经 triage 确认）
acceptance:
  - 断连后自动重试 N 次；超限则进入可恢复中间态并告警
  - 任务不卡死，可一键重推
linked_errors: [ERR-20260812-02]
created_at: 2026-08-12
