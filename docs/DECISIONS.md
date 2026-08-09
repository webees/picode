# 决策日志（现行有效）

只记录**当前成立**的产品/架构意图。实现细节以 `spec/**`、`PROCESSES.md`、`17`/`18` 为准。

| ID | 现行意图 |
|----|----------|
| D001 | 通用多智能体编码运行时；规范与 prompt **领域中立** |
| D002 | 状态以 **文件**（yaml/jsonl）为准；atomic write |
| D003 | **Pi 会话**承担有 LLM 角色；**orchestrator 无 LLM** |
| D004 | 通信走 **Bus + token + 房间 ACL** |
| D005 | 实现写码：**一 task 一 worktree**；**串行 merge** |
| D006 | **三三制**（Lead/Doer/Check）；可配置折叠但须留痕 |
| D007 | **双门闩**：work brief 批准 ∧ staffing 批准 才 spawn 实现三角 |
| D008 | **文档小组**掌 run 记忆与 knowledge 沉淀；向 run-lead 汇报 |
| D009 | **人事真招聘**；实现三角按 task 新建；人设多维 |
| D010 | **信息申请制**；实现岗默认无裸 web；ind-res 可外网 |
| D011 | **跨房**须 run-lead 批准；meeting-* 有 TTL |
| D012 | **成本不硬熔断**；可用 max_awake 等调度软限 |
| D013 | 流程步骤 **仅** PROCESSES；术语 on **仅** terminology |
| D014 | Agent 生命周期 **仅** 17-agent-runtime |
| D015 | 选项与默认 **仅** decision-catalog |
| D016 | v1 目标：**公司岗位仿真完整**；含 product 房 |
| D017 | 默认 on 岗（除 sponsor）均为 **LLM 会话**；**sess-mgr** 负责唤醒/休眠 |
| D018 | **sponsor 永远人类** |
| D019 | 平台 cell **per-run**；跨 run 只沉淀 knowledge |
| D020 | 调度默认：**规则优先**，sess-mgr LLM 仅仲裁冲突/裁剪 |
| D021 | 实现编码由项目方负责；策划见 18-v1-completion-plan |
| D022 | 自我进化：goal.kind=self_evolve；分层 L0–L5；E1→E3 成熟度；叠加 E1–E7 门闩；权威 19-self-evolution |

## 开放

| ID | 项 |
|----|-----|
| O001 | 多 goal / program 级 |
| O002 | session wake/sleep 与 Pi 绑定实现 |
| O003 | staffing CLI 与 persona schema 实现 |
| O004 | 可选 pi-subagents 临时 fork（非主路径） |
| O005 | self_evolve write_paths 生成器与 verify_commands 接入 |
