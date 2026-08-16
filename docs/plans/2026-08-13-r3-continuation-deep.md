# run-lead 自治规划 — 续跑机制深化（run-2026-08-13T09-36-28-520Z · R3）

> 目标（product_acceptance，宽松）：
> 1. 续跑策略对平台席/无任务角色明确（不无界空转烧 token）
> 2. 续跑前 gate 可选接入（防重复重跑）
> 3. 续跑状态可观测（status/CLI/MCP 可见）
>
> 依据：E6 剩余风险区（docs/knowledge/evolve/run-2026-08-13T01-15-17-073Z.md：平台席空转未根治 /
> 语义续跑/checkpoint/maxTokens 缓项）；research/prime-agent-continuation.md（M3 gate + git 快照防重复重跑、
> M2 续跑遥测、Q1 budgets）；plan-r2 (d) R3 候选（checkpoint/maxTokens/语义续跑/gate_commands/遥测）；
> 监督者本轮实测缺陷（idle 时钟基于投喂时间而非回合完成时间）。
>
> 决策归档：D067（idle 时钟=回合完成时间）/ D068（平台席策略 + gate 可选）/ D069（续跑遥测）已记入
> `docs/DECISIONS.md` 与 `docs/reference/decision-catalog.md` §12；E7 纪要（diff/验证/剩余风险）见
> `docs/knowledge/evolve/run-2026-08-13T09-36-28-520Z.md`。

---

## (a) 处置决策清单

| # | 观察缺口 / 候选 | 处置 | 理由 |
|---|---|---|---|
| 1 | **idle 时钟基于「投喂时间」而非「回合完成时间」**（监督者实测缺陷） | **修（本轮核心）** | 根因：`lastActivityMs`（continuation.ts:76）取 `max(last_wake_at, 最近转录 ts)`，而转录 ts 含 outgoing（投喂）记录——每次续跑投喂都立即重置 idle 时钟到投喂时间。noReply 长回合（agent 工作 > idle_sec 仍未响应）期间，sweep 误判「已空闲」再次投喂，长回合被打断（实测 run-lead 被连投 4 次排队，max_per_session=5 仅限总量、不限打断）。修复：idle 时钟改用「回合完成时间」= 最近一条 transcript **incoming（响应）记录** ts；若最近一条为 outgoing 且其后无 incoming（回合进行中）→ 该会话 in-flight，不进入候选。投喂（outgoing）不再重置 idle 时钟。纯函数保持（读文件，无网络）。 |
| 2 | **平台席/无任务角色被无界续跑烧 token**（E6 剩余风险 / R1 gap 3 未根治） | **修** | 根因：`deriveContinuationTargets` 对 `taskIdOfAgent===null` 的会话（scout/sys-arch/run-lead 等平台席）无终态门，R2 仅用 `max_per_session=5` 有界缓解，仍空转烧 token。修复：候选派生对无 task 绑定会话默认排除（config `self_evolve.continuation.platform_seats: "skip"` 默认），显式 `"allow"` 逃生（仍受 max_per_session 有界）。小而明确、可单测。 |
| 3 | **续跑前 gate 未接入（防重复重跑）**（ind-res M3 / R2 (d) 4） | **修（可选接入，默认关闭）** | 根因：`budgets.gate_commands` 声明未执行（C1 已声明）；续跑前无验证门，agent 可能反复重跑同一失败步骤空转。修复：新增 `self_evolve.continuation.gate_commands: string[]`（默认空=不启用）；启用时续跑投喂前对候选跑 gate（有界超时），借鉴 prime-agent `captureGitWorktreeSnapshot`（git status --porcelain + diff HEAD + untracked 聚合）——**上次失败快照与当前一致则不重跑 gate、直接跳过本轮投喂**（防没改代码反复重跑）；gate 通过 → 视为可停靠（不投喂，`gate_passed` 语义同 Q1）。默认关闭，不改变既有行为。 |
| 4 | **续跑状态不可观测**（R2 (d) 5 / M2 续跑遥测） | **修** | 根因：`picode status` 无续跑列；`self-drive continuation --status` 只给候选数；MCP `continuation_status` 同。修复：status/CLI/MCP 增 `continuations_used` / `last_continuation_at` / 剩余预算 / in-flight 标记列（D039 status 快照扩展，纯读不改状态）。 |
| 5 | **语义续跑（N7 升级）**（R2 (d) 3，goal 标题提及） | **缓** | 宽松 acceptance 三项未含语义续跑；本轮聚焦 idle 时钟缺陷 + 三项 acceptance，语义续跑（transcript.historySummary 注入续跑 prompt）依赖 idle 时钟稳定后再做，列 R4。 |
| 6 | **会话 checkpoint 快照 / maxTokens 真计量**（R2 (d) 1/2） | **缓** | checkpoint 需先定「快照只读、文件为准」边界（sys-arch 评估）；maxTokens 依赖上游 serve token 契约（D058）。维持 R2 缓项，列 R4。 |

