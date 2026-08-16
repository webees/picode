# run-lead 自治规划 — 会话 checkpoint 边界决策先行 + 最小可行落地 + re-spawn 摘要去噪（run-2026-08-13T23-48-54-042Z · self_evolve · scale L）

> 目标（宽松，run-lead 自主决策）：
> 1. **checkpoint 边界决策先行**：「快照只读、文件为准」双源分歧防护——checkpoint 是不可变只读投影，
>    恢复/续跑/调度永远读文件真相（session.yaml / task.yaml / transcripts / git），不读 checkpoint
> 2. **落地最小可行实现**：task 级 checkpoint 捕获/只读查询（`checkpoint-store.ts` + CLI `picode checkpoint`），
>    纯函数派生、不可变落盘、无守护自动写
> 3. **附带高价值小项**：re-spawn 摘要去噪一致化（E10 后续候选 #1 / D079 缓项落地）
> 4. 既有续跑/预算/门禁语义不回归（既有 385 单测全绿）
>
> 背景：E10 缓项 D081 留档「checkpoint 快照先定快照只读、文件为准边界」；sys-arch 评估点明「会话 checkpoint
> 可复用 window 压缩机制做 task 级 checkpoint，风险 = 快照与文件真相双源分歧，须定义快照只读、文件为准」；
> prime-agent 研究 M6 对照「picode 状态落盘文件真相，比进程级恢复更严」。本轮把边界决策落到可运行的最小实现：
> checkpoint 只作**观测/审计产物**，绝不反向驱动任何状态决策；恢复路径保持零改动（P1 serve 恢复 + 转录重投喂
> 仍以文件真相为准）。
>
> 依据：docs/knowledge/evolve/run-2026-08-13T21-32-57-118Z.md（D079 缓项/后续候选 #1 + D081）；
> docs/research/briefs/sys-arch-评估.md（② 会话 checkpoint + 风险）；docs/knowledge/research/prime-agent-continuation.md（M6）；
> 代码事实：`continuation-gate.ts` 已有 `captureGitWorktreeSnapshot`/`snapshotFingerprint`（可复用）；`task.ts` 的
> task 目录布局 `tasks/<id>/{task.yaml,brief/,evidence/,handoff/}`；`transcript-store.ts` `historySummary`（stripNoise 已就绪）；
> 基线：main = 50fdd0a（C3 收尾归档后），实测 385 tests（core 67 / bus 19 / orchestrator 249 / pi-extension 17 /
> mcp-server 17 / dashboard-server 16）。

---

## (a) 处置决策清单

### D082 会话 checkpoint 边界 + 最小可行落地（本轮核心 1）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D082-1 | **双源分歧风险**：快照若参与恢复/续跑，会与「文件才是真相」产生第二事实源（sys-arch 评估明确点名） | **快照只读**：checkpoint 是捕获时刻对文件真相的**只读投影**，写入后不可变（timestamped 单文件，append-only 目录）；**任何代码路径不得读 checkpoint 来驱动状态决策**——恢复/续跑/调度/合并仍只读 session.yaml / task.yaml / transcripts / git | 边界决策本体。checkpoint 是「观测产物」（对齐 D039 status 只读快照哲学），不是第二真相源 |
| D082-2 | **文件为准的落点** | checkpoint 内容须**可由文件真相纯函数重演**（确定性）；checkpoint 丢失/损坏**不影响**任何恢复/续跑路径（best-effort 观测物）；不把 checkpoint 纳入 budget/gate/遥测判定 | 文件真相不变量（D002 延续）；纯函数（同输入同输出）是既有验收纪律 |
| D082-3 | **捕获时机**：guardian 自动写 checkpoint 会把观测产物混入 tick 副作用、扩大热路径风险 | **MVP 仅显式捕获**：CLI `picode checkpoint capture --task <id>`（+ `status` 只读列出）；**guardian/merge/serve 恢复路径零改动**；捕获边界字段预留（`boundary: manual`，future 可扩展 pre_merge 等，本轮不接线） | 最小可行 + 最低回归面；把「何时自动捕获」留后续候选（d 后续候选 2） |
| D082-4 | **捕获内容** | 快照含：task.yaml `status` + 该 task 三角各会话（session.yaml state/budget） + 各会话 `historySummary`（复用 stripNoise 剔模板）+ git worktree 指纹（复用 `captureGitWorktreeSnapshot` + `snapshotFingerprint`，非 git 仓 → null 容错）+ `captured_at` + 自指纹 sha256 | 复用既有原语（zero 新机制）；stripNoise 保证摘要可读；git 指纹 = 工作树真相锚点 |
| D082-5 | **落盘格式/幂等** | `runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml`（schema v1，YAML）；`captureTaskCheckpoint(dir, taskId, {now?, boundary?})` 纯函数：同输入同输出（now 注入保证确定性）；task 不存在 → null；重复捕获产生新 ts 文件（不覆盖，不可变） | 与 session.yaml / window 归档同风格；注入 now 使单测可断言逐字节一致 |
| D082-6 | **消费面** | 只读 CLI `picode checkpoint status [--task <id>]`（列表/最新）；注册进 COMMANDS + DOMAIN_ORDER + `--help` 命令表（对齐 D074 cli.test 断言）；**不**扩 statusSnapshot 顶层（避免动 status 契约，三面一致性留后续） | MVP 消费面最小化；status 段扩展属低成本后续（d 后续候选 1） |
| D082-7 | **maxTokens 真计量** | **缓**：仍依赖 serve token 契约（D058），本轮不动 | D081 延续；与 checkpoint 正交 |
| D082-8 | **回归保障** | `deriveContinuationTargets`/`feedContinuation`/`sweepContinuationsGated`/`checkBudgets` 零改动；checkpoint 为纯新增模块 + CLI 注册，无既有路径变更 | acceptance #4 验收面；既有 continuation/预算/gate/CLI 单测全绿即验收 |

