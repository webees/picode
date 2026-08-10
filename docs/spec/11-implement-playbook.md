# 11 — AI 实现手册（按序交付）

按阶段实现；每阶段有 **完成定义（DoD）**。未完成不得跳阶段。

**v1 缺口总策划（调研 + A–H 阶段 + 测试 T20+）：** [18-v1-completion-plan.md](./18-v1-completion-plan.md)  
**Agent 运行时：** [17-agent-runtime.md](./17-agent-runtime.md)

实现顺序以 **18** 的 A→H 为准；下表 T01–T19 为回归底线，T20+ 见 18 §7。

## 阶段 0 — 仓库与规范

- [ ] 创建 monorepo 或单包结构：`orchestrator/`, `bus/`, `tools/`（名可变）  
- [ ] 读取本 docs，以 08 不变量为测试用例来源  
- [ ] `schema_version: "1"` 写入所有 run 状态根  
- [ ] 配置加载器：defaults → 用户 → 项目 → profile → run（见 13）  
- [ ] `config.room_display` / `role_display` API  

**DoD**：空 run 可 `init` 出目录树；改 `display_name` 后 prompt 展示变化且逻辑 id 不变。

## 阶段 1 — 状态存储

- [ ] `state_store`：atomic write + flock  
- [ ] goal/chunk/task CRUD  
- [ ] 非法状态迁移拒绝  

**DoD**：单测覆盖 active 前不能创建 implement task。

## 阶段 2 — Bus

- [ ] token 签发与校验  
- [ ] post/history + members  
- [ ] jsonl append 锁  
- [ ] 消息 type 校验（10）  

**DoD**：非成员 post 失败；伪造 from 失败。

## 阶段 3 — Git worktree

- [x] create/remove worktree + branch  
- [x] dirty force-dissolve：auto-commit WIP 或 backup ref  
- [x] failed 回收 + prune  
- [x] merge.lock 串行 merge  

**DoD**：两 task 并行改不同 write_paths 不互相覆盖工作区。

## 阶段 4 — 工具层

- [x] 按 09 挂 tool_profile  
- [x] repo_write 写集  
- [x] run_allowlisted  
- [x] web_* 仅 research doer  
- [x] request_info / request_cross_room 状态机  
- [x] repo_glob/grep、git_status/diff/log/commit、state_read（09 矩阵 20 工具全量注册）

**DoD**：engineer 不能 web；不能写越界路径。

## 阶段 5 — Intake + 调研并行

- [ ] spawn run-lead + tpm + ind-res  
- [ ] CLI/API 模拟 **sponsor（人类）** 确认  
- [ ] plan_draft 落盘 → draft → active  

**DoD**：未 active 时 implement spawn 被拒绝；intake 有 research brief 路径。

## 阶段 6 — 人事建组 + 实现三角闭环

- [ ] **工程主责用工单 → 人事人设 → 工程主责批准 staffing**（16-hr-cell）  
- [ ] **工程主责签发 work brief** + 文档小组落盘 + 可选调研供料  
- [ ] 无 brief 或无 staffing 批准则拒绝 spawn  
- [ ] 按 staffing 的 agent_id + persona spawn 于 worktree  
- [x] progress 定时  
- [x] evidence 校验  
- [x] handoff 包 + docs/tpm ack  
- [x] dissolve  

**DoD**：无 run-lead 批准 brief 不能 spawn；无 evidence 不能 handoff；无 ack 不能 dissolve。

## 阶段 7 — 合并列车

- [ ] merge_ready 队列拓扑排序  
- [ ] `release-eng` 串行 merge + 烟测  
- [ ] 失败 revert/abort  

**DoD**：两 merge 不能并行进入 main。

## 阶段 8 — 文档小组/变更/硬化

- [ ] **文档三人小组** per-run 注册（docs-lead / tech-writer / docs-qa；sess-mgr 调度唤醒）  
- [ ] L1/L2 Memory Brief 向工程主责汇报  
- [ ] `knowledge` 房 / 仓库 knowledge 路径由文档小组写入  
- [ ] change_order  
- [ ] draft park  
- [ ] cell check_signoff  
- [ ] violations 与 proc-audit 红灯  

**DoD**：change_order 可更新进行中 task；无文档小组 check 不得关闭记忆面。

## 回归测试清单（MUST 自动化）

|ID|断言|
|----|------|
|T01|intake 禁 implement|
|T02|open_questions 非空禁 active|
|T03|bus 无 token 拒绝|
|T04|非成员 post 拒绝|
|T05|write 越界拒绝|
|T06|diff 越界禁 handoff success|
|T07|无 evidence 禁 pass 路径|
|T08|无 handoff ack 禁 dissolve|
|T09|web 非调研拒绝|
|T10|非 git 仓 init 失败|
|T11|串行 merge 锁|
|T12|force dissolve 保留 backup ref|
|T13|配置覆盖 room display_name 不影响 bus room id|
|T14|禁用核心 room 且无替代时 init 失败|
|T15|cells.templates 指向未知 role 时校验失败|
|T16|无 run-lead 批准 work brief 时 implement spawn 失败|
|T17|engineer prompt 不含未批准调研全文|
|T18|无 staffing 批准时 prepare/spawn 失败|
|T19|staffing 人设缺席位时 people-qa 应失败|
