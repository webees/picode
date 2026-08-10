# 18 — v1 未完成项策划（调研 + 借鉴 + 落地计划）

**状态：** 策划正文（实现按阶段 DoD）  
**依赖权威：** [17-agent-runtime](./17-agent-runtime.md) · [decision-catalog](../reference/decision-catalog.md) · [PROCESSES](../PROCESSES.md) · [11-implement-playbook](./11-implement-playbook.md)  
**产品目标：** 公司岗位仿真完整；product 房；sess-mgr 调度；on 岗全 LLM（sponsor 人类）；真招聘；per-run（见 decision-catalog / DECISIONS D016–D021）。

---

## 1. 调研结论（外部设计可借鉴什么）

### 1.1 Pi 生态（直接相关）

|来源|关键设计|对 picode 的借鉴|
|------|----------|------------------|
|**Pi 本体** ([pi.dev](https://pi.dev/))|最小 harness；**无内置 sub-agent**；扩展/tmux/包自行组队|与我们一致：**编排器在 Pi 外**；Pi 只当「会思考的工位」|
|**@tintinweb/pi-subagents**|隔离会话；自有 tools/prompt/model；前台/后台；**并发上限默认 4**；可 mid-run steer；可 resume；自定义 agent type；嵌套默认关|`max_awake`；session resume；steer=注入消息；agent type=角色模板|
|**pi-messenger** (nicobailon)|**无 daemon**：共享文件夹通信；join/在线状态；claim task；**reserve files**；房间式聊天|强化我们已有 **文件 Bus + 房间**；任务 claim 可对齐 task 队列；文件预留≈ write_paths 声明|
|**社区实践** (fork + observational memory + reviewer/advisor)|主 agent 瘦上下文；fork 做探索；advisor/reviewer 干净上下文第三者视角|平台岗 **sleep 时不占上下文**；code-review / proc-audit 独立会话避免污染 engineer|

**Pi 侧不要做的事：** 不要把「公司仿真」全塞进一个 Pi 扩展里重写；保持 **orchestrator 无 LLM + 多 Pi 会话有 LLM**。

### 1.2 主流多 Agent 框架（模式层）

|模式 / 产品|要点|我们怎么用|
|-------------|------|------------|
|**Supervisor（2026 生产默认）**|中心路由 → 专家 → 汇总；子 agent 互不可见任务内输出|**`sess-mgr` = 轻量 supervisor**（只调度生命周期，不终裁业务）|
|**CrewAI Role/Goal/Backstory**|角色 + 目标 + 人设故事；Task 明确 expected output|**真招聘 persona 多维** = 强化版 Role/Goal/Backstory|
|**MetaGPT「虚拟软件公司」**|PM / Architect / Engineer 流水线角色仿真|对齐我们 **product → architecture → squad** 链路；MetaGPT 偏顺序 SOP，我们加 **封闭房间 + 门闩**|
|**LangGraph**|显式图状态、检查点、HITL|goal/task 状态机 + approvals 文件 = 检查点；sponsor 确认 = HITL|
|**Orchestrator-Worker**|中心拆任务、工人执行|orchestrator 机械拆 task；工人 = 实现三角；**不要**让 sess-mgr 又拆业务步骤（避免双脑）|
|**Swarm**|对等交接控制权|我们 **不做** 对等 swarm（易乱）；跨域用 meeting-* + run-lead 监督|

### 1.3 失败模式（调研共识 → 我们的防法）

|失败|表现|picode 对策|
|------|------|-------------|
|Supervisor 单点过载|上下文塞满、串行瓶颈|sess-mgr **只读状态 + 短决策**；业务终裁在 run-lead；max_awake 并行工人|
|上下文串味|全员共 chat|**封闭房间 + 过滤 packet**；sleep 释放会话|
|黑盒 sub-agent|不可见、难 steer|每会话独立 transcript 落盘；Bus 可审计|
|并发写冲突|多 agent 改同文件|**worktree + write_paths + 串行 merge**|
|假招聘|模板无差异|**people-qa 卡多维人设**|

---

## 2. 未完成项总表（现状 → 目标）

|ID|模块|现状|v1 目标|优先级|
|----|------|------|---------|--------|
|U1|**Session 运行时**|无 sessions 落盘|registered/sleeping/awake/terminated + API|P0|
|U2|**sess-mgr 策略引擎**|仅文档|事件→wake/sleep 表 + LLM 可选仲裁|P0|
|U3|**Pi 会话绑定**|spawn-print 手工|orchestrator 启动/停 Pi（或子进程包装）|P0|
|U4|**真招聘 staffing**|brief 有，staffing CLI 无|request→personas 多维→approve→锁|P0|
|U5|**双门闩 enforce**|主要卡 brief|prepare/spawn 同时卡 staffing|P0|
|U6|**平台岗注册**|部分 members|on 岗全注册 sleeping|P0|
|U7|**product 链路**|房/岗有|P01 强制 product 轨道产物|P1|
|U8|**progress 调度**|配置有|到期 wake squad-lead|P1|
|U9|**门禁列车**|文档有|merge.lock + 按 scale wake 门禁岗|P1|
|U10|**docs L1/L2 + knowledge**|部分目录|Memory Brief + 入库流水线|P1|
|U11|**change_order / draft park**|文档有|状态机 + 文件|P2|
|U12|**观测面板**|无|sessions 列表 / awake 数 / 房间未读|P2|

---

## 3. 目标架构（落地视图）

```text
┌─────────────────────────────────────────────────────────────┐
│ sponsor (人类)  CLI / UI  ──post──► leadership / product     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ @picode/orchestrator  (无 LLM)                              │
│  · goal/chunk/task 状态机                                    │
│  · session store (wake/sleep 机械执行)                       │
│  · token / members / worktree / merge.lock                   │
│  · 双门闩文件校验                                             │
│  · 事件总线 → 默认策略表；可选询问 sess-mgr                    │
└───────┬───────────────────────────────┬─────────────────────┘
        │ spawn / stop Pi               │ state_read
        ▼                               ▼
┌───────────────┐              ┌──────────────────────────────┐
│ Pi sessions   │◄── Bus ─────►│ RoomStore jsonl (文件通信)   │
│ (awake only)  │              │ 借鉴 pi-messenger 房间模型    │
└───────────────┘              └──────────────────────────────┘
        ▲
        │ system = agents/*.md ⊕ personas/* ⊕ brief 切片
        │
   sess-mgr / run-lead / pm / people* / docs* / squad* / gates*
```

**与 pi-subagents 的边界：**

||pi-subagents|picode|
|--|--------------|--------|
|谁决定 spawn|父 Pi 会话|**orchestrator + sess-mgr**|
|通信|父子回传为主|**封闭房间 Bus**（组织仿真）|
|文件隔离|通常同仓|**worktree + write_paths**|
|并发|扩展内队列|**max_awake + 任务队列**|

可 **可选** 用 pi-subagents 作为「单 Pi 内临时 fork」；**公司仿真主路径不依赖它**。

---

## 4. 分阶段实现计划（可执行）

### 阶段 A — Session 内核（U1/U6）· 预计 1 单元

**交付：**

1. Schema `runs/<id>/sessions/<agent_id>.yaml`  
2. API：`session.register | wake | sleep | terminate | list`  
3. init run：注册全部 on 岗（sponsor 除外）为 `sleeping`；`sess-mgr` 可先 `awake`  
4. 单测：非法迁移拒绝；sleeping 不出现在 `awake` 集合  

**会话文件最小字段：**

```yaml
schema_version: "1"
agent_id: run-lead
role_id: run-lead
state: sleeping   # registered|sleeping|awake|terminated
pi_session_id: null
last_wake_at: null
last_sleep_at: null
wake_reason: null
persona_path: null   # 平台岗可空；任务岗必填
```

**DoD：** `picode session list --run <id>` 可打印花名册；init 后 ≥ 平台岗数量条 sleeping。

---

### 阶段 B — 调度策略（U2）· 预计 1 单元

**交付：**

1. **确定性事件表**（MUST 先于 LLM）：见 17 §5.3，落配置 `sess_mgr.rules[]`  
2. `sess-mgr` 仅在「表无法决定 / 冲突 / 超 max_awake 需裁剪」时 LLM 仲裁  
3. 工具（pi-extension）：`session_wake` `session_sleep` `session_list`（经 orchestrator HTTP/本地 RPC 或文件指令队列）  
4. **文件指令队列**（无 daemon 偏好，对齐 pi-messenger 哲学）：  
   `runs/<id>/session_commands.jsonl` ← sess-mgr 写；orchestrator 轮询执行  

推荐默认：混合调度

|层|谁|何时|
|----|-----|------|
|L0 规则|orchestrator|intake 开始、双门闩齐、merge_ready、timeout|
|L1 仲裁|sess-mgr LLM|超 max_awake、多候选裁剪、异常恢复|

**DoD：** 模拟事件序列后 awake 集合符合表；max_awake=2 时不会出现 3 个 awake 实现岗。

---

### 阶段 C — Pi 进程绑定（U3）· 预计 1–2 单元

**交付：**

1. `picode session wake` 真正拉起 Pi：  
   - env：token、profile、cwd、room、persona  
   - 命令模板可配：`pi --print` / 长驻 RPC（按本机 Pi 能力）  
2. sleep = 优雅结束子进程 + 保留 transcript 路径  
3. 与 `@picode/pi-extension` 对齐；失败写入 session.error  

**借鉴 pi-subagents：** concurrency queue、resume session id、steer=向 inbox 写系统消息。

**DoD：** wake `ind-res` 后可见 Pi 进程；sleep 后进程退出且状态 sleeping。

---

### 阶段 D — 真招聘（U4/U5）· 预计 1–2 单元

**交付：**

1. CLI：  
   - `staffing request`  
   - `staffing draft-personas`（可调 recruiter 会话或模板+LLM）  
   - `staffing approve`  
2. Schema 扩展 persona **多维**（17 §6 全字段）  
3. `people-qa` 校验器（无维度 → fail T19）  
4. `prepare`/`spawn`：**brief∧staffing**  

**人设生成策略（★）：**

```text
agents/<role>.md (模板)
  + request.yaml (用工单)
  + 仓库信号 (scout 摘要可选)
  → recruiter LLM 填多维
  → people-qa 机械校验
  → people-lead 呈报
  → run-lead 批准
```

**DoD：** T16+T18+T19 自动化；无批准不可 prepare。

---

### 阶段 E — 产品与 Intake 闭环（U7）· 预计 0.5–1 单元

**交付：**

1. P01 产物：`product/brief.md` 或 `goal` 内 `product_acceptance[]`  
2. 无 pm 口径时 run-lead SHOULD 打回（可配严格度）  
3. sponsor 人类通道文档化：仅允许的 post types  

**DoD：** active 前存在产品验收口径字段。

---

### 阶段 F — 进度与门禁（U8/U9）· 预计 1 单元

**交付：**

1. progress 定时器：超时 → 规则 wake squad-lead  
2. merge 队列 + merge.lock  
3. scale 矩阵触发 code-review / sec-eng wake  

**DoD：** T11；双 task 不并行合 main。

---

### 阶段 G — 记忆与变更（U10/U11）· 预计 1 单元

**交付：** Memory Brief 路径、knowledge 候选入库、change_order、draft park  

**DoD：** playbook 阶段 8 勾选。

---

### 阶段 H — 观测（U12）· 预计 0.5 单元

**交付：** `picode status --run`：awake 列表、房间未读、门闩状态、task 进度  

---

## 5. 建议实现顺序（关键路径）

```text
A Session 内核
  → B 规则调度（可先无 LLM sess-mgr）
    → D 真招聘 + 双门闩
      → C 真 Pi 绑定
        → E 产品 intake
          → F 进度/门禁
            → G 记忆/变更
              → H 观测
```

**说明：** B 可先「纯规则 sess-mgr」跑通仿真花名册；C 再接真模型。避免一开始就调不通 Pi 卡住招聘。

---

## 6. 包级任务拆分

|包|任务|
|----|------|
|`@picode/core`|session 类型；persona schema；config `sess_mgr` 类型化|
|`@picode/bus`|可选：在线状态心跳字段；session 相关 system 消息 type|
|`@picode/orchestrator`|session CLI；规则引擎；staffing CLI；merge 队列；Pi spawn 适配器|
|`@picode/pi-extension`|session_wake/sleep 工具；state_read 扩展；禁止 sleeping 调模型（宿主保证）|
|`.picode/agents`|已有模板；按招聘输出覆盖实例|

---

## 7. 测试矩阵（在 T01–T19 上追加）

|ID|断言|
|----|------|
|T20|init 后平台岗全部 registered/sleeping（除策略要求 awake）|
|T21|sleeping agent 不产生模型调用计数|
|T22|max_awake 限制生效|
|T23|事件 intake_start 唤醒 pm+run-lead（±ind-res）|
|T24|双门闩缺一 prepare 失败|
|T25|persona 缺 mission 时 people-qa 失败|
|T26|sponsor 配置禁止 LLM profile 调用|
|T27|task dissolve 后三实例 terminated|
|T28|product 房 members 含 pm+sponsor|

---

## 8. 风险与缓解

|风险|缓解|
|------|------|
|全岗 LLM 太贵/太慢|max_awake + 规则优先 + 小模型跑 sess-mgr/people-qa|
|sess-mgr 乱杀关键岗|规则表保底；allow_orch_force_wake；proc-audit 可告警|
|Pi 版本 API 不一|spawn 适配器接口隔离；先 mock release-eng|
|招聘人设幻觉|people-qa 机械字段 + run-lead 人工批|
|与 pi-subagents 功能重叠|文档标明边界：组织仿真走 picode，临时 fork 可选扩展|

---

## 9. 成功标准（v1「仿真完整」定义）

在真实 git 仓上，**无需手改状态文件**（允许人类只做 sponsor 确认与 run-lead 关键批准）：

1. init → 花名册齐全  
2. intake（product+leadership+research）→ sponsor 确认 active  
3. P02 规划出 chunks  
4. 每 task：真招聘多维人设 + brief 双门闩  
5. 实现三角在 worktree 交付 + evidence + handoff  
6. 串行 merge 上主线  
7. Memory Brief 与可选 knowledge 条目  
8. 全程 sessions 可查询；awake 数受控  

---

## 10. 明确不做（防范围蔓延）

- 重写 Pi 内核  
- 以 CrewAI/MetaGPT 替换我们的房间/Bus（只借模式）  
- v1 多 goal program  
- 成本硬熔断  
- sponsor 的 LLM 扮演  
- 无 run-lead 的全自动 merge  

---

## 11. 下一步（实现启动令）

**状态：** 策划已确认；**实现编码由项目方负责**（本文件只作策划与验收口径）。

建议从阶段 A 开工（Session 内核 + init 注册），不阻塞于真 Pi。  
调度默认：**规则优先，sess-mgr LLM 仅仲裁**（见 §4 阶段 B）。

自我进化（dogfood 升级 picode）见 **[19-self-evolution](./19-self-evolution.md)**：须在 18 完成至 G 后再开 E1→E3。

实现时勾选：

- [x] A
- [x] B
- [x] D（可与 C 并行后半）
- [x] C
- [x] E
- [x] F
- [x] G → H
- [x] （之后）19 之 E1 → E2 → E3