### D083 re-spawn 摘要去噪一致化（附带小项 · E10 后续候选 #1 / D079 缓项落地）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D083-1 | **re-spawn 摘要含 ready 模板**：`wakeWithOpencode` 重 spawn 的 `historySummary` 仍带 `READY_MESSAGE_TEXT` 模板句，与 feed 路径（D077 stripNoise）口径不一致（E10 剩余风险 / D079 缓项） | `wakeWithOpencode` 传 `stripNoise: [READY_MESSAGE_TEXT]`，与 feed 路径机制同源；`maxEntries` 保持默认 20 不动（全量恢复语义，D077 不强行统一） | E10 后续候选 #1 落地；一处传参 + 测试，零语义变更（stripNoise 默认空=现行为） |
| D083-2 | **越界门禁教训**：上轮该改动因越出 write_paths 被 P07 回退（87615b9） | 本轮将 `opencode-adapter.ts` 显式纳入 C2 write_paths（D079 需单独任务含 adapter） | 避免重蹈 87615b9；本轮 write_paths 先写清 |

### 处置：缓 / 拒（本轮不做，留档）

| # | 候选 | 处置 | 理由 |
|---|---|---|---|
| D084 | **checkpoint 自动捕获接线**（guardian tick / merge 前 / 会话休眠前） | **缓** | 需先经一版手工捕获验证观测价值与写入代价；guardian 热路径自动写须另行评估（避免 tick 副作用扩大） |
| D085 | **checkpoint 进 statusSnapshot 三面**（status/CLI/MCP 同源） | **缓** | MVP 仅 CLI 消费面；三面同源需动 status 契约 + mcp-server，本轮控回归面 |
| D086 | **从 checkpoint 恢复/回滚** | **拒（本轮）/ 缓（远期）** | 直接违背「快照只读、文件为准」边界；若未来做，恢复目标仍为文件真相（git/文件备份），checkpoint 仅作回滚前对照基线 |
| D087 | **maxTokens 真计量** | **缓** | 待 serve token 契约（D058） |

---

## (b) chunk 分块建议（3 个；C1/C2 代码可并行实现，C3 文档收尾，串行 merge 列车 D036）

### C1 `chunk-checkpoint-store`（checkpoint 捕获 + 只读查询 · 代码+测试 · 本轮核心）

