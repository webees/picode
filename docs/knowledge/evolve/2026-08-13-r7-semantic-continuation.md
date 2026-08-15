# Evolve run-2026-08-13T18-29-39-276Z

- goal: 语义续跑：续跑 prompt 注入上一回合摘要（N7 升级）
- kind: self_evolve · scale: L（run-lead 自主决策，宽松目标）
- baseline: main（9af47c2 后）
- status: 已完成（C1 continuation-semantic 合并入 main = 见 Diff；C2 本文档）

## Intent

D066/N7 明确「语义续跑（transcript 摘要注入）列第二轮」；本 run 将该缓项落地：
续跑投喂不再只是空泛固定模板，而是带上一回合上下文要点摘要。三 product_acceptance：

1. 续跑投喂带上一回合上下文摘要（不空泛）
2. 摘要来自 transcript 既有记录，**不新增数据源**
3. 续跑预算/幂等/纯函数语义不回归

## 决策要点（D076）

- **D076 语义续跑**（C1）：
  - `composeContinuationPrompt`：续跑 prompt = 固定指令 + 上一回合要点摘要
    （`TranscriptStore.historySummary()`，确定性启发式：条数统计 + 最近 `maxEntries`
    条可读要点、截断 120 字；**无 LLM**，编排器无 LLM 不变量 D003）
  - `feedContinuation` 投喂前取摘要注入；摘要为 **null**（空/损坏转录）→ 回退固定
    `CONTINUATION_PROMPT`（best-effort，不报错不空注入）
  - **零新增数据源**：摘要源自既有 `transcripts/<agent>.jsonl`（D066/P4 转录归档），
    不新增文件/接口/配置；re-spawn（wakeWithOpencode）同款消费已在 D066 路径复用
  - 不回归：预算/幂等/纯函数语义不变；平台席策略、idle 时钟、in-flight 判定不受影响

## Diff（2 chunk，串行 merge 列车 D036）

- **C1 `merge task-continuation-semantic`**（待 C1 合并后补：commit hash + 文件数）：
  `packages/orchestrator/src/continuation.ts`（`composeContinuationPrompt` +
  `feedContinuation` 接线）、复用 `transcript-store.ts` `historySummary`；测试守护
  null 回退与注入路径
- **C2 `chunk-semantic-docs`（本任务）**：DECISIONS D076、decision-catalog §12.3
  续跑内容语义从候选改已定、operations.md 续跑语义补句、本 E9 纪要

## Verification

- C1：`npm run build && npm test` 全绿（验收见 C1 evidence；acceptance 占位符在 QA 阶段具体化）
- C2（本任务）：`npm run check`（persona-lint）通过；文档不破坏构建

## 剩余风险

- **摘要为启发式要点**：条数统计 + 截断 120 字的可读要点，非 LLM 精炼语义——对超长回合
  上下文可能有截断损失，agent 仍可从任务文件/转录原文补齐（不阻塞，可后续迭代）
- **null 回退即 D066 行为**：空/损坏转录时会话拿到的是固定模板（无摘要），语义续跑
  增益失效但不报错——不影响投喂可用性

## 后续候选

1. **摘要窗口可配置**：`historySummary` 的 `maxEntries` 目前固定（20），可暴露为
   `self_evolve.continuation.summary_entries` 配置
2. **摘要写入 ready/re-spawn 一致化**：语义续跑与 wakeWithOpencode 重 spawn 的摘要
   口径已同源，可统一为共享函数并补横切测试
3. **监控面板展示续跑摘要**：`continuations_used` 已上遥测（D069），摘要内容属会话
   级上下文，可视需要进 panel 会话详情
