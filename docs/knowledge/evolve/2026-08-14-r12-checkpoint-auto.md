<!-- 已合并至 plans/2026-08-14-r12-checkpoint-auto.md（2026-08-15 精简 · 批 2）：决策 D091 / chunk 分块 / 验证数字以 plans 为主干，本纪要的剩余风险与后续候选增量已并入 plans 合并节；细节见 git 历史。 -->

# Evolve run-2026-08-14T08-55-08-366Z

- goal: checkpoint 自动捕获接线（guardian 周期捕获，快照只读语义不变）+ 其他 run-lead 评估项（宽松）
- kind: self_evolve · scale: L（run-lead 自主决策，宽松目标）
- baseline: main（3b99888；C1/C2 合并前 = 7860df0）
- status: 已完成（C1 checkpoint-auto 合并 = 7860df0；C2 reserve-schema 合并 = 3b99888；C3 本文档）

## Intent

D082 落地 checkpoint MVP（显式捕获，`boundary: manual`），自动捕获（guardian 周期 / merge 前）为
缓项（E10 后续候选）。product_acceptance（宽松）：checkpoint 自动捕获（guardian 周期/事件驱动，
boundary 扩展）或 run-lead 评估的高价值项；**快照只读边界不变**。run-lead 评估的高价值项为
E12 剩余风险 #1（reserve.mjs 与 decision-lint 预留 schema 不一致 from vs start）。

1. checkpoint 自动捕获接线：guardian 周期捕获 + merge 前捕获，boundary 扩展（C1）
2. reserve.mjs 预留字段对齐 decision-lint 契约：from→start + --plan 预检（C2，E12 剩余风险 #1 闭环）

## 决策要点（D091）

- **D091 checkpoint 自动捕获接线**（C1 task-checkpoint-auto）：
  - 新增 `self_evolve.checkpoints` 配置——`enabled`（默认 **false** = D082 显式捕获行为不变）、
    `guardian_interval_sec`（默认 **600s** 节流，0 = 每次 tick）、`pre_merge`（默认 **true**，
    受 `enabled` 总开关约束）
  - checkpoint-store 新增 `GUARDIAN`/`PRE_MERGE` 边界常量 + `guardianCaptureDue` 纯函数 +
    `captureDueGuardianCheckpoints`（仅写观测文件，跳过终态/缺失 task，节流复用）
  - self-drive：`guardianTick` 在 `checkBudgets` 之后接线周期捕获，`GuardianTickResult.checkpoints`
    仅作观测回报，**不驱动任何状态决策**
  - merge：`mergeNext` 实际合并前 best-effort 捕获（`enabled && pre_merge`），try/catch 绝不阻断
    merge；`MergeOutcome.checkpoint` 纯观测
  - **快照只读/文件为准边界（D082）不变**：自动捕获仍只写观测文件，不读 checkpoint 驱动任何
    恢复/续跑/调度/合并状态决策（sdet 独立审计 PASS）
- **D091 reserve 字段对齐**（C2 task-decision-reserve-schema，E12 剩余风险 #1）：
  - `reserve.mjs` 预留条目字段统一为 `{run, start, count, status}`（`from`→`start`），与
    decision-lint 校验契约（D090）一致，领号 → lint 全链路可闭环
  - 新增 `--plan <file>` 预检：复用 `checkDecisions`，REF_UNRESOLVED/PLAN_MISSING 输出与
    decision-lint 逐字对齐；测试 12 用例（领号→lint 闭环 + 未预留 REF_UNRESOLVED + plan 缺失）

## Diff（2 chunk + docs，串行 merge 列车 D036）

- **C1 `task-checkpoint-auto`**（7860df0）：`packages/core/src/config.ts`（CheckpointCaptureConfig +
  校验 + DEFAULTS）、`packages/orchestrator/src/checkpoint-store.ts`（GUARDIAN/PRE_MERGE 边界 +
  guardianCaptureDue + captureDueGuardianCheckpoints）、`self-drive.ts`（guardianTick 接线）、
  `merge.ts`（mergeNext 前捕获）+ 对应测试（config/checkpoint-store/merge/self-drive）
- **C2 `task-decision-reserve-schema`**（3b99888）：`docs/decisions/reserve.mjs`（from→start +
  --plan 预检）+ `reserve.test.mjs`（12 用例）
- **C3 `task-ckauto-docs`（本任务）**：DECISIONS D091 表行 + 详条；decision-catalog §12.9 自动捕获
  配置 + boundary 语义；operations 会话 checkpoint 自动捕获 + 决策编号规程；watermark 91 landed；
  本 E13 纪要

## Verification

- C1：`npm run build` + `npm test` 全绿（445 断言：core 111 / orchestrator 282 / 其余同全量），
  tsc -b 干净；D082 快照只读边界由 sdet 独立审计 PASS（checkpoint 仅写不读）
- C2：`npm run build` + `npm test` 445 断言全绿；`reserve.test.mjs` 12/12；`npm run check` 三 lint 全绿
- C3（本任务）：`node packages/core/dist/validate/decision-lint.js .` 全绿（0 error）——
  表行/详条唯一、详条↔表行对应、水位一致（next_number=92 ≥ max 91）、引用可解析、预留 landed 无冲突

## 剩余风险

- **自动捕获默认关闭**：`self_evolve.checkpoints.enabled` 默认 false——开启后才有 guardian 周期 +
  merge 前捕获；显式捕获（D082）行为始终不变
- **guardian 周期捕获节流语义**：仅按「距上次 guardian 捕获」节流；手动 `capture` 不重置该时钟
  （boundary 不同，各自独立）；高频 tick（guardian_interval_sec=0）会每 tick 捕获——观测成本自担
- **merge 前捕获 best-effort**：捕获异常被 try/catch 吞掉，绝不阻断 merge——极端情况下 merge 落地的
  那个时点可能没有 pre_merge 快照（观测物，不影响 merge 正确性）
- **docs/** 引用为 warning 级**：历史债需人工清理（沿用 E12 记录）

## 后续候选

1. **checkpoint 进 statusSnapshot 三面**：MVP 仅 CLI 消费面；三面同源需动 status 契约 + mcp-server
2. **自动捕获默认开启评估**：观测价值验证后考虑翻转 `enabled` 默认值（现保守默认 false）
3. **docs/** 过期引用清理**：把 warning 级历史债清零（对 D0xx 引用逐一核对 DECISIONS/预留）
