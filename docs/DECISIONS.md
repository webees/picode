# 决策日志（现行有效）

只记录**当前成立**的产品/架构意图。实现细节以 `spec/**`、`PROCESSES.md`、`17`/`18` 为准。

|ID|现行意图|
|----|----------|
|D001|通用多智能体编码运行时；规范与 prompt **领域中立**|
|D002|状态以 **文件**（yaml/jsonl）为准；atomic write|
|D003|**Pi 会话**承担有 LLM 角色；**orchestrator 无 LLM**|
|D004|通信走 **Bus + token + 房间 ACL**|
|D005|实现写码：**一 task 一 worktree**；**串行 merge**|
|D006|**三三制**（Lead/Doer/Check）；可配置折叠但须留痕|
|D007|**双门闩**：work brief 批准 ∧ staffing 批准 才 spawn 实现三角|
|D008|**文档小组**掌 run 记忆与 knowledge 沉淀；向 run-lead 汇报|
|D009|**人事真招聘**；实现三角按 task 新建；人设多维|
|D010|**信息申请制**；实现岗默认无裸 web；ind-res 可外网|
|D011|**跨房**须 run-lead 批准；meeting-* 有 TTL|
|D012|**成本不硬熔断**；可用 max_awake 等调度软限|
|D013|流程步骤 **仅** PROCESSES；术语 on **仅** terminology|
|D014|Agent 生命周期 **仅** 17-agent-runtime|
|D015|选项与默认 **仅** decision-catalog|
|D016|v1 目标：**公司岗位仿真完整**；含 product 房|
|D017|默认 on 岗（除 sponsor）均为 **LLM 会话**；**sess-mgr** 负责唤醒/休眠|
|D018|**sponsor 永远人类**|
|D019|平台 cell **per-run**；跨 run 只沉淀 knowledge|
|D020|调度默认：**规则优先**，sess-mgr LLM 仅仲裁冲突/裁剪|
|D021|实现编码由项目方负责；策划见 18-v1-completion-plan|
|D022|自我进化：goal.kind=self_evolve；分层 L0–L5；E1→E3 成熟度；叠加 E1–E7 门闩；权威 19-self-evolution|
|D023|init 机械注册全部平台岗为 sleeping（sponsor 不注册）；wake 决策归阶段 B 规则引擎（18 阶段 A 字面，T23 语义：intake_start 才唤醒 pm/run-lead）|
|D024|`max_awake` 由 orchestrator 机械执行软上限（MAX_AWAKE_EXCEEDED，`--force` 可绕过），与 D012 不冲突|
|D025|**人设命名 + 团队命名**：`codename`/`team_name` 确定性生成，`staffing request` 可覆盖；权威 16 §8|
|D026|**人设/团队评分**：task 结束后按文件事实（evidence/handoff/ack/retries）打 0–100 分，沉淀 scores.yaml + `docs/knowledge/hr/`；权威 16 §9|
|D027|`task_ready`/`task_dissolved` 等 squad 事件要求三角已注册（招聘后注册，阶段 D 集成）；未注册记为 not_found|
|D028|指令队列 `session_commands.jsonl` 仅接受 `from=sess-mgr`；orchestrator `session drain` 机械执行，drain 中非 sess-mgr 指令标记 error|
|D029|阶段 D：persona 以 YAML frontmatter 落 `staffing/personas/<seat>.md`（17 §6 全维度）；`draft-personas` 机械模板填充，真实 recruiter LLM 会话可覆盖同一结构|
|D030|`staffing approve` 内联 people-qa 校验（缺失席/缺维度/seat/instance_id/tool_profile/write_paths 任一不符 → 拒绝），通过后写 staffing.yaml 并注册三角 sessions|
|D031|双门闩在 `prepareTask` 机械 enforce（goal active ∧ brief approved ∧ staffing approved）；brief 已批时 `staffing approve` 联动触发 `task_ready` 唤醒三角|
|D032|阶段 C：`pi.enabled` 时 `wakeWithPi` 拉起真 Pi 进程（`pi.command_template` 可配）；spawn 失败 → 回滚 sleeping + `session.error` + `PI_SPAWN_FAILED`；`sleepWithPi` 优雅终止进程组|
|D033|Pi 适配器用模块级句柄注册表 + 进程组信号（跨 spawner 实例 stop 可靠、防 zombie）；spawn 后 250ms 快速失败检测（`waitAlive`）|
|D034|阶段 E：`goal.product_acceptance[]` + `product/brief.md`（P01 产物）；`active` 前机械校验非空（可配 `product.require_acceptance_before_active`）|
|D035|sponsor bus 通道仅 `chat`（`post_types_allow`）；确认/变更走 CLI（`goal set-status` 等），不冒充 agent 信号|
|D036|阶段 F：merge 队列 `merge_queue.jsonl` + `merge.lock` 串行；`mergeNext` 机械合并（no-ff/rebase），squad 仍 awake 时跳过（防 mid-flight 落 main）|
|D037|progress 落 `tasks/<id>/progress.json`（`progress_report` 工具写入）；`sweepProgress` 按 `task_timeout_sec` 严格超过判 stale → `progress_due` → wake squad-lead；无 daemon|
|D038|阶段 G：change_order 落 `change_orders/<id>.yaml`（proposed→applied→closed）+ leadership 通知；draft park 置 `brief.yaml.status: parked`；knowledge 入库为 `<repo>/<knowledge_root>/<task_id>.md`|
|D039|阶段 H：`picode status` 纯读快照（goal/sessions 含 awake 与 error/task 门闩/merge 队列/房间消息数），无写无 daemon|
|D040|19 实现：`goal.kind`（delivery/self_evolve）+ `target_repo` + `evolve{layers,risk,success_metrics,rollback,forbidden_paths}`；init 支持 `--kind/--target-repo/--evolve-layers/--evolve-risk`；§4 MUST：self_evolve 目标须含 platform marker（package.json name=picode）|
|D041|write_paths 生成器：`evolveWritePaths` = allowed_layers ∩ goal.layers 的层 glob（E2）；越层 repo_write 拒绝；`evolve write-paths` CLI 输出|
|D042|E 系列门禁落地：E4 `verify_commands` 在 `mergeNext` 锁内执行（失败不 merge）；E5 code 层 merge_ready 强制 wake code-review+sec-eng；E6 `knowledge/evolve/<run_id>.md`；E7 people-qa 校验 self_evolve persona 须含 `forbidden[]` 且 write_paths ⊆ 层内|
|D043|**上/下午窗口上下文压缩**：一天按 `windows.split_hour`（默认 12）分两窗；`picode window compress` 对每个房间 bus 把**旧窗口**最老 `1 - ratio`（默认 20%）折叠为 `window_rollup` 摘要（原文归档 `bus/archive/<room>.<window>.jsonl`），保留最近 `ratio`（默认 80%）原文；当前窗口不折叠；结果写 run 级 `windows/<window>.yaml` 供会话/记忆引用；`picode window status` 只读快照|
|D044|**opencode 作为 LLM 后端**：配置 `opencode.enabled + base_url` 时，`session wake` 不再走 pi 命令模板，而是经 `opencode serve` 的 HTTP API（`POST /session` + `POST /session/{id}/message`）建真实会话（`pi_session_id` 记 `oc-<id>`）；`session sleep` 调 `DELETE /session/{id}` 关闭。provider/model 可空（用服务端默认模型，实测 opencode-go/big-pickle）。spawn 失败回滚 sleeping + 记 error（同 wakeWithPi 契约）|
|D045|**merge 拓扑排序 + 失败 abort**（11 阶段 7）：`mergeNext` 按 `chunks.yaml` 的 `depends_on` 拓扑选队（依赖任务的 merge 未 landed 时跳过，`skipped_due_to_deps`）；merge 失败执行 `git merge --abort` 恢复工作区，不留冲突态|
|D046|**init 注册全部静态默认 on 房 members**（terminology §3）：补 `architecture`（scout/sys-arch post）、`knowledge`（docs 三角 post，15 定义）、`release`/`quality`/`security`（门禁岗 post）；`announce`/`collab` 为动态房，按需注册（同 `squad-*`/`meeting-*`）|
|D047|**bus 消息全局 type 注册表校验**（10 §1/§2）：`post` 拒绝未登记 type（`BUS_TYPE_DENIED`）；新 type 须先登记 spec 10 再使用|
|D048|修复 `withFileLock` 吞掉临界区内异常的错误（I10 相关）：获取锁失败与 fn 异常分离重试（原误编为 D025 之二，重编号）|
|D049|阶段 B：默认规则表按 17 §5.3 落 `sess_mgr.rules[]`；L0 机械执行，幂等（已达标跳过）；LLM 仲裁留接口（原误编为 D026 之二，重编号）|
|D050|**错误码统一注册表**（质量重构）：`packages/core` 的 `ErrorCode` + `PicodeError`（含 `formatPicodeError`）；bus/orchestrator/pi-extension 全部错误码收敛为常量；CLI 统一 `[picode] ERROR: <CODE>: <msg>`；config 校验错误统一 `CONFIG_INVALID`（文案不变）|
|D051|**时钟依赖测试修复**（测试可信）：`windowStatus` 增可选 `now` 参数（默认真实时钟，行为不变）；bus 窗口测试固定消息 ts，不再依赖机器日期|
|D052|**SessionStore.register 无锁审计结论**（I10/A4）：`register` 为 check-then-write 无 flock；因同 agentId 记录内容确定性 + writeAtomic 原子替换，并发重复注册为良性 last-wins，无撕裂状态；跨进程重复注册由调用方（init/CLI）保证单次。transition/attachPiSession/setError 均持锁串行，已加并发测试|
|D053|**文档↔实现偏差记录**（不改 spec 正文）：(1) 18 阶段 A 内联会话样例无 `error` 字段，实现与 `reference/schemas/session.yaml` 均含——以 schema 样例为准；(2) 13 §5 `hr.default_mode` vs 实现键 `staffing.mode=real_recruit`；(3) 13 §7 `prompts.root` vs 实现键 `paths.prompts_root`；(4) 13 未列 `product.require_acceptance_before_active`（见 D034）。实现键全部以 `PicodeConfig` 类型为准|
|D054|**命名律复核结论**（glossary §0）：R1（role∩room=∅）与 id 字符集（`^[a-z][a-z0-9-]*$`，因 id 用作文件名）机械强制；R2–R7 为新增 ID 的约定（前缀/后缀/四字），机械全量强制会产生误报，不加入校验器|
|D055|**死配置键标记**（质量重构）：以下键按 13/17/19 声明于 `PicodeConfig` 与默认值，但实现零读取——保留以维持配置面兼容并在类型注释中标 `Reserved (D055)`：`sess_mgr.enabled/idle_sleep_sec/allow_orch_force_wake`、`paths.skills_root/prompts_root`、`git.rebase_on_merge/merge_serial/force_dissolve_autocommit`、`scheduler.max_parallel_triads`、`timeouts.progress_interval_sec/cross_room_ttl_sec`、`models.*`、`info_pipeline.*`、`cross_room.*`、`work_brief.seat_slicing/require_docs_assemble/allow_research_attach`、`features` 四键（除 `allow_implement_before_active`）、`bus.adapter`、`i18n.locale`、`self_evolve.enabled/require_sponsor_merge/knowledge_log_glob`；override 后统一 validateConfig 已防降级（D3 测试）|
|D056|**CLI 流程清晰化**（方向 E）：命令注册表驱动 `picode --help` 按域分组（run/goal/session/staffing/task/merge/memory/evolve/window/status）；每命令 `--help` 显示 usage；缺失参数/未知命令抛 `USAGE` 码并附「下一步」提示；全部错误统一 `[picode] ERROR: <CODE>: <msg>`；文档地图与 GETTING_STARTED 补全新命令域（E4）|
|D057|**真 LLM 闭环验证修复**（验收测试发现）：(1) `loader.ts` 补 13 §2 第 2 层「用户全局 ~/.picode/config.yaml」（原实现缺失），业务仓免配 LLM 后端；(2) 新增统一会话入口 `wakeAgent/sleepAgent/terminateAgent`，CLI 与规则引擎（applyEvent/drain/staffing/closure）共用——opencode/pi 配置下规则引擎 wake 真实建会话（原为纯状态机，导致「已 awake 无法补 spawn」死角），默认配置行为不变；(3) `npm test` 隔离 HOME（mktemp），单元测试不再受用户全局配置污染；(4) 新增 `npm run test:e2e`（scripts/e2e/smoke.sh + docs/guides/e2e-smoke.md）：临时仓完整交付闭环 + 真实 LLM 会话 + 串行 merge 合入 main|
|D058|**opencode serve v1.18 API 契约实测**（E2E 专用测试 key 验证）：(1) `POST /session` 仅接受 `{parentID?, title?}`——provider/model/system/tools 均不在会话级，多余字段被忽略；(2) 模型在**消息级**指定：`POST /session/{id}/message` body `{model: {providerID, modelID}, parts: [{type:"text",text}]}`，`model` 必须是对象（纯字符串或 `p/id` 格式均 400），不带则回退 serve 默认模型（本机 `gpt-5.6-luna` → 区域 403）；(3) 响应为单条 JSON `{info, parts}` 而非 SSE；(4) picode 适配器（D044）契约正确无需改，`smoke.sh` 第 7 步已补 model 对象并强化断言（上游错误/空响应即失败）；(5) E2E 偶发唤醒失败（三角 2/3）：applyEvent 的 wake 失败仅置 `result.rejected` 不抛、approve 不感知——smoke.sh 断言三角会话 `error` 字段兜底，产品行为暂不改（留观察）|
|D059|**唤醒失败可见化落地**（D058-5 实施，依据业界「fire-and-forget ≠ fire-and-ignore，失败必须可观测」）：`approveStaffing` 返回新增 `wokeErrors: [{agent_id, reason}]`（取 applyEvent 中 outcome=rejected 的 wake）；CLI `staffing approve` 输出含该字段，非空时 stderr 打 `[picode] WARN: 唤醒失败 <agent>: <reason>（可稍后 session wake 重试）`。事件引擎语义不变（尽力而为、不抛）；新增 2 个单测（max_awake=0 全拒断言 / 正常空数组断言）|
|D060|**11 playbook 勾选滞后核实**（不改 spec 正文）：29 项未勾选中 27 项已实现且有测试守护（逐项 grep 验证：loader 5 层 / atomic+flock / ACL / token / 消息 type / 双门闩 / merge 拓扑与 abort / 文档三人小组 / Memory Brief / change_order / draft park）；2 项未实现——cell check_signoff 文件格式与 violations/proc-audit 红灯，属 O006 开放项（spec 10 仅定义消息 type，`check_signoff` type 已注册于 bus；文件/流程格式留待 spec 细化，实现按保守默认未做）。11 playbook 勾选属实现追踪而非规范正文，补勾建议由 spec 维护方统一处理|
|D061|**opencode spawn 改为 noReply 异步**（dogfood E2E 发现）：build agent 收到「就绪」消息后自主行动（探索仓库/跑工具），spawn 同步等待模型回复导致 120s 超时、approve 卡死（实测 180s+ 超时 2/3 唤醒失败）；`spawn()` 的 ready message 加 `noReply: true`（serve 原生参数，消息异步入队、agent 自行处理），spawn 秒回（实测 approve 0.152s、wokeErrors 空）。新增 3 单测（mock fetch 断言 noReply/model 对象/spawn 快速返回）|
|D062|**dogfood 实测发现**（克隆仓 /tmp/picode-dogfood，deepseek-v4-flash 真实闭环）：(1) 模型产出 2 处低风险重构——`globToRegExp` 转义提取 `escapeRegExp`（233f431）+ `GLOB_ESCAPE_RE` 常量与 `pickFromPool`（5ad44c7），行为不变、195 测试全绿、已合并入克隆仓 main；(2) **E4 merge gate 缺陷**：`verify_commands`（npm test）在 merge 时执行但未先 build——TS 项目可能测旧 dist，本次以 merge 后手动 build+test 兜底，建议 gate 改为 `npm run build && npm test`（未改行为）；(3) **agent cwd 偏差**：opencode 会话 cwd = 会话目录（克隆仓根）而非 worktree，模型把第二处改动写进了克隆仓根 working tree 导致 merge 冲突——建议任务 prompt 明确 cd worktree，或 spawn 时把会话 directory 指向 worktree（改进建议，未改行为）|
|D064|**picode 提供 MCP 服务器（stdio · 全量工具面）**：新增 `@picode/mcp-server`——编排面（~36 工具，直接包装 orchestrator store 函数，门闩/锁/不变量全保留）+ 执行面（pi-extension 20 工具 1:1，ACL 六层全保留：profile+token+房间+路径+state 白名单+allowlist 边界）。传输 stdio（`PICODE_REPO` 指定仓库）；执行面逐调用注入 env + 重捕获工具表（与 harness/opencode 插件同款模式），token 由服务器代签（`issueToken` + run secret.txt/dev-secret 兜底），transport 参数 `_` 前缀与工具参数分离。副作用工具（session_wake/sleep/terminate、task_prepare、merge_process、task_dissolve）在描述中显式标注。HTTP/SSE 传输与 resources 留待后续|
|D065|**sponsor 信息投喂入口（intake）**：sponsor 任意时刻投喂（一条信息/想法/链接/文档），状态机 `add → triage → close`；落盘 `runs/<id>/intake/feed-*.yaml`（from=sponsor/ts/type/body）；分诊由 run-lead 会话决策或规则按 type 转对应角色（需求→product/run-lead；研究→ind-res；文档→docs cell；问题→run-lead 拆卡）；分发走 bus 通知 + 唤醒；处理结果回执 sponsor|
|D066|**会话续跑机制（continuation）**：对「已 awake ∧ 无 error ∧ 任务未终态 ∧ 预算未耗尽 ∧ 空闲超 `idle_sec`」的 opencode 会话，guardian 机械层按 D061 noReply 语义投喂**固定续跑 prompt**（复用 ready 消息角色/任务上下文 + 固定「继续推进或报告完成」模板）；预算 `self_evolve.continuation.max_per_session`（0=不限，保守默认）+ 每会话 `budget.continuations` 计数持久化（文件真相，D002），耗尽即停，靠既有 idle-sleep/budgets 停靠；断连经 P1 恢复重投喂 ready 后从持久化计数续发（不重算不超发）。**边界：不引入 daemon（N4 缓）、不 LLM 生成续跑指令（N7 缓）**；语义续跑（transcript 摘要注入）列第二轮|

