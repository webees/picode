# 产品与运行时决策目录（选项 + 默认）

**用法：** 每项 = 可选项 + **★ 当前默认（已拍板或历史约定）**。  
改默认须：更新本表 + DECISIONS 一行 + 相关权威正文（勿只改对话记忆）。

**Agent 细节唯一正文：** [spec/17-agent-runtime.md](../spec/17-agent-runtime.md)  
**未完成实现策划：** [spec/18-v1-completion-plan.md](../spec/18-v1-completion-plan.md)  
**流程唯一正文：** [PROCESSES.md](../PROCESSES.md)  
**术语 on 表：** [standards/terminology.md](../standards/terminology.md)

---

## 0. 图例

|标记|含义|
|------|------|
|★|**当前默认（已定）**|
|◐|已定方向，实现未完成|
|○|可选，未启用|

---

## 1. 产品目标与范围

### 1.1 v1 主目标

|选项|说明|
|------|------|
|A. 最小可合并链路（S 单 PR）|先通工程，仿真后补|
|**B. 公司岗位仿真完整** ★|岗位/房间/调度/招聘齐全后再谈极简裁剪|
|C. 多 goal 组合管理|program 级|

**已定：B。** 见 17-agent-runtime §2。

### 1.2 产品房

|选项|说明|
|------|------|
|不要产品房|产品意图挤在 leadership|
|**要产品房 `product`** ★|产品口径与工程终裁分离|

**已定：要。** 默认 post：`pm`；sponsor/run-lead 按成员表。

### 1.3 领域中立

|选项|说明|
|------|------|
|**规范与 prompt 领域中立** ★|无绑定具体业务案例关键字（I1）|
|绑定样例业务域|便于演示，污染通用性|

**已定：中立。**

---

## 2. 人类与会话

### 2.1 sponsor

|选项|说明|
|------|------|
|**永远是人类** ★|CLI/UI；不跑模型|
|允许 LLM 扮演 sponsor|仿真赞助方（验收失真）|

**已定：永远人类。** `sponsor.human_only: true`。

### 2.2 默认 on 岗是否全是 LLM 会话

|选项|说明|
|------|------|
|否：仅核心岗 LLM，其余规则化|省会话|
|**是：on 岗全部注册为 LLM 会话** ★|仿真完整；用调度控成本|
|混合：部分岗无 LLM 纯脚本|如 people-qa 规则引擎|

**已定：是（LLM 会话）。** 控制手段 = **sess-mgr 唤醒**，不是减岗。

### 2.3 会话数量控制

|选项|说明|
|------|------|
|靠减少 on 岗|与「仿真完整」冲突|
|**总管理 AI 决定唤醒/休眠** ★|`sess-mgr`|
|固定时间片轮转|简单但蠢|
|纯人工点名唤醒|不适合自动 run|

**已定：sess-mgr。** 细节 17 §4–§5。

### 2.4 sess-mgr 权限

|选项|说明|
|------|------|
|**只能 wake/sleep/terminate + 只读状态** ★|无 goal/merge 终裁|
|可代批 brief|权过大|
|可改 goal|禁止|

**已定：调度权 only。**

### 2.5 同时 awake 上限

|选项|说明|
|------|------|
|无上限|易打满配额|
|**`max_awake` 调度目标（默认 8）** ★|非成本熔断；超限则排队 sleep|
|硬熔断停 run|与「成本不熔断」冲突|

**已定：软上限 8（可配）。**

---

## 3. 编制与生命周期

### 3.1 平台 cell 寿命

|选项|说明|
|------|------|
|**per-run** ★|每 run 新建；知识沉 `knowledge`|
|跨 run 常驻会话|状态难清理|
|全局单例平台|多 run 串味|

**已定：per-run。**

### 3.2 实现三角来源

|选项|说明|
|------|------|
|预置固定三人|无人设|
|模板三人 + 补丁|半真|
|**真招聘：多维人设（hire_fresh）** ★|people cell 完整|
|pool_reuse（复用旧 persona 模板）|**不推荐**；仍须批准与 people-qa|

**已定：真招聘 + hire_fresh。** 维度见 17 §6；pool 见 16 §7。

### 3.2.1 命名与评分（16 §8/§9）

|选项|说明|
|------|------|
|**确定性命名（codename / team_name）+ request 覆盖** ★|稳定可复现；覆盖须批准后锁定|
|人工随意起名|不可复现，无法聚合|
|**文件事实评分（evidence/handoff/ack/retries）** ★|无 LLM、可解释、幂等|
|LLM 主观评分|成本高、不可复现；仅作 `note` 补充|

**已定：确定性命名 + 文件事实评分。** 沉淀 `scores.yaml` 与 `docs/knowledge/hr/`，供人设/团队组合优化。

### 3.3 双门闩

|选项|说明|
|------|------|
|**brief 批准 ∧ staffing 批准 才 spawn 实现三角** ★|安全默认|
|仅 brief|无人设|
|仅 staffing|无工作边界|

**已定：双门闩。**

### 3.4 三三制

|选项|说明|
|------|------|
|**凡激活环节必须 Lead/Doer/Check** ★|可 scale 折叠但换帽留痕|
|双人即可|弱检查|
|仅实现三角三三制|平台岗放羊|

**已定：三三制推广。**

### 3.5 S/M/L

|选项|说明|
|------|------|
|**保留 S/M/L；影响门禁与并行，不取消仿真岗注册** ★|岗仍在；唤醒更勤/更懒|
|S 删除平台岗|与仿真完整冲突|

**已定：scale 调策略，不删花名册。**

---

## 4. 工程与隔离

### 4.1 状态存储

|选项|说明|
|------|------|
|**文件 + atomic write（jsonl/yaml）** ★|可审计、可 diff|
|嵌入式库（如 SQLite）|不采用|

**已定：文件。**

### 4.2 并行写码

|选项|说明|
|------|------|
|**每 implement task 一 git worktree** ★||
|单工作区加锁|并行差|
|容器级隔离 only|仍要 git 策略|

**已定：worktree。**

### 4.3 合并

|选项|说明|
|------|------|
|**串行 merge 列车** ★|merge.lock|
|并行合 main|危险|

**已定：串行。**

### 4.4 成本熔断

|选项|说明|
|------|------|
|**不因成本自动杀任务** ★|可用 max_awake 软限流|
|预算耗尽 halt|可选未来 profile|

**已定：不熔断。**

### 4.5 工具与 Bus

|选项|说明|
|------|------|
|**Tool Bus + token + 房间 ACL** ★||
|Agent 直写 messenger|禁止默认|

**已定：Bus + token。**

### 4.6 信息控制

|选项|说明|
|------|------|
|**request_info → 过滤 → packet；实现岗禁裸 web** ★|ind-res 可 web|
|全员可 web|污染上下文|

**已定：申请制。**

### 4.7 跨房

|选项|说明|
|------|------|
|**run-lead 批准 + 监督；meeting-* TTL** ★||
|自由串房|禁止|

**已定：批准制。**

---

## 5. 文档与知识

### 5.1 记忆所有权

|选项|说明|
|------|------|
|**文档小组三人；对 run-lead 汇报** ★||
|实现三角自维护 README|禁止作为唯一记忆|

**已定：docs cell。**

### 5.2 知识沉淀

|选项|说明|
|------|------|
|**跨 run → knowledge 房 + 仓库 knowledge/skills 路径** ★||
|只存在 run 目录|难复用|

**已定：knowledge 沉淀。**

### 5.3 work brief

|选项|说明|
|------|------|
|**run-lead 签发；docs 组装；可选 ind-res 供料** ★||
|小队自写 brief|禁止默认|

**已定：签发制。**

---

## 6. 命名与文档

### 6.1 命名

|选项|说明|
|------|------|
|**企业四字 + 命名律 R1–R7** ★|glossary §0|
|任意昵称|易混|

**已定：命名律。**

### 6.2 文档单源

|选项|说明|
|------|------|
|**PROCESSES / terminology / 17-agent-runtime 分权** ★|AUTHORITY|
|多处复制步骤|禁止|

**已定：单源。**

---

## 7. 编排形态

### 7.1 双进程

|选项|说明|
|------|------|
|**orchestrator 无 LLM + Pi 会话有 LLM** ★||
|单一巨型 agent|难隔离|

**已定：双进程。**

### 7.1.1 外部接入方式（D064）

|选项|说明|
|------|------|
|**Pi 扩展（`pi -e`）** ★|实现三角/平台会话内工具面（09 矩阵 20 工具）|
|opencode serve（D044）|LLM 后端桥接（非工具面；消息级 model 对象）|
|**MCP 服务器（stdio · 全量工具面）**|外部 LLM/客户端驱动 run 全生命周期；编排面 36 + 执行面 20；ACL 全保留（D064）|

