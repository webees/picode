# Kanban 快照 — 2026-08-12T16:03

> 由编排者按 run-lead 决策落盘（文档小组接管后定期更新）

```
# Kanban — run-2026-08-11T16-05-20-066Z

## Backlog (15)
  - [intake-approval-proxy-v2] 审批代理固化：教学式拒绝、closed hook 自动评分回写、bus 自动留痕（run-lead 平台转交卡 2/3） | 负责人: 甲方
      decision: 平台任务卡（三角认领）
  - [intake-board-v2] 看板增强：评分列、双批状态列、审批链 refs 展示（run-lead 平台转交卡 1/3） | 负责人: 甲方
      decision: 平台任务卡（三角认领）
  - [intake-card-01] E-SERVE serve 卡死 P0：API 超时/重试 + watchdog 健康检查 | 负责人: 甲方
      decision: 修复卡（P0）
  - [intake-card-02] E-CURL 断连自动重推 / noReply 触发 loop | 负责人: 甲方
      decision: 修复卡（P1）
  - [intake-card-03] E-PATH spawn cwd=worktree + 路径解析改造 | 负责人: 甲方
      decision: 修复卡（P1）
  - [intake-card-04] E-CTX 会话持久化 / 重启前自动 commit 兜底 | 负责人: 甲方
      decision: 修复卡（P1）
  - [intake-card-05] E-APPROVAL 审批白名单补规则 + 命令组拆分 | 负责人: 甲方
      decision: 修复卡（P2）
  - [intake-card-06] E-APPROVAL find 限定 worktree / 路径前缀校验 | 负责人: 甲方
      decision: 修复卡（P2）
  - [intake-card-07] E-OTHER 终端工具问题（参考项） | 负责人: 甲方
      decision: 修复卡（P2）
  - [intake-t1] 看板纯只读重构（board.ts 零写路径，验收=只读断言） | 负责人: 甲方
      decision: 平台任务卡（三角认领执行）
  - [intake-t2] 插件逐工具权限分类（网络/出仓默认拒绝，验收=显式权限声明） | 负责人: 甲方
      decision: 平台任务卡（三角认领执行）
  - [intake-t3] 审批代理入库+approval-policy.md（验收=无 /tmp 依赖） | 负责人: 甲方
      decision: 平台任务卡（三角认领执行）
  - [intake-t4] 全局插件副本收敛 symlink 单一来源（验收=无漂移） | 负责人: 甲方
      decision: 平台任务卡（三角认领执行）
  - [intake-t5] 工具路由卡迁入 docs/tool-routing.md（验收=索引同步） | 负责人: 甲方
      decision: 平台任务卡（三角认领执行）
  - [intake-tool-routing] 工具引导：路由表生成、提示词注入块、自检模板（run-lead 平台转交卡 3/3） | 负责人: 甲方
      decision: 平台任务卡（三角认领）

## 分块 (0)
  (空)

## 双门闩中 (2)
  - [task-t2] t2 | 负责人: squad-lead@task-t2, engineer@task-t2, sdet@task-t2
      brief:approved staffing:- | .opencode/plugins/picode.ts
  - [task-t3] t3 | 负责人: squad-lead@task-t3, engineer@task-t3, sdet@task-t3
      brief:approved staffing:- | scripts/**,docs/**

## 进行中 (1)
  - [task-chunk-a] chunk-a | 负责人: squad-lead@task-chunk-a, engineer@task-chunk-a, sdet@task-chunk-a
      brief:approved staffing:approved | packages/bus/**

## 验证中 (0)
  (空)

## 交接中 (0)
  (空)

## 已完成 (1)
  - [task-t1] t1 | 负责人: squad-lead@task-t1, engineer@task-t1, sdet@task-t1
      brief:approved staffing:approved | packages/orchestrator/**
```
