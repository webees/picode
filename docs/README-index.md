# docs/ 目录索引

本文逐条记录 `docs/` 下每个文件的一句话用途（按真实内容整理）。
文档分类与权威优先级见 [AUTHORITY.md](./AUTHORITY.md)；地图见 [README.md](./README.md)。

---

## 根目录

|文件|一句话用途|
|------|----------|
|[README.md](./README.md)|docs 文档地图：按「从这里开始 / A–F 分类 / 按任务查阅」指引读者定位文档|
|[AUTHORITY.md](./AUTHORITY.md)|定义文档分类（A 权威 / B 规范 / C 领域 / D 参考 / E 入口 / F 追溯）、冲突优先级、规范用语与修订入口|
|[PROCESSES.md](./PROCESSES.md)|全部业务流程 P01–P15 与双门闩/状态速查的**唯一权威正文**（改流程只改本文）|
|[DECISIONS.md](./DECISIONS.md)|现行有效决策日志 D001–D060 与开放项 O001–O006（每行一条决策意图，不写步骤）|
|[ARCHITECTURE.md](./ARCHITECTURE.md)|picode 系统一页架构：定位、逻辑架构图、包职责与「往哪读」导引|
|[GETTING_STARTED.md](./GETTING_STARTED.md)|快速开始：安装、init→双门闩→spawn→运维的 CLI 命令流与规范索引|

## domains/（领域）

|文件|一句话用途|
|------|----------|
|[bus-system.md](./domains/bus-system.md)|Bus 通信领域：分层、token 身份、房间成员、jsonl 存储与上/下午窗口压缩|
|[git-worktree.md](./domains/git-worktree.md)|Git worktree 与合并领域：布局、生命周期、并发边界与失败回收|
|[information-control.md](./domains/information-control.md)|信息控制领域：工作组信息进入的合法路径、申请/下发与跨房监督（防串台防幻觉）|
|[tool-system.md](./domains/tool-system.md)|工具系统领域：默认拒绝、三层写安全、关键权限限制与错误码|

## guides/（指南）

|文件|一句话用途|
|------|----------|
|[README.md](./guides/README.md)|指南目录：指向上手主入口 GETTING_STARTED 与本目录两份指南|
|[pi-quickstart.md](./guides/pi-quickstart.md)|Pi 最短开发路径：组件 30 秒速览与 init 一条龙命令|
|[e2e-smoke.md](./guides/e2e-smoke.md)|E2E 冒烟（`npm run test:e2e`）使用指南：真实 LLM 闭环、opencode serve 前置与覆盖链路|
|[implement-prompt.md](./guides/implement-prompt.md)|委派给任意 coding agent 的实现任务提示词：按 spec 18 A→H 阶段推进 v1 完成|

## reference/（参考）

|文件|一句话用途|
|------|----------|
|[glossary.md](./reference/glossary.md)|命名律（R1–R7 强制）+ 岗位全量目录 + 分层/分组/默认启用一览|
|[decision-catalog.md](./reference/decision-catalog.md)|产品与运行时决策目录：选项 + ★当前默认（改默认须同步 DECISIONS 与权威正文）|
|[default-config.example.yaml](./reference/default-config.example.yaml)|默认配置摘录（与 `packages/core` DEFAULTS 保持同步，非运行源）|
|[schemas/README.md](./reference/schemas/README.md)|Schemas 索引：各 YAML 形状样例的一览表与用途说明|

### reference/schemas/（落盘文件形状样例）

|文件|一句话用途|
|------|----------|
|[bus-envelope.yaml](./reference/schemas/bus-envelope.yaml)|Bus 消息信封单行样例（ts/id/from/room/type/body/refs/meta）|
|[cell.yaml](./reference/schemas/cell.yaml)|cell（三三制小组）登记条目样例（lead/doer/check 与 check_signoff）|
|[change-order.yaml](./reference/schemas/change-order.yaml)|Active 后需求变更单样例（affects_chunks/tasks、new_acceptance、user_ack_at）|
|[chunks.yaml](./reference/schemas/chunks.yaml)|chunk 分块表样例（write/read_paths、depends_on、acceptance、状态机）|
|[config.yaml](./reference/schemas/config.yaml)|项目 `.picode/config.yaml` 配置形状样例（rooms/roles/cells/git 等）|
|[evidence-pass.yaml](./reference/schemas/evidence-pass.yaml)|测试证据通过文件样例（命令 exit_code=0 + log_ref，sdet 署名）|
|[goal.yaml](./reference/schemas/goal.yaml)|goal 目标文件样例（status/scale/acceptance/open_questions/user_confirmed_at）|
|[handoff-acceptance.yaml](./reference/schemas/handoff-acceptance.yaml)|交接验收文件样例（accepted_by/accepted_at；无此文件不得 dissolved）|
|[members.yaml](./reference/schemas/members.yaml)|房间成员表样例（access post/read 及可选 post_types_allow）|
|[progress.yaml](./reference/schemas/progress.yaml)|进度汇报消息样例（phase/head_sha/blocked/at_risk，squad-lead 定时上报）|
|[request-info.yaml](./reference/schemas/request-info.yaml)|资料申请记录样例（need/requires_web/run_lead_decision/packet_path）|
|[run-root.yaml](./reference/schemas/run-root.yaml)|run 根元数据样例（run_id/status/halt/配置快照）|
|[session.yaml](./reference/schemas/session.yaml)|会话花名册条目样例（registered/sleeping/awake/terminated、pi_session_id、persona_path）|
|[staffing-request.yaml](./reference/schemas/staffing-request.yaml)|工程主责用工单样例（skills_wanted/constraints/reuse_persona_ids）|
|[staffing.yaml](./reference/schemas/staffing.yaml)|编制锁定文件样例（批准后的三角绑定：agent_id/tool_profile/persona_file）|
|[task.yaml](./reference/schemas/task.yaml)|task 任务文件样例（kind/status/write_paths/acceptance/triad/work_room）|
|[triad.yaml](./reference/schemas/triad.yaml)|实现三角绑定样例（worktree/branch/各 seat 的 agent_id 与 token）|
|[work-brief.yaml](./reference/schemas/work-brief.yaml)|工作简报元数据样例（作者链/objective/写读集/must_read_refs/席位侧重）|

