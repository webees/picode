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
| D023 | init 机械注册全部平台岗为 sleeping（sponsor 不注册）；wake 决策归阶段 B 规则引擎（18 阶段 A 字面，T23 语义：intake_start 才唤醒 pm/run-lead） |
| D024 | `max_awake` 由 orchestrator 机械执行软上限（MAX_AWAKE_EXCEEDED，`--force` 可绕过），与 D012 不冲突 |
| D025 | 修复 `withFileLock` 吞掉临界区内异常的错误（I10 相关）：获取锁失败与 fn 异常分离重试 |
| D026 | 阶段 B：默认规则表按 17 §5.3 落 `sess_mgr.rules[]`；L0 机械执行，幂等（已达标跳过）；LLM 仲裁留接口 |
| D027 | `task_ready`/`task_dissolved` 等 squad 事件要求三角已注册（招聘后注册，阶段 D 集成）；未注册记为 not_found |
| D028 | 指令队列 `session_commands.jsonl` 仅接受 `from=sess-mgr`；orchestrator `session drain` 机械执行，drain 中非 sess-mgr 指令标记 error |
| D029 | 阶段 D：persona 以 YAML frontmatter 落 `staffing/personas/<seat>.md`（17 §6 全维度）；`draft-personas` 机械模板填充，真实 recruiter LLM 会话可覆盖同一结构 |
| D030 | `staffing approve` 内联 people-qa 校验（缺失席/缺维度/seat/instance_id/tool_profile/write_paths 任一不符 → 拒绝），通过后写 staffing.yaml 并注册三角 sessions |
| D031 | 双门闩在 `prepareTask` 机械 enforce（goal active ∧ brief approved ∧ staffing approved）；brief 已批时 `staffing approve` 联动触发 `task_ready` 唤醒三角 |
| D032 | 阶段 C：`pi.enabled` 时 `wakeWithPi` 拉起真 Pi 进程（`pi.command_template` 可配）；spawn 失败 → 回滚 sleeping + `session.error` + `PI_SPAWN_FAILED`；`sleepWithPi` 优雅终止进程组 |
| D033 | Pi 适配器用模块级句柄注册表 + 进程组信号（跨 spawner 实例 stop 可靠、防 zombie）；spawn 后 250ms 快速失败检测（`waitAlive`） |
| D034 | 阶段 E：`goal.product_acceptance[]` + `product/brief.md`（P01 产物）；`active` 前机械校验非空（可配 `product.require_acceptance_before_active`） |
| D035 | sponsor bus 通道仅 `chat`（`post_types_allow`）；确认/变更走 CLI（`goal set-status` 等），不冒充 agent 信号 |
| D036 | 阶段 F：merge 队列 `merge_queue.jsonl` + `merge.lock` 串行；`mergeNext` 机械合并（no-ff/rebase），squad 仍 awake 时跳过（防 mid-flight 落 main） |
| D037 | progress 落 `tasks/<id>/progress.json`（`progress_report` 工具写入）；`sweepProgress` 按 `task_timeout_sec` 严格超过判 stale → `progress_due` → wake squad-lead；无 daemon |
| D038 | 阶段 G：change_order 落 `change_orders/<id>.yaml`（proposed→applied→closed）+ leadership 通知；draft park 置 `brief.yaml.status: parked`；knowledge 入库为 `<repo>/<knowledge_root>/<task_id>.md` |
| D039 | 阶段 H：`picode status` 纯读快照（goal/sessions 含 awake 与 error/task 门闩/merge 队列/房间消息数），无写无 daemon |

## 开放

| ID | 项 |
|----|-----|
| O001 | 多 goal / program 级 |
| O004 | 可选 pi-subagents 临时 fork（非主路径） |
| O005 | self_evolve write_paths 生成器与 verify_commands 接入 |
