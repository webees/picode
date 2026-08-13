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
|**`max_per_session` 有界正数（保守默认 5）** ★|每会话累计续跑次数上限；耗尽即停（耗尽 ≠ 成功），靠既有 idle-sleep/budgets 停靠|
|0 = 不限|关掉续跑预算闸（风险自担，须显式声明）|

**已定：保守有界默认 = 5**（R2-C2：默认 0=不限 曾使无任务席位被无界续跑烧 token，改有界；`config.ts` `self_evolve.continuation.max_per_session`）。长时自治 run 可显式调大，0 = 不限须显式声明。

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
