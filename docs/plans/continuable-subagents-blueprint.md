<!-- 文档小组产物 · chunk-c4-continuable-blueprint · drafted_by: engineer（覃思/经纬） · checked_by: sdet（校雠）· 状态：v1 写实（输入 gate 满足：brief 已落盘 2026-08-15T17:05+0700；§5 引用写实由 squad-lead 擘画按 brief 组装，待 sdet 复核） -->
<!-- run_id: run-2026-08-15T02-30-00-DSH · baseline: 6b9610b · 写集：docs/plans/continuable-subagents-blueprint.md（纯 docs 层，零代码零配置） -->

# C4 — continuable 子代理集成蓝图（docs 层存档）

> **一句话**：picode 下轮若做「可续子代理」，方向 = **转录+摘要+续跑投喂增强**（现状 `continuation.ts` 语义的延伸，增量 steer + durable 身份 + 三道围栏），**不引入事件溯源恢复路径**（守 D002 文件真相，D082 只读先例）。本蓝图给出取舍论证、与 `continuation.ts`/`opencode-adapter` 的衔接点、docs/spec/17 修订点清单、冷恢复能力不足时的降级方案。
>
> **输入 gate 状态（v1 写实）**：`research/briefs/pi-persistence.md` **已落盘**（2026-08-15T17:05+0700；ind-res 产出，含来源 URL + retrieved_at）。brief 结论：**支持（部分接口限制）**——opencode（picode 实际集成运行时）原生支持 durable session identity + cold resume（同 sessionID 续写）；关键限制在 picode 侧使用方式（sleep 现走 DELETE 销毁会话）。据此 §2.4 分支裁决 = **分支①（resume API 直连）为主路径**，§4 增量 steer 降级方案转「兜底 + 投喂语义增强」。引用条目见 §5（含 URL + retrieved_at）。

---

## 0. 引用纪律与阅读约定

- **事实/推断标注**：每条技术论断尽量标注出处（源码符号 + 文件行号，或调研简报 URL + retrieved_at）；凡推断均显式标 `【推断】`，不冒充事实（对齐 engineer 人设禁区「把推断写成定论」）。
- **源码引用基线**：主仓 `main = 6b9610b`（本工作房基线）；源码行号按该基线。
- **禁止项**：本蓝图只描述语义与建议，**不含可执行代码片段、不含对现有源码的修改稿**（C3 纯 docs 层硬验收）；spec-17 正文本身不改（只产修订点清单）。

---

## 1. 取舍论证：转录+摘要+续跑投喂增强 vs 事件溯源恢复

### 1.1 两案定义

**方案 A — 转录+摘要+续跑投喂增强（现状语义延伸）**

现状（`packages/orchestrator/src/continuation.ts`）：

- `composeContinuationPrompt(summary)`@41：有摘要时在固定 `CONTINUATION_PROMPT` 后追加 `CONTINUATION_SUMMARY_HEADER`（"## 上一回合要点（转录摘要）"，`summary-noise.ts`@19）+ 摘要段——**语义续跑**（N7：带上一回合要点，而非空模板）。
- `deriveContinuationTargets`@140：纯派生（读 session/transcript/task，无副作用）候选条件——awake 且 `pi_session_id` 为 `oc-`、无 error、任务非终态（`TERMINAL_TASK_STATUSES`@54）、续跑预算未耗尽（D078）、平台席默认 skip、无 in-flight 长回合（`isRoundInFlight`@116）、空闲超 `idle_sec`。
- `feedContinuation`@178：`buildReadyMessage(env, composeContinuationPrompt(summary))` → `spawner.postMessage(sessionId, message)` → 转录落盘（`recordOutgoing`/`recordResponse`）→ `store.recordContinuation` 计数 +1。
- `continuation-gate.ts` `sweepContinuationsGated`@197：guardian 每 tick 入口，gate 启用时「通过 → 本轮不投喂（停靠）」，关闭（默认）时行为与 C1 完全一致。
- 转录归档（P4，`transcript-store.ts`）：`runs/<id>/transcripts/<agent>.jsonl` append-only 记录 outgoing/incoming；`historySummary`@106 生成确定性启发式摘要（无 LLM，`SUMMARY_STRIP_NOISE` 剔机械模板噪音，`summary-noise.ts`@23）。
- 断点续跑（P4/D083/D092）：`wakeWithOpencode`@301 重 spawn 时把 `historySummary` 追加进 ready 消息；serve 恢复路径（`self-drive.ts` P1@159-163）对 error 会话退避重投喂 `sendReady`@232 并清 error。

**方案 B — 事件溯源恢复（DSH 会话模型）**

