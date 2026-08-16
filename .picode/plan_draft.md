# 规划草案 · R18 FIX500：dashboard runs 端点 500 修复

run_id: run-2026-08-16T20-14-40-FIX500
基线: main @ 214d7ef（R17 收尾后，工作树干净）
scale: S（单点小修，1 个 chunk，1 组并行）

## 需求（sponsor 原话）
picode dashboard-server 跑起来后，GET /api/runs/:id 与 /sessions 对所有 run 返回 500，
要修复让它返回数据。已选：走 picode-workflow 流程组队修复（dogfood）。

## 根因（已定位，sys-arch 复核中）
- packages/orchestrator/src/status.ts statusSnapshot(): `goal.acceptance.length` /
  `goal.product_acceptance.length` 无空值保护 → 缺 goal.yaml 的 run 抛 TypeError。
- run-store.ts readGoal() 默认值对象不含 acceptance/product_acceptance。
- 对照：dashboard-server router.ts apiRuns 列表端点用 `?.length ?? 0`，正常。口径不一致。

## 修复方向（双管齐下，技术口径 run-lead 定夺）
1. readGoal 默认值补 `acceptance: []`、`product_acceptance: []`（治本，所有消费方受益）
2. statusSnapshot 调用处改 `goal.acceptance?.length ?? 0`（与列表端点口径对齐，双保险）
3. 回归测试：status.test.ts（缺 goal.yaml → snapshot.goal.acceptance=0 不抛错）+ index.test.ts（端点级 200）
4. 验收手段：重启 dashboard-server → 全部 5 个 run 两个端点逐一 200

## 验收口径（产品策划，P1）
- 对缺 goal.yaml 的 run：GET /api/runs/:id 200，snapshot.goal.acceptance=0
- 同一 run /sessions 200 不抛错
- 全部 5 个 run 两端点逐一 200
- /api/runs 列表端点无回归

## non_goals
- 不重构 statusSnapshot/run-store 整体设计；不改其它端点；不迁移 run 目录数据；不推广全量防御改造

## 待办
- [x] 产品策划澄清（subagent-52）
- [ ] sys-arch 分块复核（subagent-53）
- [ ] goal.yaml 定稿 + sponsor 确认 → active
- [ ] chunks.yaml 定稿（1 chunk ready）
- [ ] docs 组装 WORK_BRIEF → run-lead 批准
- [ ] people 招聘三人组 → run-lead 批准（双门闩）
- [ ] spawn 三人组（squad-lead + engineer + sdet）
- [ ] sdet evidence → code-review 门 → 交接包 → 签收 → 解散评分
- [ ] release-eng 串行合并 → 重启 server 验证 → 汇报
