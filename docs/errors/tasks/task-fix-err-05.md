id: task-fix-err-05
title: 修复审批代理命令组匹配瑕疵（E-APPROVAL）
source_error: ERR-20260812-05
severity: P2
status: triaged
priority: 5
assignee: proc-audit / run-lead
root_cause_hypothesis:
  - allowlist 命令组规则（如 npm test 组）匹配不完整
  - 规则定义与命令实际形态不一致
fix_scope: 供分派参考（先经 triage 确认）
acceptance:
  - npm test / npm test -- ... 等命令组均可命中 allowlist
  - 规则覆盖测试用例集齐
linked_errors: [ERR-20260812-05]
created_at: 2026-08-12
