# prime-agent 自主续跑（autonomous continuation）实现深挖（第三轮 · 2026-08-13）

> 调研方：ind-res（R1 @ run-2026-08-13T01-15-17-073Z）
> 目的：本轮实现 picode 会话续跑机制（continuation，C1-C3）。run-lead 已决策：不引入 daemon、
> 不 LLM 生成续跑指令，guardian 周期 sweep + noReply 固定续跑 prompt。本报告深挖 prime-agent 的
> autonomous.ts budgets/gates 实现、心跳/重附恢复、refinement review 门，供 C2/C3 引用与第二轮决策。
>
> **来源说明**：本报告以本地 clone 源码为主（监督者已 clone github.com/PrimeIntellect-ai/prime-agent，
> depth-1，本地 `/private/tmp/prime-agent`），比联网更精确（file:line 可核对）。
> 联网补充项走 picode 信息控制流程（request_info），**本次两次申请均返回 TOKEN_INVALID**（serve 进程
> 缺 PICODE_AGENT_ID/TOKEN env），故 4 中 Claude Code hooks / SWE-agent 采用本机既有权威本地文件
> （git-guardrails-claude-code skill）+ 已知官方文档 URL，URL 标注 retrieved_at 为知识基线日。

---

## 1. 机制拆解

### 1.1 autonomous.ts：continuation 的 budgets/gates 具体实现

**文件**：`packages/coding-agent/src/core/autonomous.ts`（593 行，纯函数 + 状态机，无网络副作用）
**来源**：commit `0987c1ba7637cbcb99afe9efe1180b838a0aa958`（2026-08-12T15:58:04-04:00, main）
URL: https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/core/autonomous.ts

**计价维度（4 个独立预算，AND 停靠，命中任一即停）**：
- `maxContinuations`（默认 3）：续跑**次数**计数 `continuationsUsed`
- `maxTurns`（默认 12）：assistant **回合**计数 `turnsUsed`（`addAutonomousUsage` 每个 assistant message +1）
- `maxTokens`（默认 80_000）：token 累计 `tokensUsed`，`autonomousTokenDelta = input + output + cacheWrite`；
  **明确排除 cacheRead**（注释：缓存读重复计入会让长自主 verifier 循环过早耗尽预算，L186-194）
- `timeoutMs`（默认 30min）：wall-clock，`startedAt` 起算（L267）

**gates（质量门，可选）**：
- `commands: string[]`（默认空=不启用）、`maxRetries`（默认 3）、`timeoutMs`（默认 5min）
- 触发：每次回合结束先跑 gates（`refreshAutonomousQualityGates`），仅当 `commands.length > 0` 才启用
- **git 工作树快照防重复重跑**（`captureGitWorktreeSnapshot`，L294-343）：跑 gate 前/后各拍快照
  （`git status --porcelain` + `git diff HEAD` + untracked sha256 聚合）；若上次失败的快照与当前
  完全一致 → **不重跑 gate**，直接计 attempt+1 并返回 "failed"，防"没改代码反复重跑"空转
- 输出截断 6000 字符回投给 agent（`buildGateFailureContinuation`，L350-360）

**决策逻辑（`shouldAutonomouslyContinue`，L227-252）——优先级顺序**：
1. `enabled=false` 或 `stopReason === error|aborted` → 不续跑（not_needed）
2. gates 结果：
   - `passed` → **停**（not_needed，"达到限额 ≠ 任务成功"，gate 过即认为完成）
   - `retry_exhausted` 或任一 limit 命中 → **停**（limit_reached）
   - `failed` → **续跑**，且续跑 prompt 换成 gate 失败说明（让 agent 去修）
3. 无 gates：任一 limit 命中 → 停；否则 → **续跑**（missing_terminal_evidence，"没有终局证据就继续"）

**停靠/无限续跑防护**：`continuationsUsed++` 在 `nextAutonomousContinuation`（L211）成功构造消息时执行，
即"发送即计数"；与 `maxTurns/maxTokens/timeoutMs` 组合构成**有界但非自封顶**的循环——gates 未配置时
纯靠 4 预算停，配置了质量门则"门过即停、门败修复、重试耗尽停"。

