# run-lead 自治规划 — 会话续跑机制（run-2026-08-13T01-15-17-073Z）

> 目标（product_acceptance）：
> 1. 会话完成单回合后由机械层自动续跑，不再空等（长时编程能力）
> 2. 续跑有界（预算/最大续跑次数）且断连可恢复（可靠性）
> 3. 本轮 run 自身作为验证载体：无人干预完成至少 2 个任务并合并
>
> 依据：监督者观察记录（23-36-04 run：单任务投喂后会话自主完成闭环，但回合结束停住，
> tokens 12 分钟零增长，无 continuation）；docs/knowledge/research/prime-agent-deep.md
> （P1-P6）+ prime-agent-deep2.md（Q1-Q4）+ docs/knowledge/pi-agent-study.md（心跳重附/
> checkpoint/预算）；sys-arch 评估（docs/research/briefs/sys-arch-评估.md：①心跳重附②会话
> checkpoint）；spec/19 §10 budgets（C1 预算已落地，仅缺续跑语义）。

---

## (a) 问题台账处置决策清单

| # | 问题（台账项） | 处置 | 理由 |
|---|---|---|---|
| N1 | **continuation 缺口（本轮核心）**：会话完成单回合后停住，guardian 只机械推进状态机事件（staffing/wake 等），从不向已 awake 的 opencode 会话投喂新消息 | **修（本轮）** | 直接命中 acceptance 1/2/3。根因是机制缺失而非上游：`POST /session/{id}/message` + noReply（D061）与 serve 恢复（P1）已具备投喂与断连重试能力，缺的是「判断会话空闲可续跑 + 有界自动投喂」的机械层。实现面小（新增 continuation sweep + 预算计数），不违反「编排器无 LLM、状态文件化」。 |
| N2 | **续跑无界**（prime-agent Q1 budgets 的续跑侧：maxContinuations/turns/time） | **修（本轮）** | 已有 C1 `budgets.maxTurns/timeoutMs` 是「防失控上限」，非「续跑预算」。新增每会话 `budget.continuations` 计数 + `self_evolve.continuation.max_per_session`（0=不限，保守默认）与 `idle_sec` 间隔，续跑耗尽即停，靠既有 idle-sleep/budgets 停靠。 |
| N3 | **断连/重启丢续跑状态**（ERR-04 家族 + P1 恢复衔接） | **修（本轮）** | 续跑计数持久化在 session.yaml（文件真相，D002），serve 重启→P1 恢复重投喂 ready→错误清除后，续跑 sweep 从持久化计数继续，不重算不超发。与 D002/D057 一致。 |
| N4 | **daemon/常驻进程**（prime-agent 进程隔离重附） | **缓** | sys-arch 评估明确「无 daemon、状态文件化」是不变量；以「guardian 周期性 sweep + 会话心跳重附」（已落地的 probeServeHealth）替代，不在本轮引入常驻进程。 |
| N5 | **会话 checkpoint 快照**（prime-agent /refine 快照回滚） | **缓** | sys-arch 评估风险：快照与「文件真相」双源分歧需先定义只读边界；本轮不做，列为第二轮候选（见 d）。 |
| N6 | **maxTokens 计量**（budgets.maxTokens v1 无计量器） | **缓** | 上游 serve 无 token 拉取契约（D058）；本轮续跑以「次数 + 时间间隔」计价，token 计量列为上游依赖，第二轮再评估。 |
| N7 | **续跑内容语义化**（喂什么：下一回合该做什么） | **缓（v1 用固定模板 + 现有任务上下文）** | 不做 LLM 生成续跑指令（编排器无 LLM 不变量）；续跑 prompt 复用 ready 消息里的角色/任务上下文 + 固定「继续推进或报告完成」模板，断言由 agent 依据人设与任务文件自行判断。语义续跑（含 transcript 摘要注入）列入第二轮。 |

**总纲**：continuation = 机械层对「已 awake、无 error、任务未终态、预算未耗尽、空闲超过 idle_sec」的 opencode 会话，按 D061 noReply 语义投喂固定续跑 prompt；所有状态落盘、幂等、可恢复。不引入 LLM 决策、不引入 daemon。

---

## (b) chunk 分块建议（3 个，串行合并列车 D036）

### C1 `chunk-continuation-core`（机制本体 · 代码层）