- **write_paths**：
  - `packages/orchestrator/src/checkpoint-store.ts`（新）：`TaskCheckpoint` schema v1（`schema_version/task_id/captured_at/boundary/task_status/sessions[]/transcript_summaries[]/git.fingerprint/sha256`）；`captureTaskCheckpoint(dir, taskId, {now?, boundary?})`（纯函数：读 task.yaml + SessionStore 按 taskIdOfAgent 匹配三角会话 + 各会话 `historySummary(agentId, {stripNoise:[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]})` + `captureGitWorktreeSnapshot` 指纹；task 不存在 → null；不可变落盘 `checkpoints/<taskId>/checkpoint-<ts>.yaml`）；`listTaskCheckpoints` / `latestTaskCheckpoint`（只读，ts 排序）
  - `packages/orchestrator/src/commands/checkpoint.ts`（新）：`picode checkpoint capture --task <id>` + `picode checkpoint status [--task <id>]`
  - `packages/orchestrator/src/commands/index.ts`（注册 `checkpointCommands` + DOMAIN_ORDER 增 `checkpoint`）
  - 测试：`checkpoint-store.test.ts`（捕获内容/纯函数幂等/不可变/ts 排序/task 缺失→null/git 非仓→null/now 注入确定性/stripNoise 生效）、`cli.test.ts` 增 `--help` 命令表断言 + 用法断言（对齐 D074 模式）
- **read_paths**：`continuation-gate.ts`（`captureGitWorktreeSnapshot`/`snapshotFingerprint`/`repoRootOf`）、`continuation.ts`（`taskIdOfAgent`）、`transcript-store.ts`（`historySummary`）、`session-store.ts`、`task.ts`（task 目录布局）、`opencode-adapter.ts`（`READY_MESSAGE_TEXT`）
- **public_contract**：新增 `checkpoint-store` 导出与 `picode checkpoint` 两个子命令；**既有导出/命令/行为零改动**
- **depends_on**：无
- **验收口径**：
  - C1-a `command`：`npm run build && npm test` 全绿（既有 385 无回归 + 新增用例，实施者确认具体数）
  - C1-b 单测：`captureTaskCheckpoint` 对 fixture task 捕获内容正确（task_status/sessions state+budget/transcript 摘要含剔噪后文本/git 指纹）；注入相同 now + 未变文件 → 两次捕获逐字节一致（纯函数、确定性）
  - C1-c 单测：task 不存在 → null；同 task 两次捕获为不同 ts 文件且首文件不被覆盖（不可变）；`list` 倒序、`latest` 取最新
  - C1-d 单测：非 git 仓库 / git 命令失败 → `git.fingerprint: null`（容错，不抛）；转录损坏 → 摘要回退 null 不阻断捕获
  - C1-e CLI：`--help` 命令表含 `checkpoint capture`/`checkpoint status`（D074 断言模式）；`capture` 落盘后可被 `status` 读到
  - C1-f 回归：既有 continuation/预算/gate/CLI/merge 用例全绿；`git diff` 确认 **C1 未触碰** continuation.ts / self-drive.ts / merge.ts / status.ts（checkpoint 纯新增模块）
- **P07 门禁**：diff ⊆ write_paths；不得顺手改 `status.ts` 顶层或 `mcp-server`（D085 缓项）

### C2 `chunk-respawn-stripnoise`（re-spawn 摘要去噪 · 代码+测试 · 附带小项）

- **write_paths**：
  - `packages/orchestrator/src/opencode-adapter.ts`（`wakeWithOpencode` 的 `transcript.historySummary(agentId)` → `historySummary(agentId, { stripNoise: [READY_MESSAGE_TEXT] })`）
  - 测试：`opencode-adapter.test.ts`（re-spawn 摘要剔除 ready 模板句、maxEntries 仍默认 20、无转录/无模板时行为不变）
- **read_paths**：`transcript-store.ts`（`historySummary` opts 契约）、`continuation.ts`（`CONTINUATION_PROMPT`——re-spawn 不剔它，剔 ready 即够用，口径与 D077 一致）
- **public_contract**：`wakeWithOpencode` 签名不变；摘要输出剔除 ready 模板文本；其余行为不变
- **depends_on**：无（与 C1 文件无重叠，可并行实现、串行 merge）
- **验收口径**：
  - C2-a `command`：`npm run build && npm test` 全绿
  - C2-b 单测：re-spawn 摘要**不含** `READY_MESSAGE_TEXT` 模板句；含非模板要点文本；`maxEntries` 未改（全量恢复语义保持）
  - C2-c 回归：既有 opencode-adapter / wake / spawn / 恢复用例全绿；无 stripNoise 参数路径输出与现版一致（opts 缺省 = 现行为）
- **P07 门禁**：diff 仅 `opencode-adapter.ts` + 其测试；不得碰 `continuation.ts`/`transcript-store.ts`（D083-2 越界教训）

### C3 `chunk-checkpoint-docs`（知识沉淀 · docs 层）

