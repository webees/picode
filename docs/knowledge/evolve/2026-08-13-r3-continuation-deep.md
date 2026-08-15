# Evolve run-2026-08-13T09-36-28-520Z

- goal: 续跑机制深化（R3）— idle 时钟修复 + 平台席停靠 + gate 可选 + 续跑遥测
- kind: self_evolve · layers: knowledge/prompts/docs/tests/code · risk: medium
- baseline: main（R2 = d81b547 合并后）
- status: 已完成（C1/C2/C3 全部合并入 main = 426bf2c）

## Intent

承接 E6 剩余风险 + R2 plan (d) R3 候选，三项宽松 product_acceptance：
1. 续跑策略对平台席/无任务角色明确（不无界空转烧 token）
2. 续跑前 gate 可选接入（防重复重跑）
3. 续跑状态可观测（status/CLI/MCP 可见）

另修监督者本轮实测缺陷（idle 时钟基于投喂时间而非回合完成时间）。
决策清单：docs/plans/2026-08-13-r3-continuation-deep.md（(a) 处置决策 1-6）。

## 决策要点（D067–D069）

- **D067 idle 时钟 = 回合完成时间**（修监督者缺陷）：idle 判定取 `max(last_wake_at, 最近一条 transcript incoming 记录 ts)`，投喂（outgoing）不重置 idle 时钟；末条为 outgoing 且其后无 incoming → in-flight，不进入候选、不投喂。根因：原 `lastActivityMs` 取 `max(last_wake_at, 最近转录 ts)` 而转录含 outgoing，投喂即重置时钟，noReply 长回合被误判空闲连投打断
- **D068 平台席策略 + 续跑 gate 可选**：`platform_seats`（默认 `"skip"`）无 task 绑定会话默认不进候选（E6 gap 3 根治），`"allow"` 显式逃生仍受 `max_per_session` 有界；`gate_commands`（默认空=不启用）续跑投喂前可选跑 gate，git 快照比对防重复重跑
- **D069 续跑遥测**：status/CLI/MCP 三面暴露逐会话 `continuations_used` / `last_continuation_at` / `max_per_session` / `in_flight` / `platform_seat` 列，纯读零写

## Diff（3 chunk，串行 merge 列车 D036）

- **C1 `merge task-idle-clock` = b34e9a3**（feature af8c6f6，5 文件 +261/−6）：`packages/orchestrator/src/continuation.ts`（`lastActivityMs` → `lastRoundCompletedMs` 取最近 incoming ts；新增 `isRoundInFlight`；`deriveContinuationTargets` 对无 task 绑定会话按 `platform_seats` 策略排除）、`continuation.test.ts`（+176 行）、`packages/core/src/config.ts`（`self_evolve.continuation` 增 `platform_seats: "allow"|"skip"` 默认 `"skip"` + 预声明 `gate_commands: string[]` 默认 `[]`）、`config.test.ts`、`docs/reference/decision-catalog.md`（§12 idle 时钟语义 + 平台席策略）
- **C2 `merge task-continuation-gate` = 426bf2c**（feature f264cf3，4 文件 +705/−4）：`packages/orchestrator/src/continuation-gate.ts`（新，290 行：`shouldRunGate` / `captureGitWorktreeSnapshot` / `runContinuationGate` / `sweepContinuationsGated` / `ContinuationGateStore`，失败快照按 agent 持久化 run 目录 `continuation-gate.jsonl`）、`continuation-gate.test.ts`（新，302 行）、`self-drive.ts`（guardianTick 接线：checkBudgets 之后、续跑 sweep 之前跑 gate）、`self-drive.test.ts`（+101 行）
- **C3 `merge task-continuation-telemetry` = dc8c654**（feature a9cced7，7 文件 +257/−6）：`packages/orchestrator/src/status.ts`（`ContinuationTelemetry` 段 + `continuationTelemetry` 派生，statusSnapshot 输出）、`status.test.ts`、`commands/self-drive.ts`（`continuation --status` 增遥测列）、`commands/self-drive.test.ts`、`packages/mcp-server/src/management.ts`（`continuation_status` 返回同列）、`management.test.ts`、`docs/guides/operations.md`（续跑观测小节）