**关键语义（供 picode 借鉴）**：
- **续跑消息是普通 user message**（role:user, text=continuationPrompt），与人工输入同队列
- `continuationPrompt` 默认值见 `DEFAULT_AUTONOMOUS_CONTINUATION_PROMPT`（L45-46）：
  "No human input is available in autonomous mode. Continue working until the host evaluator, verifier,
  or configured autonomous limits stop the run. If you were asking the user a question, make a reasonable
  assumption and verify it. If you believe you are blocked, prove it with host-observable evidence, preserve
  that evidence, and keep looking for safe progress while budget remains. Do not end the session yourself;
  the verifier/evaluator decides completion when configured gates pass."
  —— 与 picode「固定续跑 prompt」方案同构，且明确"由 gate/预算决定完成、agent 不自停"
- **状态不落盘**：`AutonomousRuntimeState` 是内存态，仅会话内 snapshot/restore 用于 compaction 竞态
  回滚（`_snapshotAutonomousRuntimeState`/`_restoreAutonomousRuntimeSnapshot`，agent-session.ts L2704-2724），
  **worker 重启后 continuationsUsed/turnsUsed/tokensUsed 归零**（重新 `createAutonomousRuntimeState`）。
  → 对比 picode N3：picode 把续跑计数持久化在 session.yaml（文件真相），重启不重算不超发，**比 prime-agent 更严**

**调用位置（agent-session.ts）**：
- `_getContinuationMessages`（L3198-3233）：回合结束 continuation 主入口，`queuedActionCount > 0` 时不触发
- `_queueAutonomousContinuationForThresholdCompaction`（L2726-2760）：compaction 阈值触发前的续跑排队，
  arrival epoch 竞态检测 + snapshot 回滚（L2742-2745）
- 另有 **goal continuation**（`_getGoalContinuationMessages` L3167-3196，`/goal`）：持久目标跨回合持续
  呈现，`goal.complete()` 才算成功，独立于 autonomous mode；`tokensUsed/timeUsedSeconds/continuationsUsed`
  **持久化**在 session JSONL 的 `thread_goal_state` custom 消息（`_loadPersistedGoalState` L1599-1612）

### 1.2 heartbeat/重附机制：会话失联后如何恢复续跑

**文件**：`packages/coding-agent/src/modes/daemon/daemon-supervisor.ts`（5171 行）
**文档**：`packages/coding-agent/docs/daemon.md`、`long-running-agents.md`
**来源 commit**：同上（0987c1ba）
URL: https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/modes/daemon/daemon-supervisor.ts

**进程拓扑**（与 picode 的 P1 serve 恢复对照）：
- supervisor（常驻）+ resident worker（每 root session tree 一进程，崩溃隔离）
- worker 崩溃 → `recoverWorker`（L2773-2877）重试阶梯 `WORKER_RETRY_DELAYS_MS = [250, 1000, 5000]`
  （L137），三次失败 → `lifecycle = "failed"`；`consecutiveFailures` 计数落 descriptor
- worker 失联（socket close）→ `handleWorkerClose`（L2483-2535）→ 若 eligible → `recoverWorker`；
  恢复期间 supervisor 抢不到则 `deferWorkerRecovery`（DEFERRED_RECOVERY_RECHECK_MS=5s 周期重查，L2551-2590）
- supervisor 消失 → worker 监视公共 socket，一个 worker 抢原子启动租约拉起替代 supervisor →
  **收养 live workers**（`adoptOrRecoverWorker` L2424-2481：connect → subscribe → refresh → ready）

**心跳/重附（picode 侧最相关）**：
- **客户端重附**：daemon 协议 v4 用 `{ generation, sequence }` 事件游标（daemon.md L99-101）；
  客户端断线后带稳定 client identity + cursor 重连，服务端报 requested interval 是否 complete/partial；
  **attach snapshot 是持久恢复基线**，缺 replay 不致命——`DaemonAgentConnection` apply snapshot 后
  丢弃重复/过期 generation 事件并报告 resynchronized
- **launch env 不落盘**：worker descriptor 不含完整环境，恢复时需 owner client 重连或从 createCommand 重建
- **worker 内存态在重启后丢失**：autonomous 计数、kernel 变量、进行中 compaction 都会重置；
  持久的是 **session JSONL（转录）+ goal state（thread_goal_state）+ scheduled-jobs.json + recovery journal**