- **write_paths**：
  - `packages/orchestrator/src/continuation.ts`（新：派生 + 投喂）
  - `packages/orchestrator/src/continuation.test.ts`（新）
  - `packages/orchestrator/src/self-drive.ts`（guardianTick 接线）
  - `packages/orchestrator/src/self-drive.test.ts`
  - `packages/orchestrator/src/session-store.ts`（budget.continuations 计数）
  - `packages/orchestrator/src/session-store.test.ts`
  - `packages/core/src/session.ts`（`SessionBudgetUsed.continuations`）
  - `packages/core/src/config.ts`（`self_evolve.continuation` 配置 + 校验 + 默认值）
  - `packages/core/src/config.test.ts` / `session.test.ts`
- **read_paths**：`packages/orchestrator/src/opencode-adapter.ts`、`packages/orchestrator/src/transcript-store.ts`（复用 spawner/transcript，不改）
- **public_contract**：`deriveContinuationTargets(dir, config, now)`（纯函数，读 session/transcript/task，返回候选 `{agent_id, session_id}`）；`feedContinuation(dir, config, agentId)`（POST noReply + 转录 + 计数）；`guardianTick` 返回新增 `continuation: { fed: string[] }`
- **depends_on**：无（决策清单 C0 文档已先行，见 c）
- **验收口径**：
  - C1-a `command`：`npm run build && npm test` 全绿
  - C1-b 单测：awake oc- 会话 + 空闲超 `idle_sec` + 预算未耗尽 → sweep 恰好 POST 一次续跑消息（mock fetch 断言 `noReply:true`、`/session/{id}/message`、prompt 含续跑指令、转录落盘）
  - C1-c 单测：预算耗尽（`budget.continuations >= max_per_session`）→ 不再投喂；task 终态 / 会话 error / sleeping / 非 oc- → 永不投喂（幂等）
  - C1-d 单测：`deriveContinuationTargets` 为纯函数（同输入同输出，无网络副作用）

### C2 `chunk-continuation-recovery`（可靠性 + CLI 面 · 代码层）

- **write_paths**：
  - `packages/orchestrator/src/self-drive.ts`（续跑与 P1 serve 恢复的衔接）
  - `packages/orchestrator/src/self-drive.test.ts`
  - `packages/orchestrator/src/commands/self-drive.ts`（`self-drive continuation` 子命令：`--status` 只读预览 / `--feed <agent>` 手动单次）
  - `packages/orchestrator/src/commands/self-drive.test.ts`（新）
  - `packages/mcp-server/src/management.ts`（`continuation_status`/`continuation_feed` 工具，包装上面两函数）
  - `packages/mcp-server/src/registry.test.ts`
- **read_paths**：`packages/orchestrator/src/continuation.ts`、`opencode-adapter.ts`、`pi-adapter.ts`
- **public_contract**：`guardianTick` 中「续跑 sweep」在 `checkBudgets` 之后、`probeServeHealth` 之前执行；`feedContinuation` 复用 `requestWithRetry`（断连退避重试）；恢复路径：P1 重投喂 ready 后，续跑计数保持、错误清除、sweep 从持久化计数续发
- **depends_on**：C1
- **验收口径**：
  - C2-a `command`：`npm run build && npm test` 全绿
  - C2-b 单测：会话置 error（serve 失联）→ 恢复重投喂 ready + 清 error → 续跑计数不重置、且未超 `max_per_session`（持久化计数断言）
  - C2-c 单测：`POST /message` 瞬时超时 → 有界重试后成功并计数 1 次（不双计）
  - C2-d CLI 冒烟：`picode self-drive continuation --status --repo <tmp> --run <id>` 只读输出候选数，不投喂；`--feed <agent>` 投喂 1 次并计数

### C3 `chunk-continuation-docs`（知识沉淀 · docs 层）

- **write_paths**：
  - `docs/knowledge/evolve/run-2026-08-13T01-15-17-073Z.md`（E6 纪要：意图/diff/验证/剩余风险）
  - `docs/knowledge/pi-agent-study.md`（追加「continuation 落地」小节，标注与 Q1 预算的关系）
  - `docs/guides/operations.md`（续跑运维规程：如何观察续跑状态、预算调整、手动单次投喂）
  - `docs/reference/decision-catalog.md`（续跑默认值与含义条目）
  - `docs/DECISIONS.md`（新增 D066：continuation 机制决策，含「不引入 daemon/不 LLM 生成指令」边界）