- DSH 会话 = append-only `SessionEvent` 日志，模型可见消息由日志**派生**（`deriveMessages()`），恢复/续跑/回放全部派生自同一事件流（调研简报 §1 ①，URL `…/docs/subsystems/session.md`，retrieved 2026-08-15）。
- 子代理侧（survey §2 #10@268-281）：durable descriptor 经 `foldSubagentDescriptor`@449 事件溯源折叠（能力边界持久可重放）；冷恢复 `listChildren`@1678/`listDescendants`@1695 从持久会话投影枚举子代理树。
- 机件（survey §2 #4@169-186）：`foldSurface` 投影、`interruptedTurnClosers`@626 崩溃尾修复、`packChunkRuns` 打包、checkpoint 门闩——survey 已明确标注**只移植机件、不移植"日志即真相"模型**（⚠️ D002 冲突面，见下）。

### 1.2 逐维对比

| 维度 | A 转录+摘要+投喂增强 | B 事件溯源恢复 |
|---|---|---|
| 真相模型 | **文件才是真相（D002）**：session.yaml / task.yaml / transcripts / git 为准；转录是**机械层归档**，不驱动状态决策 | **日志即真相**：事件日志派生一切；状态文件只是投影 —— 与 D002 正面冲突 |
| 恢复路径 | 重 spawn 注入摘要（`wakeWithOpencode`）+ 续跑投喂（`feedContinuation`）+ serve 恢复 `sendReady`；预算计数持久化（N3，断连不重算） | 事件重放精确重建"任何请求当时看到的消息序列"（`foldSurface` + `assertProvenance`@320） |
| 崩溃语义 | 写半截 YAML = 未知状态风险（survey #4@180 已点名，picode 缺尾修复）；转录 best-effort 容错 | 崩溃尾确定性收尾事件（`interruptedTurnClosers`）——恢复语义显式化 |
| 实施成本 | **S–M**：现状机制已存在，增强是增量（steer 语义、身份字段、围栏校验） | **L**：新存储模型 + 双写/迁移 + 全状态文件重审；且与"文件真相"纪律冲突需要推翻既有设计 |
| 复杂度 | 低–中：延续 `continuation.ts`/`opencode-adapter` 既有单轨 | 高：触碰 17 会话模型 + 全部状态读写路径 + checkpoint 边界 |
| 兼容性 | 向后兼容：现有 run 目录直接可读，零迁移 | 破坏性：需要双真相源或迁移工具，旧 run 不可重放 |
| 观测/审计 | 已有 transcript jsonl + checkpoint 只读投影（D082） | 日志天然可审计，但引入第二事实源风险（intake §2.3 明示） |
| 与 D082 先例 | 一致：checkpoint = 只读投影，**不得读其驱动状态决策**（D082 详条，DECISIONS.md@90） | 冲突：checkpoint 在 DSH 里是恢复/续跑的一环，与 picode D082 边界相反 |

### 1.3 结论（守 D002 文件真相）

> **采用方案 A 增强，拒绝方案 B（不引入事件溯源恢复路径）。**

依据链：

1. **D002 文件真相**（DECISIONS.md@10：「状态以文件（yaml/jsonl）为准；atomic write」）——B 的"日志即真相"是结构性冲突，非增量可调和；
2. **D082 只读先例**（DECISIONS.md@90 + catalog §12.9@527-535）：checkpoint 明确是"捕获时刻对文件真相的只读投影，任何代码路径不得读 checkpoint 驱动状态决策"——picode 已两次裁决（D082/D091）观测面不反驱动状态面，B 把日志提升为恢复真相源与之相悖；
3. **intake 已定 non_goal**（`run-2026-08-15T02-08-48-06-DSH-intake.md` §5：「不引入事件溯源恢复路径（违背 D002/D082 文件真相）」）+ §3 C 行（「事件溯源恢复违背 D002」→ P1 下轮，本轮只调研+蓝图）；
4. **survey #10 风险行@281**（「D002 文件真相 vs durable 会话投影——蓝图阶段必须给出"转录+摘要"与"事件溯源"的取舍论证」）——本蓝图即该论证的落点；
5. **调研简报 §1 ②@30-32** 的可续子代理机制（持久子会话 + Activation + 冷恢复 + inbox FIFO）中，**可移植的是"持久身份 + 消息通道 + 结算通知 + 围栏"这组语义**，而"冷恢复"在 picode 的对应物是「转录+摘要重投喂」，不必上溯到事件溯源。

**可保留的 B 机件（非真相模型）**：survey #4 已界定的纯机件——崩溃尾修复、checkpoint 写前门闩等，属**其它候选**（#4 移植候选设计），不因本蓝图否决；本蓝图只否决"用事件日志做恢复真相源"。

---

## 2. 衔接点设计（与 continuation.ts / opencode-adapter）

> 均为**只读阅读**现状后的语义衔接描述；落地实现属下轮 goal（本蓝图只描述，不落代码）。

### 2.1 durable 会话身份：`oc-<id>` 句柄 vs 持久 id

**现状（opencode-adapter.ts）**：