**与 picode P1 serve 恢复的映射**：
| 维度 | prime-agent | picode（P1，self-drive.ts `probeServeHealth`/`recoverServeSessions`） |
|---|---|---|
| 失联检测 | supervisor 监听 worker socket close | 周期 `probeServeHealth`（serve-recovery 台账防风暴） |
| 重试阶梯 | 250ms/1s/5s × 3 | `SERVE_RECOVERY_BACKOFF_MS` 退避 × 3（self-drive.ts L138-146） |
| 恢复动作 | connect/subscribe/refresh；或 relaunch + 从 JSONL 重hydrate | `rePOSTMessage` 重投喂 ready 消息（D061 noReply）+ 清 error |
| 状态持久 | autonomous 计数内存态（重启清零）；goal/transcript 落盘 | 计数落 session.yaml（文件真相，重启不丢） |
| 游标/去重 | generation cursor + attach snapshot 基线 | 无（幂等靠任务文件真相 + ready 消息语义） |

**结论**：prime-agent 靠"进程级恢复 + 转录重hydrate"，picode 靠"serve 会话重投喂 + 状态文件真相"。
两者都不做 daemon 常驻（picode 不变量），picode 的续跑计数持久化**比 prime-agent 更可靠**（N3 已对）。

### 1.3 refinement review：自主评审门如何触发

**文件**：`packages/coding-agent/src/core/refinement/refinement.ts`、`agent-session.ts`、`settings-manager.ts`
**来源 commit**：同上（0987c1ba）
URL: https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/core/refinement/refinement.ts

**触发时机（两个）**：
1. `turn_interval`：每 N 个 assistant 回合自动评审，N 默认 **25**（`settings.autoRefine.turnInterval`，
   settings-manager.ts L883-896），附冷却 `cooldownMs` 默认 **20min**（失败/拒绝后不立刻重试）
2. `compact`：自动 compaction 时同步触发评审

**评审门（model-backed）**：
- `reviewAutoRefine`（refinement.ts L949-989）：把最近 40_000 字符会话 + 当前 harness 状态 +
  refinement 历史喂给模型，`AUTO_REFINE_REVIEW_SYSTEM_PROMPT`（L175-190）要求 JSON 输出
  `{ shouldRefine: bool, rationale, instructions }`
- **判据**："trajectory contains evidence useful to this session's future turns"才 approve；
  拒绝一次性噪音/未支持假设/瞬时工具输出；优先 local harness edits，global 仅限跨会话持久 lesson
- 评审失败/截断 → 不重试（stamp cooldown），防模型调用风暴

**应用阶段（防竞写 + 可回滚）**：
- 提案生成不突变 harness 状态；apply 前重读 harness 文件，`baselineState` 对比 → 冲突编辑拒绝
  （Q3，防多会话竞写）；rollbackOf/rollbackScope/HarnessScope（session-local 默认）
- `--auto` / `--approve` 双语义（agent-session.ts `_runSerializedRefineCheckpoint` L2226-2307）

**与 picode 对照**：
- picode 已有：`evolve-refine.ts` 的 `reviewLesson`（**启发式**评审门，Q2 落地：证据=commits+task.yaml+
  evidence.yaml+git log，噪音/空轨迹拒绝；`self_evolve.refine_gate` mode: heuristic|none，L66-98）
  + `--approve`/`--auto` 双语义（L213-231）
- 差异：prime-agent 评审是 **LLM 决策**；picode 是**机械启发式**（符合"编排器无 LLM"不变量，更强可预测性）
- C1 预算 vs E4 验证门：picode 已有 `checkBudgets`（maxTurns/timeoutMs 防失控，self-drive.ts L355-401，
  gate 停靠非成功——setError "budget exceeded" + sleep）与 E4 verify_commands；本轮 C1 只缺"续跑语义"
  （预算耗尽≠成功、空闲即续跑、续跑次数有界），与 prime-agent Q1 的 gates 语义对齐

---

## 2. 与 picode 映射（本轮 C1/C2/C3）