## spec/（规范）

|文件|一句话用途|
|------|----------|
|[00-product.md](./spec/00-product.md)|产品定位：定义、非目标、技术基线与核心组织原则|
|[01-runtime.md](./spec/01-runtime.md)|运行时契约：目录布局、goal/chunk/task/triad 状态机与主循环|
|[02-organization.md](./spec/02-organization.md)|组织：三三制 MUST 规则、cell 登记、封闭房间规则与身份实例化|
|[03-workflows.md](./spec/03-workflows.md)|工作流纯索引：P01–P16 → PROCESSES.md（不展开步骤正文）|
|[04-enforcement.md](./spec/04-enforcement.md)|强制层：Bus post 校验、写集、evidence、交接、合并门禁等 MUST 机械执行点|
|[05-scaling-mvp.md](./spec/05-scaling-mvp.md)|规模缩放与 MVP：S/M/L 判据、子系统开关矩阵与 MVP 切片|
|[06-platform-tech.md](./spec/06-platform-tech.md)|平台技术选型摘要 → domains/（worktree/Bus/写集/进度等结论表）|
|[07-hardening.md](./spec/07-hardening.md)|硬化规范索引 → domains / 04 / 08（工具、Bus、信息、跨房、Git 强制摘要）|
|[08-invariants.md](./spec/08-invariants.md)|系统不变量 I1–I16：全局 MUST，实现任何模块前先满足|
|[09-tool-profiles.md](./spec/09-tool-profiles.md)|工具画像矩阵：默认 on 岗的允许/禁止工具表（Y/L/W/G 图例）|
|[10-bus-messages.md](./spec/10-bus-messages.md)|Bus 消息 type 目录：公共信封与 chat/progress/handoff_* 等类型一览|
|[11-implement-playbook.md](./spec/11-implement-playbook.md)|AI 实现手册：阶段 0–8（含 DoD）与回归测试 T01–T19|
|[12-threat-model.md](./spec/12-threat-model.md)|威胁模型与控制：资产、威胁→控制映射与秘密路径默认排除|
|[13-configuration.md](./spec/13-configuration.md)|配置体系：分层覆盖、可配置范围总表、窗口压缩/LLM 后端等配置项|
|[14-pi-development.md](./spec/14-pi-development.md)|基于 Pi 生态的开发手册：仓库布局、双进程模型、角色文件与最小命令流|
|[15-docs-cell.md](./spec/15-docs-cell.md)|文档小组编制**正文**：记忆/知识/下发/汇报职责、房间与 scale 要求|
|[16-hr-cell.md](./spec/16-hr-cell.md)|人事部编制**正文**：按任务招聘流程、人设、命名（codename/team_name）与评分|
|[17-agent-runtime.md](./spec/17-agent-runtime.md)|Agent 运行时**唯一权威**：会话状态机、sess-mgr 调度策略、人设多维与配置键|
|[18-v1-completion-plan.md](./spec/18-v1-completion-plan.md)|v1 未完成项策划：调研结论、U1–U12 差距、阶段 A–H 实现计划与 T20–T28 测试|
|[19-self-evolution.md](./spec/19-self-evolution.md)|自我进化**唯一权威**：分层 L0–L5、E1–E7 门闩、成熟度 E0–E4 与准备清单|

## standards/（标准）

|文件|一句话用途|
|------|----------|
|[terminology.md](./standards/terminology.md)|运行时术语**唯一正文**：默认 on 的岗位/房间、编制、流程产物名与易分对|
|[doc-style.md](./standards/doc-style.md)|文档风格与维护规范：单点权威、文件放置、写法与索引文件约定|