**已定：三种接入并存。** 会话内 = Pi 扩展；后端 = opencode serve；外部驱动 = MCP 服务器。MCP 客户端身份 = 受管工位（token/房间/画像判定，sponsor 永远人类）。

### 7.2 进度

|选项|说明|
|------|------|
|**squad-lead 定时 progress** ★|默认间隔可配|
|无进度|难调度|

**已定：progress。**

### 7.3 Draft 空闲

|选项|说明|
|------|------|
|**park（默认）** ★||
|stop||
|run_lead_advance|仍须 sponsor 确认（除非危险开关）|

**已定：park。**

---

## 8. 门禁（scale 矩阵 · 可调）

|检查|S ★默认|M|L|
|------|---------|---|-----|
|evidence + chunk done|MUST|MUST|MUST|
|code-review 会话|SHOULD 唤醒|MUST|MUST|
|sec-eng|风险触发|风险触发|MUST|
|串行 merge|MUST|MUST|MUST|

**说明：** 岗仍 registered；是否 awake 由 sess-mgr + 上表。

---

## 9. v1 核心已定项（摘要）

|#|决定|
|---|------|
|1|产品房 `product`|
|2|v1 = 公司岗位仿真完整|
|3|on 岗全 LLM 会话 + `sess-mgr` 唤醒/休眠|
|4|sponsor 永远人类|
|5|staffing 真招聘 + 多维人设|
|6|平台 cell per-run；知识进 knowledge|

---

## 10. 自我进化（self_evolve）

权威正文：[spec/19-self-evolution.md](../spec/19-self-evolution.md)

### 10.1 是否启用

|选项|说明|
|------|------|
|**启用能力设计，默认 run 仍为 delivery** ★|`self_evolve.enabled=true`，`default_kind=delivery`|
|默认每个 run 都是 self_evolve|危险，不采用|
|完全不做自我进化|不做 dogfood|

### 10.2 默认可写层

|选项|说明|
|------|------|
|**knowledge + prompts + docs + tests** ★|先 E1–E2|
|含 code|E3，显式打开|
|含 policy|E4，sponsor 双确认|

### 10.3 合入

|选项|说明|
|------|------|
|**sponsor 确认 merge** ★||
|仅 run-lead|不满足「人类赞助」精神|

### 10.4 成熟度起点

|选项|说明|
|------|------|
|**E0 人工 dogfood → E1 知识 → E2 文档/提示 → E3 代码** ★|依赖 18 完成至 G|
|直接 E3|不推荐|

---

## 11. 可调软默认

|项|★ 默认|其它选项|
|----|--------|----------|
|max_awake|8|4 / 12 / 无上限|
|idle_sleep_sec|600|300 / 1800|
|intake 并行 ind-res|true|false|
|orchestrator force wake|true|false|
|S 是否少注册平台岗|**否**（全注册，靠 sleep）|是，少注册|
|多 goal|不做 v1|后续版本|
|成本预算 profile|无|可选扩展|
|self_evolve.allowed_layers|knowledge,prompts,docs,tests|+code / +policy|

---

## 12. 会话续跑（continuation，D066）

权威正文：[spec/19-self-evolution.md](../spec/19-self-evolution.md)；机制实现 `packages/orchestrator/src/continuation.ts`。

### 12.1 每会话续跑上限

|选项|说明|
|------|------|
|**`max_per_session` 有界正数（保守默认 5）** ★|task 绑定会话每会话累计续跑次数上限；耗尽即停（耗尽 ≠ 成功），靠既有 idle-sleep/budgets 停靠|
|**`max_per_session_platform` 独立更紧预算（默认 2）** ★|平台席（无 task 绑定会话）独立上限，按 `taskId` 分流（D078）；0 = 不限保留|
|0 = 不限|关掉续跑预算闸（风险自担，须显式声明）|

**已定（D078）：预算按角色分流。** `max_per_session` 默认 5（task 绑定会话）、
`max_per_session_platform` 默认 2（平台席独立更紧预算；`config.ts`
`self_evolve.continuation.*`）。`deriveContinuationTargets` 预算门按 `taskId` 分流——
task 绑定用 `max_per_session`、平台席（taskId 空）用 `max_per_session_platform`，
判定顺序保持预算门在前、`platform_seats=skip` 门在后。**有意行为变更**：现
`platform_seats: "allow"` 配置（原继承 `max_per_session=5`）升级后平台席收紧到 2，
属有意保守收窄。遥测顶层增 `max_per_session_platform` 字段、session 级
`max_per_session` 反映该会话适用上限（三面口径一致）。0 = 不限须显式声明。

### 12.2 续跑空闲间隔

|选项|说明|
|------|------|
|**`idle_sec` 触发间隔（保守默认）** ★|会话空闲超过该间隔才投喂续跑 prompt；须小于 `idle_sleep_sec` 否则先被休眠|
|过小|续跑频繁、挤占回合|
|过大|空等恢复（回到无 continuation 老问题）|

**已定：保守间隔默认**（具体默认值见 `config.ts` `self_evolve.continuation.idle_sec`）。

**已定（R3-C1）：idle 时钟 = 回合完成时间，非投喂时间**（D067）。idle 判定取
`max(last_wake_at, 最近一条 transcript **incoming（响应）记录** ts)`——续跑投喂记录为
outgoing，**不重置 idle 时钟**。若转录末条为 outgoing 且其后无 incoming（长回合进行中），
该会话视为 in-flight，**不进入候选、不投喂**（修复监督者实测：原 `lastActivityMs` 取
`max(last_wake_at, 最近转录 ts)`，投喂即重置时钟，长回合被误判空闲连投打断）。实现
`packages/orchestrator/src/continuation.ts`（`lastRoundCompletedMs` / `isRoundInFlight`）。

### 12.5 平台席策略（无 task 绑定会话）

|选项|说明|
|------|------|
|**`platform_seats: "skip"`（默认）** ★|无 task 绑定会话（scout/sys-arch/run-lead 等平台席）不进续跑候选，防无界空转烧 token|
|`"allow"`|显式逃生：平台席可被续跑，但仍受 `max_per_session` 有界|

**已定（R3-C1）：默认 `"skip"`**（D068；`config.ts` `self_evolve.continuation.platform_seats`）。
承接 R2-C2 的 `max_per_session` 有界缓解，从「总量有界」升级为「默认不入场」；
`"allow"` 须显式声明，行为仍受预算闸约束。

### 12.6 续跑前 gate（防重复重跑，R3-C2）

|选项|说明|
|------|------|
|**`gate_commands` 空 = 不启用（默认）** ★|行为与 D066 完全一致；续跑直接投喂|
|配置 `gate_commands`|投喂前对候选跑 gate（有界超时 60s）；**上次失败快照与当前一致 → 不重跑不投喂**（防没改代码反复重跑）；gate 通过 → 停靠不投喂；失败 → 不投喂但保留候选（下轮重试）|

**已定（R3-C2）：默认不启用**（D068；`config.ts` `self_evolve.continuation.gate_commands`）。
借鉴 prime-agent `captureGitWorktreeSnapshot`（`git status --porcelain` + `diff HEAD` +
untracked 内容 sha256 聚合），失败快照按 agent 持久化 run 目录 `continuation-gate.jsonl`；
非 git 仓库快照不可得 → 保守每次重跑 gate（不误判但去重失效）。
不引入 LLM 决策、不引入 daemon；默认关闭不改既有行为。

### 12.7 续跑遥测（R3-C3）

|选项|说明|
|------|------|
|**status/CLI/MCP 三面逐会话遥测列** ★|`continuations_used` / `last_continuation_at` / `max_per_session` / `in_flight` / `platform_seat`；纯读零写|
|仅 status 快照|可观测面不足，运营无法定位续跑预算耗尽/长回合 in-flight|

**已定（R3-C3）：三面一致**（D069；`packages/orchestrator/src/status.ts` `continuationTelemetry`）。
`picode status` 快照含 `continuation` 段；`self-drive continuation --status` 与 MCP
`continuation_status` 复用同一派生，口径一致、纯读零写（D039 status 快照扩展）。

### 12.3 续跑内容语义

|选项|说明|
|------|------|
|**固定模板 + 现有任务上下文** ★|复用 ready 消息角色/任务上下文 + 固定「继续推进或报告完成」模板；不 LLM 生成指令（编排器无 LLM）|
|**transcript 摘要注入（P4 historySummary）** ★|语义续跑：续跑 prompt 含上一回合要点摘要；确定性启发式、无 LLM；摘要为 null（空/损坏转录）回退固定模板|
|LLM 动态生成指令|违背「编排器无 LLM」，不采用|