**总纲**：本轮修监督者实测缺陷（idle 时钟）+ 三项 product_acceptance；平台席默认停靠、gate 可选防重跑、续跑可观测。不引入 daemon、不 LLM 生成指令（不变量不变）；所有状态仍文件真相 + 纯函数可测。

---

## (b) chunk 分块建议（4 个；C1/C2/C3 写集互斥可并行，串行 merge 列车 D036，C4 收尾）

### R3-C1 `chunk-idle-clock`（修缺口 1 + 平台席策略 2 · 代码+配置）

- **write_paths**：
  - `packages/orchestrator/src/continuation.ts`（`lastActivityMs` → `lastRoundCompletedMs`：取最近 incoming 响应 ts；末条 outgoing 无后续 incoming → in-flight 跳过；`deriveContinuationTargets` 对无 task 绑定会话按 `platform_seats` 策略排除）
  - `packages/orchestrator/src/continuation.test.ts`
  - `packages/core/src/config.ts`（`self_evolve.continuation` 增 `platform_seats: "allow" | "skip"`（默认 `"skip"`）；为 C2 预留声明 `gate_commands: string[]`（默认 `[]`）——一次加完字段避免 config 冲突）
  - `packages/core/src/config.test.ts`
  - `docs/reference/decision-catalog.md`（§12 平台席策略 + idle 时钟语义）
- **read_paths**：`transcript-store.ts`（incoming/outgoing 类型）、`session-store.ts`
- **public_contract**：idle 时钟基于「回合完成时间」；进行中回合（投喂后无响应）不投喂；投喂 outgoing 不重置 idle 时钟；平台席默认不进候选
- **depends_on**：无
- **验收**：
  - R3-C1-a `command`：`npm run build && npm test` 全绿
  - R3-C1-b 单测：转录末条为 outgoing 且无后续 incoming（长回合进行中）→ `deriveContinuationTargets` 不产出该候选（不投喂）；有 incoming 后空闲超 `idle_sec` → 恢复候选（idle 时钟 = 响应时间，非投喂时间）
  - R3-C1-c 单测：无 task 绑定会话（`scout`/`sys-arch`）默认 `platform_seats="skip"` 不进候选；`"allow"` 时进入但受 `max_per_session` 有界（回归 C1-c 预算门）
  - R3-C1-d 单测：`deriveContinuationTargets` 仍为纯函数（同输入同输出，无网络副作用）
  - R3-C1-e 文档：decision-catalog §12 增「平台席策略」+「idle 时钟 = 回合完成时间」

### R3-C2 `chunk-continuation-gate`（修缺口 3 · 代码层，默认关闭）

- **write_paths**：
  - `packages/orchestrator/src/continuation-gate.ts`（新：`shouldRunGate` / `captureGitWorktreeSnapshot` / `runContinuationGate`——读 config `continuation.gate_commands`，git 快照比对防重复重跑）
  - `packages/orchestrator/src/continuation-gate.test.ts`（新）
  - `packages/orchestrator/src/self-drive.ts`（guardianTick 接线：checkBudgets 之后、续跑 sweep 之前跑 gate；gate 失败且快照未变 → 本轮跳过该候选投喂）
  - `packages/orchestrator/src/self-drive.test.ts`
- **read_paths**：`continuation.ts`（候选派生 + feed 路径）、`config.ts`（`continuation.gate_commands`，C1 已声明）
- **public_contract**：`gate_commands` 非空才启用；gate 失败 + git 快照未变 → 不重跑不投喂（防重复重跑）；gate 通过 → 该会话本轮不投喂（停靠语义）
- **depends_on**：R3-C1（读 `config.continuation.gate_commands` 字段）
- **验收**：
  - R3-C2-a `command`：`npm run build && npm test` 全绿
  - R3-C2-b 单测：`gate_commands` 默认空 → 不启用（行为与 C1 一致，回归）；配置后启用
  - R3-C2-c 单测：git 快照比对——上次失败快照与当前一致 → `shouldRunGate=false` 且不投喂；工作树有变化 → 重跑 gate
  - R3-C2-d 单测：gate 通过 → 该会话跳过本轮投喂；gate 失败 → 不投喂但保留候选（下轮可重试）
  - R3-C2-e 回归：既有续跑单测不受影响（默认关闭）

### R3-C3 `chunk-continuation-telemetry`（修缺口 4 · 代码+CLI+MCP）