| # | prime-agent 机制 | picode 落点 | 采纳/差异 |
|---|---|---|---|
| M1 | 续跑=普通 user message + 固定 prompt | C1 `feedContinuation` POST noReply + 转录 | **同构**；prompt 借鉴默认文案的"由 gate/预算定完成、agent 不自停" |
| M2 | 4 预算 AND 停靠（cont/turn/token/time） | C1 `budget.continuations` + `max_per_session`（N2） | picode 用"次数+时间间隔"计价（N6 token 缓）；语义同"预算耗尽≠成功" |
| M3 | gate 失败→续跑+回投输出；worktree 快照防重复重跑 | 第二轮：续跑前跑 `gate_commands`（C1 已声明未执行，d-3） | 快照防重跑值得做（低成本，命中 d-3） |
| M4 | token 计量排除 cacheRead | N6 上游依赖，缓 | — |
| M5 | worker 重启 autonomous 计数清零 | C2：续跑计数持久化 session.yaml（N3） | **picode 更严**：重启不重算不超发 |
| M6 | daemon 重附（generation cursor + snapshot 基线） | C2：P1 serve 恢复衔接（rePOSTMessage ready + 清 error + 计数保持） | picode 无 daemon（不变量），不做进程级重附 |
| M7 | auto-refine LLM 评审门 | 已有 `reviewLesson` 启发式门（Q2） | picode 保持机械门，不引入 LLM |
| M8 | goal continuation（持久目标 + tokenBudget） | 缓（第二轮候选：任务级"继续推进"目标注入） | 与续跑正交，第二轮再评估 |

**C1/C2 具体接线建议**：
- `guardianTick` 顺序：park → drain → derive/apply → sweepProgress → **checkBudgets** → **续跑 sweep（新）**
  → idleSleep → probeServeHealth（C2 计划：续跑在 checkBudgets 之后、probeServeHealth 之前，与计划一致）
- 续跑候选判定（对 prime-agent M1 的机械化）：`awake + 无 error + 任务未终态 + budget.continuations <
  max_per_session + 空闲 > idle_sec`；幂等（task 终态/error/sleeping/非 oc- 永不投喂）
- 续跑 prompt 固定模板复用 ready 消息上下文（N7：v1 固定，语义化缓）

---

## 3. 其他开源 agent 框架的续跑/自主循环模式

> 注：联网（request_info）本次因 serve env 缺 PICODE_AGENT_ID/TOKEN 返回 TOKEN_INVALID（两次），
> 以下基于本机既有权威本地文件 + 已公开官方文档。URL 已附；retrieved_at 为知识基线日 2026-08-13，
> 建议 C3 文档核对时以官网为准复核。

### 3.1 Claude Code hooks（本地 skill 实测格式 + 官方文档）

- 本机权威本地文件：`~/.agents/skills/git-guardrails-claude-code/SKILL.md`（真实可运行，含 hook 配置格式）
  - hooks 注册在 `settings.json`：`"hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command",
    "command": "..." }] }] }`；`$CLAUDE_PROJECT_DIR` 注入项目路径；command 钩子以 JSON stdin/stdout 交互
  - 事件点（官方文档 hooks-reference）：`PreToolUse` / `PostToolUse` / `Stop` / `SubagentStop` /
    `UserPromptSubmit` / `Notification` 等 —— **`Stop` 是回合结束触发点**（Claude Code 官方 hooks 参考，
    URL: https://docs.anthropic.com/en/docs/claude-code/hooks，retrieved_at=2026-08-13 知识基线）
- **对 picode 的启示**：
  - `Stop`/`SubagentStop` hook = 回合结束钩子，可在此**机械触发**下一轮（与 guardian 周期 sweep 是两种
    时序策略：事件驱动 vs 周期轮询；picode 无 daemon、状态文件化 → **周期 sweep 更合不变量**）
  - hooks 用 JSON stdin/stdout 协议、command 即脚本 → 与 picode "机械层 + 文件真相"同哲学
  - Claude Code 亦无 daemon 常驻续跑语义，长时运行靠外部编排（CI/脚本循环 `claude --continue`）

### 3.2 SWE-agent（princeton-nlp）

- URL: https://github.com/SWE-agent/SWE-agent（retrieved_at=2026-08-13 知识基线）
- **核心循环**：Model→Action(Edit/Submit)→Observation 的三元回合循环（容器内交互式 shell 观察）；
  每回合 `environment step` 返回 observation，模型据以决定下一个 action