**已定（D076）：固定模板 + transcript 摘要注入双轨。** 续跑 prompt 由
`composeContinuationPrompt` 组合——固定指令 + `TranscriptStore.historySummary()`
（`transcripts/<agent>.jsonl` 派生，条数统计 + 最近 `maxEntries` 条可读要点、截断 120 字，
确定性启发式、**无 LLM**，D003）；摘要为 null 时回退固定 `CONTINUATION_PROMPT`（best-effort，
不报错不空注入）。**零新增数据源**：摘要源自 D066 既有转录归档，不新增文件/接口/配置；
re-spawn（wakeWithOpencode）同款消费已复用。预算/幂等/纯函数语义不回归。

### 12.4 进程形态

|选项|说明|
|------|------|
|**guardian 周期性 sweep（无 daemon）** ★|续跑 sweep 内嵌 guardianTick（checkBudgets 之后、probeServeHealth 之前）；无常驻进程|
|daemon/worker 常驻|违背「无 daemon、状态文件化」（sys-arch 评估），不采用|

### 12.8 摘要窗口与去噪（D077）

|选项|说明|
|------|------|
|**`summary_entries` 可配（默认 8）+ `stripNoise` 去噪** ★|`historySummary` 取最近 N 条作要点；生成 outgoing 要点前删除命中子串（feed 传 `[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`），删空条目整条跳过；条数统计仍基于原始转录；`maxEntries<=0` = 摘要窗口关闭返回 null（回退固定模板）|
|固定硬编码 8（D076）|摘要被每次投喂的机械模板噪音淹没、窗口无法调优（D077 前的问题）|
|re-spawn 去噪（wakeWithOpencode stripNoise）|**已定（D083 → D092 统一）**：重 spawn 摘要剔除 ready + 续跑模板句，与 feed/checkpoint 口径一致（D079 落地；`maxEntries` 仍默认 20）|

**已定（D077 + D083 + D092）：`summary_entries` 默认 8（非负整数，0 = 窗口关闭）**；
`feedContinuation` 传 `stripNoise: [READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`
剔除固定投喂模板文本，避免摘要被重复噪音淹没。提取 `CONTINUATION_SUMMARY_HEADER`
常量供 `composeContinuationPrompt`/re-spawn 复用。摘要仍为确定性启发式（D076 不变，
非 LLM 精炼）。**剔噪口径已统一收敛（D092）**：新建 `packages/orchestrator/src/summary-noise.ts`
（零 import 零依赖）收敛模板常量 + 导出 `SUMMARY_STRIP_NOISE` 统一剔噪清单，
feed / checkpoint（`CHECKPOINT_NOISE`）/ re-spawn 三处统一消费——re-spawn
`wakeWithOpencode` 摘要由仅剔 `READY_MESSAGE_TEXT`（D083）升级为同剔续跑模板，
与 feed/checkpoint 语义对齐；`maxEntries` 保持默认 20（全量恢复语义）。

### 12.9 会话 checkpoint（D082）

权威正文：`packages/orchestrator/src/checkpoint-store.ts` + `commands/checkpoint.ts`；
CLI：`picode checkpoint capture` / `picode checkpoint status`。

**边界：快照只读、文件为准。** checkpoint 是捕获时刻对文件真相的**只读投影**，写入后
不可变（timestamped 单文件、append-only 目录）。**任何代码路径不得读 checkpoint 来驱动
状态决策**——恢复/续跑/调度/合并仍只读 session.yaml / task.yaml / transcripts / git
（D002 文件真相不变量）。checkpoint 只是观测/审计产物（best-effort），丢失或损坏不影响
任何恢复路径。

|项|说明|
|------|------|
|**显式捕获** ★|`picode checkpoint capture --task <id>` 显式触发；`boundary: manual` 默认|
|**只读查询** ★|`picode checkpoint status [--task <id>]`：列某 task 全部（最新在前）或缺省列全部有 checkpoint 的 task 概览（count + 最新）|
|**捕获内容（schema v1）**|task.yaml `status` + 三角各会话 state/budget + 各会话 `historySummary`（`CHECKPOINT_NOISE` = `SUMMARY_STRIP_NOISE`（D092）剔模板）+ git worktree 指纹（非 git 仓 → null）+ `captured_at` + 自指纹 sha256|
|**纯函数 + 不可变落盘**|`captureTaskCheckpoint(dir, taskId, {now?, boundary?})` 同输入同输出（now 注入确定性）；落盘 `runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml`；重复捕获产生新 ts 文件不覆盖；task 不存在 → null|
|**自动捕获（D091）** ★|`self_evolve.checkpoints`：`enabled`（默认 **false**，开启后自动捕获生效，D082 显式捕获行为不变）+ `guardian_interval_sec`（默认 600s 节流，0 = 每次 tick）+ `pre_merge`（默认 true，受 `enabled` 总开关约束）。guardian 周期捕获（`boundary: guardian`，guardianTick 在 checkBudgets 后接线，仅写观测文件、跳过终态/缺失 task）；merge 前捕获（`boundary: pre_merge`，mergeNext 实际合并前 best-effort，try/catch 绝不阻断 merge）。两者均只写不读，**快照只读边界（D082）不变**|
|checkpoint 进 statusSnapshot 三面|**缓**：MVP 仅 CLI 消费面；三面同源需动 status 契约 + mcp-server|
|从 checkpoint 恢复/回滚|**拒（本轮）/缓（远期）**：违背「快照只读、文件为准」边界；若未来做，恢复目标仍为文件真相（git/文件备份），checkpoint 仅作回滚前对照基线|

---

## 13. 监控面板（Dashboard，D070）

权威正文：[spec/13-configuration.md](../spec/13-configuration.md)（`runs_root`/`opencode.base_url`）；
机制实现 `packages/dashboard-server`（只读 HTTP）+ `packages/dashboard`（前端 UI）。

### 13.1 包布局

|选项|说明|
|------|------|
|**两包分置 monorepo（前端 + 只读后端）** ★|`packages/dashboard`（Vue3+Vite+shadcn-vue）+ `packages/dashboard-server`（`node:http` 零框架）|
|单包合并|前端重依赖拖慢后端 build/test，职责不分|
|后端并入 orchestrator|无独立重启/端口面，监视工具与编排耦合|

**已定（D070）：两包分置。** 前端独立 pnpm，后端 npm workspace 成员。

### 13.2 包管理器分离

|选项|说明|
|------|------|
|**server=npm 成员，前端=自包含 pnpm** ★|根 `workspaces` 显式五包+server 排除前端（npm 无 `!` 排除）；E4 对前端 `pnpm -C packages/dashboard build` 显式验收|
|前端并入 npm 根安装|vue-tsc 需 TS6.0.3 而主仓 TS5.8.2，冲突 + 重型依赖拖慢根 gate|
|全部 pnpm|主仓 E4 gate=`npm run build` 由 merge 机械执行，切 pnpm 需全量迁移|

**已定（D070）：分离。** 根 build/test 覆盖 server；前端独立 `pnpm install/build/dev`。

### 13.3 后端形态（只读投影复用）

|选项|说明|
|------|------|
|**轻量只读 HTTP + 复用 orchestrator 纯读投影** ★|直接 import `statusSnapshot`/`buildBoard`/`readMergeQueue`/`readProgress`/`readGoal`（D039 只读无锁）+ `@picode/core`（loadConfig/readYamlFile/runsRoot/runDir）；面板 = 薄 HTTP 包装，避免第二份解析逻辑|
|后端重新解析 YAML|知识重复，与 01/04 解析漂移风险|
|写操作面板（POST 编排）|违背「无 daemon、面板只读」不变量，不采用|

**已定（D070）：投影复用。** 全部 GET、无副作用、不持锁。

### 13.4 路由面（9 端点，全部 GET）

|端点|内容|
|------|------|
|`GET /api/runs`|列 run（id + goal 摘要：status/scale/title/kind/created/acceptance 计数）|
|`GET /api/runs/:id`|goal + run.yaml + statusSnapshot（goal/sessions/tasks/merge_queue/continuation 遥测）|
|`GET /api/runs/:id/board`|buildBoard 7 列看板卡片 + `columns`|
|`GET /api/runs/:id/chunks`|chunks.yaml 原样（缺省 `{chunks: []}`）|
|`GET /api/runs/:id/tasks`|逐任务 task.yaml + brief/staffing latch + progress + evidence|
|`GET /api/runs/:id/sessions`|会话表（SessionStore.list）+ continuation 遥测段（D069）|
|`GET /api/runs/:id/merge`|merge_queue.jsonl 全量 + 计数（queued/merged/failed）|
|`GET /api/runs/:id/gates`|gates/ 门禁文件 + 各任务 evidence（E4/E6）|
|`GET /api/live/:runId/:agent`|代理 serve `GET /session/{id}/message` → 抽 `info.tokens.total/input/output`（`oc-` 前缀剥离）；serve 失联/超时（5s ERR-01）→ `{error}` 不挂死|