- `pi_session_id` 形如 `oc-<opencode-session-id>`（`OpencodeHandle`@17）；`opencodeSessionIdOf`@340 剥前缀得到 serve 侧会话 id；spawn 后 `attachPiSession`（session-store.ts@215）挂到 session.yaml。
- `taskIdOfAgent`@76：从 `agent_id`（`engineer@task-x`）派生 task id —— **agent_id 才是 picode 的持久身份主键**（session.yaml 主键，`SAFE_AGENT_ID_RE`@32）。
- serve 重启/会话销毁后 `oc-<id>` 句柄失效：sleep@165 清 `pi_session_id`、terminate@177 清之；恢复靠 P1 `sendReady`（同一会话）或重 spawn（新会话 + 摘要注入）。

**设计建议（durable 会话身份）**：

- **持久 id = `agent_id`（含 task 绑定）**，跨轮/跨进程/跨 serve 重启不变；**ephemeral 句柄 = `pi_session_id`（`oc-<id>`）**，只在本 run 内、serve 存活期内有效。两者分层：`agent_id` 进文件真相（session.yaml），`oc-<id>` 只是"当前激活的 serve 会话"指针。
- 子代理身份建议沿用 `agent_id` 命名空间（如 `subagent@<parent-task>-<n>` 或任务席位模式——**【推断】** 具体命名属下轮决策，本蓝图只钉"持久 id 复用 agent_id 主键、不新建 id 体系"原则）。
- 若 brief 支持持久会话（**v1 写实：支持**）：`pi_session_id` 可扩展"平台持久会话引用"字段（保留句柄 + 冷恢复目标——resume = 同 sessionID `POST /session/{id}/message`，brief §2.2），但**该字段仍只是文件真相里的一个指针，不承担真相**（衔接 D002/D082 边界）。

### 2.2 父→子消息通道（opencode `/session/{id}/message`）

**现状**：

- `postMessage(sessionId, message, policy)`@211 = POST `/session/{id}/message`（opencode serve HTTP API，D044）；`buildReadyMessage(env, extraText)`@186 组装 ready 消息（D061 noReply 异步入队，不阻塞 spawn/恢复）；`sendReady`@232 对既有会话重投喂。
- guardian 续跑投喂 `feedContinuation`@178 即复用同一通道：`postMessage` + 转录落盘（`onMessagePosted` 钩子 → `recordOutgoing`/`recordResponse`）。

**设计建议（父→子消息通道）**：

- 父→子投喂 = **复用 `postMessage`/`buildReadyMessage` 通道**，消息体按「ready 上下文（role/task/write_paths）+ 本次指令文本」组装（现状 `spawner.buildReadyMessage(env, extraText)` 已支持 extraText 追加段）。
- 通道语义分级（衔接 survey #5 inbox 三原语@188-201）：`followup`（入 next-turn+唤醒，新轮次/新指令）≈ 现状续跑投喂；`steer`（入 next-step+唤醒，下一步引导/纠偏）≈ 新增增量投喂语义；`inject`（入 next-step 不唤醒，策略变更/上下文快照）≈ 状态通知。**picode 现状只有"整体重投喂"一种投喂形态**（survey #5@197 已点名），增强 = 把投喂动作按上述三档分级。
- 子→父回报：现状子代理侧无显式回报通道；picode 的 agent 间通信走 bus（04 §1）。**建议**：子代理结算/进展经 bus 房间消息（`refs` 指转录/证据文件），父经房间读史消费——机械层转录 + 语义层 bus 双轨（转录是机械记录，bus 是语义消息，二者不混）。

### 2.3 interrupt 保活

**现状**：

- `sleep(agentId, reason)`@165：awake→sleeping，清 `pi_session_id`，保留 budget/token/记忆指针（17 §5.2）；`wake`@112：sleeping→awake（`budget.turns`+1，`continuations` 不重置，N3 断连可恢复）。
- serve 恢复（`self-drive.ts` P1@159-163,237-256）：error 会话有界退避重投喂 `sendReady` → 成功清 error（每会话最多 1 次自动恢复，防风暴台账）。

**设计建议（interrupt 保活）**：

- **interrupt（暂停）≈ `sleep`**：保留会话身份、转录、预算与记忆指针；**resume（恢复）≈ `wake` + 重投喂（含摘要）**。现状"sleep 清 `pi_session_id`"意味着恢复时要么 `sendReady`（serve 会话还在）要么重 spawn（注入摘要）——两条恢复腿都已存在。
- **v1 写实（brief 支持）**：interrupt 保活 = sleep **保留**平台会话引用（不再 DELETE，或 `PATCH archived`，brief §4.2）+ 转录完整 + 预算持久化；恢复 = wake 走 resume（`GET /session/{id}` 校验存在 → `POST /session/{id}/message` 续写，现成 `sendReady` 直接接线），404/失联回退重 spawn + 摘要投喂（brief §4.2 路径 A）。
- 保活不变量：interrupt/resume 不得丢转录（jsonl append-only）、不得重算预算（`recordContinuation` 幂等计数）、不得丢未认领工作（**现状缺 cancel 保留队列语义**，survey #5@197 点名 —— 列为下轮候选）。