- **预算/终止**：`max_steps`（回合上限，默认如 100）是主要终止条件；`--max_steps`、`--timeout`；
  终止后产出 `trajectory`（JSONL）供评估复现——**预算有界 + 轨迹全录**，与 picode 有界续跑 + 转录一致
- **无输入长时运行**：`run_batch`/评估批量模式单次跑完整回合循环直到 max_steps 或成功提交，无跨会话续跑；
  断连恢复靠**轨迹重放**（trajectory 可重放/重评估），非进程内续跑
- **对 picode 的启示**：①`max_steps` 单维度有界 + 轨迹全录是"有界续跑"的极简实现（picode N2 类似）；
  ②"观察→再行动"循环中，**成功提交/验证是唯一终局信号**（与 prime-agent gates、picode E4 verify 同哲学）

---

## 4. 第二轮候选建议（供 run-lead 决策）

1. **gate 命令进续跑**（M3，低成本高价值）：`budget.continuations` 耗尽前对候选会话跑 `gate_commands`
   （C1 已有声明未执行）；借鉴 prime-agent 的 **git worktree 快照防重复重跑**（状态未变不重跑），
   把 `setError`/续跑停靠从"次数预算"升级为"验证过才停"
2. **续跑遥测**（d-5）：`status` 增 continuationsUsed/last_continuation_at 列（对齐 M2 计数）
3. **语义续跑**（d-1，N7 升级）：续跑 prompt 注入 TranscriptStore.historySummary 或窗口 summary
   （P4/prime-agent compaction 语义摘要），让续跑带着上下文
4. **任务级 goal continuation**（M8，缓）：把"任务目标 + tokenBudget"作为会话级持久目标注入
   （对照 /goal），任务未终态即持续续跑、tokenBudget 命中即 budget_limited 停
5. **maxTokens 真计量**（N6）：待 serve 暴露 token 契约后，续跑预算并入 token 维度；
   计量时参考 prime-agent **排除 cacheRead**（防缓存读重复计耗尽早停）

---

## 5. 来源与检索记录

| 来源 | URL / 路径 | retrieved_at | 说明 |
|---|---|---|---|
| autonomous.ts | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/core/autonomous.ts | 2026-08-13（本地 clone @ commit 0987c1ba，2026-08-12T15:58:04-04:00） | 4 预算 + gates 全实现 |
| agent-session.ts | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/core/agent-session.ts | 同上 | continuation 调用点、goal、snapshot/restore、auto-refine checkpoint |
| daemon-supervisor.ts | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/modes/daemon/daemon-supervisor.ts | 同上 | recoverWorker/adopt 重试阶梯 |
| docs/daemon.md | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/docs/daemon.md | 同上 | 重附/游标/snapshot 基线 |
| refinement.ts | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/core/refinement/refinement.ts | 同上 | LLM 评审门 |
| settings-manager.ts | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/src/core/settings-manager.ts | 同上 | autoRefine turnInterval=25/cooldown=20min |
| long-running-agents.md | https://github.com/PrimeIntellect-ai/prime-agent/blob/0987c1ba/packages/coding-agent/docs/long-running-agents.md | 同上 | goal vs autonomous 互补 |
| picode self-drive.ts | 本仓 packages/orchestrator/src/self-drive.ts | 2026-08-13 | checkBudgets/probeServeHealth |
| picode evolve-refine.ts | 本仓 packages/orchestrator/src/evolve-refine.ts | 2026-08-13 | reviewLesson 启发式门 |
| git-guardrails-claude-code | 本机 ~/.agents/skills/git-guardrails-claude-code/SKILL.md | 2026-08-13 | Claude Code hooks 配置格式 |
| Claude Code hooks 官方 | https://docs.anthropic.com/en/docs/claude-code/hooks | 2026-08-13（知识基线；request_info 本次 TOKEN_INVALID，建议 C3 复核） | Stop/PreToolUse 事件点 |
| SWE-agent | https://github.com/SWE-agent/SWE-agent | 2026-08-13（知识基线；同上复核建议） | max_steps/trajectory |

> 联网缺口留痕：本轮 request_info ×2 → `TOKEN_INVALID: missing PICODE_AGENT_ID/TOKEN`（serve env）。
> 若需联网复核 3.1/3.2 URL 与 retrieved_at，请 run-lead 放行后第二轮补证。