## 开放

|ID|项|
|----|-----|
|O001|多 goal / program 级|
|O004|可选 pi-subagents 临时 fork（非主路径）|
|O005|self_evolve write_paths 生成器与 verify_commands 接入|
|O006|cell `check_signoff` 与 `violations`/proc-audit 红灯：spec 10 仅定义 type，无文件/流程格式；proc-audit 的 `drift`/`alert` bus 通道已就绪（成员表 `post_types_allow`），红灯记录文件留待 spec 细化|

## D063 — error.report / error.digest 消息类型（T2 越权改 spec 处置）
- 2026-08-11 · 来源：T2 插件权限分类任务（模型越权直接改 spec 登记 bus 消息类型）
- 决定：回退 spec 改动；消息类型决策记本条目；错误收集机制（docs/errors/ + bus error.report/error.digest）自本决策生效
- 纪律强化：spec 正文变更必须经 DECISIONS 门禁；正确内容放进错误通道仍是流程事故（run-lead 裁决）

## D064 — picode 提供 MCP 服务器（stdio · 全量工具面）
- 2026-08-12 · 来源：甲方「先做成 MCP，再让 picode 自己优化自己」指令
- 决定：新增 `@picode/mcp-server` 包，stdio 传输，暴露 56 个工具：
  - **编排面（36）**：init_run/board_view/run_status/goal_*/chunk_add/brief_*/staffing_*/task_prepare/task_dissolve/session_*/evidence_submit/handoff_*/merge_*/memory_brief_*/change_order_create/knowledge_ingest/evolve_*/self_drive_*/progress_sweep——直接包装 orchestrator store 函数，双门闩/锁/不变量原样生效
  - **执行面（20）**：pi-extension 工具 1:1（bus_*/repo_*/git_*/run_allowlisted/web_*/request_*/progress_report/state_read/session_*），ACL 六层全保留；transport 参数 `_` 前缀与工具参数分离；token 服务器代签（`issueToken` + run secret.txt，dev-secret 兜底）；逐调用注入 env + 重捕获（与 harness/opencode 插件同款）
  - 命名冲突处置：编排面直接控制版更名 `session_wake_direct`/`session_sleep_direct`/`session_roster`，执行面保留 09 矩阵规范名