### 2.4 subagent-settled 通知映射（DSH agentEvents → picode 事件引擎）

**现状（picode 事件引擎）**：

- 编排事件 `SESSION_EVENTS`（`packages/core/src/session.ts`@69-81）：`run_created` / `intake_start` / `sponsor_message` / `goal_active` / `staffing_request` / `brief_assemble` / `task_ready` / `progress_due` / `merge_ready` / `task_dissolved` / `change_applied`——`applyEvent`（rules-engine）+ guardian tick（`self-drive.ts`@544-547）消费。
- 房间消息 `BUS_MESSAGE_TYPES`（`packages/bus/src/room-store.ts`）：`chat`/`progress`/`status`/`blocked`/`ready`/`objection`/`handoff_notice`/`handoff_ack`/`request_info`/`cell_done`/`merge_ready`/`system`/…——bus 是 agent 间语义消息（04 §1.2 post 校验 + 房间 ACL）。

**设计建议（subagent-settled 映射）**：

- DSH `subagent-settled` = 运行时在子代理结算时向父投递的**通知**（独立来源 kind，避免把运行时叙述冒充为子代理自写内容，调研简报 §1 ②@30-32）。
- picode 映射：**机械层** = guardian/orchestrator 在检测到子代理会话终态（task 终态/会话 terminate）时，补发一个编排事件（**建议复用现有事件词汇，不新增**：子代理结算最贴近 `task_dissolved`/`cell_done` 语义；新增事件类型需决策编号 + spec 10 注册，列为下轮）；**语义层** = 父经房间收到 `cell_done`/`handoff_notice` 类消息，携带 `refs` 指向子代理证据/转录。
- 来源标注纪律：结算通知由**机械层生成**（orchestrator 观察状态文件派生），**不是子代理 LLM 自报**——对齐 DSH"不把运行时叙述冒充为子代理内容"；该纪律写入 spec-17 修订点（见 3.3）。

---

## 3. docs/spec/17 修订点清单（本轮只产清单，修订执行属下轮/相关 chunk）

> 对象：`docs/spec/17-agent-runtime.md` §4 会话状态机（@90）/ §5 sess-mgr 策略（@116）/ §9 房间（@208）；配套 `docs/spec/04-enforcement.md` §2 写集（@38-58）。每条含**动机 / 建议条文（描述性）/ 影响面**。

### 3.1 深度围栏 ≤N（子代理嵌套深度上限）

- **动机**：DSH `SubagentDepthError`@466（`maxDepth` 默认 3，`dsh-tool-subagent` Config@29）+ `delegationDepthOf`@43/`resolveChildDepth`@486 + session header `origin/parentSession/delegationDepth` 校验（dsh-session@1122-1123）——子代理树深度有界，防无约束递归委托。picode 现状：三角任务无子代理概念，一旦引入子代理，深度无界。
- **建议条文**（描述性）：17 §4 会话记录增可选 `delegation_depth` 字段（registered 时默认 0，子代理 spawn 时 `parent_depth+1`）；spawn 时校验 `depth ≤ N`（建议默认 3，对齐 DSH；可配置），超限结构化拒绝（错误码带当前深度与上限）；`origin:"subagent"` + `parent_session` 记入会话头部（衔接 2.1 持久身份）。
- **影响面**：17 §4 状态机字段增量（向后兼容，旧 session.yaml 无该字段视为 0/平台席）；17 §5 调度（sess-mgr wake 决策读 depth 作为可观测输入）；orchestrator spawn 路径新增校验（04 §2 写集不受影响）。**不改变既有平台席/任务席语义**（现状所有会话 depth=0 或空）。

### 3.2 父子写集继承只收窄（captureDelegatedPolicyOverrides 语义）

- **动机**：DSH `captureDelegatedPolicyOverrides`@594（子继承父的策略覆盖，**仅可收窄**）+ `SUBAGENT_DELEGATION_CONTEXT`@547（"permission scope was fixed…cannot be widened…state the limitation"——本会话提示即源于此）。picode 现状：04 §2.1 write_paths 是**每 task 静态白名单**（@40-49），无父子继承语义；子代理若被授予父全部写集即越权风险。
- **建议条文**（描述性）：04 §2 增"子代理 write_paths ⊆ 父 write_paths（只收窄、不放宽）"——子代理 spawn 时写集 = 父写集 ∩ 子任务声明写集；越界写仍走 04 §2.1 拒绝 + violation；父写集收窄子代理写集属合法，反向（子宽于父）结构化拒绝。人设（17 §6 tool_profile/write_paths 维度）沿用此规则实例化。
- **影响面**：04 §2.1 校验逻辑增量（spawn 时计算有效写集而非静态读 task 声明）；17 §6 人设维度说明一句；staffing 生成子代理 persona 时校验收窄性。**既有 task 写集语义零变更**（无父链时规则退化为现状）。

### 3.3 所有权围栏（子代理会话不被普通房间路由）