**已定（D070）：9 端点全只读 JSON。** 实现 `packages/dashboard-server/src/router.ts`。
**（2026-08-15 D113/D114 修订标注：路由面已扩展——bus 读面 3 端点 + 唯一写端点 POST /bus/:room
（sponsor chat 写代理）+ approvals/change-orders 数据源 2 端点，见 §25.1；D070 只读不变量仅对本写端点
局部例外）**

### 13.5 运行方式

|选项|说明|
|------|------|
|**server + 前端分别启动，Vite proxy 联调** ★|server `node packages/dashboard-server/dist/index.js --repo <path>`（默认 8788）；前端 `cd packages/dashboard && pnpm dev`（Vite 5173，proxy `/api` → 127.0.0.1:8788 免 CORS）|
|SSE/WebSocket 推流|serve 无推送契约（D058），轮询最稳（tokens 页 `refetchInterval` 2–5s）|
|打包部署|本地只读工具，不做部署（第二轮）|

**已定（D070）：本地双进程 + 轮询。** `--repo` 默认 cwd，读 `.picode/config.yaml` 的
`runs_root` 与 `opencode.base_url`，可指向任意真实 run 仓（dogfood 克隆等）。

### 13.6 视觉检修（D071）

|选项|说明|
|------|------|
|**语义状态色 token + 域组件层 + 三视图派生** ★|D071：`--status-success/warning/danger/info` + 边框/阴影 token + `components/dashboard` 域组件（StatCard/StatusBadge/SectionCard/EmptyState/ErrorState/Skeleton*）；总览/详情页统一复用|
|各页手写样式/硬编码状态色|样式漂移、无一致性（检修前的「丑/晦涩」根因）|

**已定（D071）：统一 token + 域组件。** 语义状态色浅深色均满足 WCAG AA ≥4.5:1；
`--radius` 统一 0.5rem（修 :root 双 radius 冲突）；默认主题精修蓝强调色（zinc 基础）。

### 13.7 三视图数据派生方式（D071-4/D071-5，零端点改动）

|选项|说明|
|------|------|
|**既有 9 端点派生纯函数 + 静态知识常量** ★|`views.data.ts`（`derivePersonnel/deriveRooms/deriveProgress`）由 `/tasks` + `/sessions` + statusSnapshot 响应派生，`views.test.ts` fixture 断言；角色/房间/阶段静态知识落 `role-meta.data.ts`（ROLE_META/ROOM_META/PHASE_META），`dashboard-server` 与 9 端点零改动|
|新增专用端点（如 /api/runs/:id/rooms）|改动 server、破坏 D070 只读投影契约，不采用|
|前端直读 `members.json` / 人设文件|引入文件系统耦合，面板只读约定下不采用|

**已定（D071）：派生纯函数 + 静态知识。** 三视图数据全部由既有 9 端点响应在
前端派生（纯函数，可单测）；角色/房间通俗名以静态常量维护（同步来源在
`role-meta.data.ts` 注释标注：人设 frontmatter / ROLE_PRIMARY_ROOM 约定 /
terminology §3），面板不引入新端点、不改 API 契约。

---

## 14. 会话生命周期（run 收尾休眠 + 跨 run 残留审计，D072/D073）

权威正文：[spec/17-agent-runtime.md](../spec/17-agent-runtime.md)（会话状态机）；
机制实现 `packages/orchestrator/src/self-drive.ts`（`sleepPlatformSeats`/`closeRun`/guardianTick
终态分支）+ `packages/orchestrator/src/session-audit.ts`（`deriveAuditReport`/`cleanResidual`）。

### 14.1 收尾自动休眠（goal 终态平台席）

|选项|说明|
|------|------|
|**终态自动休眠平台席（sleepPlatformSeats + closeRun）** ★|goal completed/cancelled 即休眠全部 awake 平台席（无 task 绑定会话），guardianTick 与 `goal set-status` 双触发点；幂等 best-effort|
|仅人工清理|残留会话占满 max_awake，阻塞后续 run 唤醒（本次 run 前 product acceptance 未满足的根因）|

**已定（D072）：自动休眠。** `closeRun` = 补发 TASK_DISSOLVED（幂等） + `sleepPlatformSeats`；
平台席判定 = `taskIdOfAgent===null`。不引入规则表新事件，`setGoalStatus` 保持纯净。

### 14.2 跨 run 残留审计与清理

|选项|说明|
|------|------|
|**`session audit` 跨 run 审计 + `--clean` 清理（C2）** ★|`deriveAuditReport` 纯派生（逐 run goal_status/awake[]/residual + 跨 run 汇总 vs max_awake）；`cleanResidual` 对终态 run 残留调 C1 closeRun（best-effort）；`--run` 过滤单 run|
|仅收尾自动休眠，无审计/清理手段|残留检查/清理只能人工翻 run 目录，无法判定 max_awake 是否被残留占满|

**已定（D073）：`picode session audit --repo <path> [--clean] [--run <id>]`**（noRun，跨 run）。
审计纯读零写（D039 延续）；`--clean` 依赖 C1 closeRun 原语（动态 import 延迟接通，未合并时报 NOT_FOUND）。

### 14.3 残留审计的 max_awake 判定

|选项|说明|
|------|------|
|**`residual_awake >= max_awake` → `max_awake_exhausted`** ★|跨 run 汇总终态 run 的 awake 会话总数，与 `sess_mgr.max_awake` 比较；运维据此决定是否 `--clean`|
|仅列残留、不做汇总|无法一眼判定是否已阻塞后续 run 唤醒|

**已定（D073）：汇总含 `max_awake_exhausted` 布尔。** 清理前后各跑一次
`session audit` 对比，验证残留清空且非终态 run 不受影响。

---

## 15. Skill harness（技能承载体系，D084）

权威正文：[standards/skill-spec.md](../standards/skill-spec.md)（SKILL.md 规范唯一正文）；
配置键 `paths.skills_root`（[13-configuration §3](../spec/13-configuration.md)，默认 `skills`）；
机制实现 `packages/core/src/skills.ts` + `packages/core/src/validate/skill-lint.ts` +
`packages/orchestrator/src/{pi-adapter,opencode-adapter}.ts`。

### 15.1 SKILL.md 校验（skill-lint）

|选项|说明|
|------|------|
|**自研 `skill-lint` 镜像 persona-lint（数据优先不抛错）** ★|`npm run check` 内含；校验 `skills_root` 下全部 `**/SKILL.md` frontmatter——`name` 必填匹配 `SAFE_ID_RE` 且等于目录名、`description` 必填（>1024 仅 warning，兼容存量 ponytail）、`license`/`allowed-tools`/`compatibility`/`argument-hint`/`metadata` 白名单、未知键 warning|
|官方 `skills-ref` 工具接入|**缓项（D085）**：npm 包需联网安装/运行，picode 无裸网（D010）；自研已覆盖等价语义，后续可对齐|

**已定（D084-1）：自研 skill-lint。** 结构化返回 `{ok, problems, files}` + CLI；
错误码全集 `packages/core/src/validate/skill-lint.ts` `SkillLintCode`。

### 15.2 skills_root 激活与发现

|选项|说明|
|------|------|
|**激活 `paths.skills_root`（默认 `skills`）+ 纯模块 `skills.ts`** ★|D055 死键局部解除；`resolveSkillsRoot`/`discoverSkills`（递归 `**/SKILL.md`，跳过 node_modules/点目录）/`buildSkillIndex`（metadata 一行一项，有界截断）/`personaDeclaredSkills`（frontmatter `skills[]` 对账 catalog）；`validateConfig` 禁绝对/`..` 逃逸；未配置时空转零行为变更|
|维持死键（D055）|harness 无处落地，SKILL.md 无法被发现的技能毫无意义|

**已定（D084-2）：激活。** `@picode/core` 导出 skills 模块；仅激活此键，D055 其余死键不动。

### 15.3 persona skills[] 接线

|选项|说明|
|------|------|
|**`buildPiEnv` 注入 `PICODE_SKILLS_INDEX` + `PICODE_PERSONA_SKILLS`** ★|读人设 frontmatter `skills[]`（实例人设 `staffing/personas/<seat>.md`，平台席回退 `.picode/agents/<role>.md`）→ 对账 skill 目录 → env 注入；`buildReadyMessage` 系统 prompt 追加 skills 段|
|skills[] 仅声明不接线|必填维度零消费，声明与能力脱节|

**已定（D084-3）：接线。** 未知 skill 名 → index 标记 unavailable 不阻断 spawn；
两个种子角色模板（engineer/run-lead）声明 `skills: [ponytail]` dogfood 验证。