- **read_paths**：C1/C2 产出、spec/19、prime-agent 研究、docs/plans/2026-08-12-parallel-org.md
- **depends_on**：C1（机制已存在才写得出操作手册）
- **验收口径**：
  - C3-a `command`：`npm run build && npm test` 全绿（文档不破坏构建）
  - C3-b 人工/机械核查：E6 纪要落盘于 `docs/knowledge/evolve/` 且 commit 归档（O005-② E6 untracked 清零）；DECISIONS 含 D066；decision-catalog 含续跑默认值
  - C3-c `command`：`npm run check`（persona-lint）通过

**编排顺序**：C1 → C2（依赖 C1）→ C3（依赖 C1，与 C2 并行可行因写集互斥，但为列车稳定按 C1→C2→C3 串行）。全程串行 merge（D036），E4 gate `npm run build && npm test`，E5 code 层 merge_ready 强制唤醒 code-review（goal 含 code 层）。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 C0） | run-lead（本会话） | 已产出 |
| C1 continuation-core | **三角 A**（squad-lead/engineer/sdet，真招聘） | 核心机制 + 配置 + 预算；engineer 主实现，sdet 验证命令 |
| C2 continuation-recovery | **三角 B**（squad-lead/engineer/sdet，真招聘） | 恢复衔接 + CLI/MCP；与 C1 写集互斥 |
| C3 continuation-docs | **文档小组**（docs-lead/tech-writer/docs-qa） | E6 + 操作手册 + DECISIONS |
| 调研任务（并行、非 chunk） | **ind-res** | 深挖 prime-agent autonomous continuation 实现细节（autonomous.ts 的 budgets/gates、heartbeat 重附、refinement review），产出 `docs/knowledge/research/prime-agent-continuation.md`（URL + retrieved_at），供 C2/C3 引用与第二轮决策；联网走信息控制流程（request_info） |
| 评审 | code-review（E5 code 层 MUST）/ sec-eng | C1/C2 merge_ready 时机械唤醒 |

人员调度：三角 A/B 经标准 staffing 真招聘（`staffing request → draft-personas → check → approve`，D025/D030）；people-qa 校验 self_evolve persona 含 forbidden 且 write_paths ⊆ 层内（E7）。ind-res 为平台席，由 run-lead 经 research 房指派。

---

## (d) 提前完成 → 第二轮优化候选清单（按 sys-arch 优先级 + 本轮实测反馈）

1. **语义续跑**：续跑 prompt 注入 `TranscriptStore.historySummary`（P4 已有）或窗口语义摘要（C3' summary），让续跑带着「上一回合要点」而非空模板——命中「续跑内容语义化」N7。
2. **会话 checkpoint 快照**（prime-agent /refine 对应物）：task 级只读快照 + 回滚，需先定「快照只读、文件为准」边界（N5）。
3. **续跑预算门细化**（Q1 gates）：续跑耗尽前跑 `gate_commands`（C1 已有声明未执行）或支持按 role 差异化 `max_per_session`。
4. **maxTokens 真计量**（N6）：等 serve 暴露 token 契约（D058 后续），续跑预算并入 token 维度。
5. **续跑遥测看板**：`status` 增续跑计数/最近续跑时间列（D039 status 快照扩展）。
6. **窗口摘要自动生成**（Q4 摘要预算）：把 C3' 的 summary 字段由 docs-lead 手填改为机械/自动提炼，接入续跑上下文。

---

## 本轮验证载体说明（acceptance 3）

本轮 run 自身即验证：C1（机制）与 C2（恢复+CLI）两个代码任务 + C3 文档任务，在无人干预下由 self-drive guardian 推进——guardian 唤醒三角 → 三角会话收到 ready 消息自主实现 → **续跑 sweep 在会话空闲时自动投喂续跑 prompt 使实现持续推进** → 自测 → evidence/handoff → 串行 merge → E6 归档。run-lead 只产出本规划，不再逐任务投喂。验收判定：至少 2 个任务（C1+C2）完成并合并入 main。

> 精简批2（2026-08-15）：本 run E 纪要（r1）已摘要化，教训/风险去向见 evolve/E1-E15-SUMMARY.md；E 纪要细节见 git 历史。