- **动机**：DSH `hasApiRemoteSubagentOwner`@55（子代理会话对普通 API 路由**所有权围栏**——`agent-busy`，必须走 subagent 通道）+ 调研简报 §1 ②（子代理只能被父 `send_message` 继续）。picode 现状：bus 房间 ACL（04 §1.2 post 校验：token↔agent_id→members.yaml→access）——**无"子会话仅父可路由"语义**；任一有 post 权的成员可向子代理房间发消息。
- **建议条文**（描述性）：17 §9 房间增量——子代理会话归属父会话（`owner_session` 字段）；普通房间消息**不得唤醒/路由子代理**（bus 校验在 ACL 之上加 owner 围栏：目标会话是子代理且发送者非 owner → 结构化拒绝 `agent-busy` 语义等价物）；父→子走 2.2 通道，其它成员须经父转达或显式授权（衔接 DSH `CALLER_NOT_LIVE`/`DELEGATED_CALLER` 语义——调研简报 §1 ⑩@63：**子代理不可问人**，picode 同理：子代理不得直接向 sponsor 提问，须经父转达）。
- **影响面**：04 §1.2 校验增量（房间 ACL 之上加 owner 围栏）；bus 消息类型表（可复用现有类型，不新增）；17 §5.3 事件→wake 表（子代理唤醒触发源收窄为父）。**既有房间语义零变更**（非子代理会话不受影响）。

---

## 4. 降级方案：冷恢复能力不足时 → 增量 steer 而非整体重投

> 触发条件与前提（v1 写实）：brief 结论 = opencode **支持** cold resume（同 sessionID 续写），故本方案由「若 Pi 不支持冷恢复时的主路径」转为 **「resume API 失效 / serve 数据目录迁移 / 平台不可用时的兜底」+「投喂语义增强」**（brief §4.5：转录重投喂与 resume API 可叠加）。增量 steer 语义独立于 resume 是否可用，作为下轮 I1 保留建议。

### 4.1 现状"整体重投"语义（作为对照基线）

- 续跑投喂 = `feedContinuation`@178 整体投喂 `composeContinuationPrompt`（固定模板 + 摘要段）；重 spawn = `wakeWithOpencode`@301 注入完整历史摘要；serve 恢复 = `sendReady`@232 重投 ready。
- 局限（survey #5@197）：**唤醒 = 整体重投喂**，无 next-turn/next-step 两级语义；忙碌中重复唤醒无门闩；cancel 不保留队列。

### 4.2 增量 steer 方案（衔接 survey #5 inbox 三原语@188-201）

| 原语（DSH） | 语义 | picode 对应投喂动作 |
|---|---|---|
| `followup`@396 | 入 next-turn + 唤醒（新用户输入/续跑） | 现状续跑投喂（新轮次） |
| `steer`@399 | 入 next-step + 唤醒（引导下一步） | **新增**：增量投喂——"上一步证据已回执，下一步是 X"式引导，按进度增量推进，不整体重投 |
| `inject`@402 | 入 next-step **不唤醒**（策略变更/上下文快照） | **新增**：状态变更通知（如 checkpoint 更新、budget 变更）只入队不唤醒 |
| wake 门闩@444 | 空闲才开新 driver，busy 不插队 | guardian 已具 quiescence 雏形（`deriveContinuationTargets` 的 idle/in-flight 判定@164/116）；steer 投喂同样须过该门闩 |

**降级语义要点**：

1. **不整体重投**：Pi 无冷恢复时，恢复 = 转录摘要（`historySummary`）+ 增量引导，而非把整段历史/固定模板整体重灌——上下文有界、预算受控（`budget.continuations` 计数不变，D078）。
2. **增量粒度**：以"下一步引导"为单位投喂（证据回执/审批结果/进度推进/纠偏指令），每次投喂携带摘要段（现状 `composeContinuationPrompt` 已支持）。
3. **门闩对齐**：`sweepContinuationsGated`@197 的 gate（防重复重跑）+ idle 判定在增量 steer 下继续生效；gate 通过即停靠、快照未变不重投（`shouldRunGate`@112）。
4. **不触碰 17 状态机**：降级方案只在投喂语义层增强（continuation.ts 的派生/投喂函数形态），**不改 registered→sleeping⇄awake→terminated**（17 §4）；若走 S 变体，可仅把"续跑投喂从整体重投改增量 steer"（survey #5@199），连会话状态机都不碰。
5. **适用场景**：跨轮任务推进、父→子阶段性纠偏、断连后上下文有界恢复；**不适用**：需要精确回放逐 token 历史的场景（picode 无此需求，转录是机械记录非真相，D002）。

---

## 5. Pi 持久化 brief 引用（输入 gate · 已写实）