### 15.4 渐进披露三层

|选项|说明|
|------|------|
|**metadata → instructions → resources 三层** ★|① metadata 启动注入（`buildSkillIndex` 有界截断 ≈100 tokens：name + 一行 desc + 相对路径）；② instructions 激活时 `repo_read` SKILL.md 正文（≤1024 字 desc 由 lint 守）；③ resources 按需读 `scripts/`/`references/`/`assets/`；**SKILL.md 正文绝不进系统 prompt**|
|一次性灌入 skill 正文|爆 context、正文进转录污染续跑摘要（D076 stripNoise 新负担）|

**已定（D084-4）：三层分离，只注入 metadata。** agent 激活为模型自主（D003 编排器无 LLM）。

### 15.5 allowed-tools 工具白名单

|选项|说明|
|------|------|
|**仅解析不强制** ★|`skill-lint` 校验形状（非空 string[]），但不限制 agent 工具面——ACL 仍由 tool_profile 六层决定（09 tool-profiles）|
|机械强制 skill 级工具白名单|**拒（D088）**：与现有 ACL 关系未定，强制可能破坏权限模型，留档待设计|

---

## 16. 决策编号管理（D089 / D090）

权威正文：`docs/decisions/watermark.yaml`（机器状态水位 ledger）+ `docs/decisions/reserve.mjs`（分配器 CLI，D089）；
编号完整性校验：`packages/core/src/validate/decision-lint.ts` + CLI `node packages/core/dist/validate/decision-lint.js`（D090）。

### 16.1 编号分配方式

|选项|说明|
|------|------|
|**机器状态水位（watermark.yaml）全局分配** ★|`node docs/decisions/reserve.mjs --reserve --run <run-id> --count N` 在 flock 临界区领取连续编号段并推进水位；`--land` 标记占用；`--status` 只读快照；同 run 重复 reserve 幂等；**勿手改 watermark（机器状态）**|
|人工数「当前最大编号+1」|并行 run 各取号会撞号（D084-089 曾因 skill docs 与 checkpoint docs 并行合并冲突重排），不采用|

**已定（D089）：机器水位全局分配。** DECISIONS 顶部水位说明要求：新决策先 `--reserve` 领号、落地后 `--land` 标记占用。

### 16.2 编号完整性校验