- **write_paths**：
  - `docs/DECISIONS.md`（D082 表行 + 详条「checkpoint 边界 + 最小可行落地」；D083 表行 + 详条「re-spawn 摘要去噪落地」；D084–D087 缓/拒行；D079 缓项表行更新为「已由 D083 落地」）
  - `docs/reference/decision-catalog.md`（新增 §12.9「会话 checkpoint（D082）」：快照只读/文件为准边界 + MVP 范围 + 后续候选；§12.8 re-spawn 行更新「已定（D083）」）
  - `docs/guides/operations.md`（checkpoint 小节：`picode checkpoint capture/status` 用法 + 快照只读语义 + 排查指引；续跑摘要小节补 re-spawn 去噪一句）
  - `docs/knowledge/evolve/run-2026-08-13T23-48-54-042Z.md`（E11 纪要：意图/决策/diff/验证/剩余风险/后续候选）
  - `docs/plans/2026-08-13-r9-checkpoint-boundary.md`（本规划，已含）
- **read_paths**：C1/C2 产出、DECISIONS.md D077–D081 既有条目、catalog §12.8、operations 续跑章节
- **depends_on**：C1、C2（机制落地才写得准）
- **验收口径**：
  - C3-a `command`：`npm run build && npm test` 全绿（文档不破坏构建）
  - C3-b 核查：DECISIONS 含 D082–D087（含 D079 状态更新）；catalog §12.9 checkpoint 边界 + §12.8 re-spawn 已定；operations 补 checkpoint 用法句 + re-spawn 去噪句
  - C3-c `command`：`npm run check`（persona-lint）通过

**编排**：C1（checkpoint-store）与 C2（re-spawn 去噪）无文件重叠，可并行实现、串行 merge（D036）；C3 文档在 C1/C2 合并后收尾。E4 gate：代码层显式 `npm run build && npm test`；merge_ready 强制唤醒 code-review（E5，code 层 MUST）。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 D082–D087） | run-lead（本会话） | 已产出 |
| C1 checkpoint-store | **三角 A**（squad-lead/engineer/sdet，真招聘） | checkpoint 捕获/只读查询 + CLI + 测试；engineer 主实现，sdet 验证（纯函数幂等/不可变/git 容错/CLI 命令表） |
| C2 respawn-stripnoise | **三角 B**（squad-lead/engineer/sdet，真招聘） | `wakeWithOpencode` stripNoise + 测试；engineer 主实现，sdet 验证（剔 ready 模板/回归） |
| C3 checkpoint-docs | **文档小组**（docs-lead/tech-writer/docs-qa） | DECISIONS D082–D087 + catalog §12.9/§12.8 + operations + E11 纪要 |
| 评审 | code-review（E5 code 层 MUST） | C1/C2 merge_ready 机械唤醒 |

人员调度：C1/C2 各一三角经标准 staffing 真招聘（D025/D030），可并行开工；C3 文档小组在 C1/C2 合并后收尾。改动集中在 orchestrator 新增 checkpoint-store + CLI 注册 + opencode-adapter 一处传参 + docs 层，**不触碰** continuation 派生/self-drive guardian/merge/status 顶层/mcp-server（缓项边界）。

---

## (d) 后续候选（本轮不做，留档）

1. **checkpoint 进 statusSnapshot 三面**：`status.ts` + CLI + MCP 同源暴露 checkpoints 段（对齐 D039/D069 三面哲学），需动 status 契约，另行评估
2. **checkpoint 自动捕获接线**：guardian tick / merge 前 / 会话休眠前捕获（boundary 字段已预留）；需先经手工捕获验证观测价值与写入代价，且 guardian 热路径自动写须防副作用
3. **checkpoint 回滚能力**：以文件真相（git / 文件备份）为恢复目标，checkpoint 仅作回滚前对照基线；不得让 checkpoint 成为第二真相源（D086 远期）
4. **maxTokens 真计量**：待 serve token 契约（D058）就绪（D087）

---

## 本轮验证载体

无人干预下由 self-drive guardian 推进（三角会话 ready → 自主实现 → 续跑 → 自测 → evidence/handoff → 串行 merge）。
验收判定：C1/C2 代码任务合并入 main（acceptance 1/2/3 达成），C3 文档归档（E11 纪要），既有 continuation 单测全绿（acceptance 4）。

> 精简批2（2026-08-15）：本 run E 纪要（r9）已摘要化，教训/风险去向见 evolve/E1-E15-SUMMARY.md；E 纪要细节见 git 历史。