> 事实来源：`research/briefs/pi-persistence.md`（ind-res 产出，run-2026-08-15T02-30-00-DSH / task-chunk-c4-continuable-blueprint；检索时间 2026-08-15T17:04:17+0700）。**brief 已于 2026-08-15T17:05+0700 落盘**，以下条目为按 brief 写实；§2.1 分支选择据此裁决。本地勘察（§3.1 表）由 brief 引自 picode 源码与本机 opencode DB；联网来源（§3.2 表）URL + retrieved_at 如下。

### 5.1 可行性结论（P1 写实）

**结论：支持（部分接口限制）。** picode 实际集成的运行时是 **opencode**（opencode.ai / Anomaly，`opencode serve` + `@opencode-ai/sdk`），**原生支持 durable session identity + 会话续写/恢复**（brief §0）：

- **durable session identity：支持** — 会话以稳定 id（`ses_...`）持久化在磁盘 SQLite（本机 `~/.local/share/opencode/opencode.db`），跨 serve 进程重启有效（brief §2.1，事实）；本机存在 5 天前创建的 `picode:*` 会话仍可查（brief §2.1 本地 DB 证据）。
- **cold resume：支持** — 恢复 = 同一 sessionID 重新 `POST /session/{id}/message`（无独立 resume 端点）；`GET /session`（列表）+ `GET /session/{id}`（存在性校验）+ `POST /session/{id}/message`（续写）三件套即可实现（brief §2.2，事实）。
- **全量历史拉取：支持** — `GET /session/{id}/message` 返回全量消息（`{info, parts}`，limit 分页），可旁路校准本地 transcript.jsonl（brief §2.4）。
- **checkpoint/快照：部分支持** — `revert/unrevert` + 服务端快照 + 长会话自动 compaction；无客户端显式 checkpoint 导出 API（brief §2.4）。
- **关键限制（picode 侧使用方式问题，非平台缺失）**：`DELETE /session/{id}` 永久删除会话及全部数据；picode 当前 `sleepAgent` 正是走 DELETE 关会话 → 「睡眠即销毁 durable 身份」。cold resume 需**停止在 sleep 时 DELETE**（改用保留会话或 `PATCH archived`），wake 走 resume API（复用现成 `sendReady`）而非重 spawn（brief §0/§4.2）。
- **范围澄清**：**Pi（pi.dev / Earendil）≠ opencode（opencode.ai / Anomaly）**，二者是不同产品；C4 蓝图所问「Pi 平台持久化能力」应指向 opencode（picode 的 `opencode.enabled` 配置与 `oc-<id>` 句柄）（brief §1，事实）。
- **对 brief 一处表述的更正（squad-lead 源码复核 2026-08-15）**：brief §3.1 称 `sendReady`「已实现但全仓无调用方」——**不准确**：`self-drive.ts:256`（P1 serve 恢复路径 `attemptServeRecovery`）已调用 `spawner.sendReady(session.pi_session_id, agentId, env)` 对 error 会话同会话重投喂。准确表述：`sendReady` **已接线于 serve 恢复路径，但未接线于 wake/resume 路径**（`wakeWithOpencode`@301 仍重 spawn + 摘要）——分支① 的接线面实际比 brief 所述更小（仅补 wake 路径），serve 恢复路径本身即「同会话续写」的现成范例（衔接 §5.4）。

### 5.2 分支裁决（P3 写实 · 机械判定）

按蓝图 §2.4 预设逻辑 + brief 结论「支持（含 picode 侧使用方式限制）」：

- **分支①（resume API 直连）激活为主路径**：durable 会话身份 + 会话复用（2.1/2.3 的 sendReady 接线方案）成立；`pi_session_id`（`oc-<id>`）可作「平台持久会话引用」字段保留，作为文件真相里的指针。
- **§4 降级方案状态**：由「若 Pi 不支持冷恢复时的主路径」转为 **「resume API 失效/serve 数据目录迁移时的兜底」+「投喂语义增强（增量 steer）」** —— 即 brief §4.5「转录重投喂与 resume API 可叠加：resume 保证上下文连续，转录/摘要作为审计与降级」。
- **brief §4.5 关键结论**：opencode 无「durable 子会话/子代理树/父子权限」成熟语义（`children`/`fork` 是会话分支；`background`/`warp` 为实验接口）——**子代理的可恢复性由 picode 侧用 `oc-<id>` 句柄 + 路径 A 实现，无需自建会话存储**。

### 5.3 来源引用（P2 写实 · URL + retrieved_at）

| 来源 | URL | 支撑点 |
|---|---|---|
| opencode 官方 Server 文档（Last updated: Aug 14, 2026） | https://opencode.ai/docs/server/ | `opencode serve` 用法、§2.2 全 API 表、`noReply`、`prompt_async`、DELETE 语义（retrieved 2026-08-15T17:04+0700） |
| opencode 官方 SDK 文档 | https://opencode.ai/docs/sdk/ | `createOpencodeClient`、`client.session.prompt`（retrieved 2026-08-15T17:04+0700） |
| opencode 源码 `packages/core/src/global.ts`（dev 分支） | https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts | 数据目录 = `xdgData()/opencode`（retrieved 2026-08-15T17:04+0700） |
| opencode 源码 `packages/core/src/session/sql.ts`（dev 分支） | https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/sql.ts | Session/Message/Part 表定义，与本机 DB 逐列一致（retrieved 2026-08-15T17:04+0700） |
| pi.dev 官方 Sessions 文档 | https://pi.dev/docs/latest/sessions | Pi（Earendil）会话模型：JSONL 存 `~/.pi/agent/sessions/`；`pi -c/-r/--session/--fork` 恢复（retrieved 2026-08-15T17:04+0700） |