- **write_paths**：
  - `packages/orchestrator/src/status.ts`（`StatusSnapshot` 增 `continuation` 段：每会话 `continuations_used` / `last_continuation_at` / `max_per_session` / `in_flight`）
  - `packages/orchestrator/src/status.test.ts`
  - `packages/orchestrator/src/commands/self-drive.ts`（`continuation --status` 增预算/上次投喂/in-flight 列）
  - `packages/orchestrator/src/commands/self-drive.test.ts`
  - `packages/mcp-server/src/management.ts`（`continuation_status` 返回同列）
  - `packages/mcp-server/src/management.test.ts` / `registry.test.ts`
  - `docs/guides/operations.md`（续跑观测小节：status/CLI/MCP 列含义 + 平台席停靠说明）
- **read_paths**：`session-store.ts`（budget 字段）、`continuation.ts`
- **public_contract**：status/CLI/MCP 三面一致暴露续跑计数/上次投喂时间/in-flight/平台席状态；纯读零写
- **depends_on**：R3-C1（读 `budget.continuations` + in-flight 派生）
- **验收**：
  - R3-C3-a `command`：`npm run build && npm test` 全绿
  - R3-C3-b 单测：status 快照含 continuation 段且字段正确（续跑后 `continuations_used` 递增、`last_continuation_at` 落盘）
  - R3-C3-c CLI 冒烟：`picode self-drive continuation --status --repo <tmp> --run <id>` 输出含预算列（只读）；`picode status` 含 continuation 段
  - R3-C3-d 文档：operations.md 续跑观测小节更新

### R3-C4 `chunk-round3-docs`（知识归档 · docs 层）

- **write_paths**：
  - `docs/knowledge/evolve/run-2026-08-13T09-36-28-520Z.md`（E7 纪要：意图/决策/diff/验证/剩余风险，含 idle 时钟缺陷修复记录）
  - `docs/DECISIONS.md`（D067 idle 时钟=回合完成时间；D068 平台席策略 + 续跑 gate 可选接入；D069 续跑遥测）
  - `docs/reference/decision-catalog.md`（§12 补平台席策略/gate/遥测条目，若有 C1/C2 未覆盖部分）
  - `docs/guides/operations.md`（gate 运维规程 + 平台席续跑策略说明，若 C3 未覆盖）
  - `docs/plans/2026-08-13-r3-continuation-deep.md`（本决策归档）
- **read_paths**：C1-C3 产出、research/prime-agent-continuation.md、plan-r2 (d)
- **depends_on**：R3-C1、R3-C2、R3-C3 合并后
- **验收**：
  - R3-C4-a `command`：`npm run build && npm test` 全绿（文档不破坏构建）
  - R3-C4-b 核查：E7 纪要含 diff/验证/剩余风险；DECISIONS 含 D067-D069；decision-catalog 平台席/gate/遥测条目落地
  - R3-C4-c `command`：`npm run check`（persona-lint）通过

**编排**：C1/C2/C3 写集互斥可并行实现（三角 A/B/C），串行 merge 列车（D036）C1 → C2 → C3 → C4。E4 gate 全程 `npm run build && npm test`；code 层 merge_ready 强制 code-review（E5）。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| R3-C1 idle-clock（idle 时钟 + 平台席策略） | **三角 A**（squad-lead/engineer/sdet） | 修监督者缺陷 + acceptance 1；engineer 实现，sdet 验证 |
| R3-C2 continuation-gate（续跑前 gate 可选接入） | **三角 B**（squad-lead/engineer/sdet） | acceptance 2；与 C1/C3 写集互斥 |
| R3-C3 continuation-telemetry（status/CLI/MCP 可观测） | **三角 C**（squad-lead/engineer/sdet） | acceptance 3；与 C1/C2 写集互斥 |
| R3-C4 round3-docs（知识归档） | **文档小组**（docs-lead/tech-writer/docs-qa） | E7 纪要 + DECISIONS D067-D069 + catalog/operations + 决策归档 |
| 评审 | code-review（E5 code 层 MUST） | C1-C3 merge_ready 机械唤醒 |

三角 A/B/C 并行真招聘；people-qa 校验 E7（write_paths ⊆ 层内 + forbidden）。

---

## (d) R4 候选（本轮缓项，留档）

1. **语义续跑**（N7 升级）：续跑 prompt 注入 `TranscriptStore.historySummary`（P4 已有），带上一回合要点
2. **会话 checkpoint 快照**（prime-agent /refine 对应物）：先定「快照只读、文件为准」边界
3. **maxTokens 真计量**：待 serve token 契约（D058）就绪，续跑预算并入 token 维度
4. **续跑预算按 role 差异化**：`max_per_session` 按角色/任务类型区分（承接平台席策略的精细化）

> 精简批2（2026-08-15）：本 run E 纪要（r3）已摘要化，教训/风险去向见 evolve/E1-E15-SUMMARY.md；E 纪要细节见 git 历史。