- 身份语义：MCP 服务器 = 可信本地进程（同 orchestrator CLI）；执行面按调用方 `_agent_id` 走 token/房间/画像判定，sponsor 永远人类不变
- 自优化衔接：MCP 客户端可作为「受管工位」驱动 self_evolve run（spec 19 第 3 章扩展），E1–E7 门闩与 sponsor 合入闸门不变

## D066 — 会话续跑机制（continuation）
- 2026-08-13 · 来源：run-lead 自治规划 run-2026-08-13T01-15-17-073Z（N1–N7 决策清单）
- 问题：会话完成单回合后停住（23-36-04 run 实测 tokens 12 分钟零增长），guardian 只机械推进状态机事件，从不向已 awake 的 opencode 会话投喂新消息
- 决定：新增机械层 continuation——guardian tick 内派生候选 `{agent_id, session_id}`（`deriveContinuationTargets` 纯函数，读 session/transcript/task）+ 按 D061 noReply 语义投喂固定续跑 prompt（`feedContinuation`：POST /message + 转录 + 计数）
- 候选判据：已 awake ∧ 无 error ∧ 任务未终态 ∧ 预算未耗尽 ∧ 空闲超 `idle_sec`
- 预算（N2）：`self_evolve.continuation.max_per_session`（0=不限，保守默认）+ 每会话 `budget.continuations` 计数持久化于 session.yaml（文件真相 D002）；耗尽即停，靠既有 idle-sleep/budgets 停靠；耗尽 ≠ 成功
- 恢复（N3）：serve 重启 → P1 恢复重投喂 ready → 清 error → 续跑 sweep 从持久化计数续发，不重算不超发（幂等）
- 边界：**不引入 daemon/常驻进程**（N4 缓，sys-arch「无 daemon、状态文件化」不变量，以周期性 sweep + probeServeHealth 心跳重附替代）；**不 LLM 生成续跑指令**（N7 缓，编排器无 LLM 不变量，固定模板 + 现有任务上下文，agent 依人设与任务文件自判）
- 缓项：N5 会话 checkpoint 快照、N6 maxTokens 计量（上游无 token 契约，D058）、N7 语义续跑（transcript 摘要注入）均列第二轮