> 完整来源清单（含 SDK 文档、Intro 文档、serve.ts 源码、remove-opencode-db spec、pi.dev 首页）见 brief §3.2 表。retrieved_at 统一为 brief 检索时间 **2026-08-15T17:04+0700**（ind-res 标注；联网检索同一时区）。

### 5.4 本地核实对照（P4 写实 · brief §3.1）

| 勘察点 | brief 结论 | 对本蓝图含义 |
|---|---|---|
| `opencode-adapter.ts`：`sendReady`（同会话重投喂）已实现 | 事实（brief §3.1；**brief「全仓无调用方」表述不准确**——见 §5.1 更正） | 分支① 核心接线点：wake 走 resume（sendReady）替换重 spawn 分支；serve 恢复路径（`self-drive.ts:256`）已是「同会话续写」现成范例，**仅需补 wake 路径接线**（衔接 §2.3/§5.1） |
| `continuation.ts`：wake 恢复 = 重 spawn + 摘要（非 resume 旧会话） | 事实 | 下轮 I2 改造对象：恢复路径从「重 spawn + 摘要」改「resume 优先 + 摘要兜底」 |
| `session-store.ts`：`pi_session_id`（oc-<id>）已在 session.yaml | 事实 | durable 句柄已存在，仅需 sleep 不再清空/DELETE |
| `pi-adapter.ts sleepAgent`：opencode 会话先 `DELETE /session/{id}` 再 sleep | 事实（brief §3.1） | **改造关键**：sleep 保留（或 `PATCH archived`）替代 DELETE——这是 cold resume 的前提（brief §5 风险 1） |
| 本机 opencode.db：10,836 会话 / 20,249 消息 / 51,044 parts；单会话最多 1,187 消息 | 事实（brief §3.1） | 长会话持久化能力实证；compaction part（5 条）→「全量历史以本地 transcript.jsonl 为准」纪律成立（brief §2.4/§5 风险 2） |

---

## 6. 下轮实现建议（non-goal 记录，不落代码）

> 供下轮 goal 规划引用；实现时须逐一过决策编号（D104 起，D089 领号流程）与双门闩。

| # | 建议 | 关联蓝图节 | 涉及面（下轮实现范围） |
|---|---|---|---|
| I1 | 续跑投喂语义分级：followup/steer/inject + wake 门闩 | 2.2 / 4.2 | `continuation.ts` 派生与投喂形态（S 变体可不碰 17） |
| I2 | durable 会话身份：`agent_id` 主键 + `pi_session_id` 分层；**resume API 接线为主路径**（sleep 保留/归档替代 DELETE + wake `sendReady` resume，404 回退重 spawn） | 2.1 / 2.3 / 5.2 | session.yaml schema 增量 + opencode-adapter（`sendReady` 接线）+ pi-adapter `sleepAgent` 改造（brief §4.2 路径 A） |
| I3 | 子代理 spawn/注册 + 深度围栏 ≤N（默认 3） | 3.1 | orchestrator spawn 校验 + 17 §4 字段增量 |
| I4 | 父子写集继承只收窄（子 ⊆ 父 write_paths） | 3.2 | 04 §2 校验增量 + staffing persona 生成 |
| I5 | 所有权围栏（子会话仅父可路由 + 子代理不可直接问人） | 3.3 | bus 校验增量 + 17 §9 房间增量 |
| I6 | subagent-settled 通知：机械层结算事件（复用现有事件词汇）+ 来源标注纪律 | 2.4 | guardian/rules-engine 补发 + spec 10 注册核对 |
| I7 | cancel 保留队列语义（防强制解散丢请求） | 2.3 | 17 §4 状态机 + sess-mgr 策略（M 成本，survey #5 风险 🟡） |

> 依赖顺序建议：I1（无依赖）→ I2/I3 → I4/I5（围栏依赖身份与 spawn）→ I6（依赖 I2 的身份 + I3 的结算点）；I7 独立可选。具体排期由 run-lead/sys-arch 决策，本蓝图不代编排。

---

## 7. Open Questions / known issues 素材（供 handoff 交接）