> 注：D067/D068/D069 中 catalog §12 的 idle 时钟与平台席条目已随 C1 落地；gate 与遥测条目由本 C4 补齐（见 DECISIONS / decision-catalog / operations 变更）。

## Verification

- `npm run build && npm test` 实测全绿：**346 tests（0 fail）** core 67 / bus 19 / orchestrator 226 / pi-extension 17 / mcp-server 17（R2 时 319 → R3 三 chunk 后 +27）
- 单测覆盖：C1-b 末条 outgoing 无后续 incoming（长回合进行中）→ 不产出候选不投喂；有 incoming 后空闲超 `idle_sec` → 恢复候选（idle 时钟 = 响应时间非投喂时间）；C1-c 无 task 绑定会话默认 skip 不进候选 / allow 时进入但受 max_per_session 有界（回归预算门）；C1-d `deriveContinuationTargets` 仍纯函数；C2-b gate_commands 默认空不启用（行为与 C1 一致）；C2-c 快照一致 → `shouldRunGate=false` 不投喂 / 工作树变化 → 重跑 gate；C2-d gate 通过 → 跳过本轮投喂 / 失败 → 不投喂但保留候选；C3-b status 快照含 continuation 段且字段正确
- `npm run check`（persona-lint）通过（20 agent files OK）

## 剩余风险

- **minor：`shouldRunGate` 未接入 prod 主路径**：`continuation-gate.ts` 的 `shouldRunGate` 纯函数仅被单测直接覆盖，`runContinuationGate` 生产路径在内部内联了等效的「上次失败指纹 === 当前 → 不重跑」比对（continuation-gate.ts:162-163），未复用该导出函数——存在「测试面与生产面双份逻辑」漂移隐患（本次等价，后续维护需留意同步）
- **gate 默认关闭**：`gate_commands` 空 → 防重复重跑能力不生效；需显式配置才启用（本期按「可选接入、默认不改既有行为」设计，属预期）
- **gate 依赖 git 仓库**：非 git 目录/无 HEAD 时 `captureGitWorktreeSnapshot` 返回 null → 保守每次重跑 gate（不误判但 gate 去重失效）；运维须保证 run 目录为 git 仓库（同 R2 guardian HEAD 检测）
- **平台席 `"allow"` 逃生仍烧 token**：显式放开后仅受 `max_per_session` 有界，无任务席位无产出仍会消耗预算（预期逃生路径，运维注意）
- **语义续跑未做**（plan (a) 5 缓）：续跑 prompt 仍为空模板 + 任务上下文，无 transcript 摘要注入；列 R4
- **会话 checkpoint / maxTokens 计量未做**（plan (a) 6 缓）：checkpoint 待定「快照只读、文件为准」边界；maxTokens 依赖上游 serve token 契约（D058）
- **续跑×idle-sleep 时序**：`idle_sec` 须小于 `idle_sleep_sec`，否则会话先休眠续跑不触发（运维规程已列排查项）

## R4 候选（承接 plan (d)，按本轮实测增补）

1. **语义续跑**（N7 升级）：续跑 prompt 注入 `TranscriptStore.historySummary`（P4 已有），带上一回合要点
2. **会话 checkpoint 快照**：先定「快照只读、文件为准」边界
3. **maxTokens 真计量**：待 serve token 契约（D058）就绪
4. **续跑预算按 role 差异化**：`max_per_session` 按角色/任务类型区分（承接平台席策略精细化）
5. **`shouldRunGate` 接入 prod**：让生产 gate 路径复用 `shouldRunGate` 纯函数，消除双份逻辑漂移隐患（本轮 minor finding）
