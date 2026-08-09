# 08 — 系统不变量（全局 MUST）

实现任一模块前，先满足下列不变量。违反视为严重缺陷。

## I1 领域中立

- MUST NOT 在默认代码、默认 prompt、默认 profile 中写入具体业务领域或专项任务关键字。  
- 示例与测试数据仅用 `module-a`、`goal-001` 等抽象占位。

## I2 状态外置

- 可调度事实 MUST 存在于 `runs/<run_id>/`（或 schema 指定路径）。  
- 聊天内容 MUST NOT 作为合并、解散、active 的唯一依据。

## I3 确认前不实现

- `goal.status ∉ {active}` ⇒ MUST NOT spawn `implement|integrate` 三角。  
- intake 期间 MUST 允许调研与文档纪要。

## I4 三三制

- 激活的 cell MUST 有 lead / doer / check（可折叠但 MUST 留 `seat` 痕迹）。  
- 同一交付物上 check MUST NOT 兼任 doer（折叠时换帽留痕）。  
- 仅 `run-lead` 可对 goal→active 与 merge 终裁签名。

## I5 工作组专一与信息过滤

- 实现三角 MUST NOT 直接 `web_*`。  
- **工作提示词 / work brief MUST 由工程主责签发**；文档小组整理；调研仅供料并经工程主责删减（PROCESSES P03）。  
- 无 `brief.yaml` 中 run-lead 批准 MUST NOT spawn 实现三角。  
- 额外资料 MUST 经 `request_info` →（可选调研）→ run-lead 审阅 → docs 下发包。  
- 跨房 MUST 经 `request_cross_room` + run-lead 批准 + run-lead 监督。

## I6 Git 隔离

- 实现写 MUST 发生在 task worktree。  
- 主工作区对实现三角默认只读。  
- merge MUST 串行（`merge.lock`）。

## I7 写集

- `repo_write` 路径 MUST ∈ `write_paths`。  
- handoff/merge 前 MUST `git diff` ⊆ write_paths。

## I8 证据与交接

- command acceptance pass MUST 有 exit_code=0 与 log_ref。  
- dissolved 前 MUST 有 handoff 包 + acceptance.yaml。  
- 解散 MUST NOT 删除 evidence/handoff。

## I9 Bus 唯一发言

- 房间消息 MUST 经 bus + token。  
- MUST NOT 直写 messenger/feed 文件。

## I10 原子状态

- `runs/` 多进程写 MUST atomic rename + flock。  
- worktree **不**免除 runs/ 锁。

## I11 身份

- 每个 agent 实例 MUST 有编排器签发的 `agent_id` + `agent_token`。  
- bus/工具 MUST 校验 token。

## I12 监督收紧

- check 席 MUST NOT 写业务 write_paths（`sdet` 默认可 `run_allowlisted`，默认可无 `repo_write`）。  
- `proc-audit` / `docs-qa` / `people-qa` 默认可无业务写。

## I13 配置驱动展示与编制

- 房间名、角色名、三角 seat→role 绑定、工具画像、超时等 MUST 可从配置加载（13）。  
- 业务逻辑 MUST NOT 硬编码用户可见中文名。  
- 配置 MUST NOT 静默关闭 I1–I12（仅 `features.*` 危险开关可显式打开并告警）。

## I14 文档小组掌管记忆与知识

- MUST 存在文档三人小组（docs-lead / tech-writer / docs-qa，可折叠留痕）。  
- Run 记忆（L1/L2）与知识库运营 MUST 由文档小组负责；实现三角 MUST NOT 私自改知识库主索引。  
- 文档主责 MUST 向工程主责提供 Memory Brief（节奏见 15）。  
- 工作 brief 组装与资料下发包 MUST 经文档小组（工程主责仍为 brief 签发人）。

## I15 人事招聘实现组

- 实现三角 MUST NOT 假设全局预置固定三人；默认 **每 task 经人事部招聘**（16）。  
- 工程主责提交用工标准 → 人事做人设 → 工程主责批准 → 人事建组。  
- 无 `staffing.yaml` 中 run-lead 批准 MUST NOT spawn 实现三角。  
- 平台岗 per-run 注册；实现组默认 hire_fresh。

## I16 自我进化边界

- `goal.kind=self_evolve` 时 MUST 遵守 [19-self-evolution](./19-self-evolution.md) 之 **E1–E7**（独立 worktree、层内写集、自测门禁、不得默认削弱 I1–I15）。  
- 默认 run 为 `delivery`；MUST NOT 在未声明 `self_evolve` 时改写 platform 根。