1. **输入 gate 已满足（2026-08-15T17:05+0700）**：`research/briefs/pi-persistence.md` 落盘；§5 引用写实完成（结论「支持（部分接口限制）」+ URL/retrieved_at）。**剩余阻塞**：v1 写实待 sdet 复核 + run-lead 签收；C1 验收判定待复核通过。
2. **N 值（深度围栏上限）**：建议默认 3（对齐 DSH `maxDepth`@29），是否按 run 规模可配？【推断：可配，默认 3】
3. **子代理身份命名**：`subagent@<parent-task>-<n>` vs 任务席位模式，下轮决策。【推断】
4. **结算事件类型**：复用 `task_dissolved`/`cell_done` vs 新增事件类型（需决策编号 + spec 10 注册）——本蓝图倾向复用，下轮定。
5. **所有权围栏与既有房间 ACL 的叠加序**：ACL 先查还是 owner 围栏先查？影响拒绝错误码语义，下轮定。【推断：owner 围栏叠加在 ACL 之上（更严）】
6. **子代理可问人禁令**（调研简报 §1 ⑩：`CALLER_NOT_LIVE`/`DELEGATED_CALLER`）：picode 无"子代理问人"路径，但需确认 bus 权限下子代理不会直连 sponsor——纳入 I5 验收面。
7. **上游依赖**：C1（goal 跨轮）的 goal 激活/预算语义可能为子代理任务提供"任务级续跑"底座（survey §5 分块草案 C4 依赖 C1）——本蓝图与 C1 无代码交集，但 I1 与 C1 的 guardian 续跑需合并防双逻辑（survey #5@201 风险已点名）。

---

## 8. 引用速查（本蓝图引用的事实锚点）

### 源码（基线 6b9610b）

- `packages/orchestrator/src/continuation.ts`：`composeContinuationPrompt`@41 / `taskIdOfAgent`@76 / `TERMINAL_TASK_STATUSES`@54 / `deriveContinuationTargets`@140 / `isRoundInFlight`@116 / `feedContinuation`@178
- `packages/orchestrator/src/continuation-gate.ts`：`sweepContinuationsGated`@197 / `shouldRunGate`@112 / `runContinuationGate`@146
- `packages/orchestrator/src/opencode-adapter.ts`：`OpencodeHandle`@17 / `buildReadyMessage`@186 / `postMessage`@211 / `sendReady`@232 / `wakeWithOpencode`@301 / `opencodeSessionIdOf`@340
- `packages/orchestrator/src/transcript-store.ts`：`historySummary`@106 / `recordOutgoing`@73 / `recordResponse`@78
- `packages/orchestrator/src/summary-noise.ts`：`CONTINUATION_SUMMARY_HEADER`@19 / `SUMMARY_STRIP_NOISE`@23
- `packages/orchestrator/src/session-store.ts`：`SAFE_AGENT_ID_RE`@32 / `wake`@112 / `sleep`@165 / `terminate`@177 / `recordContinuation`@145 / `attachPiSession`@215
- `packages/orchestrator/src/self-drive.ts`：P1 serve 恢复@159-163,237-256 / guardian tick@525-547
- `packages/core/src/session.ts`：`SESSION_EVENTS`@69-81
- `packages/bus/src/room-store.ts`：`BUS_MESSAGE_TYPES`
- `docs/spec/17-agent-runtime.md`：§4 状态机@90 / §5@116 / §6 人设@154 / §9 房间@208
- `docs/spec/04-enforcement.md`：§1.2 post 校验@21-27 / §2 写集@38-58
- `docs/DECISIONS.md`：D002@10 / D082@90

### 调研/规划资料

- `.picode/plans/dsh-source-survey.md`：§2 #10@268-281（durable descriptor/深度围栏/冷恢复/权限边界）、§2 #5@188-201（inbox 三原语 + wake 门闩）、§2 #4@169-186（事件溯源机件 vs 真相模型）、§4 P1 C@357-361
- `.picode/plans/run-2026-08-15T02-08-48-06-DSH-intake.md`：§2.3@62-67（D002 文件真相）、§3 C@76、§5 non_goals@110-120、§6 C1-C3@148-152、§8.2@182-185
- `.picode/plans/research-brief-deepseek-harness.md`：§1 ①@26-28（会话=事件日志）、§1 ②@30-32（continuable 子代理全机制）、§1 ⑩@62-64（子代理不可问人）、§4 来源 11/12@115-116
- `research/briefs/pi-persistence.md`：**已落盘（2026-08-15T17:05+0700）**——§5 引用写实完成；结论「支持（部分接口限制）」，URL + retrieved_at 见 §5.3

---

## 修订表

| 修订 | 内容 | 状态 |
|---|---|---|
| v0 draft（2026-08-15） | 蓝图骨架成文：四要素 + brief 占位；输入 gate 未满足 | draft（待 sdet 核对 + brief 写实 + run-lead 签收） |
| v1 写实（2026-08-15T17:1x+0700） | 输入 gate 满足（brief 落盘）：§5 引用写实（P1 结论/P2 URL+retrieved_at/P3 分支裁决/P4 本地对照）；§4 降级方案转兜底+增强；§2.1/§2.3 分支收敛为①（resume API 直连） | 待 sdet 复核（recheck_trigger）+ run-lead 签收 |