|选项|说明|
|------|------|
|**decision-lint 六项校验** ★|`npm run check` 内含（persona-lint + skill-lint + decision-lint 三 lint）。校验 ①表行编号唯一（DUP_TABLE）②详条编号唯一（DUP_SECTION）③详条↔表行对应（TABLE_SECTION_MISMATCH）④watermark 水位一致（WATERMARK_DRIFT）⑤docs/** D0xx 引用可解析（REF_UNRESOLVED warning）⑥reservations 幂等/无冲突（RESERVATION_COLLISION）|
|事后人工平移修复|碰撞/损坏只能事后救火、无人拦截，不采用|

**已定（D090）：机器门禁。** `--plan <file>` 预检模式把 plan 文件的 D0xx 引用对「DECISIONS ∪ 预留」解析，run-lead 写 plan 前即可拦截碰撞；错误（DUP/DRIFT/COLLISION/MISMATCH）须在 merge 前清零，引用缺失为 warning（历史债不阻断）。

### 16.3 领号 / 落地流程

```
1. 规划前领号：   node docs/decisions/reserve.mjs --reserve --run <run-id> --count N
2. 决策落地：     把预留编号写入 docs/DECISIONS.md（表行 + 详条），plan/文档引用用同一编号
3. 标记占用：     node docs/decisions/reserve.mjs --land --run <run-id>
4. 完整性验证：   node packages/core/dist/validate/decision-lint.js <repo>    # 全绿（0 error）
```

- 预留未落地（status: reserved）即被写入 DECISIONS → `RESERVATION_COLLISION` 错误；`--land` 后方可豁免
- watermark 损坏/缺文件：reserve.mjs 以初始状态引导（`next_number=90`），`--status` 可查当前水位与全部预留
- 本 run 自身的 D089/D090 即按本流程领取编号 89–90 并标记 landed（dogfood 验证）

## 17. 监督观测（supervise，D093）

权威正文：`packages/orchestrator/src/supervise.ts` + `packages/orchestrator/src/live.ts` +
`commands/supervise.ts`；CLI：`picode supervise [--once|--interval <sec>] [--log <path>]`。

**无 daemon（D037）不变量延续。** supervise 是**操作者前台调用的观测命令**——每次观测独立
派生（statusSnapshot + 每 awake 会话 serve live tokens + worktree `.ts` 计数），非平台守护
进程、不写状态。live tokens 原语（`fetchLiveTokens`/`serveSessionIdOf`/`stripOcPrefix`）自
dashboard-server 上移至 orchestrator（dashboard-server 改薄壳 re-export），dashboard 与
supervise 共用同一实现（D093-1）。

|选项|说明|
|------|------|
|**`picode supervise --once`（默认）** ★|单次观测输出 JSON：`{ts, run_id, goal_status, agents[], total, worktrees, tasks, merge_queue}`；`agents[]` 每会话 `{agent_id, state, tokens}`（非 awake / POLL_FAIL → `tokens: null`）；`total` = 全体 awake 会话 tokens 汇总（**POLL_FAIL 不计入**）|
|**`picode supervise --interval <sec>` 循环 + STOPPED** ★|循环观测；`isIdleStopped` 纯函数判定——`total` 连续 3 轮零增长（窗口 `rounds+1` 条等值）→ 输出 `{stopped:true, rounds, total}` 退出 0；**total=0（全 POLL_FAIL/空观测）不判空闲**（轮询失败非空闲信号，需 operator 介入）|
|**`picode supervise --log <path>`** ★|每次观测追加一行 JSONL（与 --once/--interval 均兼容），供后台归档/回放|
|硬编码 dogfood 脚本 `scripts/supervise/supervise.mjs`|无产品出口、与 dashboard-server 各自维护 tokens 轮询（D093 前的问题），已被命令正式化取代|
|平台 daemon 常驻监控|违背「无 daemon、状态文件化」（sys-arch 评估 / D037），不采用|

**已定（D093）：命令正式化。** STOPPED 仅是退出信号，不驱动任何状态变更；
`--interval` 循环在操作者前台进程中运行，中断即停止观测。tokens 数据源 = serve 契约
（D058，消息级 `info.tokens.total`）。

## 18. 配置合并深拷贝语义（deepMerge，D099）

权威正文：`packages/core/src/config.ts`（`deepMerge` + `cloneValue`）。

**D099 已定：配置合并返回与 DEFAULTS/overlay 完全独立的深拷贝。** 修复前
`deepMerge(DEFAULTS, {})` 对未覆盖嵌套子树保留共享引用（`out={...a}` 浅拷贝），导致
「改加载后 config」污染 DEFAULTS 全局单例、同进程后续 `loadConfig` 读到被篡改值
（Bug A，guardianTick 顺序依赖失败）。修复后 `cloneValue` 递归深拷贝全分支：
对象分支（未覆盖键深拷贝 / 覆盖键递归 / b-only 键深拷贝）、数组分支（byId/rest 项
深拷贝）、fallback 深拷贝。

|语义|说明|
|------|------|
|**合并结果独立性** ★|返回对象与 DEFAULTS / overlay 任意一侧无共享引用；改返回对象不再污染任何后续加载|
|**数组按 id 合并** ★|同 id 项合并、`enabled:false`/`_delete` 删除、无 id 项追加（13 §2 语义，用例守护）|
|**回归保障** ★|「同进程两次 loadConfig 互不影响」（第二次 opencode.enabled 保持默认 false）+ 官方 npm test 全绿|

## 19. E2/E7 排除语义按层分组判定（D100）

权威正文：`packages/core/src/evolve.ts`（`isEvolveWritePathAllowed` 共享判定）+ 
`packages/orchestrator/src/staffing.ts`（`checkPersonas` 委托调用）。

**D100 已定：多层并集下按层分组判定，carve-out 只否决所属层。** 修复前
`layers=[knowledge,docs]` 时 docs 层 carve-out `!docs/knowledge/**` 被扁平化进并集，
「任一 exclude 命中即 throw」误拒 knowledge 层自身 include（E2 evolve.ts 与 E7
staffing.ts **双处同病**）。

|语义|说明|
|------|------|
|**按层分组判定** ★|路径 ∈ 某层 includes ∧ ∉ 该层 excludes → 放行；carve-out 只否决其所属层，不否决其他层 include|
|**goal forbidden_paths 全局否决** ★|`forbidden_paths` 优先于一切层判定，命中即拒|
|**单层语义不变** ★|docs 单层（无 knowledge 层）对 `docs/knowledge/**` 仍拒（orchestrator evolve.test.ts:66-81 原样保留，防放水回归）|
|**单一事实源** ★|E2 `assertEvolveWritePathAllowed` 与 E7 `checkPersonas` 均委托 core 共享判定，删除本地同病逻辑|

## 20. yagni 死配置处置（D101 · D055 局部解除）

权威正文：`packages/core/src/config.ts` DEFAULTS（键集）+ `docs/spec/17-agent-runtime.md` /
`19-self-evolution.md`（关联规范面）。

**D101 已定：D055 死配置 5 删 1 留。** 逐键全仓 grep 零读取者删除（接口+DEFAULTS
同步删），有真实读取点者保留并刷新注释标记。

|键|处置|说明|
|------|------|------|
|`sess_mgr.enabled`|**删**|零读取（D055 reserved）|
|`sess_mgr.allow_orch_force_wake`|**删**|零读取（D055 reserved）|
|`self_evolve.enabled`|**删**|零读取（goal.kind 驱动，D055 reserved）|
|`self_evolve.require_sponsor_merge`|**删**|零读取（D055 reserved）|
|`self_evolve.knowledge_log_glob`|**删**|零读取（路径固定，D055 reserved）|
|`sess_mgr.idle_sleep_sec`|**留**|真实读取点 `self-drive.ts:373,380`（`sleepIdleSessions` opt-in）；注释刷新为 reserved 标记|

**兼容不变量**：既有用户配置含已删键仍可加载——分层 merge 不拒未知键、
`validateConfig` 不查已删键（loader.test.ts 新用例守护）。

## 21. ponytail 清理（死导出 / 薄壳 / 夹具单源，D102）

权威正文：各 chunk 交接包（C1/C3/C4/C5）+ DECISIONS D102 详条。

**D102 已定：监督者 ponytail-audit 三类清理全量落地，行为零变化。**

|项|处置|验证|
|------|------|------|
|死导出 ×3（`roomDisplay`/`isPicodeError`/`canConsumeModel`）|定义删除 + 测试引用同步（C1/C3）|grep 三面（prod+test+dist）零残留|
|单导出薄壳 ×3（mcp-server `errors.ts`/`schema.ts`、orchestrator `jsonl.ts`）|并入调用方（C4）：toMcpError/toZodShape → index.ts；readJsonl → rules-engine 单宿主导出 + merge.ts 跨引；测试改走 test-utils 共享 helper（**禁止 import ./index.js**，触发 serve 启动）|build+test 全绿；跨引防复制粘贴（C4 复核打回修正）|
|测试夹具 ×24（本地 tmpGitRepo/mkdtemp）|收敛 test-utils 共享单源（C5）：`gitInit` branch 选项 + `tmpGitRepo` 包装；A/B/C/D 四类逐字等价（branch:null 保留 `git init -q` 形态）|官方 npm test 502/502 全绿（core 125/bus 19/orch 307/pi 17/mcp 18/dash 16）；行为等价抽查|

## 22. 环境教训：工作房 node_modules 断链治理（D103）

权威正文：各 chunk handoff/evidence.yaml（C1/C2/C4 同型问题 + C4 取证流程）+ DECISIONS D103 详条。

**D103 已定：工作房环境治理流程沉淀为 run 标准操作。** git worktree 内
`node_modules/@picode/*` 指向不存在的 `.picode/node_modules`（断链）时，`@picode/core`
解析会落主仓**陈旧 dist**，测试/构建读到旧产物（TS2688 / 串扰）——C1/C2/C4 三次复现。

|步骤|说明|
|------|------|
|重建 `node_modules/@picode/*` 自链|指向本 worktree 的 packages dist；gitignored 零 repo diff|
|清理 `*.tsbuildinfo`|`find packages -name "*.tsbuildinfo" -delete`，避免瞬时 TS2688|
|官方 `npm test`（HOME 隔离）|`npm test` 自带 mktemp；补充包级跑另设 `TH=$(mktemp -d)`|
|sdet/审查复建环境重复上述步骤|C4 evidence 按此流程双跑取证（/private/tmp/picode-base-c4-*、picode-chunk-c4-*）|

## 23. goal 激活/回合预算（D104）/ skill_load 双轨（D105）/ 沙箱与审批（D106）/ C 蓝图存档（D107）/ 变更单纪律（D108）

### 23.1 goal 激活语义与回合预算（D104 · chunk-c1-goal-crossrun）

权威正文：spec 17 §5.4（guardian 续跑 vs goal resume 明界）+ DECISIONS D104 详条。

**D104 已定：goal.yaml 增增量字段，守 D002 文件真相（revision 仅 CAS 围栏、不重建状态）。**

|维度|语义|
|------|------|
|`revision`|CAS 围栏：`updateGoal(expectedRevision)` 陈旧 expected → ILLEGAL_TRANSITION；不引入事件日志重建状态|
|`activation`|`armed\|disarmed`，新 run 默认 **disarmed**；`picode goal resume` 是**唯一 arm 入口**；`set-status`→active 不自动 arm；block→disarmed|
|guardian 投喂 vs goal resume|guardian 投喂 = 会话级机械续跑（active∧armed 可投喂；active∧disarmed 零投喂）；goal resume = goal 级激活授权（blocked→active + 清 blocker + armed）；disarmed 只门闩续跑，不阻断 run 文件事件推进|
|`rounds_started` / `max_goal_rounds`|每次成功续跑投喂 +1；达上限（0=不限）guardian 自动 `block(code:"round-limit")` 零投喂；resume 拒绝|
|`blocked_reason.code`|lower-kebab 政策码：`draft-idle` / `round-limit` / `provider-limit` / `queue-failed`（格式校验，不硬白名单）|
|旧格式兼容|无 activation 字段的旧 active goal 默认 armed（行为兼容）；旧格式 max_goal_rounds=0|

**回合预算默认：`self_evolve.goal.max_rounds: 0`（不限）**——唯一新增 config 键；createRun 落盘 goal.yaml
`max_goal_rounds`（文件真相，显式字段可覆盖，运行期不回查 config）。

### 23.2 skill_load 双轨（D105 · chunk-c2-skill-load）

权威正文：docs/guides/skills/skill-harness.md §5（双轨明界）+ docs/spec/09-tool-profiles.md（ACL）+ DECISIONS D105 详条。

**D105 已定：persona `skills[]` 声明与 `skill_load` 工具双轨并存、不重复注入。**

|轨道|机制|
|------|------|
|persona `skills[]` 声明（D084 基线）|系统提示常驻 **metadata**（渐进披露，有界截断）；SKILL.md 正文**绝不**进系统提示|
|`skill_load <name>` 工具（D105）★|运行时按需加载**完整 body**（SKILL.md 全文含 frontmatter）；结果仅回工具结果、不注入 persona 系统提示|

|行为|默认/规则|
|------|------|
|ACL|画像 implement.engineer / implement.squad-lead；未授权 → TOOL_DENIED|
|体积上限|`DEFAULT_SKILL_MAX_BYTES = 64KiB`；env `PICODE_SKILL_MAX_BYTES` 覆盖（**不新增 config 键**）；超限 byte 感知截断（`truncated: true` + `bytes`/`maxBytes`）|
|健康校验|SKILL.md 缺失 → SKILL_MD_MISSING；坏 frontmatter → SKILL_BAD_FRONTMATTER；越界路径 → SKILL_PATH_DENIED；未知名 → SKILL_NOT_FOUND（内联码，不进 ErrorCode 枚举）|
|单次语义|单次单技能；加载结果不注入 persona 系统提示（与声明双轨不重复注入）|

### 23.3 沙箱三态（D106 · chunk-c3-sandbox-approval）

权威正文：spec 04-enforcement §10（10.1 定位 / 10.2 升级 / 10.3 守卫 / 10.4 旋钮）+ DECISIONS D106 详条。

**D106 已定：沙箱为 write_paths 静态白名单之上的动态兜底围栏（双轨，不替代）；每调用 resolve。**

|mode|行为|
|------|------|
|`read-only`|拒一切写（含 write_paths 内）|
|`workspace-write`（默认）★|write_paths 内可写；越界结构化拒绝（含生效 mode + `[sandbox: …]` 标记），可申请一次性升级|
|`danger-full-access`|工作房（cwd）内任意路径可写；仍拒 path escape 出 cwd（比 DSH full 更保守）|

会话 env `PICODE_SANDBOX_MODE` 覆盖 > 默认；非法 env → SANDBOX_MODE_INVALID。

### 23.4 审批 ask/never（D106）

**D106 已定：升级请求成对参数 + 审批策略 + allowed-once 单次放行 + 成对审计。**

|策略|行为|
|------|------|
|`ask`（默认）★|越界升级请求落 `runs/<id>/approvals/pending-<id>.json`；`picode approval list/decide` 决策|
|`never`|fail-closed 直接拒绝（APPROVAL_DENIED），不落请求文件|

|规则|内容|
|------|------|
|参数成对|`sandbox_permissions` + `justification`；缺一/空白/非法 → ESCALATION_MALFORMED；非严格更宽 → SANDBOX_ESCALATION_INVALID（WIDER_MODES 执行时校验）|
|answerer|**run-lead 代批**（`approval decide --approve|--reject --note`）；policy 层动作走 sponsor 人工|
|allowed-once|重试带 approval_id 单次放行；消费后 status=used；重试再验 APPROVAL_ALREADY_USED|
|审计成对|asked+decided 同文件（status 流转 pending→approved/rejected→used + used_at）；D071 零 dashboard 端点|

### 23.5 read-before-edit 守卫（D106）

**D106 已定：未读已存在文件禁编辑（fail-closed 默认开）。**

|行为|规则|
|------|------|
|`repo_read` 记录 observed|本会话（extension 进程内）读过才放行编辑已存在文件|
|编辑未读已存在文件|`FS_NOT_OBSERVED`（"edit requires reading first"）|
|新建文件|免预读（createIfAbsent 语义）|
|开关|`PICODE_READ_BEFORE_EDIT` 默认**开**；`0/false/off/no` 显式关闭，其余 fail-closed 保持开|

**配置旋钮最小化（D104/D106）：** 沙箱/审批/守卫三处开关全走会话 env（`PICODE_SANDBOX_MODE` /
`PICODE_APPROVAL_POLICY` / `PICODE_READ_BEFORE_EDIT`）+ core 常量，**零 config 键**；config 面本轮仅
`self_evolve.goal.max_rounds`（D104）。

### 23.6 continuable 子代理蓝图存档（D107 · chunk-c4-continuable-blueprint）

权威正文：docs/plans/continuable-subagents-blueprint.md（v1 写实）+ DECISIONS D107 详条。

**D107 已定（本轮只存档蓝图，不落代码）：** 下轮 C 实现输入 = 蓝图四要素——

1. **取舍**：采用「转录+摘要+续跑投喂增强」（方案 A，continuation.ts 语义延伸），拒绝事件溯源恢复（方案 B，守 D002/D082）
2. **可行性结论**（research/briefs/pi-persistence.md，ind-res 落盘 2026-08-15T17:05+0700）：opencode 原生 durable session + cold resume **支持（部分接口限制）**——限制在 picode 侧使用方式（sleep/terminate 现走 DELETE，需改保留/归档 + wake resume 接线，复用现成 sendReady）
3. **三道围栏修订点清单**（不改 17 正文）：深度围栏 ≤N（默认 3）/ 父子写集继承只收窄（子 ⊆ 父 write_paths）/ 所有权围栏（子会话仅父可路由 + 子代理不可直接问人）
4. **降级**：resume API 失效时增量 steer 而非整体重投（I1）

下轮 I1-I7 实现时逐一过决策编号（D104 起，D089 领号流程）与双门闩；I1 须与 D104 guardian 续跑合并防双逻辑（continuation.ts 内收敛）。

### 23.7 变更单 + 工具计数断言纪律（D108 · co-002 教训）

权威正文：change_orders/co-002.yaml + DECISIONS D108 详条。

**D108 已定（流程/测试纪律）：**

|项|纪律|
|------|------|
|注册表/清单测试|偏好**成员断言**（expected 数组逐项）而非**计数断言**（`tools.size === N`）——计数对合法扩展脆弱（skill_load 新增使「20 spec-09 tools」断言过期）|
|越写集修复|走变更单（co-002 模式：决策依据 + scope_limit 行级语义 + new_acceptance），不自行越写集|
|环境教训复证|node_modules 断链治理以 D103 为权威（本轮 C3 再次复现，治理流程复证有效）|

遗留观察：mcp-server registry.test.ts 标题仍为「carries the 20 spec-09 tools」（co-002 scope_limit 保持 20 成员语义，措辞性）——后续可顺手更名。

## 24. 可续子代理（D109 durable 会话 / D110 围栏 / D111 settled+投喂分级 / D112 docs 收尾）

权威正文：蓝图 `docs/plans/continuable-subagents-blueprint.md`（D107）+ DECISIONS D109-D111 详条 +
spec 17 §4/§5.2/§6/§9（durable-session 代写）+ spec 04 §1.2/§2.1（fence-owner 修订）。

### 24.1 opencode 会话 sleep 语义（D109 · I2）

**D109 已定：sleep 保留/归档替代 DELETE（durable 会话），terminate 仍 DELETE。**

| 动作 | 语义（D109 起） | D044 前 |
|------|------|------|
| **sleep** | `oc-<id>` 会话**保留**：`sleepAgent` 零 DELETE；`session-store.sleep` 保留 `pi_session_id`（平台持久会话引用、文件真相指针）；仅清空失效 `pid-` 进程句柄 | `DELETE /session/{id}` 销毁（D044）|
| **wake** | **resume 优先**：`isAlive` 探测（GET /session/{id}）→ 同会话 `sendReady` 续写（POST /session/{id}/message，零新 POST /session）；404/失联/竞态 → 回退重 spawn + 转录摘要 | 重 spawn + 摘要（无 resume）|
| **terminate** | **DELETE 不变**（终态销毁，`pi_session_id` 清空）| DELETE（语义保持）|

D044 行已加 I2 修订标注（sleep 改保留/归档替代 DELETE；terminate 仍 DELETE）。

### 24.2 深度围栏 ≤3（D109 · I3）

**D109 已定：子代理嵌套深度有界，超限结构化拒绝。**

| 维度 | 语义 |
|------|------|
| 字段 | `SessionRecord` 增可选 `delegation_depth` / `parent_session`（旧格式缺省 0/平台席，schema_version 保持 "1"）|
| 校验 | `wakeAgent`（D057 统一 spawn 入口）统一校验 `delegation_depth > MAX_SUBAGENT_DEPTH(=3)` → `SUBAGENT_DEPTH_EXCEEDED`（消息含当前深度与上限）|
| 错误码 | `SUBAGENT_DEPTH_EXCEEDED`（errors.ts 本轮**唯一**新增；I5 复用 ROOM_POST_DENIED 不新增）|
| 旋钮 | N=3 为 orchestrator 侧常量暂不可配（衔接 D106 配置旋钮最小化；可配置化列后续候选）|

### 24.3 写集只收窄（D110 · I4）

**D110 已定：子代理有效写集 = 父 task write_paths ∩ 子声明，只收窄不放宽。**

| 规则 | 语义 |
|------|------|
| `draftPersonas` | 子代理有效写集 = 父 ∩ 子声明；父缺失 → fail-loud |
| `checkPersonas` | 子 persona `write_paths ⊆ 父 task write_paths`；子宽于父 → 结构化拒绝（people-qa failed）|
| 匹配口径 | 精确路径匹配（glob 前缀子集不隐式视为子集，须声明完全一致或更小字面路径）|
| 退化 | 无 `parent_task` → 现状（顶层任务写集语义零变更）|

### 24.4 所有权围栏（D110 · I5）

**D110 已定：子代理会话房仅父可路由；子代理不可直接问人。** post 校验序 =
type → members ACL → **owner 围栏**。

| 规则 | 语义 |
|------|------|
| 判定 | 房间元数据 `owner_session`（meta.yaml）+ owner 会话 roster 记录（depth>0 ∧ parent_session 非空，文件真相）→ 子代理会话房 |
| 目标侧 | 发送者 ≠ `parent_session` → `ROOM_POST_DENIED`（消息含 owner fence 标记，agent-busy 等价）；嵌套链仅直接父可路由 |
| 发送侧 | 子代理仅可向其父可发言的房间发言（sponsor/领导层房不可直达，须经父转达）|
| 错误码 | 复用 `ROOM_POST_DENIED`（errors.ts 零改动）|
| 零变更 | 非子代理房间（无 meta / 顶层 owner / 非子代理发送者）围栏不触发 |

### 24.5 settled 机械通知（D111 · I6）

**D111 已定：子代理结算由 orchestrator 机械层补发 `cell_done`（复用词汇，不新增事件）。**

| 规则 | 语义 |
|------|------|
| 检测 | guardian 纯派生 `deriveSettledSubagentNotices`：depth>0 ∧ state=terminated ∧ parent_session 非空（session.yaml 文件真相）|
| 投递 | 复用 `cell_done` bus 词汇进父房；refs 指转录/会话/证据；meta.source=orchestrator（非 LLM 自报）|
| 幂等 | 父房 bus 已有该子代理 cell_done 则跳过（读 bus 文件，不建事件日志）|
| 事件面 | **不新增 SESSION_EVENTS**（core session.ts / deriveEvents 零改动，spec-10 无需注册）|

### 24.6 投喂分级（D111 · I1）

**D111 已定：投喂三档 followup/steer/inject（S 变体不碰 17 状态机）。**

| 档 | 语义 | 门闩 |
|------|------|------|
| `followup` | 现状续跑投喂（默认，零行为变化）| idle + in-flight 全量 |
| `steer` | 增量 next-step 引导（摘要段 + 引导段，extraText 通道，不重灌固定模板）| idle + in-flight 全量 |
| `inject` | 状态通知不唤醒（只对 awake oc- 会话；不计数预算）| 仅 in-flight（busy 不插队）|

**KI-6 防双逻辑**：投喂计数/预算/门闩全部收敛在 continuation.ts 内，不新建模块
（continuation-gate.ts / rules-engine.ts 零改动）。

### 24.7 docs 收尾 + 流程教训（D112）

**D112 已定：docs 收尾（D109-D111 落档 + D044 修订标注 + catalog 同步 + E18 纪要 + --land）；
流程简化候选记录不实施。**

| 项 | 内容 |
|------|------|
| 决策落档 | D109-D111 表行+详条（来源标注到 chunk/task）；D044 行 I2 修订标注（sleep 保留 / terminate DELETE）|
| 流程简化候选 | sponsor 反馈 + 流程复杂度审计（真实性评级**高**，修正项已落地：代提交 ≥3 / squad-lead 价值补充 / 交接包重复细化 / 重复汇报来源标注）；**A 级试点排下一轮流程优化 run**，本轮不实施 |
| 纪律 | 决策内容与交接包/evidence 一致（事件溯源 D002 / 事实一致）；编号必须 reserve.mjs 领号（D089）|

---

## 25. 管理界面完善：聊天室化 + 流程可视化 + 流程项落地（D113-D118）

权威正文：DECISIONS D113-D118 详条 + sysarch 分块方案（`.picode/chunks.yaml`）+ spec 04
（bus/房间 ACL）+ spec 16（招聘评分）+ `docs/knowledge/feedback/DOC-LIFECYCLE.md`（文档生命周期）。

### 25.1 面板路由面扩展（D113 读面 / D114 写代理）

**D113 已定：bus 读面 3 端点 + approvals/change-orders 数据源 2 端点（全部仍 GET 只读）；
D114 已定：唯一写端点 = POST /bus/:room sponsor chat 写代理（D070 只读局部例外）。**

| 端点 | 语义 |
|------|------|
| `GET /api/runs/:id/bus` | 房间列表（bus/*.jsonl 扫描行计数，与 statusSnapshot.rooms 同源口径）|
| `GET /api/runs/:id/bus/:room` | 消息流（BusMessage 字段原样；`?limit=` 默认 50 取最近 N 条；损坏行容错跳过；SAFE_ROOM_RE 防路径逃逸）|
| `GET /api/runs/:id/bus/:room/members` | 参与者（rooms/<room>/members.{yaml,json} 原样，缺失/损坏容错 null）|
| `POST /api/runs/:id/bus/:room` | **唯一写端点**：sponsor 身份 post `type=chat`（D018/D035 语义不变）；校验链走 RoomStore.post（type → members ACL → owner/sender 围栏）；ACL fail-closed——成员表须含 sponsor 且 access=post 且 post_types_allow 含 chat（默认仅 leadership/product 两房）；未授权 `ROOM_POST_DENIED` 403 / `BUS_TYPE_DENIED` 400 / `BAD_ROOM` 400 / `BAD_BODY` 400 / `ACL_CORRUPT` 500 |
| `GET /api/runs/:id/approvals` | 审批流数据源（approvals/pending-*.json 全量，ApprovalStore.list 升序，asked/decided 成对审计字段）|
| `GET /api/runs/:id/change-orders` | 变更单数据源（change_orders/*.yaml，proposed→applied→closed 状态机，readChangeOrders ts 升序）|

**只读纪律**：以上读端点全部 GET、fs 直读不套 ACL（面板观测者无 agent 身份，apiGates/statusSnapshot 先例）；
D070「无写」仅对 D114 写代理作唯一局部例外——其余路由非 GET 仍 405；index.ts CORS 补 POST
（GET,POST,OPTIONS）+ OPTIONS 预检 204。D071「零端点改动」约束随之局部解除（D113/D114 修订标注已落
DECISIONS 行）。

### 25.2 聊天室前端（D116 · W2a chunk-chat-ui）

**D116 已定：聊天室 tab + 消息流视图 + 发送框 + 房间入口增强。**

| 件 | 语义 |
|------|------|
| tab | index.vue 新增「聊天室」tab（owner=chat-ui）；rooms-view 房间卡片可点击进入聊天室 |
| 消息流 | chat-room-view：ts 相对时间、类型徽章走 labels 中文映射、body/refs/meta 详情可展开；参与者面板（GET members + 平台房 ROLE→ROOM 派生）；轮询 3s；骨架屏/ErrorState（D071 语义 token）|
| 发送框 | chat-send-box：POST /bus/:room（D114 写代理）；成功清空+刷新；未授权中文提示（ROOM_POST_DENIED/BUS_TYPE_DENIED，可发房提示 leadership/product）；非 sponsor 可发房禁用 |
| 派生 | chat.data.ts 纯函数（消息类型映射/参与者/房间列表/发送预检）+ chat.test.ts fixture 断言；labels.ts owner=chat-ui |

**审批联动**：发送失败提示与门禁 tab 审批流展示语义一致；本 chunk 不实现审批请求落盘
（写代理 fail-closed，D114）。

### 25.3 流程可视化（D115 · W2b chunk-flow-ui）

**D115 已定：approvals/change-orders 数据源消费 + 门禁状态机展示 + 9 视图增强。**

| 区 | 语义 |
|------|------|
| flow.api.ts（新）| useApprovals/useChangeOrders（3s 轮询），类型对齐 D113 两数据源端点 |
| 门禁 tab 审批流区 | approvals 列表——status pending/approved/rejected/used 徽章 + asked{from_agent/task_id/path/mode/reason} 与 decided{by/decision} 成对展示 |
| 门禁 tab 变更单区 | change_orders proposed→applied→closed 状态 + 时间线 |
| 门禁状态机 | 每任务流水：双门闩 brief/staffing → progress phase → evidence pass → handoff+acceptance → dissolve → merge（数据源 /tasks latch/progress/evidence + /merge + /gates，纯派生 flow.data.ts）|
| 9 视图增强 | 看板双门闩徽标 / 合并门拓扑依赖与等待原因 / 概览审批待办+变更单活跃告警卡 / 进度双门闩列 / 人员·分块·tokens 轻量增强（D071 语义色/域组件一致）|

标签本地化于 flow.data.ts（labels.ts owner=chat-ui，gates-panel resultLabel 先例）；只读展示不驱动状态决策。

### 25.4 流程项落地（D117 · W1b chunk-process-items）

**D117 已定：评分画像消费（只读）+ reuse_persona_ids 显式预填 + 文档精简维护 docs:lean。**

| 项 | 语义 |
|------|------|
| queryTalentPool | hr-talent.ts 只读消费入口（按 grade/skills/seat 筛选、S/A 级优先）；`picode staffing pool` 子命令（--grade/--seat/--skill，只读零写、不自动注入、非法 grade 结构化拒绝）|
| reuse_persona_ids | createStaffingRequest 显式预填（引用已存在字段，不新增配置键）；与知识文档不符以知识文档为权威并记录偏差 |
| docs:lean | scripts/doc-lean-check.mjs（零依赖只读：决策权威+关键目录 / DECISIONS 行式 / feedback 索引 / 冗余检测）+ package.json `docs:lean`（可作 merge gate 输入）|

### 25.5 docs 收尾（D118）

**D118 已定：D113-D117 落档 + D070/D071 修订标注 + catalog §25 + operations 面板节 + E19 纪要 +
--land + push。**

| 项 | 内容 |
|------|------|
| 决策落档 | D113-D118 表行+详条（来源标注到 chunk/队：W1a 观澜 / W1b 铨衡 / W2a 雁书 / W2b 砥柱）|
| 修订标注 | D070/D071 行 + 详条边界：面板契约「9 端点全 GET 只读」→「+聊天室读/写 + 审批流/变更单数据源；写仅限 sponsor chat（D114）」（2026-08-15）|
| 同步 | operations.md 监控面板节（新端点清单 + 聊天室 tab + 运维要点）；E19 纪要（flow-ui 部分占位，run-lead 合并后收尾）|
| 闭环 | `--reserve`（113-118）→ 落档 → `--land`（status=landed）；push origin main（rev-list 0）|
