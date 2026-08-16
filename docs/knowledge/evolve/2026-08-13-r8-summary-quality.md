<!-- 精简批2（2026-08-15）：E 纪要已摘要化——教训/风险去向见 evolve/E1-E15-SUMMARY.md 对应行，细节见 git 历史。 -->
# Evolve run-2026-08-13T21-32-57-118Z

- goal: 续跑机制深化第三轮：摘要语义化 + 预算差异化（宽松目标，run-lead 自主决策）
- kind: self_evolve · scale: L（run-lead 自主决策，宽松目标）
- baseline: main（fc72f39 后）
- status: 已完成（C1 continuation-summary 合并 = 6d1973f；C2 continuation-budget 合并 = 910ae6a；C3 本文档）

## Intent

E9 候选（摘要语义化/预算差异化/checkpoint）本轮落地前两项。D076 已把续跑 prompt 带上
上一回合要点摘要，但存在两个硬化点：摘要窗口硬编码（8）不可调、机械模板文本污染下一轮
摘要；且 `max_per_session` 单一预算让续跑需求轻的平台席（监测/调研型）继承三角预算，易烧
token。product_acceptance：

1. 宽松：续跑机制继续深化（E9 候选：摘要语义化/预算差异化/checkpoint），run-lead 自主决策
2. 验收：既有 continuation 单测全绿 + build 通过（385 tests 全绿）

## 决策要点（D077 / D078）

- **D077 摘要窗口可配置 + stripNoise 去噪**（C1 task-continuation-summary，6d1973f）：
  - `historySummary` 增 `opts.stripNoise[]`：生成 outgoing 要点前删除命中子串
    （feed 传 `[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`），删空条目整条跳过；
    条数统计仍基于原始转录（不受去噪影响）；`maxEntries<=0` = 摘要窗口关闭返回 null
  - `feedContinuation` 用 `config.self_evolve.continuation.summary_entries`（默认 8，
    非负整数校验）替代硬编码 8；提取 `CONTINUATION_SUMMARY_HEADER` 常量供
    compose/re-spawn 复用
  - 越界处置：初始改动 `wakeWithOpencode` 传 `stripNoise:[READY_MESSAGE_TEXT]`
    （opencode-adapter.ts）不在本任务 write_paths，P07 门禁（diff ⊆ write_paths）MUST
    拦截，squad-lead 以 87615b9 回退（re-spawn 去噪属后续候选，D079）
- **D078 续跑预算按角色分流**（C2 task-continuation-budget，910ae6a，main = fc1ed8d）：
  - 新增 `self_evolve.continuation.max_per_session_platform`（默认 **2**，平台席独立更紧
    预算；非负整数校验，0=不限保留）
  - `deriveContinuationTargets` 预算门按 `taskId` 分流——task 绑定用 `max_per_session`
    （5）、平台席（taskId 空）用 `max_per_session_platform`（2）；判定顺序保持预算门在前、
    `platform_seats=skip` 门在后
  - 遥测三面一致：顶层增 `max_per_session_platform` 字段、session 级 `max_per_session`
    反映该会话**适用上限**（status/CLI/MCP 同派生）
  - **有意行为变更**：现 `platform_seats: "allow"` 配置（原继承 5）升级后平台席收紧到 2

## Diff（2 chunk + docs，串行 merge 列车 D036）

- **C1 `task-continuation-summary`**（6d1973f）：`transcript-store.ts`（historySummary
  `opts.stripNoise` / `maxEntries<=0`）、`continuation.ts`（feed 用 summary_entries +
  stripNoise + `CONTINUATION_SUMMARY_HEADER`）、`config.ts`（summary_entries 默认 8 +
  校验）；对应测试；越界 opencode-adapter 改动回退（87615b9，P07 门禁）
- **C2 `task-continuation-budget`**（910ae6a，main = fc1ed8d）：`config.ts`
  （max_per_session_platform 默认 2 + 校验）、`continuation.ts`（预算门 taskId 分流）、
  `status.ts`（遥测顶层/会话级字段）；对应测试
- **C3 `task-deep-docs`（本任务）**：DECISIONS D077/D078 + D079-081 缓项、decision-catalog
  §12.1 预算分流 + §12.8 摘要窗口、operations.md 续跑配置说明、本 E10 纪要

## Verification

- C1：`npm run build && npm test` 全绿（6 workspace 共 385 tests：core 67 / bus 19 /
  orchestrator 249 / pi-extension 17 / mcp-server 17 / dashboard-server 16）+ typecheck 通过
  （evidence 见 task-continuation-summary/evidence/evidence.yaml，C1-a..C1-d 逐项复核）
- C2：`npm run build && npm test` 全绿（evidence 见 task-continuation-budget）
- C3（本任务）：文档不破坏构建；`npm run check`（persona-lint）通过

## 剩余风险

- **摘要仍为启发式**：stripNoise 仅精确剔模板句，摘要仍含续跑 feed 的 outgoing 记录
  （确定性、可复现）；「关键动作提取」留 D080 缓项（仍启发式，不引 LLM）
- **平台席预算收紧**：`max_per_session_platform=2` 为有意保守行为变更——`allow` 逃生路径
  的监测/调研型会话续跑次数变少，可能影响其长时调研产出；按需显式调大
- **re-spawn 摘要无去噪**：`wakeWithOpencode` 重 spawn 的摘要仍含 ready 模板文本（D079 缓项），
  与 feed 路径摘要口径不一致，属已知差量

## 后续候选

1. **re-spawn 摘要去噪一致化**（D079）：`wakeWithOpencode` 传 `stripNoise:[READY_MESSAGE_TEXT]`，
   与 feed 路径口径统一；需单独任务（含 opencode-adapter 于 write_paths）
2. **摘要语义化/关键动作提取**（D080）：stripNoise 之后的启发式提炼，仍不引 LLM
3. **checkpoint 快照 / maxTokens 真计量**（D081，E7 缓项延续）：checkpoint 先定「快照只读、
   文件为准」边界；maxTokens 待 serve token 契约（D058）就绪
