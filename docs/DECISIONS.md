# 决策日志（现行有效）

> 决策编号由机器状态 `docs/decisions/watermark.yaml` 全局分配（`node docs/decisions/reserve.mjs`），**勿手改**该文件；新决策须先 `--reserve --run <run-id> --count N` 领取编号段，落地后 `--land` 标记占用。

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
|D044|**opencode 作为 LLM 后端**：配置 `opencode.enabled + base_url` 时，`session wake` 不再走 pi 命令模板，而是经 `opencode serve` 的 HTTP API（`POST /session` + `POST /session/{id}/message`）建真实会话（`pi_session_id` 记 `oc-<id>`）；`session sleep` 调 `DELETE /session/{id}` 关闭。provider/model 可空（用服务端默认模型，实测 opencode-go/big-pickle）。spawn 失败回滚 sleeping + 记 error（同 wakeWithPi 契约）**（D109 修订标注：I2 起 sleep 改保留/归档替代 DELETE——会话保留、`pi_session_id` 不销毁，wake resume 优先；terminate 仍 DELETE，终态销毁语义不变）**|
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
|D055|**死配置键标记**（质量重构）：以下键按 13/17/19 声明于 `PicodeConfig` 与默认值，但实现零读取——保留以维持配置面兼容并在类型注释中标 `Reserved (D055)`：`sess_mgr.enabled/idle_sleep_sec/allow_orch_force_wake`、`paths.prompts_root`、`git.rebase_on_merge/merge_serial/force_dissolve_autocommit`、`scheduler.max_parallel_triads`、`timeouts.progress_interval_sec/cross_room_ttl_sec`、`models.*`、`info_pipeline.*`、`cross_room.*`、`work_brief.seat_slicing/require_docs_assemble/allow_research_attach`、`features` 四键（除 `allow_implement_before_active`）、`bus.adapter`、`i18n.locale`、`self_evolve.enabled/require_sponsor_merge/knowledge_log_glob`；override 后统一 validateConfig 已防降级（D3 测试）——`paths.skills_root` 已于 D084 激活移除本标记，其余死键不动|
|D056|**CLI 流程清晰化**（方向 E）：命令注册表驱动 `picode --help` 按域分组（run/goal/session/staffing/task/merge/memory/evolve/window/status）；每命令 `--help` 显示 usage；缺失参数/未知命令抛 `USAGE` 码并附「下一步」提示；全部错误统一 `[picode] ERROR: <CODE>: <msg>`；文档地图与 GETTING_STARTED 补全新命令域（E4）|
|D057|**真 LLM 闭环验证修复**（验收测试发现）：(1) `loader.ts` 补 13 §2 第 2 层「用户全局 ~/.picode/config.yaml」（原实现缺失），业务仓免配 LLM 后端；(2) 新增统一会话入口 `wakeAgent/sleepAgent/terminateAgent`，CLI 与规则引擎（applyEvent/drain/staffing/closure）共用——opencode/pi 配置下规则引擎 wake 真实建会话（原为纯状态机，导致「已 awake 无法补 spawn」死角），默认配置行为不变；(3) `npm test` 隔离 HOME（mktemp），单元测试不再受用户全局配置污染；(4) 新增 `npm run test:e2e`（scripts/e2e/smoke.sh + docs/guides/e2e-smoke.md）：临时仓完整交付闭环 + 真实 LLM 会话 + 串行 merge 合入 main|
|D058|**opencode serve v1.18 API 契约实测**（E2E 专用测试 key 验证）：(1) `POST /session` 仅接受 `{parentID?, title?}`——provider/model/system/tools 均不在会话级，多余字段被忽略；(2) 模型在**消息级**指定：`POST /session/{id}/message` body `{model: {providerID, modelID}, parts: [{type:"text",text}]}`，`model` 必须是对象（纯字符串或 `p/id` 格式均 400），不带则回退 serve 默认模型（本机 `gpt-5.6-luna` → 区域 403）；(3) 响应为单条 JSON `{info, parts}` 而非 SSE；(4) picode 适配器（D044）契约正确无需改，`smoke.sh` 第 7 步已补 model 对象并强化断言（上游错误/空响应即失败）；(5) E2E 偶发唤醒失败（三角 2/3）：applyEvent 的 wake 失败仅置 `result.rejected` 不抛、approve 不感知——smoke.sh 断言三角会话 `error` 字段兜底，产品行为暂不改（留观察）|
|D059|**唤醒失败可见化落地**（D058-5 实施，依据业界「fire-and-forget ≠ fire-and-ignore，失败必须可观测」）：`approveStaffing` 返回新增 `wokeErrors: [{agent_id, reason}]`（取 applyEvent 中 outcome=rejected 的 wake）；CLI `staffing approve` 输出含该字段，非空时 stderr 打 `[picode] WARN: 唤醒失败 <agent>: <reason>（可稍后 session wake 重试）`。事件引擎语义不变（尽力而为、不抛）；新增 2 个单测（max_awake=0 全拒断言 / 正常空数组断言）|
|D060|**11 playbook 勾选滞后核实**（不改 spec 正文）：29 项未勾选中 27 项已实现且有测试守护（逐项 grep 验证：loader 5 层 / atomic+flock / ACL / token / 消息 type / 双门闩 / merge 拓扑与 abort / 文档三人小组 / Memory Brief / change_order / draft park）；2 项未实现——cell check_signoff 文件格式与 violations/proc-audit 红灯，属 O006 开放项（spec 10 仅定义消息 type，`check_signoff` type 已注册于 bus；文件/流程格式留待 spec 细化，实现按保守默认未做）。11 playbook 勾选属实现追踪而非规范正文，补勾建议由 spec 维护方统一处理|
|D061|**opencode spawn 改为 noReply 异步**（dogfood E2E 发现）：build agent 收到「就绪」消息后自主行动（探索仓库/跑工具），spawn 同步等待模型回复导致 120s 超时、approve 卡死（实测 180s+ 超时 2/3 唤醒失败）；`spawn()` 的 ready message 加 `noReply: true`（serve 原生参数，消息异步入队、agent 自行处理），spawn 秒回（实测 approve 0.152s、wokeErrors 空）。新增 3 单测（mock fetch 断言 noReply/model 对象/spawn 快速返回）|
|D062|**dogfood 实测发现**（克隆仓 /tmp/picode-dogfood，deepseek-v4-flash 真实闭环）：(1) 模型产出 2 处低风险重构——`globToRegExp` 转义提取 `escapeRegExp`（233f431）+ `GLOB_ESCAPE_RE` 常量与 `pickFromPool`（5ad44c7），行为不变、195 测试全绿、已合并入克隆仓 main；(2) **E4 merge gate 缺陷**：`verify_commands`（npm test）在 merge 时执行但未先 build——TS 项目可能测旧 dist，本次以 merge 后手动 build+test 兜底，建议 gate 改为 `npm run build && npm test`（未改行为）；(3) **agent cwd 偏差**：opencode 会话 cwd = 会话目录（克隆仓根）而非 worktree，模型把第二处改动写进了克隆仓根 working tree 导致 merge 冲突——建议任务 prompt 明确 cd worktree，或 spawn 时把会话 directory 指向 worktree（改进建议，未改行为）|
|D063|**error.report / error.digest 消息类型（T2 越权改 spec 处置）**：回退模型越权 spec 改动；登记 bus 消息类型 error.report/error.digest；错误收集机制（docs/errors/ + bus）自 D063 生效|
|D064|**picode 提供 MCP 服务器（stdio · 全量工具面）**：新增 `@picode/mcp-server`——编排面（~36 工具，直接包装 orchestrator store 函数，门闩/锁/不变量全保留）+ 执行面（pi-extension 20 工具 1:1，ACL 六层全保留：profile+token+房间+路径+state 白名单+allowlist 边界）。传输 stdio（`PICODE_REPO` 指定仓库）；执行面逐调用注入 env + 重捕获工具表（与 harness/opencode 插件同款模式），token 由服务器代签（`issueToken` + run secret.txt/dev-secret 兜底），transport 参数 `_` 前缀与工具参数分离。副作用工具（session_wake/sleep/terminate、task_prepare、merge_process、task_dissolve）在描述中显式标注。HTTP/SSE 传输与 resources 留待后续|
|D065|**sponsor 信息投喂入口（intake）**：sponsor 任意时刻投喂（一条信息/想法/链接/文档），状态机 `add → triage → close`；落盘 `runs/<id>/intake/feed-*.yaml`（from=sponsor/ts/type/body）；分诊由 run-lead 会话决策或规则按 type 转对应角色（需求→product/run-lead；研究→ind-res；文档→docs cell；问题→run-lead 拆卡）；分发走 bus 通知 + 唤醒；处理结果回执 sponsor|
|D066|**会话续跑机制（continuation）**：对「已 awake ∧ 无 error ∧ 任务未终态 ∧ 预算未耗尽 ∧ 空闲超 `idle_sec`」的 opencode 会话，guardian 机械层按 D061 noReply 语义投喂**固定续跑 prompt**（复用 ready 消息角色/任务上下文 + 固定「继续推进或报告完成」模板）；预算 `self_evolve.continuation.max_per_session`（0=不限，保守默认）+ 每会话 `budget.continuations` 计数持久化（文件真相，D002），耗尽即停，靠既有 idle-sleep/budgets 停靠；断连经 P1 恢复重投喂 ready 后从持久化计数续发（不重算不超发）。**边界：不引入 daemon（N4 缓）、不 LLM 生成续跑指令（N7 缓）**；语义续跑（transcript 摘要注入）列第二轮|
|D067|**续跑 idle 时钟 = 回合完成时间，非投喂时间**（R3-C1 修监督者实测缺陷）：idle 判定取 `max(last_wake_at, 最近一条 transcript **incoming（响应）记录** ts)`，续跑投喂记录为 outgoing **不重置 idle 时钟**；转录末条为 outgoing 且其后无 incoming（长回合进行中）视为 **in-flight，不进入候选、不投喂**。根因：原 `lastActivityMs` 取 `max(last_wake_at, 最近转录 ts)` 而转录含 outgoing，每次投喂立即重置 idle 时钟，noReply 长回合被误判空闲连投打断（实测 run-lead 被连投 4 次排队）。实现 `continuation.ts`（`lastRoundCompletedMs` / `isRoundInFlight`），纯函数不变|
|D068|**平台席策略 + 续跑 gate 可选接入**（R3-C1/C2）：`self_evolve.continuation.platform_seats` 默认 `"skip"`——无 task 绑定会话（scout/sys-arch/run-lead 等平台席）不进续跑候选，根治 E6「平台席无界空转」gap（R2-C2 仅 `max_per_session` 有界缓解）；`"allow"` 显式逃生仍受预算闸约束。`self_evolve.continuation.gate_commands` 默认 `[]`（不启用）——启用时续跑投喂前跑 gate（有界超时，借鉴 prime-agent `captureGitWorktreeSnapshot`：git status + diff HEAD + untracked 聚合）；**上次失败快照与当前一致 → 不重跑不投喂**（防没改代码反复重跑），gate 通过 → 停靠不投喂；失败快照按 agent 持久化 run 目录 `continuation-gate.jsonl`。不引入 LLM 决策/daemon，默认关闭不改既有行为|
|D069|**续跑遥测三面可观测**（R3-C3）：status/CLI/MCP 三面一致暴露逐会话续跑列——`continuations_used`（`session.budget.continuations` 持久化）/ `last_continuation_at`（最近 outgoing 转录 ts）/ `max_per_session`（配置值）/ `in_flight`（末条 outgoing 无响应=回合进行中）/ `platform_seat`（未绑定任务）。`picode status` 快照含 `continuation` 段；`self-drive continuation --status` 与 MCP `continuation_status` 复用同一派生（`status.ts` `continuationTelemetry`），三面口径一致、纯读零写|
|D070|**监控面板（Dashboard）**：`packages/dashboard-server`（npm workspace 成员 · `node:http` 只读 HTTP · 复用 orchestrator 纯读投影 9 端点 + serve tokens 代理）+ `packages/dashboard`（自包含 pnpm 项目 · Vue3+Vite+shadcn-vue · 从根 workspaces 显式排除）。后端并入根 build/test、前端 E4 用 `pnpm -C packages/dashboard build` 显式验收；只读、无写、无 daemon（D002/D057 延续）；`--repo` 定位任意真实 run 仓**（2026-08-15 D113/D114 修订标注：面板契约由「9 端点全 GET 只读」扩展为「+聊天室读/写（bus 读面 3 端点 + 唯一写端点 POST /bus/:room）+ 审批流/变更单数据源（approvals/change-orders）」；写仅限 sponsor chat（D114，D018/D035 语义不变），其余路由非 GET 仍 405，只读不变量对本端点外保持）**|
|D071|**Dashboard 视觉检修**：语义状态色 token（绿/琥珀/红/蓝，浅深色均 WCAG AA ≥4.5:1）+ 边框阴影层级 token + 域组件层（StatCard/StatusBadge/SectionCard/EmptyState/ErrorState/Skeleton 系）+ 布局壳精修。总览页中文通俗文案/统计条/状态色点（labels 单一事实源）；详情页 9 视图 TabsList + 进度/房间/人员三视图。**零端点改动约束**：三视图由既有 9 端点派生纯函数（`views.data.ts`）+ 静态知识常量（`role-meta.data.ts`），`dashboard-server` 零改动**（2026-08-15 D113/D116 修订标注：聊天室化/流程可视化引入新端点（bus 读面 + 写代理 + approvals/change-orders）与前端组件（聊天室 tab/chat-room-view/chat-send-box/flow 视图），「零端点改动」约束局部解除（D113 读面扩展 + D114 写代理唯一例外）；三视图派生纯函数 + 静态知识常量模式延续（chat.data.ts/flow.data.ts））**|
|D072|**run 收尾自动休眠平台席**（C1）：goal 终态（completed/cancelled）自动休眠所有 awake 平台席（无 task 绑定），不残留 awake 占 max_awake。`sleepPlatformSeats` + `closeRun`（补发 TASK_DISSOLVED + 休眠平台席，幂等 best-effort）；guardianTick 终态分支回报 `slept_platform`，`goal set-status` 终态分支联动 closeRun|
|D073|**session audit 跨 run 会话残留审计与清理**（C2）：`deriveAuditReport` 纯派生（逐 run 读 goal.status + SessionStore，输出 residual 标记 + 跨 run 汇总 vs max_awake）+ `cleanResidual` 执行器（对终态 run 残留调 C1 closeRun 原语，动态 import 延迟接通，best-effort 单 run 失败不阻断）；CLI `session audit [--clean] [--run]`（noRun 跨 run）|
|D074|**C2 验收 test 目标修正（处置记录）**：chunk acceptance `<project-test-command>` 占位符在 QA 阶段具体化为 `cli.test` 注册断言（`picode session audit` 入 --help 命令表）+ `session-audit.test` 派生/执行/失败容错断言，371 测试全绿；验收口径由占位符修正为具体断言，实现据此补齐 test 目标|
|D075|**`session audit --clean` 端到端实测延后（处置记录）**：C2 验收仅单测覆盖派生 + cleanResidual 注入 closeRun 失败容错；`--clean` 对真实终态 run 的端到端清理延后至 C3 后由监督者执行（证据注明），不改变 C1/C2 语义|
|D076|**语义续跑（N7 升级）**：续跑 prompt 注入上一回合要点摘要——`feedContinuation` 改用 `composeContinuationPrompt`（固定指令 + `TranscriptStore.historySummary()` 确定性启发式要点，无 LLM）；摘要为 null（空/损坏转录）回退固定 `CONTINUATION_PROMPT`；数据源仅复用既有 `transcripts/<agent>.jsonl`（**零新增数据源**）；预算/幂等/纯函数语义不回归|
|D077|**摘要窗口可配置 + stripNoise 去噪**（摘要质量）：`historySummary` 增 `opts.stripNoise[]`（outgoing 要点生成前删除命中子串，删空条目整条跳过；条数统计仍基于原始转录）；`maxEntries<=0` 视为摘要窗口关闭返回 null；`feedContinuation` 用配置 `self_evolve.continuation.summary_entries`（默认 8）替代硬编码 8，并传 `stripNoise:[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]` 剔除机械模板噪音；提取 `CONTINUATION_SUMMARY_HEADER` 常量供 compose/re-spawn 复用。wakeWithOpencode 的 stripNoise 越界改动因 write_paths 门禁回退（D079 缓项）|
|D078|**续跑预算按角色分流**（预算差异化）：新增 `self_evolve.continuation.max_per_session_platform`（默认 **2**，平台席独立更紧预算；非负整数校验，0=不限保留）；`deriveContinuationTargets` 预算门按 `taskId` 分流——task 绑定会话用 `max_per_session`、平台席（taskId 空）用 `max_per_session_platform`，判定顺序保持预算门在前、platform_seats=skip 门在后；遥测顶层增 `max_per_session_platform` 字段、session 级 `max_per_session` 反映该会话适用上限（三面口径一致）。**现 allow 配置（继承 5）升级后平台席收紧到 2，属有意保守行为变更**|
|D079|**已由 D083 落地**：re-spawn 摘要去噪一致化——`wakeWithOpencode`（opencode-adapter.ts）传 `stripNoise:[READY_MESSAGE_TEXT]`，本轮显式纳入 write_paths 落地（见 D083）|
|D080|**缓项：上一回合摘要语义化/关键动作提取**：stripNoise 仅精确剔模板句，摘要仍含续跑 feed 的 outgoing 记录（确定性、可复现）；后续可对 summary 做模板句剔除/关键动作提取（仍启发式，不引 LLM）|
|D081|**checkpoint 部分已由 D082 落地**：会话 checkpoint 快照（快照只读、文件为准、MVP 显式捕获）见 D082；maxTokens 真计量仍待 serve token 契约（D058）就绪（缓）|
|D082|**会话 checkpoint 边界 + 最小可行落地**：checkpoint = 捕获时刻对文件真相的**只读投影**，写入后不可变（timestamped 单文件、append-only 目录）；**任何代码路径不得读 checkpoint 驱动状态决策**——恢复/续跑/调度/合并仍只读 session.yaml / task.yaml / transcripts / git。落地 `checkpoint-store.ts`（纯函数 `deriveTaskCheckpoint`/`captureTaskCheckpoint`，不可变落盘 `runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml` schema v1 + 自指纹 sha256）+ 只读 CLI `picode checkpoint capture/status`；**MVP 仅显式捕获**（`boundary: manual` 预留，guardian/merge/serve 恢复路径零改动）|
|D083|**re-spawn 摘要去噪一致化**（D079 落地）：`wakeWithOpencode` 重 spawn 的 `historySummary` 传 `stripNoise: [READY_MESSAGE_TEXT]`，剔除重投喂 ready 模板句，与 feed 路径（D077）口径一致；`maxEntries` 保持默认 20（全量恢复语义）。`opencode-adapter.ts` 本轮显式纳入 write_paths（D079 越界教训）|

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

## D067 — 续跑 idle 时钟 = 回合完成时间
- 2026-08-13 · 来源：监督者 R3 实测缺陷（run-2026-08-13T09-36-28-520Z）
- 问题：idle 判定原取 `max(last_wake_at, 最近转录 ts)`，转录含 outgoing（投喂）记录——每次续跑投喂都立即把 idle 时钟重置到投喂时间；noReply 长回合（agent 工作 > idle_sec 仍未响应）期间 sweep 误判「已空闲」再次投喂，长回合被打断（实测 run-lead 被连投 4 次排队；`max_per_session` 只限总量、不限打断）
- 决定：idle 时钟 = **回合完成时间** = `max(last_wake_at, 最近一条 transcript incoming（响应）记录 ts)`；投喂（outgoing）不参与 idle 计算。转录末条为 outgoing 且其后无 incoming → 该会话 **in-flight**（长回合进行中），不进入候选、不投喂
- 实现：`packages/orchestrator/src/continuation.ts` 的 `lastRoundCompletedMs` / `isRoundInFlight`；`deriveContinuationTargets` 保持纯函数（读文件无网络）
- 边界：投喂 outgoing 永不重置 idle 时钟；in-flight 只跳过当前候选派生，不改变 feed 语义

## D068 — 平台席策略 + 续跑 gate 可选接入
- 2026-08-13 · 来源：E6 剩余风险（平台席空转未根治）+ ind-res 研究（M3 gate + git 快照防重复重跑）
- 问题 1：`deriveContinuationTargets` 对无 task 绑定会话（scout/sys-arch/run-lead 等平台席）无终态门，R2 仅用 `max_per_session=5` 有界缓解，仍空转烧 token
- 问题 2：`budgets.gate_commands` 声明未执行；续跑前无验证门，agent 可能反复重跑同一失败步骤空转
- 决定：
  - `platform_seats`（默认 `"skip"`）：无 task 绑定会话默认不进续跑候选（根治空转）；`"allow"` 显式逃生、仍受 `max_per_session` 有界
  - `gate_commands`（默认空 `[]`，不启用）：启用时续跑投喂前对候选跑 gate（有界超时 60s），`git status --porcelain + diff HEAD + untracked 聚合` 得工作树快照；**上次失败快照指纹 === 当前 → 不重跑不投喂**（防没改代码反复重跑）；gate 通过 → 停靠不投喂；失败 → 不投喂但保留候选（下轮重试）；失败快照按 agent 持久化 `runs/<id>/continuation-gate.jsonl`
- 实现：`packages/orchestrator/src/continuation-gate.ts`（`shouldRunGate` / `captureGitWorktreeSnapshot` / `runContinuationGate` / `sweepContinuationsGated` / `ContinuationGateStore`）；guardianTick 接线在 checkBudgets 之后、续跑 sweep 之前
- 边界：默认关闭不改既有行为（gate_commands 空 = 与 D066 完全一致）；不引入 LLM 决策、不引入 daemon

## D069 — 续跑遥测（status/CLI/MCP 三面）
- 2026-08-13 · 来源：R2 plan (d) 5「续跑遥测看板」+ ind-res 研究 M2
- 问题：`picode status` 无续跑列；`self-drive continuation --status` 只给候选数；MCP `continuation_status` 同缺——运营无法查看每会话续跑预算、上次投喂时间、进行中回合与平台席停靠
- 决定：`status.ts` 新增 `ContinuationTelemetry` 段（每会话 `continuations_used` / `last_continuation_at` / `max_per_session` / `in_flight` / `platform_seat`），`statusSnapshot` / CLI `continuation --status` / MCP `continuation_status` 三面共用同一 `continuationTelemetry` 派生，口径一致、纯读零写（D039 status 快照扩展，不改状态）
- 实现：`packages/orchestrator/src/status.ts`（`continuationTelemetry`）、`commands/self-drive.ts`、`packages/mcp-server/src/management.ts`

## D070 — 监控面板（Dashboard）架构
- 2026-08-13 · 来源：sponsor 指令「先做监控面板」+ run-lead 自治规划 run-2026-08-13T12-16-26-548Z（D1–D10）
- 问题：sponsor 需直观展示 run 工作细节（goal/chunks/任务/会话+tokens 活跃度/merge 列车/门禁 evidence·E4），数据源为 `.picode/runs` YAML + opencode serve API，且可本地运行并接入真实 run 数据
- 决定（要点）：
  - **两包分置**：`packages/dashboard`（前端 UI，Vue3+Vite+TS+shadcn-vue）+ `packages/dashboard-server`（后端只读 HTTP，`node:http` 零框架依赖）。不合并单包——前端依赖重、后端零 UI 依赖可独立 build/test
  - **包管理器分离**：dashboard-server 为 **npm workspace 成员**（tsc 构建，进根 build/test）；dashboard 前端为**自包含 pnpm 项目**（vendor 模板自带 pnpm-workspace/lock，保留），根 `workspaces` 从 `packages/*` 改显式五包+server 排除前端（npm 不支持 `!` 排除）；E4 gate 对前端 chunk 用 `pnpm -C packages/dashboard build` 显式验收
  - **无 daemon 只读**：后端全部 GET、无写、无锁、无副作用（遵守 sys-arch「无 daemon、状态文件化」不变量，D002/D057）；复用 orchestrator 纯读投影（statusSnapshot/buildBoard/readMergeQueue/readProgress/readGoal）+ `@picode/core`（loadConfig/readYamlFile/runsRoot/runDir），面板 = 薄 HTTP 包装，避免第二份解析逻辑
  - **9 端点投影复用**：`GET /api/runs`、`/api/runs/:id`、`/api/runs/:id/{board,chunks,tasks,sessions,merge,gates}`、`/api/live/:runId/:agent`（代理 serve `GET /session/{id}/message` 取 `info.tokens.total`，`oc-` 前缀剥离（D044），ERR-01 有界超时 5s 降级 `{error}` 不挂死）
  - **联调**：Vite dev proxy `/api` → `127.0.0.1:8788`（免 CORS）；server 亦开 CORS 兜底；前端 tanstack/vue-query 轮询（tokens 实时页 `refetchInterval` 2–5s），不做 WebSocket/SSE（serve 无推送契约，D058）
  - **运行**：server `node packages/dashboard-server/dist/index.js --repo <path>`（`--repo` 默认 cwd，读 `.picode/config.yaml` 的 `runs_root` 与 `opencode.base_url`）；前端 `cd packages/dashboard && pnpm dev`（Vite 5173）
  - **非目标（范围外）**：无写操作（无 POST 编排/唤醒/合并按钮）、无鉴权（本地 localhost 工具）、无部署打包；鉴权/写面列第二轮
- 实现：C1 server（`packages/dashboard-server`，9 端点 + live 代理 + 根 workspace 接线，1af542e）；C2 scaffold（`packages/dashboard` vendor 模板裁剪 + proxy + 骨架页，7cd3aa5）；C3 pages（API hooks + 6 面板，chunk-dashboard-pages）；C4 本文档（docs 层）
- 边界：面板只读不改状态、不持锁；serve 失联降级显示不白屏（C3 降级提示）；数据源 = 文件真相（D002）+ serve 实时 tokens。**（2026-08-15 D113/D114 修订标注：读面扩展 bus/approvals/change-orders（仍只读，见 D113）；写面唯一局部例外 = POST /bus/:room sponsor chat 写代理（见 D114）；D070「无写」对本端点外保持）**

## D071 — Dashboard 视觉检修（语义色/布局/三视图/零端点改动约束）
- 2026-08-13 · 来源：sponsor 反馈面板「丑、描述晦涩」+ run-2026-08-13T15-08-28-705Z C1–C3 检修规划
- 问题：面板视觉语言不统一（主题重复/radius 冲突/未定义 `--c-border` token）、文案晦涩（英文/机器拼写）、且缺房间/人员/进度可见性；D070 已定 9 端点只读契约，验收约束**不改 dashboard-server**
- 决定：
  - **语义色 token**：`index.css` 新增 `--status-success/warning/danger/info`（绿/琥珀/红/蓝，浅深色均 WCAG AA ≥4.5:1）+ `--border-subtle/strong` + `--shadow-card/popover` + 骨架屏动画基元；`themes.css` 去重 `theme-yellow` 重复块、统一 `--radius: 0.5rem`（修 :root 双 radius 冲突）；默认主题改精修蓝强调色（zinc 基础）
  - **域组件层**：`components/dashboard/` 新增 StatCard / StatusBadge / SectionCard / EmptyState / ErrorState / SkeletonTable / SkeletonGrid，总览与详情页统一复用，消除各页手写样式漂移
  - **总览页（C2）**：标题/描述/错误态改中文通俗文案；新增统计条（全部/进行中/已完成/受阻）；卡片状态色点 + 悬停反馈 + 空态图标；文案统一走 `@/utils/labels`（RUN_STATUS/RUN_KIND/RUN_SCALE 单一事实源），`index.components.ts` 仅补展示细节（badge 样式/状态圆点/相对时间/统计聚合）
  - **详情页三视图（C3）**：9 视图横向可滚 TabsList（概览/进度/房间/人员/分块/看板/会话/合并/门禁）；新增进度视图（逐任务 phase/blocked/summary/updated_at + in-flight/受阻计数）、房间视图（squad 房按 task `work_room`+triad 派生成员、平台房按 snapshot.rooms + ROLE→ROOM 约定）、人员视图（平台席 sessions + 任务三角 tasks.triad）；看板列加宽 + 列头状态点 + 卡内进度条；各视图 spinner 换骨架屏 + 语义色
  - **零端点改动约束（硬约束）**：三视图全部由既有 9 端点响应派生——`views.data.ts` 导出 `derivePersonnel/deriveRooms/deriveProgress` 纯函数 + `views.test.ts` fixture 断言；角色/房间/阶段静态知识落 `role-meta.data.ts`（ROLE_META 取自人设 frontmatter description + ROLE_PRIMARY_ROOM 约定，ROOM_META 取自 terminology §3）；面板只读不读 `members.json` 避免文件系统耦合；`dashboard-server` 与 9 端点零改动
- 实现：C1 设计系统（5e8b3ec）；C2 总览（7fe32ba + 文案 labels 收敛 4ab9ee7）；C3 运行详情三视图（73abe11）；C4 本文档（docs 层）
- 边界：仅视觉/文案/派生展示层，不改任何 API 契约；数据仍源 = 文件真相（D002）+ serve 实时 tokens（D058）；后续页面继续复用 token 与域组件，新增数据需先经 D071-4 派生纯函数或静态知识常量。**（2026-08-15 D113/D115/D116 修订标注：聊天室化/流程可视化引入新端点与前端组件，「零端点改动」约束局部解除——D113 读面扩展 + D114 写代理唯一例外 + D115 approvals/change-orders 数据源消费；派生纯函数模式延续到 chat.data.ts/flow.data.ts，D071 语义色/域组件约定继续适用）**

## D072 — run 收尾自动休眠平台席（sleepPlatformSeats + closeRun，C1）
- 2026-08-14 · 来源：会话生命周期 run（run-2026-08-13T17-25-34-974Z）product_acceptance：run 收尾（goal completed/cancelled）时平台席自动休眠，不残留 awake 占 max_awake
- 问题：goal 进入终态后平台席（无 task 绑定的 scout/sys-arch/run-lead/pm 等）仍保持 awake，残留会话占满 `max_awake`，后续 run 无法唤醒新席位（实测 product acceptance 1/3 未满足）
- 决定：
  - `sleepPlatformSeats(dir, config)`：遍历 SessionStore.list() 中 awake 且无 task 绑定（`taskIdOfAgent===null`）的平台席逐个 `sleepAgent`；幂等，重复调用零副作用
  - `closeRun(dir, config)`：① applyEvent 补发 TASK_DISSOLVED（幂等：已 dissolved 的 applyEvent 无副作用）② sleepPlatformSeats；导出供 CLI/guardian 共用
  - 双触发点：guardianTick 终态 goal 分支（回报 `slept_platform` 于 GuardianTickResult）+ `goal set-status` 终态分支（completed/cancelled → best-effort closeRun）
  - best-effort：单席/单任务失败不阻断整体（guardian 与 CLI 共用，收尾不可因单席失败中断）；`run-store.setGoalStatus` 保持纯净未改
- 实现：`packages/orchestrator/src/self-drive.ts`（sleepPlatformSeats/closeRun/guardianTick 终态分支 + slept_platform）、`commands/goal.ts`（set-status 终态联动）、对应测试（幂等/非终态不触发/CLI 冒烟）
- 边界：不做规则表新事件；残留会话清理失败不抛（幂等跳过），由 C2 `session audit --clean` 兜底回收
- commit: bacbe04 / e251a65（main）

## D073 — session audit 跨 run 会话残留审计与清理（C2）
- 2026-08-14 · 来源：product_acceptance：提供会话残留检查/清理手段（CLI 可审计跨 run 残留）+ max_awake 不被已完成 run 残留占满
- 问题：C1 自动休眠是 best-effort，失败/遗漏的残留会话仍会占满 max_awake；需跨 run 可审计、可清理的手段
- 决定：
  - `deriveAuditReport` 纯派生（只读零写）：逐 run 读 `goal.status` + `SessionStore.list()`，输出 run_id/goal_status/awake[]/terminal/residual + 跨 run 汇总（runs_total/terminal/residual/awake_total/residual_awake vs max_awake，`max_awake_exhausted`）；数据源 = runsRoot 下含 goal.yaml 的 run 目录（与 dashboard listRuns 同口径）
  - `cleanResidual` 执行器：对终态 run 的残留会话调 C1 `closeRun` 原语；**动态 import 延迟接通**（C1 未合并时本模块仍可审计，--clean 报 NOT_FOUND 提示）；best-effort 单 run 失败仅记 skipped 不阻断整体
  - CLI `session audit --repo <path> [--clean] [--run <id>]`（noRun:true，跨 run）；--clean 输出 `{...deriveAuditReport, clean}`
- 实现：`packages/orchestrator/src/session-audit.ts`（TERMINAL_GOAL_STATUSES/isTerminalGoal/auditRun/listRunIds/filterRunIds/deriveAuditReport/cleanResidual）、`commands/session.ts`（audit 子命令）、`cli.test.ts`（命令注册断言）、`session-audit.test.ts`（派生/执行/失败容错）
- 边界：审计纯读零写（D039 延续）；清理是 C1 收尾的兜底，不替代 C1 自动休眠
- commit: acbed71 / b9cafd8（main）

## D074 — C2 验收 test 目标修正（处置记录）
- 2026-08-14 · 来源：task-session-audit QA 阶段（C2 commit body「修正 test 目标」）
- 事实：chunk acceptance 的 `<project-test-command>` 为占位符；C2 将其具体化为 `cli.test` 注册断言（`picode session audit` 出现在 --help 命令表）+ `session-audit.test` 覆盖派生/执行/失败容错，371 测试全绿
- 处置：验收口径由占位符修正为具体断言，实现据此补齐 test 目标；未改产品语义
- 纪律强化：acceptance 占位符须在 brief 阶段具体化为可执行命令，避免 QA 阶段才发现 test 目标缺失

## D075 — `session audit --clean` 端到端实测延后（处置记录）
- 2026-08-14 · 来源：task-session-audit evidence（`--clean 实测待 C3 后跑（监督者执行）`）
- 事实：C2 单测覆盖 deriveAuditReport 派生 + cleanResidual 注入 closeRun 失败容错，但未对真实终态 run 做 `--clean` 端到端实测；延后至 C3（lifecycle-docs）合并后由监督者执行
- 处置：端到端验证列入 C3 收尾清单；行为语义不受影响（cleanResidual 依赖 C1 closeRun 原语）

## D076 — 语义续跑：续跑 prompt 注入上一回合要点摘要（composeContinuationPrompt + historySummary）
- 2026-08-14 · 来源：run-lead 自治规划 run-2026-08-13T18-29-39-276Z（N7 升级，宽松目标）
- 问题：D066 续跑投喂为固定模板（`CONTINUATION_PROMPT`），空泛且不携带上一回合上下文——长回合任务续跑时 agent 需自行从任务文件/转录回忆进度，易重复或遗漏，且与「无 LLM」边界未冲突但语义增益有限
- 决定：
  - `composeContinuationPrompt`：续跑 prompt = 固定指令 + 上一回合要点摘要（`TranscriptStore.historySummary(agentId)`，确定性启发式：条数统计 + 最近 `maxEntries` 条可读要点、截断 120 字；**无 LLM**——编排器无 LLM 不变量，D003）
  - `feedContinuation` 投喂前取摘要注入；摘要为 **null**（空转录 / 文件损坏 / 无内容）→ 回退固定 `CONTINUATION_PROMPT`（best-effort，不报错不空注入）
  - **零新增数据源**：摘要源自既有 `transcripts/<agent>.jsonl`（D066/P4 转录归档），不新增文件、接口、配置；re-spawn（wakeWithOpencode）同款消费已在 D066 路径复用（transcript-store.ts `historySummary`）
  - 不回归：预算（`max_per_session`）/幂等（noReply + 计数）/纯函数（`deriveContinuationTargets` 读文件无网络）语义不变；平台席策略、idle 时钟、in-flight 判定不受影响
- 实现：`packages/orchestrator/src/continuation.ts`（`composeContinuationPrompt` + `feedContinuation` 接线）、`transcript-store.ts` `historySummary` 复用
- 边界：摘要为启发式要点（统计 + 截断），非 LLM 精炼；语义续跑不改变候选派生与投喂节奏
- 纪律强化：跨 chunk 延后的验收动作须在收尾 task（docs/knowledge）显式列明执行人与时机，避免残留检查缺位

## D077 — 摘要窗口可配置 + stripNoise 去噪（C1 task-continuation-summary）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-13T18-29-39-276Z-plan（E9 候选 1/2）+ run-2026-08-13T21-32-57-118Z C1
- 问题：D076 语义续跑把 `historySummary` 的 `maxEntries` 硬编码为 8，且每次自动续跑投喂的机械模板文本（`READY_MESSAGE_TEXT` / `CONTINUATION_PROMPT`）会被记入转录——下一轮摘要被重复模板噪音淹没、窗口无法调优
- 决定：
  - `historySummary` 新增 `opts.stripNoise?: string[]`：生成 outgoing 要点前从文本删除命中子串，删空条目整条跳过；条数统计（outgoing/incoming）仍基于原始转录不受影响；纯函数（同输入同输出）
  - `maxEntries <= 0` 视为摘要窗口关闭，返回 null（回退固定 `CONTINUATION_PROMPT`）
  - `feedContinuation` 用配置 `self_evolve.continuation.summary_entries`（默认 8，非负整数校验）替代硬编码 8，并传 `stripNoise: [READY_MESSAGE_TEXT, CONTINUATION_PROMPT]` 剔除机械投喂噪音
  - 提取 `CONTINUATION_SUMMARY_HEADER` 常量，`composeContinuationPrompt` 复用（摘要段标题同源，供测试/引用）
- 实现：`packages/orchestrator/src/transcript-store.ts`（historySummary opts.stripNoise/maxEntries<=0）、`continuation.ts`（feed 接线 + 常量）、`packages/core/src/config.ts`（summary_entries 默认 8 + 校验）、对应测试（config 默认/校验 + transcript 去噪 + feed 集成）
- 边界：摘要仍为确定性启发式（非 LLM 精炼，D076 不变）；wakeWithOpencode 重 spawn 保持默认 maxEntries=20 且不加 stripNoise（越界改动回退，D079）
- commit: 6d1973f（C1 task-continuation-summary 合并；本体 8d67fd0 + P07 门禁回退 87615b9）

## D078 — 续跑预算按角色分流（C2 task-continuation-budget）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-13T18-29-39-276Z-plan（E9 候选 4 预算差异化）+ run-2026-08-13T21-32-57-118Z C2
- 问题：`max_per_session` 单一预算对 task 绑定会话与平台席共用——平台席（监测/调研型角色）续跑需求轻却继承三角预算，易烧 token
- 决定：
  - 新增 `self_evolve.continuation.max_per_session_platform`（默认 **2**，平台席独立更紧预算；非负整数校验，0=不限保留）
  - `deriveContinuationTargets` 预算门按 `taskId` 分流：task 绑定会话用 `max_per_session`、平台席（taskId 空）用 `max_per_session_platform`；判定顺序保持预算门在前、`platform_seats=skip` 门在后（skip 默认下平台席本就先被挡出，预算门仅对 allow 逃生生效）
  - `continuationTelemetry` 顶层增 `max_per_session_platform` 字段；session 级 `max_per_session` 反映该会话**适用上限**（task 绑定 → max_per_session，平台席 → max_per_session_platform），三面（status/CLI/MCP）口径一致
  - **有意行为变更**：现 `platform_seats: "allow"` 配置（继承 max_per_session=5）升级后平台席收紧到 2，属有意保守收窄，需在配置变更说明中注明
- 实现：`packages/core/src/config.ts`（字段默认 2 + 校验）、`packages/orchestrator/src/continuation.ts`（预算分流）、`status.ts`（遥测顶层/会话级字段）、对应测试
- 边界：0=不限语义保留；平台席默认 skip 不受预算门影响；遥测字段新增不破坏既有消费方（向后兼容）
- commit: 910ae6a（C2 task-continuation-budget 合并，main = fc1ed8d）

## D079 — 缓项：re-spawn 摘要去噪一致化（处置记录）
- 2026-08-14 · 来源：D077 C1 越界改动回退（evidence 记录）
- 事实：D077 初始 commit 7c98e80 亦改 `packages/orchestrator/src/opencode-adapter.ts`（`wakeWithOpencode` 传 `stripNoise:[READY_MESSAGE_TEXT]`），该文件不在 task-continuation-summary write_paths 内，P07 diff 门禁（`git diff --name-only base...HEAD ⊆ write_paths`）MUST 拦截
- 处置：squad-lead 以 5cc0e35/87615b9 回退该一行（re-spawn 去噪属后续候选，非 C1 验收必需）；feed 路径 stripNoise 不受影响，D077 验收口径一致
- 纪律强化：越界 write_paths 的改动即使语义正确也须回退；re-spawn 去噪留待独立任务（后续候选）

## D080 — 缓项：摘要语义化/关键动作提取（后续候选）
- 2026-08-14 · 来源：D077 决策边界 + run-lead 规划 (d) 后续候选 1
- 事实：stripNoise 仅精确剔除固定模板句；摘要仍含续跑 feed 的 outgoing 记录（确定性、可复现）——可读但不含「关键动作」语义
- 处置：后续对 summary 做模板句剔除/关键动作提取（仍启发式，不引 LLM；不改变编排器无 LLM 不变量 D003）
- 纪律：未立项不实现；决策目录 §12.3 摘要语义仍标注「启发式」

## D081 — checkpoint 已由 D082 落地；maxTokens 真计量仍缓（缓项更新）
- 2026-08-14 · 来源：run-2026-08-13T21-32-57-118Z goal acceptance + E7 缓项延续
- 事实：会话 checkpoint 快照（N5）与 maxTokens 真计量（N6，待 serve token 契约 D058）原均未实施；本轮预算差异化（D078）只解决预算总量，不解决「会话中途崩溃恢复」
- 处置：checkpoint 部分本轮落地（D082：快照只读、文件为准、MVP 显式捕获）；maxTokens 仍待 opencode serve 暴露 token 计量契约后再评估（缓）
- 纪律：缓项只记录不实现，避免范围蔓延；实施须重新立项

## D082 — 会话 checkpoint 边界 + 最小可行落地（C1 task-checkpoint-store）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-13T23-48-54-042Z-plan（E10 后续候选 #3 / D081 缓项落地）
- 问题：会话中途崩溃/观测需捕获时刻快照，但若快照参与恢复/续跑/调度，会与「文件才是真相」产生**第二事实源**（sys-arch 评估点名双源分歧风险）
- 决定：
  - **快照只读**：checkpoint 是捕获时刻对文件真相的**只读投影**，写入后不可变（timestamped 单文件、append-only 目录）；**任何代码路径不得读 checkpoint 驱动状态决策**——恢复/续跑/调度/合并仍只读 session.yaml / task.yaml / transcripts / git（文件真相不变量 D002 延续）
  - **纯函数派生**：`deriveTaskCheckpoint(dir, taskId, {now?, boundary?})` 同输入同输出（now 注入保证确定性）；task 不存在 → null；checkpoint 丢失/损坏**不影响**任何恢复路径（best-effort 观测物）
  - **MVP 仅显式捕获**：CLI `picode checkpoint capture --task <id>`（+ `status` 只读列出）；guardian/merge/serve 恢复路径**零改动**；捕获边界字段预留（`boundary: manual`，future 可扩展 pre_merge 等）
  - **捕获内容**（schema v1）：task.yaml `status` + 三角各会话（session.yaml state/budget）+ 各会话 `historySummary`（复用 `stripNoise:[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`）+ git worktree 指纹（复用 `captureGitWorktreeSnapshot`+`snapshotFingerprint`，非 git 仓 → null 容错）+ `captured_at` + 自指纹 sha256
  - **落盘**：`runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml`（ts 由 now 派生，字典序=时间序；重复捕获产生新文件，不覆盖=不可变）
  - **消费面最小化**：只读 CLI 两个子命令；不扩 statusSnapshot 顶层（status 契约不动，三面一致性留后续候选）
- 实现：`packages/orchestrator/src/checkpoint-store.ts`、`commands/checkpoint.ts`、`commands/index.ts`（注册 + DOMAIN_ORDER）、`checkpoint-store.test.ts` + `cli.test.ts`（命令表断言，D074 模式）
- 边界：checkpoint 是**观测/审计产物**，不反向驱动任何状态决策；恢复路径零改动（P1 serve 恢复 + 转录重投喂仍以文件真相为准）
- 缓/拒留档：checkpoint 自动捕获接线（guardian/merge 前）缓——需先验证手工捕获价值；从 checkpoint 恢复/回滚拒（违背快照只读边界，远期若做恢复目标仍为文件真相）；maxTokens 真计量缓（待 D058）
- commit: 84c52bb/93a2bc7（C1 task-checkpoint-store 合并）

## D083 — re-spawn 摘要去噪一致化（C2 task-respawn-stripnoise）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-13T23-48-54-042Z-plan（E10 后续候选 #1 / D079 缓项落地）
- 问题：`wakeWithOpencode` 重 spawn 的 `historySummary` 未传 stripNoise，转录里每次重投喂的 `READY_MESSAGE_TEXT` 固定模板句被计入摘要，摘要被机械噪音淹没（与 feed 路径 D077 行为不一致）；D079 记录上轮该改动因越出 write_paths 被 P07 回退
- 决定：`wakeWithOpencode` 调 `historySummary(agentId, { stripNoise: [READY_MESSAGE_TEXT] })`，剔除重投喂 ready 模板句；`maxEntries` 保持默认 20 不动（全量恢复语义，不强行与 feed 的 8 统一）；本轮 `opencode-adapter.ts` 显式纳入 write_paths（D079 越界教训）
- 实现：`packages/orchestrator/src/opencode-adapter.ts` + `opencode-adapter.test.ts`（2 用例：重 spawn 摘要不含 ready 模板句；转录仅模板句时整条跳过）
- 边界：stripNoise 缺省 = 现行为（零回归）；仅剔 `READY_MESSAGE_TEXT`，不剔 `CONTINUATION_PROMPT`（re-spawn 不经 feed 路径，口径与 D077 feed 一致）
- commit: 3eb8434（C2 task-respawn-stripnoise 合并）

|D084|**Skill harness 落地（技能承载体系）**：锚定 agentskills spec——① 新增 `skill-lint`（镜像 persona-lint 数据优先设计）校验 `skills_root` 下全部 `**/SKILL.md` frontmatter：`name` 必填匹配 `SAFE_ID_RE` 且等于目录名、`description` 必填（>1024 仅 warning）、`license`/`allowed-tools`/`compatibility`/`argument-hint`/`metadata` 白名单、未知键 warning；② **激活** `paths.skills_root`（D055 死键局部解除，默认 `skills` 不变，`validateConfig` 补相对路径校验禁绝对/`..` 逃逸），新增纯模块 `skills.ts`（`resolveSkillsRoot`/`discoverSkills`/`buildSkillIndex`/`personaDeclaredSkills`），未配置时 harness 空转零行为变更；③ **persona skills[] 接线**：`buildPiEnv` 注入 `PICODE_SKILLS_INDEX` + `PICODE_PERSONA_SKILLS`（读人设 frontmatter `skills[]`，实例人设/平台席模板），`buildReadyMessage` 系统 prompt 追加 skills 段；④ **渐进披露三层**：metadata（启动注入，有界截断）→ instructions（激活时 `repo_read` SKILL.md 正文）→ resources（按需），SKILL.md 正文绝不进系统 prompt；⑤ `npm run check` 追加 skill-lint；两个种子角色模板（engineer/run-lead）声明 `skills: [ponytail]` dogfood 接线。缓项：D085 skills-ref 官方工具接入、D086 打包/导入双轨机械实现、D087 skill-creator 评价循环（拒）、D088 allowed-tools 机械强制（拒）|
|D085|**缓项：skills-ref 官方校验工具接入**（agentskills spec 工具链）：官方工具为 npm 包需联网安装/运行，picode 无裸网（D010 信息控制）；自研 skill-lint 覆盖等价语义（name/desc/命名），后续可对齐。留档|
|D086|**缓项：skill 打包/导入双轨**（mattpocock M6：托管只读 vs 可编辑副本）：已以文档约定存在（skills/README M6 双轨）；机械实现依赖 CLI 下载器（需网），本轮不做。留档|
|D087|**拒：skill-creator / 评价循环**（anthropics 全套 evals/benchmark/variance）：依赖 LLM 评价循环，超出「承载体系」边界；后续独立 run 立项|
|D088|**拒：allowed-tools 字段机械强制**（skill 级工具白名单 vs picode tool_profile）：与 09 tool-profiles ACL 关系未定，强制可能破坏现有权限模型；本轮仅解析不强制。留档待设计|
|D089|**决策编号全局分配器（watermark ledger + reserve 脚本）**：`docs/decisions/watermark.yaml`（schema v1：`next_number` + `reservations[]`）+ `docs/decisions/reserve.mjs`（`--reserve --run <id> --count N` 领取连续编号段 / `--land` 标记占用 / `--status` 只读快照；复用 `@picode/core` `withFileLock`+`writeAtomic`，flock 临界区原子 read-modify-write，同 run 重复 reserve 幂等返回既有预留）；DECISIONS 顶部加水位说明。**勿手改 watermark（机器状态）**——新决策先 `--reserve` 领号、落地后 `--land` 标记占用|
|D090|**decision-lint 决策编号完整性校验**：镜像 persona-lint 数据优先设计（`checkDecisions` 返回 `{ok, problems, files}` + CLI），校验 ①表行编号唯一（DUP_TABLE）②详条编号唯一（DUP_SECTION）③详条↔表行对应（TABLE_SECTION_MISMATCH）④watermark 水位一致（WATERMARK_DRIFT）⑤docs/** D0xx 引用可解析（REF_UNRESOLVED warning）⑥reservations 幂等/无冲突（RESERVATION_COLLISION）；`--plan <file>` 规划期预检；`npm run check` 接线三 lint（persona-lint + skill-lint + decision-lint）|
|D091|**checkpoint 自动捕获接线（guardian 周期捕获 + merge 前捕获，boundary 扩展，快照只读边界不变）**：新增 `self_evolve.checkpoints` 配置（`enabled` 默认 false = D082 显式捕获行为不变；`guardian_interval_sec` 默认 600s 节流；`pre_merge` 默认 true 但受 `enabled` 总开关约束）；checkpoint-store 新增 `GUARDIAN`/`PRE_MERGE` 边界常量 + `guardianCaptureDue` 纯函数 + `captureDueGuardianCheckpoints`（仅写观测文件，跳过终态/缺失 task，节流复用）；self-drive `guardianTick` 在 `checkBudgets` 之后接线周期捕获（`GuardianTickResult.checkpoints` 仅作观测回报，**不驱动任何状态决策**）；merge `mergeNext` 实际合并前 best-effort 捕获（`enabled && pre_merge`，try/catch 绝不阻断 merge，`MergeOutcome.checkpoint` 纯观测）；**快照只读/文件为准边界（D082）不变**。同 run 一并落地 reserve.mjs 预留字段对齐（`from`→`start`）+ `--plan` 预检（E12 剩余风险 #1 闭环）|
|D092|**摘要剔噪口径统一收敛到 `summary-noise.ts`（零依赖下沉 + `SUMMARY_STRIP_NOISE` 三处统一）**：新建 `packages/orchestrator/src/summary-noise.ts`（**零 import 零依赖**）收敛 `READY_MESSAGE_TEXT`/`CONTINUATION_PROMPT`/`CONTINUATION_SUMMARY_HEADER` 常量 + 导出统一剔噪清单 `SUMMARY_STRIP_NOISE`（`[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`）；feed（`feedContinuation`）/ checkpoint（`CHECKPOINT_NOISE`）/ re-spawn（`wakeWithOpencode` 摘要）**三处统一消费**，剔噪口径单一来源，根治「re-spawn（D083）只剔 ready、feed/checkpoint（D077/D082）剔 ready+续跑」的口径漂移；`opencode-adapter.ts`/`continuation.ts` 从该模块导入并**保留 re-export**，既有引用路径零改动；re-spawn 摘要由仅剔 ready 改为统一剔 ready+续跑模板（行为对齐）|
|D093|**`picode supervise` 监控命令正式化（live tokens 原语上移 + `--once`/`--interval` + STOPPED 判定）**：`fetchLiveTokens`/`lastTokenSample`/`serveSessionIdOf`/`stripOcPrefix` 自 dashboard-server **原样上移** `orchestrator/live.ts`（dashboard-server `live.ts` 改薄壳 `export * from "@picode/orchestrator"`）；新增 `supervise.ts`——`deriveSuperviseObservation`（statusSnapshot + 每 awake 会话 `fetchLiveTokens` + worktree `.ts` 计数，纯读、fetchImpl 可注入）输出 `{ts,agents,total,worktrees,tasks,merge_queue}` + `isIdleStopped` 纯函数（total 连续 3 轮零增长判定，**POLL_FAIL 不计入**）；CLI `picode supervise --once`（默认单次 JSON）/ `--interval <sec>` 循环 + STOPPED 退出 0 / `--log` JSONL 追加；命令表注册 + DOMAIN_ORDER。**无 daemon（D037）不变量延续**——操作者前台调用，非平台守护|
|D094|**缓项留档：feed 映射文档化 / checkpoint 进 status 三面等**：① summary-noise 消费方（feed/re-spawn/checkpoint）剔噪口径映射图鉴文档化（现仅散见 DECISIONS/catalog）；② checkpoint 进 statusSnapshot 三面（MVP 仅 CLI 消费面，三面同源需动 status 契约 + mcp-server，E13 候选 1）；③ 自动捕获默认开启评估（观测价值验证后考虑翻转 `checkpoints.enabled` 默认值）；④ 摘要语义化/关键动作提取（D080 延续）。均留档待评估，未立项不实现，实施须重新立项并走 D089 领号|
|D095|**checkpoint 观测三面同源（status/CLI/MCP）**：StatusSnapshot 增 checkpoint 段（每任务 latest checkpoint：task_id/latest_at/boundary/sha256）；`picode checkpoint status` 与 MCP checkpoint_status 同源输出|
|D096|**checkpoint 自动捕获默认开启（评估后）**：`self_evolve.checkpoints.enabled` 默认翻转 true（guardian_tick/pre_merge 自动捕获生效）；显式 false 关闭|
|D099|**deepMerge 深拷贝修复（Bug A · C1 task-config-singleton）**：`deepMerge(DEFAULTS,{})` 未覆盖嵌套子树与 `DEFAULTS` 共享引用（`out={...a}` 浅拷贝）→ `enableOpencode()` 改加载后 config 污染全局单例 → 同进程后续 `loadConfig` 读到被篡改值 → guardianTick 用例顺序依赖失败（官方测试 303/304 失败 1；不隔离 HOME 15+ 失败）。`cloneValue` 递归深拷贝根治共享状态——对象/数组/fallback 全分支深拷贝，合并结果与 DEFAULTS/overlay 完全独立；merge 语义不变（数组按 id、`enabled:false`/`_delete` 删除、无 id 追加）|
|D100|**E2/E7 排除语义按层分组判定（Bug B · C2 task-evolve-glob-fix）**：`layers=[knowledge,docs]` 多层并集下 docs 层 carve-out `!docs/knowledge/**` 被扁平化，「任一 exclude 命中即 throw」误拒 knowledge 层 include（E2 evolve.ts + E7 staffing.ts **双处同病**）。core 新增共享判定 `isEvolveWritePathAllowed`——**按层分组**：路径 ∈ 某层 includes ∧ ∉ 该层 excludes → 放行；goal `forbidden_paths` 全局否决；carve-out 只否决所属层。单层语义不变（docs 单层仍拒 `docs/knowledge/**`）|
|D101|**yagni 死配置清理（D055 局部解除 · C1 task-config-singleton）**：5 删 1 留——删 `sess_mgr.enabled`/`sess_mgr.allow_orch_force_wake`/`self_evolve.enabled`/`self_evolve.require_sponsor_merge`/`self_evolve.knowledge_log_glob`（接口+DEFAULTS 同步删，grep 零读取）；留 `sess_mgr.idle_sleep_sec`（`sleepIdleSessions` opt-in 真实读取点，仅刷新注释标记 reserved）。既有用户配置含已删键仍可加载（分层 merge 不拒未知键）|
|D102|**ponytail 清理（死导出×3 + 薄壳×3 + 夹具单源）**：死导出 `roomDisplay`（C1）/`isPicodeError`/`canConsumeModel`（C3）删除，grep 三面零残留；单导出薄壳 mcp-server `errors.ts`/`schema.ts`、orchestrator `jsonl.ts` 并入调用方（C4，readJsonl 单宿主导出+跨引）；24 处本地 `tmpGitRepo`/mkdtemp 夹具收敛 test-utils 共享单源（C5，行为不变）|
|D103|**环境教训：工作房 node_modules 断链治理（C1/C2/C4 同型问题）**：worktree 内 node_modules 指向不存在的 `.picode/node_modules` 断链，`@picode/core` 解析落主仓陈旧 dist——三次复现均以重建自链修复（gitignored 零 repo diff）；工作房环境治理流程（node_modules 自链 + tsbuildinfo 清理 + HOME 隔离）沉淀为 run 标准操作，后续工作房统一布局|
|D104|**goal 跨轮跟踪：激活/回合预算/政策码（C1 goal-crossrun，守 D002 文件真相）**：goal.yaml 增增量字段——`revision`（CAS 围栏，仅并发校验**不重建状态**）、`rounds_started`/`max_goal_rounds`（回合预算，默认 0=不限）、`activation`（armed\|disarmed，默认 disarmed，唯一 arm 入口 = `picode goal resume`）、`blocked_reason` 政策码（lower-kebab：draft-idle/round-limit/provider-limit/queue-failed）；guardian 投喂=会话级机械续跑（受 activation 门闩：disarmed 零投喂）、goal resume=goal 级激活授权（明界写入 spec 17 §5.4）；达上限 guardian 自动 block(round-limit) 不静默续；配置旋钮最小化——仅新键 `self_evolve.goal.max_rounds`（createRun 落盘 goal.yaml，显式字段可覆盖）|
|D105|**skill_load 双轨（C2 skill-load）**：persona `skills[]` 声明 = 系统提示常驻元数据（D084 渐进披露 metadata 层）；`skill_load <name>` 工具 = 运行时按需加载完整 body（SKILL.md 全文含 frontmatter）——ACL 受限（implement.engineer/squad-lead，未授权 TOOL_DENIED）、单次单技能、`DEFAULT_SKILL_MAX_BYTES=64KiB` 超限 byte 感知截断（truncated:true）、未知名 `SKILL_NOT_FOUND` 内联码（不进 ErrorCode 枚举）；加载结果仅回工具结果**不注入 persona 系统提示**（不重复注入）；体积上限 env `PICODE_SKILL_MAX_BYTES` 覆盖、不新增 config 键|
|D106|**沙箱三态 + 一次性升级审批 + read-before-edit（C3 sandbox-approval）**：repo_write 每调用 resolve sandbox mode（read-only/workspace-write/danger-full-access，会话 env 覆盖 > 默认，叠加于 write_paths 静态白名单之上不替代）；越界写 → 结构化拒绝（含生效 mode + `[sandbox: ...]` 标记）→ `sandbox_permissions`+`justification` 成对申请一次性升级（WIDER_MODES 严格更宽，无理由 ESCALATION_MALFORMED）→ 审批 ask/never（默认 ask，answerer=run-lead 代批，policy 层 sponsor 人工）→ allowed-once 单次放行 + asked/decided 同文件成对审计；read-before-edit 守卫（未读已存在文件 → FS_NOT_OBSERVED，`PICODE_READ_BEFORE_EDIT` 默认开 fail-closed）；三处开关全走会话 env、零 config 键（配置旋钮最小化）|
|D107|**continuable 子代理蓝图存档（C4 blueprint，纯 docs，下轮实现输入）**：本轮只出蓝图 `docs/plans/continuable-subagents-blueprint.md`（守 D002：采用「转录+摘要+续跑投喂增强」，拒绝事件溯源恢复）；Pi 持久化可行性结论 = **支持（部分接口限制）**——opencode 原生 durable session（SQLite `ses_...`）+ cold resume（同 sessionID `POST /session/{id}/message`），关键限制在 picode 侧使用方式（sleep/terminate 现走 DELETE 销毁会话，需改保留/归档 + wake resume）；降级 = 增量 steer 而非整体重投；三道围栏（深度 ≤N / 父子写集只收窄 / 所有权围栏）只产修订点清单；下轮 I1-I7 实现时逐一过决策编号 + 双门闩|
|D108|**co-002 变更单 + 工具计数断言教训（C2 流程教训 · 含环境教训复证）**：工具注册表「20 spec-09 tools」硬编码计数断言在合法新增工具（skill_load，D105）时失效，须 run-lead 经 co-002 变更单授权最小写集扩展（2 文件）才全绿——教训：注册表/清单测试应偏好**成员断言**（expected 数组）而非计数断言（`tools.size === N`）；变更单模式（co-002：决策依据 + scope_limit 行级语义 + new_acceptance）沉淀为越写集修复标准流程；node_modules 断链问题本轮 C3 再次复现，D103 治理流程复证有效（复证非新决策）|
|D109|**durable 会话 + resume + 深度围栏（I2+I3 · chunk-durable-session）**：I2 **sleep 保留/归档替代 DELETE**——`sleepAgent` 对 oc- 会话不再 DELETE，`session-store.sleep` 保留 `pi_session_id`（`oc-<id>` 作平台持久会话引用、文件真相指针）；wake **resume 优先**（isAlive 探测 → 同会话 sendReady 续写，404/失联回退重 spawn + 转录摘要）；terminate 仍 DELETE。I3 子代理注册——SessionRecord 增可选 `delegation_depth`/`parent_session`（旧格式缺省 0/平台席，schema_version 保持 "1"）；`wakeAgent`（D057 统一 spawn 入口）深度围栏 ≤3，超限结构化拒绝 `SUBAGENT_DEPTH_EXCEEDED`（消息含当前深度与上限）|
|D110|**写集只收窄 + 所有权围栏（I4+I5 · chunk-fence-owner）**：I4 子代理有效写集 = 父 task write_paths ∩ 子声明（只收窄不放宽；子宽于父 → 结构化拒绝；父缺失 fail-loud；无父链退化现状）；I5 bus post 在 ACL 之上加 **owner 围栏**——目标为子代理会话房（depth>0 ∧ parent_session 非空）且发送者非其 `parent_session` → `ROOM_POST_DENIED`（消息含 owner fence 标记，agent-busy 等价；嵌套仅直接父可路由）；发送侧问人禁令——子代理仅可向其父可发言的房间发言（sponsor/领导层房不可直达）；复用错误码不新增（errors.ts 零改动）；非子代理房间语义零变更|
|D111|**settled 机械通知 + 投喂分级（I6+I1 · chunk-settle-feed）**：I6 guardian 纯派生检测子代理终态（depth>0 ∧ terminated ∧ parent_session）→ 复用 `cell_done` bus 词汇机械投递父房（refs 指转录/证据，meta.source=orchestrator 非 LLM 自报，父房 bus 幂等），**不新增 SESSION_EVENTS**（core session.ts 零改动）；I1 投喂三档 followup/steer/inject（S 变体不碰 17 状态机）——followup=现状续跑、steer=增量引导（摘要+引导段，不重灌固定模板）、inject=状态通知不唤醒不计数；投喂计数/预算/门闩收敛 continuation.ts 内防双逻辑（KI-6，不新建模块）|
|D112|**docs 收尾 + 流程教训（chunk-docs · W3）**：D109-D111 落档（表行+详条，来源标注到 chunk/task）+ D044 行 I2 修订标注 + decision-catalog 同步（durable 会话语义 + 三道围栏条目）+ E18 纪要 + `--land` 闭环；流程简化候选记录——sponsor 反馈 + 流程复杂度审计（真实性评级高、修正项已落地）A 级试点排下一轮流程优化 run，本轮只记录候选不实施|
|D113|**dashboard-server 读面扩展（W1a chunk-dashboard-server · D071「9 端点全 GET 只读」局部例外，仍只读）**：新增 bus 读面 3 端点（`GET /api/runs/:id/bus` 房间列表（bus/*.jsonl 扫描行计数，与 statusSnapshot.rooms 同源口径）/ `GET /api/runs/:id/bus/:room` 消息流（`?limit=` 默认 50 取最近 N 条、损坏行容错跳过、SAFE_ROOM_RE 防路径逃逸）/ `GET /api/runs/:id/bus/:room/members` 参与者（rooms/<room>/members.{yaml,json} 原样，容错 null））+ 流程数据源 2 端点（`GET /api/runs/:id/approvals` ApprovalStore.list 升序 / `GET /api/runs/:id/change-orders` readChangeOrders ts 升序，供 W2 flow-ui）；全部仍 GET 只读，fs 直读不套 ACL（面板观测者无 agent 身份，apiGates/statusSnapshot 先例），D070/D071 只读不变量延续|
|D114|**聊天室写面写代理（W1a chunk-dashboard-server · D070 只读例外唯一写端点）**：`POST /api/runs/:id/bus/:room` 为**唯一写端点**——以 **sponsor** 身份 post `type=chat`（D018 sponsor 永远人类 + D035 sponsor 通道仅 chat，语义不变）；校验链直接走 `@picode/bus` RoomStore.post（type 注册表 → members ACL → owner 围栏 → sender 围栏），**ACL fail-closed**——成员表须含 sponsor 且 access=post 且 post_types_allow 含 chat（现默认仅 leadership/product 两房），未授权结构化拒绝（ROOM_POST_DENIED 403 / BUS_TYPE_DENIED 400 / BAD_ROOM 400 / BAD_BODY 400 / ACL_CORRUPT 500）；其余路由非 GET 仍 405（只读不变量仅本端点局部例外）；index.ts CORS 补 POST（Access-Control-Allow-Methods: GET,POST,OPTIONS）+ OPTIONS 预检 204|
|D115|**流程可视化入面板（W2b chunk-flow-ui · 供 D113 approvals+change_orders 数据源消费）**：flow.api.ts 新增 useApprovals/useChangeOrders（3s 轮询）+ 门禁 tab 审批流区（pending/approved/rejected/used 徽章 + asked/decided 成对展示）与变更单区（proposed→applied→closed + 时间线）；门禁状态机展示每任务流水（双门闩 brief/staffing → progress phase → evidence pass → handoff+acceptance → dissolve → merge），数据源 /tasks latch/progress/evidence + /merge 队列 + /gates，纯派生 flow.data.ts（审批/变更单/门禁阶段标签本地化于 flow.data.ts，不占 labels.ts owner）|
|D116|**聊天室前端（W2a chunk-chat-ui）**：index.vue 新增「聊天室」tab + rooms-view 房间卡片点击进入聊天室（入口增强）+ chat-room-view 消息流视图（ts/类型徽章中文 labels 映射/body/refs/meta 详情可展开/参与者面板）+ chat-send-box 发送框（POST /bus/:room，成功清空 + 刷新，未授权结构化错误中文提示 ROOM_POST_DENIED/BUS_TYPE_DENIED，非 sponsor 可发房禁用发送框）+ chat.data.ts 派生纯函数 + chat.test.ts fixture 断言；轮询 3s（既有模式）+ 骨架屏/ErrorState（D071 语义 token 不硬编码色值）；审批联动——发送框失败提示与门禁 tab 审批流展示语义一致（本 chunk 不实现审批请求落盘，写代理 fail-closed D114）|
|D117|**流程项落地（W1b chunk-process-items）**：评分画像消费——hr-talent.ts 新增只读消费入口 `queryTalentPool`（按 grade/skills/seat 筛选、S/A 级优先）+ `picode staffing pool` 子命令（--grade/--seat/--skill，只读零写、不自动注入、非法 grade 结构化拒绝）；createStaffingRequest 支持显式预填 reuse_persona_ids（引用已存在字段，不新增配置键）；文档精简维护——scripts/doc-lean-check.mjs（零依赖只读检查：决策权威/关键目录/DECISIONS 行式/feedback 索引/冗余检测）+ package.json `docs:lean` 接线（可作 merge gate 输入）|
|D118|**docs 收尾 + 流程教训（W3 chunk-docs）**：D113-D117 落档（表行+详条，来源标注到 chunk）+ D070/D071 行修订标注（面板契约「9 端点全 GET 只读」→「+聊天室读/写 + 审批流/变更单数据源；写仅限 sponsor chat（D114）」）+ decision-catalog §25 同步（面板端点面 + 写代理条目）+ operations.md 监控面板节更新（新端点清单 + 聊天室 tab + 运维要点）+ E19 纪要 + `--land` 闭环（watermark reserved → landed，next_number 119）+ git push origin main（本 run 收尾含 push）|
## D084 — Skill harness 落地（技能承载体系）
- 2026-08-14 · 来源：run-lead 自治规划 run-2026-08-13T23-50-59-484Z（从 anthropics/skills + agentskills spec 学习，改 picode 自身技能承载体系）
- 问题：`paths.skills_root` 是 D055 死键（声明零读取），两个种子 SKILL.md 无任何校验守卫，新 skill 可任意书写；`Persona.skills[]` 是必填维度但零消费；ready 消息若硬注入 skill 正文会爆 context
- 决定（C1 spec + C2 wiring 落地）：
  - **① skill-lint**（`packages/core/src/validate/skill-lint.ts`，镜像 persona-lint 数据优先设计，不抛错返回结构化 `{ok, problems, files}` + CLI）：校验 `skills_root` 下全部 `**/SKILL.md` frontmatter——`name` 必填匹配 `SAFE_ID_RE`（`^[a-z][a-z0-9-]*$`）且等于目录名、`description` 必填（>1024 仅 warning，agentskills 建议上限，兼容存量 ponytail）、白名单键 `license`/`allowed-tools`/`compatibility`/`argument-hint`/`metadata`、未知键 warning（防误杀存量 argument-hint）
  - **② skills_root 激活**：`packages/core/src/skills.ts` 新增纯模块 `resolveSkillsRoot`/`discoverSkills`/`buildSkillIndex`/`personaDeclaredSkills`；`config.ts` 移除该键 D055 reserved 注释，`validateConfig` 补相对路径校验（非空/非绝对/无 `..` 逃逸）；**仅激活此键**，D055 其余死键（prompts_root 等）不动；未配置时 harness 空转零行为变更
  - **③ persona skills[] 接线**：`buildPiEnv` 读会话 persona frontmatter `skills[]`（实例人设 `staffing/personas/<seat>.md`，平台席回退 `.picode/agents/<role>.md`）→ 对账 skill 目录 → 注入 `PICODE_SKILLS_INDEX`（全量目录）+ `PICODE_PERSONA_SKILLS`（本会话声明路径）；`buildReadyMessage` 系统 prompt 追加「可用技能（metadata）」+「本会话声明技能」两段
  - **④ 渐进披露三层**：metadata（启动注入，`buildSkillIndex` 有界截断 ≈100 tokens）→ instructions（激活时 agent `repo_read` SKILL.md 正文，≤1024 字 desc 由 lint 守）→ resources（`scripts/`/`references/`/`assets/` 按需读取）；**SKILL.md 正文绝不进系统 prompt**（不爆 context、正文不进转录 → D076 stripNoise 无新负担）
  - **⑤ 校验/等价检查**：`npm run check` 追加 skill-lint（persona-lint + skill-lint 双通过）；单测覆盖 discover/buildSkillIndex/personaDeclaredSkills 与 skill-lint 全错误码及 validateConfig 路径逃逸拒绝
  - **⑥ 种子声明**：`.picode/agents/engineer.md` 与 `run-lead.md` frontmatter 增可选 `skills: [ponytail]`（dogfood 接线；persona-lint TEMPLATE_REQUIRED 不含 skills，加字段不破坏）
- 实现：C1 `packages/core`（skills.ts + skill-lint + config 激活 + index 导出 + package.json check 接线，884af8d）；C2 `packages/orchestrator`（pi-adapter buildPiEnv + opencode-adapter renderSkillsSection + 2 角色模板，d5d3aeb，含冲突修复 3ddabcc）；C3 本文档 + skill-spec.md + skill-harness.md + catalog §15 + E11 纪要
- 边界：未知 skill 名 → index 标记 unavailable 不阻断 spawn；allowed-tools 仅解析不强制（D088 拒）；agent 激活为模型自主（D003 编排器无 LLM）
- 缓项：D085 skills-ref 官方工具接入（需网）、D086 打包/导入双轨机械实现（需网下载器）；拒项：D087 skill-creator 评价循环、D088 allowed-tools 机械强制

## D085 — 缓项：skills-ref 官方校验工具接入
- 2026-08-14 · 来源：run-2026-08-13T23-50-59-484Z 决策清单 (d) 1
- 事实：agentskills spec 官方校验工具为 npm 包，需联网安装/运行，picode 无裸网（D010 信息控制）
- 处置：自研 skill-lint 已覆盖等价语义（name/desc/命名）；后续 picode 信息控制允许后接官方工具或对齐其语义。留档

## D086 — 缓项：skill 打包/导入双轨机械实现
- 2026-08-14 · 来源：run-2026-08-13T23-50-59-484Z 决策清单 (d) 2
- 事实：mattpocock M6 双轨（托管只读 vs 可编辑副本）已以文档约定存在（skills/README M6），机械实现依赖 CLI 下载器（需网）
- 处置：本轮不做；后续独立任务实现托管/可编辑安装器。留档

## D087 — 拒：skill-creator / 评价循环
- 2026-08-14 · 来源：run-2026-08-13T23-50-59-484Z 决策清单
- 决定：anthropics skill-creator 全套（evals/benchmark/variance）依赖 LLM 评价循环，超出本轮「承载体系」边界——本轮只做规格+校验+注入；后续独立 run 立项

## D088 — 拒：allowed-tools 字段机械强制
- 2026-08-14 · 来源：run-2026-08-13T23-50-59-484Z 决策清单
- 决定：skill 级工具白名单与 picode ACL（09 tool-profiles 六层）关系未定，强制可能破坏现有权限模型；本轮仅解析不强制，留档待设计
- 纪律：未立项不实现

## D089 — 决策编号全局分配器（watermark ledger + reserve 脚本，C1 task-decision-reserve）
- 2026-08-14 · 来源：run-lead 自治规划 run-2026-08-14T07-27-45-654Z（并行 run 决策编号冲突修复）
- 问题：并行 run 各自向 DECISIONS 追加决策时按「当前最大编号+1」取号会撞号（D084-D089 曾因 skill docs 与 checkpoint docs 并行合并冲突重排，重复编号进入 main 无人拦截）；碰撞只能事后人工平移
- 决定：引入机器状态水位 ledger 全局分配决策编号——
  - `docs/decisions/watermark.yaml`（schema v1）：`next_number` + `reservations[]`（`run` + 编号区间，`status: reserved|landed`）
  - `docs/decisions/reserve.mjs`：`--reserve --run <id> --count N` 领取连续编号段并推进水位 / `--land --run <id>` 标记占用 / `--status` 只读快照；复用 `@picode/core` `withFileLock`+`writeAtomic`，flock 临界区原子 read-modify-write；同 run 重复 `--reserve` 幂等返回既有预留
  - `docs/DECISIONS.md` 顶部加水位说明：**勿手改 watermark（机器状态）**，新决策先 `--reserve` 领号、落地后 `--land` 标记占用
  - 预留字段名：C1 reserve.mjs 写 `from`/`count`，C2 decision-lint 解析 `start`/`count`——两实现不一致（见 E12 剩余风险），本 run 落地按 lint 兼容 `start`/`count`
- 实现：`docs/decisions/{watermark.yaml,reserve.mjs,reserve.test.mjs}`（9 用例：幂等/并发区间不重叠/land 幂等/损坏文件拒读）+ DECISIONS 顶部说明
- 验证：npm run build + npm test 全绿（429 断言）+ reserve.test.mjs 9/9 通过
- commit: 2d39b37 / 4e004c0（C1 task-decision-reserve 合并）

## D090 — decision-lint 决策编号完整性校验（C2 task-decision-lint）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-14T07-27-45-654Z C2 + D089 设备（碰撞「从事后人工平移」变「机器门禁」）
- 问题：D089 水位 ledger 管分配，但 DECISIONS 的**完整性**（编号唯一/详条↔表行对应/水位一致/引用可解析/预留不冲突）仍无校验——损坏状态会再次静默进入 main
- 决定：`packages/core/src/validate/decision-lint.ts`（镜像 persona-lint 数据优先设计，损坏输入不抛错，返回结构化 `{ok, problems, files}` + CLI），校验六项：
  1. 表行编号唯一（DUP_TABLE，error）
  2. 详条编号唯一（DUP_SECTION，error）
  3. 详条↔表行对应（TABLE_SECTION_MISMATCH，error）
  4. watermark 水位一致（WATERMARK_DRIFT，error：max 表号 ≤ next_number-1）
  5. docs/** D0xx 引用可解析（REF_UNRESOLVED，warning——历史债不阻断）
  6. reservations 幂等/无冲突（RESERVATION_COLLISION，error：与既有 DECISIONS 编号/互相重叠）
  - `--plan <file>` 规划期预检：plan 文件 D0xx 引用对「DECISIONS ∪ 预留」解析，run-lead 写 plan 前即可拦截碰撞
- 实现：`decision-lint.ts` + `decision-lint.test.ts`（全错误码覆盖 + 合法 fixture 零报错 + `--plan` 预检 + 修复前损坏样本报 DUP 防回归）+ `index.ts` 导出 + `npm run check` 接线（persona-lint + skill-lint + decision-lint 三 lint）
- 验证：npm run build + npm test 全绿；decision-lint 对修复前损坏 DECISIONS 报 6 error（C3 修复后清零）
- commit: a20dbd8 / 8460427（C2 task-decision-lint 合并）

## D091 — checkpoint 自动捕获接线（guardian 周期捕获 + merge 前捕获，boundary 扩展，快照只读边界不变）（C1 task-checkpoint-auto + C2 reserve-schema）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-14T08-55-08-366Z（C1 checkpoint-auto）+ E12 剩余风险 #1 落地（C2 reserve-schema）
- 问题：D082 MVP 仅显式捕获（`boundary: manual`），guardian/merge 前自动捕获为缓项（E10 后续候选）；同时 C1/C2 预留 schema 不一致——reserve.mjs 写 `from`/`count`、decision-lint 只解析 `start`/`count`，领号 → lint 全链路无法闭环
- 决定：
  - **自动捕获接线（boundary 扩展）**：新增 `self_evolve.checkpoints` 配置——`enabled`（默认 **false** = D082 显式捕获行为不变）、`guardian_interval_sec`（默认 **600s** 节流，0 = 每次 tick 都捕获）、`pre_merge`（默认 **true** 但受 `enabled` 总开关约束）
  - checkpoint-store 新增 `GUARDIAN`/`PRE_MERGE` 边界常量 + `guardianCaptureDue` 纯函数（距上次 guardian 捕获超间隔 → due；从未捕获 → due）+ `captureDueGuardianCheckpoints`（仅写观测文件，跳过终态/缺失 task，节流复用）
  - self-drive：`guardianTick` 在 `checkBudgets` 之后接线周期捕获，`GuardianTickResult.checkpoints` 仅作观测回报，**不驱动任何状态决策**
  - merge：`mergeNext` 实际合并前 best-effort 捕获（`enabled && pre_merge`，boundary=pre_merge），try/catch 绝不阻断 merge；`MergeOutcome.checkpoint` 纯观测
  - **快照只读/文件为准边界（D082）不变**：自动捕获仍只写观测文件，不读 checkpoint 驱动任何恢复/续跑/调度/合并状态决策
  - **reserve 字段对齐（C2）**：`reserve.mjs` 预留条目字段统一为 `{run, start, count, status}`（`from`→`start`），与 decision-lint 校验契约（D090）一致；新增 `--plan <file>` 预检（复用 checkDecisions，REF_UNRESOLVED/PLAN_MISSING 输出与 decision-lint 逐字对齐）
- 实现：`packages/core/src/config.ts`（CheckpointCaptureConfig + 校验 + DEFAULTS）、`packages/orchestrator/src/checkpoint-store.ts`（GUARDIAN/PRE_MERGE 常量 + guardianCaptureDue + captureDueGuardianCheckpoints）、`self-drive.ts`（guardianTick 接线）、`merge.ts`（mergeNext 前捕获）+ 对应测试；`docs/decisions/reserve.mjs` + `reserve.test.mjs`
- 验证：npm run build + npm test 445 断言全绿（core 111 / orchestrator 282），tsc -b 干净；D082 边界由 sdet 独立审计 PASS（checkpoint 仅写不读）；reserve.test.mjs 12/12（领号→lint 闭环 + 未预留 REF_UNRESOLVED + plan 缺失 PLAN_MISSING）
- commit: 7860df0（C1 task-checkpoint-auto 合并）/ 3b99888（C2 task-decision-reserve-schema 合并）

## D092 — 摘要剔噪口径统一收敛到 summary-noise.ts（C1 task-summary-noise-unify）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-14T10-07-06-439Z（C1 摘要剔噪口径统一，宽松目标）
- 问题：`READY_MESSAGE_TEXT` 定义在 `opencode-adapter.ts`、`CONTINUATION_PROMPT` 定义在 `continuation.ts`，两处分别维护 stripNoise 清单导致**口径漂移**——re-spawn（D083）只剔 ready 模板，feed/checkpoint（D077/D082）剔 ready+续跑模板，同一份转录在不同消费方产出不同摘要，噪音过滤语义不一致
- 决定：
  - 新建 `packages/orchestrator/src/summary-noise.ts`（**零 import、零依赖**）：收敛 `READY_MESSAGE_TEXT`/`CONTINUATION_PROMPT`/`CONTINUATION_SUMMARY_HEADER` 常量 + 导出统一剔噪清单 `SUMMARY_STRIP_NOISE`（`[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`）；零依赖模块可被 orchestrator 任意模块引用而不引入循环依赖
  - `opencode-adapter.ts`/`continuation.ts` 从该模块导入并**保留 re-export**，既有引用路径（checkpoint-store / 测试）零改动
  - feed（`feedContinuation`）/ checkpoint（`CHECKPOINT_NOISE`）/ re-spawn（`wakeWithOpencode` 摘要）**三处统一消费** `SUMMARY_STRIP_NOISE`，剔噪口径单一来源
  - **re-spawn 行为变更**：`wakeWithOpencode` 摘要由仅剔 `READY_MESSAGE_TEXT` 改为统一剔 ready+续跑模板，与 feed/checkpoint 语义对齐（opencode-adapter.test 断言扩为双剔除）
- 实现：`summary-noise.ts` + `summary-noise.test.ts`（常量语义 + `SUMMARY_STRIP_NOISE` 组成 + **零 import 结构校验**）+ `opencode-adapter.ts`/`continuation.ts`/`checkpoint-store.ts` 接线 + checkpoint-store.test 追加 `CHECKPOINT_NOISE === SUMMARY_STRIP_NOISE` 统一口径断言
- 验证：npm run build 全量通过；npm test 全绿（core 111 / orchestrator 285 / mcp-server 17 / dashboard-server 16，0 fail）；tsc 干净
- 边界：summary-noise 零依赖下沉不改变任何消费方对外契约（re-export 兼容既有 import 路径）；剔噪口径从此以 `SUMMARY_STRIP_NOISE` 为单一事实源
- commit: ea6982e（C1 task-summary-noise-unify 合并，main = b2a0321）

## D093 — `picode supervise` 监控命令正式化（C2 task-supervise-command）
- 2026-08-14 · 来源：run-lead 规划 run-2026-08-14T10-07-06-439Z（C2 监控守护正式化，宽松目标）
- 问题：`scripts/supervise/supervise.mjs` 监控循环（token/会话/worktree/任务轮询 + STOPPED 判定）仍为硬编码 dogfood 脚本，无产品出口；`fetchLiveTokens` 仅存于 `dashboard-server`，orchestrator 反向依赖破坏包边界
- 决定：
  - **live tokens 原语上移**：`packages/orchestrator/src/live.ts` 自 dashboard-server **原样迁移** `fetchLiveTokens`/`lastTokenSample`/`serveSessionIdOf`/`stripOcPrefix`，index re-export；dashboard-server `live.ts` 改薄壳 `export * from "@picode/orchestrator"`（router/index.test 同步改从 orchestrator 导入）
  - **supervise 观测纯函数**：`supervise.ts` `deriveSuperviseObservation`（statusSnapshot + 每 awake 会话 `fetchLiveTokens` + worktree `.ts` 计数，`fetchImpl` 可注入，纯读）输出 `{ts,agents,total,worktrees,tasks,merge_queue}`；`isIdleStopped` 纯函数——total 连续 3 轮零增长判定，**POLL_FAIL 不计入 total、不参与空闲判定**（轮询失败非空闲信号）
  - **CLI 出口**：`picode supervise --once`（默认单次观测 JSON）/ `--interval <sec>` 循环 + STOPPED 判定退出 0 / `--log <path>` 每次观测追加 JSONL（与 --once/--interval 均兼容）；`commands/index.ts` 注册 + DOMAIN_ORDER 加 supervise；cli.test --help 命令表断言
  - **无 daemon 不变量（D037）延续**：supervise 为**操作者前台调用**，每次观测独立派生，非平台守护进程
- 实现：`live.ts` + `live.test.ts`、`supervise.ts` + `supervise.test.ts`、`commands/supervise.ts`、`commands/index.ts`、dashboard-server `live.ts` 薄壳 + `index.test.ts` 同步
- 验证：npm run build && npm test 全绿（478 断言，orchestrator 298）；npm run check 三 lint 0 error；对真实 run 仓 `--once` 实测输出观测（含本会话 live tokens）
- 边界：STOPPED 仅是退出信号，不驱动任何状态变更；tokens=0（无会话成功采样/全 POLL_FAIL）不判空闲——需 operator 介入而非自动 STOPPED
- commit: b2a0321（C2 task-supervise-command 合并，main）

## D094 — 缓项：feed 映射文档化 / checkpoint 进 status 三面等（后续候选）
- 2026-08-14 · 来源：run-2026-08-14T10-07-06-439Z（D092/D093 决策边界）+ E13 后续候选延续
- 事实：本轮落地 D092（摘要剔噪口径统一）+ D093（supervise 命令正式化）；以下项未立项、留档：
  1. **feed 映射文档化**：summary-noise 消费方（feed/re-spawn/checkpoint 三处）的剔噪口径映射与机制说明现仅散见 DECISIONS/catalog，未成单一图鉴文档——待独立 docs 任务收敛
  2. **checkpoint 进 statusSnapshot 三面**：MVP 仅 CLI 消费面；三面（status/CLI/MCP）同源需动 status 契约 + mcp-server（E13 后续候选 1 延续）
  3. **自动捕获默认开启评估**：观测价值验证后考虑翻转 `checkpoints.enabled` 默认值（现保守默认 false，E13 后续候选 2 延续）
  4. **摘要语义化/关键动作提取**（D080 延续）：stripNoise 仅精确剔模板句，摘要可读但不含「关键动作」语义（仍启发式，不引 LLM，D003 不变量不变）
- 处置：未立项不实现；实施须重新立项并走 D089 领号（`--reserve` → 落地 → `--land` → decision-lint 全绿）
- 纪律：缓项只记录不实现，避免范围蔓延


## D095 — checkpoint 观测三面同源（C1 task-checkpoint-status-triad）
- 2026-08-14 · 来源：run-2026-08-14T11-14-26-837Z 规划（E14 后续候选 #1 落地）
- 决定：StatusSnapshot 增 checkpoint 段（每任务 latest checkpoint 概要：task_id/latest_at/boundary/sha256，只读）；`picode checkpoint status` 与 MCP checkpoint_status 与 status 快照同源（D039 三面口径一致延续）
- commit: 4903f63（C1）

## D096 — checkpoint 自动捕获默认开启（C2 task-checkpoint-auto-default）
- 2026-08-14 · 来源：run-2026-08-14T11-14-26-837Z 规划（E14 后续候选 #2 评估）
- 决定：`self_evolve.checkpoints.enabled` 默认翻转 true（guardian_tick 周期捕获 + pre_merge 捕获生效）；显式 false 可关闭；快照只读/文件为准边界不变（D082）
- commit: 2c0d718（C2）

## D099 — deepMerge 深拷贝修复（Bug A · C1 task-config-singleton）
- 2026-08-15 · 来源：run-2026-08-15T01-12-43-3NZ C1（run-lead 实证：guardianTick 顺序依赖失败 + 不隔离 HOME 15+ 失败）
- 问题：`deepMerge(DEFAULTS, {})`（core/src/config.ts:537-566，558-564 `out={...a}` 浅拷贝）→ 未覆盖嵌套子树与 `DEFAULTS` 共享引用 → `config.opencode === DEFAULTS.opencode` → `enableOpencode()`（self-drive.test.ts:172-177）改「加载后 config」→ **污染 DEFAULTS 全局单例** → 同进程后续 `loadConfig`（loader.ts:32-54）读到被篡改值（opencode.enabled=true）→ guardianTick 用例顺序依赖失败（官方测试 303/304 失败 1；不隔离 HOME 15+ 失败）
- 决定：`cloneValue` 递归深拷贝——对象分支未覆盖键深拷贝、覆盖键递归 deepMerge、b-only 键深拷贝；数组分支 byId/rest 项深拷贝；fallback 深拷贝。合并结果与 DEFAULTS/overlay 完全独立。**语义保持**：数组按 id 合并、`enabled:false`/`_delete` 删除、无 id 项追加（13 §2 既有+新用例守护）
- 附带发现（假绿→暴露）：checkpoint-auto 用例（self-drive.test.ts:815-846）基线「绿」依赖 Bug A 污染的静默 wake 失败——修复移除污染后暴露（task 无 progress.json → `sweepProgress` 判 staleSec=∞ → `progress_due` 正常唤醒，与 checkpoint 捕获无关）。**裁决 = co-001 变更单**（run-lead 2026-08-15 授权 C1 行级夹具修复，`188b057`，仅 1 文件 +13 行；不碰 guardianTick/checkpoint 实现语义）
- 实现：`packages/core/src/config.ts`（cloneValue 深拷贝）+ `config.test.ts`（两次 loadConfig 互不影响回归）+ `loader.test.ts`（user-global enabled 存活 / defaults 深等语义不变）+ `orchestrator/src/t-regression.test.ts`（roomDisplay 引用清理）
- 验证：core 122/122、bus 19/19、orchestrator **304/304**、pi-extension 17/17、mcp-server 18/18、dashboard-server 16/16，官方 `npm test`（HOME 隔离）`FULL_TEST_EXIT=0`；C1 合并（2df7486）后全量 502/502 复核通过
- commit: d229eea（C1 task-config-singleton 合并）+ 188b057（co-001 夹具修复）

## D100 — E2/E7 排除语义按层分组判定（Bug B · C2 task-evolve-glob-fix）
- 2026-08-15 · 来源：run-2026-08-15T01-12-43-3NZ C2（run-lead 实证：E7 与 E2 双处同病，比审计记录多一处）
- 问题：`layers=[knowledge,docs]` → `evolveWritePaths` 扁平并集（evolve.ts:64-75）→ docs 层 carve-out `!docs/knowledge/**` 在并集后被扁平化 → `assertEvolveWritePathAllowed`（evolve.ts:85-91）「任一 exclude 命中即 throw」**误拒 knowledge 层 include**（E2）；`checkPersonas`（staffing.ts:289-296）`outsideLayer = excluded || !includes` **同病**（E7）
- 决定：core 新增共享判定 `isEvolveWritePathAllowed(config, evolve, writePath)`——**按层分组**：路径 ∈ 某层 includes ∧ ∉ 该层 excludes → 放行；goal `forbidden_paths` 全局否决；carve-out 只否决其所属层，不否决其他层 include。E2 `assertEvolveWritePathAllowed` 委托该判定（保留 `excluded by evolve layer` / `not inside any evolve layer` 两种错误消息）；E7 `checkPersonas` 改调该判定（删除本地同病逻辑，import 同步清理）。**单一事实源**
- 单层语义不变（硬约束）：docs 层（无 knowledge 层）对 `docs/knowledge/**` 仍拒（orchestrator evolve.test.ts:66-81 原样保留，防「为修 bug 放水」）
- 实现：core `evolve.ts` + `evolve.test.ts`（×4 双层放行/单层仍拒/forbidden 全局否决+非层内仍拒/并集形态契约）、orchestrator `staffing.ts` + `staffing.test.ts`（×2 E7 双层零问题/单层仍报）、`evolve.test.ts`（×1 多层放行对照）
- 验证：build 0 error；针对性回归 37/37；官方 npm test 506/507（唯一失败=guardianTick 基线 flake，stash 对照 303/304 同失败，单独跑 1/1 通过）；orchestrator 306/307 vs 基线 303/304（+3 新用例全过）；diff 门禁 5/5 ⊆ write_paths
- commit: 492e2ac → merge **362718a**（C2 task-evolve-glob-fix）

## D101 — yagni 死配置清理（D055 局部解除 · C1 task-config-singleton）
- 2026-08-15 · 来源：run-2026-08-15T01-12-43-3NZ C1（ponytail-audit 转达 + D055 reserved 6 处逐键甄别）
- 问题：D055 预留的 6 个配置键零读取（sess_mgr.enabled / allow_orch_force_wake / self_evolve.enabled / require_sponsor_merge / knowledge_log_glob / idle_sleep_sec），配置面冗余误导
- 决定：5 删 1 留——
  - **删 ×5**（全仓 grep 零读取，接口+DEFAULTS 同步删）：`sess_mgr.enabled`、`sess_mgr.allow_orch_force_wake`、`self_evolve.enabled`、`self_evolve.require_sponsor_merge`、`self_evolve.knowledge_log_glob`
  - **留 ×1**：`sess_mgr.idle_sleep_sec`——真实读取点 `orchestrator/src/self-drive.ts:373,380`（`sleepIdleSessions` opt-in），**不得删除**，仅刷新注释标记 reserved
  - **兼容**：既有用户配置含已删键仍可加载（分层 merge 不拒未知键、validateConfig 不查已删键，loader.test.ts 新用例守护）
- 实现：`packages/core/src/config.ts` + `config.test.ts`（D4 断言 :85 self_evolve.enabled 同步）+ `loader.test.ts`
- 验证：core 122/122、官方 npm test 全绿（FULL_TEST_EXIT=0）；残留键配置可加载
- commit: d229eea（C1 task-config-singleton）；docs 侧摘录同步（default-config.example.yaml）归 C6（D101 落地）；spec 17/19 历史 yaml 示例仍含已删键字样（非运行时引用，C6 不动，见 E16 剩余风险留档）

## D102 — ponytail 清理（死导出×3 + 薄壳×3 + 夹具单源 · C1/C3/C4/C5）
- 2026-08-15 · 来源：run-2026-08-15T01-12-43-3NZ（plan (e) 排期：死导出 / 薄壳并入 / 夹具单源）
- 问题：监督者 ponytail-audit 全仓审计——死导出符号（roomDisplay / isPicodeError / canConsumeModel，prod 引用 0 仅测试引用）；单导出薄壳（mcp-server errors.ts/schema.ts、orchestrator jsonl.ts，复制粘贴风险）；24 处本地 tmpGitRepo/mkdtemp 夹具重复
- 决定：
  - **死导出 ×3**：`roomDisplay` 定义（config.ts:779）+ 唯一测试引用 t-regression.test.ts:12,86 同 chunk 闭环（C1）；`isPicodeError`/`canConsumeModel` 删除 + 引用同步（C3：errors.test.ts:8,25、core session.test.ts:6,68-70、orchestrator session.test.ts:8,61-65 改内联等价断言），grep 三面（prod+test+dist）零残留
  - **薄壳 ×3 并入调用方（C4）**：mcp-server `errors.ts`（toMcpError → index.ts）/ `schema.ts`（toZodShape → index.ts）并入 + 测试改走 test-utils 共享 helper（**禁止 import ./index.js**——顶层 `await server.connect(StdioServerTransport)` 会触发服务器启动）；orchestrator `jsonl.ts`（readJsonl）→ **rules-engine.ts 单宿主导出 + merge.ts 跨引**（C4 复核打回复制粘贴，279c8d7 修正）
  - **夹具单源（C5）**：两包 test-utils 共享 `gitInit`（branch 选项）+ `tmpGitRepo` 包装，24 文件本地定义归零（A 类 5 直换 / B 类 15 / C 类 2 特殊步骤保留 / D 类 2 自定义行为 branch:null 逐字保留）；行为零变化（分支/email/name/前缀/自定义步骤逐字等价抽查）
- 验证：C1 合并 2df7486、C3 合并 f4c4a4b、C4 合并 6fa14ab、C5 合并 1f93f55；每合并点官方 npm test 全绿，C5 后全量 **502/502**（core 125/bus 19/orch 307/pi 17/mcp 18/dash 16）；diff 门禁 C5 26/26 ⊆ write_paths
- commit: d229eea（C1）/ ef25cd2（C3）/ 9f5a2f2+279c8d7（C4）/ adf7cda（C5）

## D103 — 环境教训：工作房 node_modules 断链治理（C1/C2/C4 同型问题）
- 2026-08-15 · 来源：run-2026-08-15T01-12-43-3NZ 实施期观察（C1/C2/C4 工作房同型问题上报）
- 问题：git worktree 内 `node_modules/@picode/*` 指向不存在的 `.picode/node_modules`（断链），`@picode/core` 解析落主仓**陈旧 dist**，测试/构建读到旧产物（TS2688 瞬时错误 / 串扰）；C1/C2/C4 三次复现，每次均需重建自链修复
- 决定：工作房环境治理流程沉淀为 run 标准操作——
  1. worktree 内重建 `node_modules/@picode/*` 自链（指向本 worktree 的 packages dist）
  2. `find packages -name "*.tsbuildinfo" -delete` 清理缓存，避免瞬时 TS2688
  3. 官方 `npm test`（HOME 隔离）跑全量；补充包级跑另设 `TH=$(mktemp -d)`
  4. sdet/审查复建环境须重复上述步骤（gitignored 自链零 repo diff）
- 影响：后续 run 工作房统一布局（node_modules 自链 + 缓存清理 + HOME 隔离）；不改变任何业务语义，纯环境/工具面治理
- 验证：C4 evidence（精卫）按此流程双跑取证（/private/tmp/picode-base-c4-*、picode-chunk-c4-*）；C5 全量 502/502 复证
- commit: 无独立提交（流程沉淀，证据见各 chunk handoff/evidence.yaml）

## D104 — goal 激活/回合预算/政策码（C1 chunk-c1-goal-crossrun · 守 D002 文件真相）
- 2026-08-15 · 来源：run-2026-08-15T02-30-00-DSH C1（团队 周晷，提交 2f8ceba + 8cb44b7 → merge 6a4a1ba）+ survey §2 #1@118-131（DSH dsh-goal：CAS revision / roundsStarted+maxGoalRounds / activation armed|disarmed / blockedReason 政策码）+ intake §6 A1-A6 + spec 17 §5.4（明界，C1 写入）
- 问题：goal.yaml 无 revision CAS（并发写 = 最后写胜）、无回合预算、无 disarm/resume 激活语义（跨进程恢复即静默续跑风险）、blocked 只有自由文本 park_reason 无政策码
- 决定（逐项）：
  - **revision 仅 CAS 围栏，不重建状态**（守 D002/D082）：goal.yaml 仍文件真相；`updateGoal(dir, expectedRevision, fn)` 函数层 CAS，陈旧 expected → `PicodeError(ILLEGAL_TRANSITION, "... stale revision ...")`——复用既有错误码不新增（errors.ts 归 C3 域，C1 零触碰，D1/D8）；读侧免锁（writeYamlFile temp+rename 原子可见）
  - **激活语义（guardian 投喂 vs goal resume 明界）**：`activation: armed|disarmed` 持久化于 goal.yaml；新 run 默认 disarmed；`setGoalStatus`→active **不自动 arm**（D3）；block→disarmed；**唯一 arm 入口 = `picode goal resume`**（blocked→active + 清 blocked_reason + armed；intake/completed 等非 allowed 状态 GOAL_TRANSITIONS 围栏拒绝，D5）。guardian 投喂 = 会话级机械续跑（active∧armed 可投喂；active∧disarmed 零投喂）；goal resume = goal 级激活授权；activation=disarmed 只门闩续跑投喂、**不阻断 run 文件事件推进**（task_ready/merge_ready/progress_due 照常）。明界写入 spec 17 §5.4
  - **旧格式向后兼容**：readGoal 对无 activation 字段的旧 active goal 默认 armed（视为曾由 set-status 授权，行为兼容，D3/K4）；其余 → disarmed；旧格式 max_goal_rounds 默认 0（D7）
  - **回合预算**：`rounds_started` 每次成功续跑投喂（feedContinuation 成功）→ +1，resume/disarm/block 不计数（D2）；`rounds_started ≥ max_goal_rounds`（0=不限）→ guardian 自动 `blockGoal(code:"round-limit")` 零投喂（D6，sweep 级预算检查先于候选派生）；resume 也拒绝（预算硬天花板，round budget exhausted，D5）
  - **政策码**：`block --code` 接受任意 lower-kebab（格式校验，不硬白名单）；规范码 `draft-idle` / `round-limit` / `provider-limit` / `queue-failed`；guardian 自动码 round-limit（D4）
  - **配置旋钮最小化（衔接 D106）**：仅此一个 config 新键 `self_evolve.goal.max_rounds`（非负整数，默认 0=不限，validateConfig 拒绝非法值）；createRun 时落盘 goal.yaml `max_goal_rounds`（文件真相；goal.yaml 显式字段可编辑覆盖；运行期预算读 goal.yaml 不回查 config，D7）
  - **同步锁取舍（D1）**：goal 变更走同步文件锁 `withSyncFileLock`（`.goal.lock`，O_EXCL + {pid,at} 陈旧恢复 + 有界重试，镜像 withFileLock 语义——mcp-server/self-drive 同步调用面不可改 async）统一入口 `updateGoal`，写侧串行
- 观察项（C1 K1/K2，C5 记录）：① CLI 无 `--expected` 乐观锁参数——CAS 在函数层强制执行（单测守护 A3）；命令层并发写经同步文件锁串行化（sdet ev-4-lock 实测：两并行 block 进程先到者成功、后者被 GOAL_TRANSITIONS 围栏拒绝，goal.yaml 无损坏）；如需 CLI 级乐观锁可扩展 `--expected` 标志（留观察）；② withSyncFileLock 与 atomic.ts withFileLock 两套并存（协议等价、调用面不同），后续可统一（留观察）
- 验证：C1 evidence（run-store.test A1/A3/A4、goal.test lifecycle/block USAGE、continuation-gate.test A2 跨进程门闩/A4 预算自动 block）；官方 npm test（HOME 隔离）519/519；合并后 562/562（C2 终态）；decision-lint 前向引用消解（spec 04-enforcement §10.4 引用 D104，C5 落地后 0 warning）
- commit: 2f8ceba（C1 提交）+ 8cb44b7（fix：block 同时置 activation=disarmed，与交接包 D3 对齐）→ merge **6a4a1ba**

## D105 — skill_load 双轨（persona skills[] 声明 vs 运行时按需加载 · C2 chunk-c2-skill-load）
- 2026-08-15 · 来源：run-2026-08-15T02-30-00-DSH C2（团队 运斤，run-lead 接管提交 d3bb0c2 → merge 83df029）+ survey §2 #3@153-165（dsh-tool-skill 渐进披露：系统提示只挂目录，`ctx.skills.get(name)`@126 调用时取完整 body；catalogDescriptionMaxLength@27）+ intake §6 B1-B3 + D084（技能承载体系基线）
- 决定：
  - **双轨明界（声明 vs 按需）**：persona `skills[]` 声明 = 系统提示常驻**元数据**（D084 渐进披露 metadata 层，有界截断；SKILL.md 正文绝不进系统提示）；`skill_load <name>` = 运行时按需取**完整 body**（SKILL.md 全文含 frontmatter）。加载结果仅回工具结果、**不注入 persona 系统提示**——两轨并存不重复注入（B2）。一行界定写入 `docs/guides/skills/skill-harness.md` §5
  - **ACL 受限（B1）**：core `loadSkill(name, metas, {cwd, maxBytes})` 按 discoverSkills 索引解析 SKILL.md 完整 body；pi-extension 注册 `skill_load` 工具；tool-profiles ToolName 增 `skill_load`，画像授权 implement.engineer / implement.squad-lead；未授权画像 → TOOL_DENIED 结构化拒绝（extension-acl.test 守护）
  - **健康校验结构化错误**：SKILL.md 缺失 → SKILL_MD_MISSING；坏 frontmatter → SKILL_BAD_FRONTMATTER；越界路径 → SKILL_PATH_DENIED（cwd 围栏纵深防御——工具侧 metas 来自 `discoverSkills(<cwd>/skills)` 天然受限）
  - **未知名技能内联码**：`SKILL_NOT_FOUND`（skills.ts 本地 SkillLoadCode 常量），**不进 ErrorCode 枚举**（errors.ts 归 C3，本 chunk 零 diff）
  - **体积有界（B2）**：`DEFAULT_SKILL_MAX_BYTES = 64KiB`；env `PICODE_SKILL_MAX_BYTES` 可覆盖（**唯一旋钮，不新增 config 键**，衔接 D106 配置旋钮最小化；skills_root 配置化覆盖不在本轮范围——C2 known_issues §3）；超限 byte 感知截断（不劈多字节字符）标注 `truncated: true` + `bytes`/`maxBytes` 字段
  - **共享文件纪律**：pi-extension/src/index.ts owner=C3（52d22ae 已合并），C2 纯增量追加（import +4 符号、尾部工具注册区、文件底 skillMaxBytes helper），C3 区（repo_write/repo_read/沙箱/审批/守卫）零改动；git diff 复核零删除行
- 越写集处置（co-002，衔接 D108）：全量测试唯一失败 = extension.test.ts「all 20 spec-09 tools are registered」计数断言（C2 按验收 B1 合法注册 skill_load 第 21 个工具）；该文件不在 C2 write_paths（diff 门禁）；run-lead 经 **co-002** 变更单（2026-08-15T10:44:45Z）授权最小写集扩展（extension.test.ts 20→21 + mcp-server execution.ts 09 matrix 20→21 校验；registry.test.ts 保持 20 成员语义）后全量 562/562
- 验证：C2 evidence（sdet 承蜩 verdict pass）：官方 npm test（HOME 隔离）562/562 exit 0（core 155/bus 19/orch 318/pi-extension 36/mcp-server 18/dashboard-server 16）；npm run check 三 lint 0 error；sdet 独立驱动实测 `skill_load ponytail` 返回完整 body（11/11 + 独立脚本 8/8，body 与磁盘 SKILL.md 全文 6637 字节逐字一致）；ACL 拒绝（implement.sdet / governance.sess-mgr → TOOL_DENIED）；未知 ghost-skill → SKILL_NOT_FOUND；env maxBytes=100 → truncated=true
- commit: d3bb0c2（C2 提交，run-lead 接管；庖丁会话 failed）→ merge **83df029**

## D106 — 沙箱三态 + 一次性升级审批 + read-before-edit（C3 chunk-c3-sandbox-approval）
- 2026-08-15 · 来源：run-2026-08-15T02-30-00-DSH C3（团队 锁钥，提交 2e50375 → merge 52d22ae）+ survey §2 #2@135-149（SANDBOX_MODES@26 / WIDER_MODES@29 / approveEscalation@92 / APPROVAL_POLICIES@36 / 审计对@144,155 / allowed-once）+ survey §2 #7@222-233（ObservedStateGate@16 / editIntent@89 FS_NOT_OBSERVED）+ intake §6 E1-E5 + intake Q4@168 + goal.yaml constraints:20（sponsor 2026-08-15 确认：升级请求 run-lead 代批，policy 层变更走 sponsor 人工）
- 决定（逐项）：
  - **沙箱三态（E1，双轨定位）**：core `SANDBOX_MODES = [read-only, workspace-write, danger-full-access]`；每调用 `resolveSandboxMode`（会话 env `PICODE_SANDBOX_MODE` 覆盖 > 默认 workspace-write；非法 env fail-loud SANDBOX_MODE_INVALID）。**定位 = write_paths 静态白名单之上的动态兜底围栏，不替代**（E4）：read-only 拒一切写（含白名单内）；workspace-write 白名单内可写、越界结构化拒绝（WRITE_PATH_DENIED 含生效 mode + `[sandbox: file access denied under <mode> mode]` 标记 + 升级提示）；danger-full-access 工作房（cwd）内任意路径可写、**仍拒 path escape 出 cwd**（比 DSH full 更保守，宁紧勿松）
  - **一次性升级阶梯（E2）**：越界写可申请升级——`repo_write` 携带 `sandbox_permissions` + `justification` **成对**（缺一/空白/非法 mode → ESCALATION_MALFORMED；非严格更宽 → SANDBOX_ESCALATION_INVALID，WIDER_MODES 执行时校验：read-only→[workspace-write, danger-full-access]、workspace-write→[danger-full-access]、danger-full-access→[]）；审批策略 `PICODE_APPROVAL_POLICY` 默认 ask（ask → 请求落 `runs/<id>/approvals/pending-<id>.json`；never → fail-closed APPROVAL_DENIED **不落请求文件**）；**allowed-once 是唯一授权**：重试 `repo_write` 带 approval_id（且 sandbox_permissions+path 与请求一致）单次放行，消费后 status=used，重试再验 APPROVAL_ALREADY_USED；pending/rejected/未知/无 answerer 一律 fail-closed（APPROVAL_PENDING/APPROVAL_REJECTED/APPROVAL_NOT_FOUND）
  - **审批 answerer（Q4 决策）**：`picode approval list [--status …]` 观测；`picode approval decide --id <id> --approve|--reject --note`——answerer=**run-lead 代批**（picode 无实时人类通道的务实默认）；policy 层动作（不可代行的终裁）走 sponsor 人工（goal.yaml constraints:20）
  - **审计成对**：asked+decided **同文件**（approvals/pending-<id>.json，status 流转 pending→approved/rejected→used + used_at），成对审计闭环；落盘一律经 withFileLock（atomic.ts，与 goal/checkpoint CAS 同源）；D071：审批观测走 run 目录文件，零 dashboard 端点
  - **read-before-edit 守卫（E3）**：repo_read 记录本会话（extension 进程内 observed 集）读过的文件；repo_write 目标为**已存在**文件且本会话未读过 → `FS_NOT_OBSERVED`（"edit requires reading first"）；新建文件（createIfAbsent 语义）免预读；`PICODE_READ_BEFORE_EDIT` 默认**开**（fail-closed：0/false/off/no 显式关闭，其余保持开）
  - **配置旋钮最小化（衔接 D104）**：沙箱/审批/守卫三处开关全走会话 env（PICODE_SANDBOX_MODE / PICODE_APPROVAL_POLICY / PICODE_READ_BEFORE_EDIT）+ core 常量，**本轮不新增 config 键**（spec 04-enforcement §10.4）
- 实现取舍/观察项（C3 known_issues §4）：① 会话级 env 在扩展 load 时解析一次（picode 无会话内 mode 切换事件，等价 DSH「每调用 resolve」于固定会话 env）；② read-before-edit 只认 repo_read（repo_grep 等内部读取不记录 observed，可扩展 readText 统一记录——观察）；③ danger-full-access 下 escalation 参数被忽略（mode 围栏短路 tryEscalation，写直接由 mode 授权放行；判定**非阻断**——该写本被授权、无安全边界突破；如后续要求 danger 模式对成对参数一致性校验可增强，非本轮验收）；④ approval decide 无 CLI 身份认证（操作约定，policy 层 sponsor 人工兜底）
- 验证：C3 evidence（ev-1..ev-7 + E5 实测全链路 exit 0：升级 → run-lead 批准 → 单次放行 → 重试再验 APPROVAL_ALREADY_USED + never 对照 APPROVAL_DENIED 不落请求）；官方 npm test（HOME 隔离）552/552（+50 用例：sandbox 10/approval 12/extension-sandbox 16/commands approval 9/pi-adapter 2/errors 1）；npm run check 0 error（1 warning = D104 前向引用，C5 落地后消解）
- commit: 2e50375（C3 提交，run-lead 代提交）→ merge **52d22ae**

## D107 — continuable 子代理蓝图存档（C4 chunk-c4-continuable-blueprint · 下轮实现输入）
- 2026-08-15 · 来源：run-2026-08-15T02-30-00-DSH C4（团队 经纬：d7f743b v0 + 73953db v1 写实 + 4131637 v1.1 复核补正 → merge 048cd94）+ survey §2 #10@268-281（durable descriptor / depth 围栏 / 冷恢复 / 权限边界）+ intake §6 C1-C3 + research/briefs/pi-persistence.md（ind-res，落盘 2026-08-15T17:05+0700）
- 决定：**本轮只存档蓝图、不落代码**——`docs/plans/continuable-subagents-blueprint.md`（v1 写实，四要素）作为下轮 C 实现输入（验收 C3：run-lead 审阅存档）
  - **取舍论证（守 D002）**：采用方案 A「转录+摘要+续跑投喂增强」（现状 continuation.ts 语义延伸）**拒绝方案 B 事件溯源恢复**——B 的「日志即真相」与 D002 结构性冲突、与 D082 只读先例相悖；蓝图 §1.3 结论 + 依据链（D002/D082/intake non_goal/survey #10）
  - **Pi 持久化可行性结论（brief 写实）**：picode 实际集成运行时是 **opencode**（opencode.ai/Anomaly，≠ pi.dev，brief §1 澄清）——原生支持 durable session identity（`ses_...` SQLite 持久化，跨 serve 重启有效）+ cold resume（同一 sessionID `POST /session/{id}/message`，无独立 resume 端点）+ 全量历史拉取（GET /session/{id}/message）；**关键限制在 picode 侧使用方式**：`sleepAgent`/`terminateAgent` 现走 `DELETE /session/{id}` 销毁会话（pi-adapter.ts:350/367 → opencode-adapter.ts:269-276）→「睡眠/终止即销毁 durable 身份」；cold resume 需 sleep 改保留/归档（或 PATCH archived）+ wake 走 resume（复用现成 sendReady；self-drive.ts:256 serve 恢复路径已是「同会话续写」现成范例，仅需补 wake 路径接线）
  - **分支裁决（蓝图 §5.2）**：分支① resume API 直连激活为主路径（`pi_session_id` oc-<id> 作「平台持久会话引用」指针，仍守 D002/D082 边界）；§4 降级方案转「resume API 失效/serve 数据目录迁移时的兜底」+「投喂语义增强（增量 steer）」；子代理可恢复性由 picode 侧用 oc-<id> 句柄 + 路径 A 实现，无需自建会话存储
  - **三道围栏（只产修订点清单，不改 spec 17 正文，蓝图 §3）**：深度围栏 ≤N（建议默认 3）/ 父子写集继承只收窄（子 ⊆ 父 write_paths）/ 所有权围栏（子会话仅父可路由 + 子代理不可直接问人）
  - **下轮实现建议（蓝图 §6，I1-I7）**：I1 投喂分级 followup/steer/inject + wake 门闩 / I2 resume API 接线 + sleep 保留改造 / I3 深度围栏 / I4 写集继承 / I5 所有权围栏 / I6 结算通知（复用事件词汇）/ I7 cancel 保留队列——实现时须逐一过决策编号（D104 起，D089 领号流程）与双门闩；依赖顺序 I1 → I2/I3 → I4/I5 → I6
- 衔接风险（C4 known_issues KI-6）：I1 与 D104 的 guardian 续跑必须合并防两套续跑逻辑——下轮实现优先在 continuation.ts 内收敛，不新建模块
- 验证：C4 evidence（sdet 复核）+ diff 门禁（仅 1 文件 ⊆ write_paths）+ 零代码/零配置 + 不引入事件溯源（蓝图 §1.3 明确拒绝）
- commit: d7f743b + 73953db + 4131637 → merge **048cd94**

## D108 — co-002 变更单 + 工具计数断言教训（C2 流程教训 · 含环境教训复证）
- 2026-08-15 · 来源：run-2026-08-15T02-30-00-DSH C2 实施期（全量测试唯一失败 = 计数断言过期）+ change_orders/co-002.yaml（run-lead applied 2026-08-15T10:44:45Z）
- 问题：`packages/pi-extension/src/extension.test.ts`「all 20 spec-09 tools are registered」断言 `tools.size === expected.length(20)`——C2 按验收 B1 合法注册 `skill_load`（第 21 个工具）→ 计数断言失效，npm test 链停住；该文件不在 C2 write_paths，diff 门禁（R8/R9）禁止 C2 自行修改
- 决定/处置：
  - **co-002 变更单（run-lead applied）**：授权 C2 最小写集扩展 2 文件——extension.test.ts 工具计数/清单断言 20→21（expected 数组追加 skill_load）+ mcp-server execution.ts 09 matrix 硬编码 20→21 校验；scope_limit：行级断言语义（mcp-server registry.test.ts 保持 20 成员语义——skill_load 不注册于 mcp-server 执行面，仅成员断言无计数）；new_acceptance：C2 合并后 pi-extension 全量测试全绿（含 all 21 spec-09 tools 断言）
  - **教训（沉淀为测试/流程纪律）**：① 注册表/清单测试偏好**成员断言**（expected 数组逐项 in）而非**计数断言**（size === N）——计数对合法扩展脆弱（本次 skill_load 是验收要求的合法新增，断言先于工具面过期）；② 越写集修复走变更单（co-002 模式：决策依据 + scope_limit 行级语义 + new_acceptance），不自行越写集——与 D074（验收 test 目标修正）同类流程纪律
  - **环境教训复证（非新决策）**：node_modules 悬空 symlink 问题本轮 C3 再次复现（known_issues §3：「与上轮 C1 同源问题」，重建自链修复）——D103 治理流程（自链 + tsbuildinfo 清理 + HOME 隔离）本轮复证有效；D103 为权威决策，本条目只记录复证、不重复立号
- 遗留观察（C2 summary 提示，C5 记录）：mcp-server/src/registry.test.ts 测试标题仍为「carries the 20 spec-09 tools」（co-002 scope_limit 保持 20 语义：仅成员断言、无计数）——措辞性不影响正确性，后续可顺手更名（不在本 chunk 写集）
- 验证：co-002 应用后 C2 全量官方 npm test（HOME 隔离）562/562 exit 0；npm run check 三 lint 0 error；diff 门禁 9 文件 = 7 write_paths + co-002 授权 2 文件
- commit: d3bb0c2（C2 提交，含 co-002 授权 2 文件）→ merge **83df029**

## D109 — durable 会话 + resume + 深度围栏（W1 chunk-durable-session · I2+I3）
- 2026-08-15 · 来源：run-2026-08-15T03-00-00-SUBAGENT W1（更漏队：传灯/秉烛/验漏；commit 59a515d + co-003 修复 276f379 → merge **dd311f6**）+ 蓝图 §6 I2/I3 + research/briefs/pi-persistence.md 结论「支持（部分接口限制）」（ind-res，落盘 2026-08-15T17:05+0700，URL + retrieved_at 见蓝图 §5.3）
- 问题：D044 起 sleep/terminate 均走 `DELETE /session/{id}` 销毁会话——「睡眠即销毁 durable 身份」，wake 只能重 spawn + 摘要（无 resume）；子代理嵌套深度无上限（无围栏，蓝图 §3.1）
- 决定：
  - **I2 sleep 保留/归档替代 DELETE**：`pi-adapter.sleepAgent` opencode 分支不再调 `OpencodeSpawner.stop`（保留会话）；`session-store.sleep` 保留 `pi_session_id`（`oc-<id>` 作「平台持久会话引用」文件真相指针，蓝图 §2.1 分层；仅清空失效 `pid-` 进程句柄）；**terminateAgent 零改动**（终态销毁 DELETE 语义不变——D044 对 terminate 保持成立，本行修订只涉 sleep）
  - **I2 wake resume 优先**：`wakeWithOpencode` 增 resume 分支——`isAlive` 探测（GET /session/{id}，现成）→ 同会话 `sendReady` 续写（POST /session/{id}/message，**零新 POST /session**）；404/失联/竞态 → 回退重 spawn + 转录摘要（现状语义保留）；零新增平台原语（mock serve 断言三行为：sleep 零 DELETE / wake 同会话 POST 计数 / 404 回退重 spawn）
  - **I3 注册**：core `SessionRecord` 增可选 `delegation_depth`/`parent_session`（旧格式缺省 0/平台席，schema_version 保持 "1"——budget? 可选字段先例）；`session-store.register` 支持 depth/parentSession 参数（显式传入才写字段）
  - **I3 深度围栏 ≤3**：`wakeAgent`（D057 统一 spawn 入口，CLI 与规则引擎共用）在 opencode/pi 两路前统一校验 `delegation_depth > MAX_SUBAGENT_DEPTH(=3)` → `SUBAGENT_DEPTH_EXCEEDED`（消息含当前深度与上限，不触碰后端）；`core/errors.ts` 新增**唯一**错误码（I5 复用 ROOM_POST_DENIED 不新增——errors.ts 单写者纪律）
  - **spec-17 owner 落地**（shared_files owner 声明）：§4 字段增量 + 深度围栏 MUST、§5.2 sleep/wake/terminate durable 语义、§6 子代理写集收窄一句（I4）、§9 owner 围栏 + 来源标注纪律（I5/I6）按蓝图 §3 建议条文一次性落地；`docs/reference/schemas/session.yaml` 同步
- 验证：官方 npm test（HOME 隔离）591 测 0 fail（core 160 / bus 19 / orchestrator 342 / pi-extension 36 / mcp-server 18 / dashboard-server 14 pass + 2 skip 基线既有）；npm run check 三 lint 0 error；acceptance 7/7 满足
- 越写集处置（co-003，衔接 D108 变更单模式）：`rules-engine-opencode.test.ts` D057 测试旧断言「sleep 后 DELETE」与 I2 新语义冲突（文件不在本 chunk 12 写集内）→ run-lead **co-003**（status=applied）授权最小写集扩展（仅 D057 sleep 断言行级更新）→ 276f379 修复（断言改零 DELETE + `oc-<id>` 保留，terminate 断言保留）→ orchestrator 342/342 全绿
- 遗留观察（known_issues）：serve 侧会话累积（sleep 不再 DELETE 的代价，本机 opencode.db 已 10,836 会话）——归档/清理（PATCH archived 或定期 GC）列后续轮候选，非本轮验收；N=3 为 orchestrator 侧常量暂不可配（衔接 D106 配置旋钮最小化，可配置化列后续候选）
- 边界：resume/注册/围栏均向后兼容（旧 session.yaml 直接可读）；D044「session sleep 调 DELETE」部分失效（本行修订标注，见上）

## D110 — 写集只收窄 + 所有权围栏（W2a chunk-fence-owner · I4+I5）
- 2026-08-15 · 来源：W2a（城垣队：司阍/谯楼/界碑；commit 9399a48 → merge **d28130a**，基线 dd311f6）+ 蓝图 §3.2/§3.3 + sysarch 落点裁决（I4 落 staffing.ts 非 evolve.ts；I5 落 room-store.ts，测试文件新建）
- 问题：04 §2.1 write_paths 为每 task 静态白名单、无父子继承语义——子代理若获父全部写集即越权风险（蓝图 §3.2）；bus 房间 ACL 无「子会话仅父可路由」语义——任一有 post 权的成员可向子代理房间发消息、子代理可直达 sponsor 房（蓝图 §3.3 + 调研简报 §1 ⑩「子代理不可问人」）
- 决定：
  - **I4 写集只收窄（staffing.ts）**：`readTaskYaml` 增可选 `parent_task`（只读字段，写入方 = run-lead/未来 spawn 路径）；`draftPersonas` 子代理有效写集 = **父 task write_paths ∩ 子声明**（只收窄不放宽，父缺失 fail-loud）；`checkPersonas` 增子代理校验——子 persona `write_paths ⊆ 父 task write_paths`，子宽于父 → 结构化拒绝（沿用 persona⊆task 精确子集先例@268-271 → approveStaffing 抛 people-qa failed）；无父链退化为现状（既有 task 写集语义零变更）
  - **I5 所有权围栏（room-store.ts）**：post 校验序 = type → members ACL → **owner 围栏**；房间元数据自持 `owner_session`（`rooms/<room>/meta.yaml`，`RoomStore.setRoomOwner` 声明房→会话绑定，非法 agent id 拒绝）；围栏读 owner 会话 roster 记录（`delegation_depth`/`parent_session`，文件真相 D002）判定「子代理会话房」= depth>0 ∧ parent_session 非空——**目标侧**：发送者 ≠ 其 `parent_session`（仅直接父可路由；会话本人/其它成员/误配成员均拒）→ `ROOM_POST_DENIED`（消息含 owner fence 标记，agent-busy 语义等价物）；嵌套链仅直接父可路由；**发送侧（问人禁令）**：发送者为子代理 → 仅可向其父会话可发言的房间发言（`canPost(room, parent)` 判定，须经父转达）；sponsor/领导层房因父（task 席）非成员而不可直达
  - **错误码复用 `ROOM_POST_DENIED`**（errors.ts 零改动，**不新增错误码**——D109 errors.ts 单写者纪律）；spec-04 §1.2 post 校验序增量（token → members ACL → owner 围栏，目标侧+发送侧）+ §2.1 子代理只收窄条款（有效写集 = 父 ∩ 声明、子宽于父结构化拒绝、父缺失 fail-loud、无父链退化）
- 验证：官方 npm test（HOME 隔离）600 pass + 2 skipped（基线 589 + 11 新增：staffing.test +5 / room-store.test 新建 +6）；npm run check 三 lint 0 error（decision-lint 114 OK）；diff 门禁 = 5 写集文件 ⊆ write_paths；errors.ts / spec-17 零 diff（owner 纪律）
- 遗留观察（known_issues）：「仅直接父可路由」比 spec-17 §9 条文「须经父转达或显式授权」更严（本实现无「显式授权」通道，采 acceptance 权威口径「非 owner → 拒绝」，显式授权留作未来扩展）；写集包含判定为精确路径匹配（glob 前缀子集不隐式视为子集，子任务须声明完全一致或更小字面路径）；子任务声明与父无交集 → 有效写集空 → people-qa fail-closed（提示信息可后续优化）；`setRoomOwner` 尚无生产者（spawn 侧接线归后续 chunk/未来 spawn 改造）；orchestrator 不豁免 owner 围栏（未来向子代理房投机械通知须以 owner 身份或显式设计走变更单）
- 边界：非子代理房间语义零变更（无 meta / 顶层 owner / 非子代理发送者 → 围栏不触发）；顶层任务写集语义零变更（无 parent_task 退化现状）

## D111 — settled 机械通知 + 投喂分级（W2b chunk-settle-feed · I6+I1）
- 2026-08-15 · 来源：W2b（驿道队：传驿/衔辔/烽燧；commit 1852340 → merge **284d858**，基线 dd311f6）+ 蓝图 §2.4/§4.2 + D104 KI-6（I1 与 guardian 续跑合并防双逻辑）
- 问题：子代理结算无机械通知——父无法从状态文件感知子代理结束（蓝图 §2.4「不把运行时叙述冒充为子代理内容」尚无机械通道）；续跑投喂只有「整体重投」一种形态（无 next-turn/next-step 分级、无「状态通知不唤醒」语义，survey #5@197 点名）
- 决定：
  - **I6 机械结算（self-drive.ts）**：纯函数 `deriveSettledSubagentNotices` 检测子代理会话终态（`delegation_depth > 0` ∧ `state === "terminated"` ∧ `parent_session` 非空，session.yaml 文件真相）→ `postSettledSubagentNotices` 复用既有 `cell_done` bus 词汇投递父房（refs 指 `transcripts/<agent>.jsonl` + `sessions/<agent>.yaml` + `tasks/<taskId>/evidence`；from=父会话 agent_id，meta.source=orchestrator + body 机械标注——来源 = orchestrator 观察状态文件派生，**非子代理 LLM 自报**）；**幂等** = 父房 bus 已有该子代理 cell_done 则跳过；**不新增 SESSION_EVENTS**（core/session.ts 零改动，deriveEvents 零改动，spec-10 无需注册）
  - **I1 投喂三档（continuation.ts，S 变体不碰 17 状态机）**：`ContinuationKind` + `FeedOptions`——followup = 现状续跑投喂（默认，零行为变化）；steer = 增量 next-step 引导（`composeSteerPrompt` = 摘要段 + 引导段，指令经 `buildReadyMessage` extraText 通道，**不重灌固定续跑模板**——蓝图 §4.2「不整体重投」）；inject = 状态通知**不唤醒**（只对 awake oc- 会话投递、状态不变、只过 in-flight 门闩 busy 不插队、不过 idle 门闩、不计续跑预算）；wake 门闩沿用既有 idle/in-flight 判定（followup/steer 全量门闩防 busy 插队，D067 idle 时钟语义不变）
  - **KI-6 合并防双逻辑**：投喂计数/预算/门闩全部收敛在 continuation.ts 内，**不新建模块**（diff 无新文件）；continuation-gate.ts / rules-engine.ts 零改动
- 验证：官方 npm test（HOME 隔离）604 pass + 2 skipped（606 测 = 基线 591 + 15 新增 I6×5 + I1×10 全绿；core 160 / bus 19 / orchestrator 357 / pi-extension 36 / mcp-server 18 / dashboard-server 14 pass + 2 skip）；npm run check 三 lint 0 error；diff 门禁 = 恰好 4 写集文件 ⊆ write_paths；acceptance 4/4 满足
- 遗留观察（known_issues）：inject 转录副作用（写 outgoing 转录 → 该会话后续 followup/steer 派生因「末条 outgoing」判 in-flight 暂缓，属行为观察——inject 为新增 API 暂无生产调用方，缓解属下轮增强，本轮不动转录 schema D002）；I6 bus from=父会话 agent_id（task.ts 建房成员不含 orchestrator 且不在本轮写集，来源纪律经 meta.source 显式表达）；平台席父会话（无 @task- 绑定）无父房可投递 → 保守跳过不写文件（下轮 tick 可重试）；W2 与 fence-owner 并行——cell_done 目标是父房（squad-task-x，非子代理会话房）+ 发送者是父会话（父即子代理 owner）→ 预期不受 I5 围栏影响（合并门串行验证已过，284d858 全量回归绿）
- 边界：不引入事件日志/台账（幂等读父房 bus 文件，守 D002/D082）；17 状态机零触碰（inject 对 awake 会话投递不触发状态迁移；sleeping 会话直接返回 null）

## D112 — docs 收尾 + 流程教训（W3 chunk-docs）
- 2026-08-15 · 来源：W3 收尾（本 chunk）+ sysarch §4@92-94 决策编号建议 + sponsor 反馈 + run-lead 流程复杂度审计（`docs/knowledge/feedback/sponsor-feedback-and-process-audit-2026-08-15.md`，commit e99f1fa）+ 独立验证报告（`.picode/plans/audit-verification-report.md`，commit 5278a73 修正落地）
- 决定：
  - **D109-D111 决策落档**：表行 + 详条（来源标注到 chunk/task：W1 durable-session / W2a fence-owner / W2b settle-feed）；**D044 行加 I2 修订标注**（session sleep 改保留/归档替代 DELETE；terminate 仍 DELETE）；decision-catalog §24 同步（opencode sleep 语义 durable 会话保留 vs DELETE 销毁 + 深度围栏/写集收窄/所有权围栏条目）；E18 纪要 `docs/knowledge/evolve/run-2026-08-15T03-00-00-SUBAGENT.md`（分块/合并序列/决策编号/波序/审计验证引用/剩余风险）；`--land` 闭环（watermark next_number 109 → 113）
  - **流程简化候选（本轮不实施）**：sponsor 反馈 + 流程复杂度审计真实性评级**高**（9 项验证清单 7 成立 / 2 部分成立 / 0 不成立，数据事实与 run 历史档案逐条吻合）；修正项已落地（①代提交 ≥5 → **≥3**（commit message 实证口径）；②squad-lead 价值补充 C1 B1 根因分析；③交接包重复细化为「summary 重复高、artifact_index 重复低」；④重复汇报来源标注为会话实录、仓库不可复核）；**A 级简化试点**（三人组 → 双人组 / 人设程序化生成 / 交接包精简 2 件 / 重复汇报治理）排下一轮流程优化 run，本轮只记录候选（E18 后续候选 1），不实施不改变既有流程
- 验证：decision-lint **0 error**（docs/** 全量扫描）；npm run check 三 lint 全过；diff 门禁 = 4 写集文件 ⊆ write_paths（纯 docs 层，零代码零配置）；决策编号闭环 `--reserve`（109-112，count 4）→ 落档 → `--land`（status=landed）
- 剩余风险（E18 终态）：serve 侧会话累积 GC（D109 遗留，后续轮候选）；D2 偏差记录（D044 修订标注行，sleep 保留 / terminate DELETE 两义齐全）；流程简化试点排下轮（E18 后续候选 1，验收口径建议改可测基线）；push 由 run-lead 在合并门（approvals/merge.yaml，R9）批准后执行（本 chunk 按约束不 push）
- commit: 本提交（chunk-docs / W3）

## D113 — dashboard-server 读面扩展（bus 读面 + approvals/change-orders 数据源 · W1a chunk-dashboard-server）
- 2026-08-15 · 来源：W1a（观澜队：凭栏/听涛/漱石；commit 50e2ab6 → merge **a55e05f**）+ sysarch 分块方案（`.picode/chunks.yaml`）+ run goal success_criteria「聊天室化 + 流程可视化」；与 D071「9 端点全 GET 只读」契约构成**读面局部扩展**（仍只读）
- 问题：面板聊天室化需要 bus 消息流/参与者数据，流程可视化需要审批流/变更单数据——既有 9 端点（D070/D071）只有状态投影（rooms 仅消息数、无逐条消息），缺房间/消息/审批/变更单读面
- 决定：
  - **bus 读面 3 端点**：`GET /api/runs/:id/bus`（房间列表——bus/*.jsonl 扫描行计数，与 statusSnapshot.rooms 同源口径）；`GET /api/runs/:id/bus/:room`（消息流——逐行解析 JSONL，BusMessage 字段原样，`?limit=` 默认 50 取最近 N 条，损坏行容错跳过（room-store readBus 逐行容错先例），房间名 SAFE_ROOM_RE 校验防路径逃逸）；`GET /api/runs/:id/bus/:room/members`（参与者——rooms/<room>/members.{yaml,json} 原样（id/access/post_types_allow），缺失/损坏容错 null）
  - **流程数据源 2 端点**：`GET /api/runs/:id/approvals`（approvals/pending-*.json 全量，asked/decided 成对审计字段，ApprovalStore.list 升序语义）；`GET /api/runs/:id/change-orders`（change_orders/*.yaml，proposed→applied→closed 状态机数据源，readChangeOrders ts 升序）——供 W2 flow-ui 流程可视化
  - **只读语义不变**：全部仍 GET、fs 直读不套 ACL（面板观测者无 agent 身份，apiGates/statusSnapshot 先例）、无写无锁无副作用；D070「只读无写无 daemon」与 D071「零端点改动」约束对读面成立（D071 约束随后由 D114 写代理作唯一局部例外，见 D114）
- 验证：W1a 全量验证（dashboard-server 31+2skip + curl 冒烟 200/403/400/405）+ 回归断言（limit/损坏行/逃逸/字段原样）+ HTTP 面矩阵（review task-chunk-dashboard-server，结论 pass）
- 边界：房间读面与 bus 文件真相（D002）一致；members 读取与 loadMembers 同口径（members.json 优先）；损坏成员表读面容错 null、写面仍 fail-closed（D114）

## D114 — 聊天室写面写代理（D070 只读例外唯一写端点 · W1a chunk-dashboard-server）
- 2026-08-15 · 来源：W1a（观澜队；commit 50e2ab6 → merge **a55e05f**）+ sysarch 分块方案 + goal success_criteria「界面可发送消息（写权限 + 审批联动）」；D070「无写」局部例外
- 问题：面板要可发送消息（product_acceptance「发送消息走现有 bus API + 审批联动（未授权拒绝）」），但 D070 面板**只读、无写**是硬不变量——需在不放大写面、不引入新 ACL 逻辑的前提下开放一条受控写通道
- 决定：
  - **唯一写端点**：`POST /api/runs/:id/bus/:room`——以 **sponsor** 身份 post `type=chat`（D018 sponsor 永远人类 + D035 sponsor 通道仅 chat，**语义不变**）；payload 形如 `{body: string, refs?: string[], type?: "chat"}`（type 缺省=chat），非对象/空 body/非法 refs → `BAD_BODY` 400
  - **ACL fail-closed**：校验链直接走 `@picode/bus` RoomStore.post（type 注册表 → members ACL → owner 围栏 → sender 围栏，D110 语义沿用）——成员表须含 sponsor 且 access=post 且 post_types_allow 含 chat（现默认仅 leadership/product 两房，run-store.ts createRun）；未授权 → `ROOM_POST_DENIED` 403；非 chat 类型 → `BUS_TYPE_DENIED` 400；房间名非法 → `BAD_ROOM` 400；成员表损坏 → `ACL_CORRUPT` 500（fail-closed，绝不静默放行）
  - **只读不变量保持**：其余路由非 GET 仍 405（D070 只读契约仅对本端点局部例外）；index.ts CORS 补 POST（Access-Control-Allow-Methods: GET,POST,OPTIONS）+ OPTIONS 预检 204
- 验证：W1a 全量验证 + curl 冒烟 200/403/400/405（POST 成功 / sponsor 无权限房拒绝 / 类型拒绝 / 房间非法）+ review 结论 pass（「POST 仅 sponsor chat 两房（D114 局部例外，未放大）」）
- 边界：写代理只做身份与 ACL 判定，不新增审批落盘逻辑（审批请求落盘 = 既有 approval 流程，D115 只展示不代写）；前端发送失败提示与审批流展示语义一致（D116）

## D115 — 流程可视化入面板（approvals + change_orders 数据源 + 门禁状态机展示 · W2b chunk-flow-ui）
- 2026-08-15 · 来源：W2b（砥柱队：司关/钤印/稽核；**待合并**，合并门后由 run-lead 收尾）+ sysarch 分块方案 + goal success_criteria「流程可视化：双门闩/审查门/合并门状态机展示 + 审批流展示」
- 问题：面板有看板/门禁 tab，但双门闩（brief/staffing）、审查门、合并门的状态流转与审批流/变更单缺可视化；数据源 D113 已就绪
- 决定：
  - **flow.api.ts（新）**：approvals/change-orders fetchers + `useApprovals`/`useChangeOrders` hooks（3s 轮询，既有模式），类型对齐 D113 两数据源端点响应
  - **门禁 tab（gates-panel.vue）**：新增审批流区（approvals 列表——status pending/approved/rejected/used 徽章 + asked{from_agent/task_id/path/mode/reason} 与 decided{by/decision} 成对展示）与变更单区（change_orders proposed→applied→closed 状态 + 时间线）；门禁状态机展示每任务流水（双门闩 brief/staffing → progress phase → evidence pass → handoff 包 + acceptance → dissolve → merge），数据源 /tasks latch/progress/evidence + /merge 队列 + /gates，纯派生 flow.data.ts
  - **9 视图增强**：看板（tasks-board.vue）卡片增双门闩状态徽标；合并（merge-train.vue）合并门展示增强（拓扑依赖/等待原因 skipped_due_to_deps）；概览（goal-overview.vue）审批待办数/变更单活跃数告警卡片；进度（progress-view.vue）双门闩状态列；人员/分块/tokens（personnel-view/chunks-table/sessions-live）轻量增强（D071 语义色/域组件一致，无结构重构）
  - **派生与标签**：审批/变更单/门禁阶段标签本地化于 flow.data.ts（labels.ts owner=chat-ui，gates-panel resultLabel 先例）；不改 views.data.ts/role-meta.data.ts
- 验证：`__tests__/flow.test.ts` fixture 断言派生纯函数（状态机阶段映射/审批状态标签/变更单时间线）；`pnpm -C packages/dashboard test`（vitest 全绿）+ `pnpm -C packages/dashboard build` 通过（**W2b 合并后补充实测数字**）
- 边界：只读展示（写代理唯一写面仍 D114）；门禁状态机为**展示投影**，不驱动任何状态决策（文件真相 D002）

## D116 — 聊天室前端（消息流/发送框/房间入口 tab · W2a chunk-chat-ui）
- 2026-08-15 · 来源：W2a（雁书队：青鸟/尺素/鱼雁；commit 7981df0 → merge **19e006c**）+ sysarch 分块方案 + goal success_criteria「聊天室化：实时消息流视图 + 界面可发送消息」
- 问题：面板房间视图只展示统计（D071 派生），无逐条消息流、无发送通道——聊天室化需前端消息流视图 + 发送 UI + 房间入口
- 决定：
  - **「聊天室」tab（index.vue，owner）**：房间列表（房间名/通俗名/消息数/参与者摘要，deriveRooms/roomLabel 复用）→ 选中房间 → 消息流视图（chat-room-view：ts 相对时间、类型徽章走 labels 中文映射、body/refs/meta 详情可展开）→ 参与者面板（GET members 端点 + 平台房 ROLE→ROOM 派生）
  - **消息流轮询** refetchInterval 3s（既有模式）；加载态骨架屏、错误态 ErrorState（D071 语义 token，不硬编码色值）
  - **发送框（chat-send-box）**：输入 chat 文本 → `POST /bus/:room`（D114 写代理）；成功 → 清空 + 触发消息流刷新（invalidate/refetch）；未授权拒绝 → 结构化错误中文提示（ROOM_POST_DENIED/BUS_TYPE_DENIED，提示可发房间为 leadership/product）；发送目标房间由参与者面板展示的 ACL 决定（非 sponsor 可发房禁用发送框）
  - **审批联动**：发送框失败提示与门禁 tab 审批流展示语义一致（拒绝原因可见、pending 审批在门禁 tab 可见）——本 chunk 不实现审批请求落盘（写代理 fail-closed，D114）
  - **派生纯函数** chat.data.ts（消息类型中文映射、参与者/房间列表派生、发送校验预检）+ `__tests__/chat.test.ts` fixture 断言（views.test.ts 模式）；rooms-view.vue 房间卡片可点击进入聊天室（入口增强）；views.data.ts / role-meta.data.ts 只读复用不改
- 验证：`pnpm -C packages/dashboard test`（vitest 全绿）+ `pnpm -C packages/dashboard build` 通过（merge 19e006c，门禁 pass）
- 边界：发送面完全收敛到 D114 写代理（前端零新增写逻辑）；labels.ts owner=chat-ui（共享文件纪律，flow-ui 不占）

## D117 — 流程项落地（评分画像消费 queryTalentPool + staffing 显式 reuse_persona_ids + 文档精简维护 docs:lean · W1b chunk-process-items）
- 2026-08-15 · 来源：W1b（铨衡队：品藻/铨叙/月旦；commit 13af0e4 + W1b 补丁 44aa83b（pool 参数兼容）→ merge **ab78cab** + 补丁 merge **78d4aa4**）+ goal success_criteria「流程项落地：评分-招聘回路（评分画像消费）、文档精简维护机制」+ `docs/knowledge/feedback/` 文档生命周期/评分回路权威
- 问题：人才池（docs/knowledge/hr/talent.yaml）只沉淀不消费——招聘侧 reuse_persona_ids 无显式画像引用入口（评分画像与招聘脱节）；文档精简维护无机械检查（DECISIONS 行式/目录结构/冗余靠人工）
- 决定：
  - **评分画像消费（只读）**：hr-talent.ts 新增只读消费入口 `queryTalentPool`（按 grade/skills/seat 筛选、S/A 级优先，TalentRecord 含 score/grade/skills/seat/codename）；`picode staffing pool` 子命令（--grade/--seat/--skill，只读零写、不自动注入（防隐式行为变更）、非法 grade 结构化拒绝）——供招聘 reuse_persona_ids 显式引用
  - **reuse_persona_ids 显式预填**：createStaffingRequest 支持显式预填 reuse_persona_ids（引用已存在字段，**不新增配置键**）；机制与知识文档不符时以知识文档为权威并记录偏差
  - **文档精简维护**：scripts/doc-lean-check.mjs（零依赖只读 node 脚本，退出码 0=通过：决策权威 + 关键目录结构 / DECISIONS 行式（`## D### — 标题` 单行、编号唯一、条目非空）/ feedback 索引覆盖 / feedback 冗余检测）+ package.json `docs:lean` 接线（可作 merge gate 输入）
- 验证：W1b 全量 **379/379** + doc-lean-check exit 0 + pool CLI 手动/插桩实测（records=3 → 筛选 1/1/3/0）+ 铨叙 hr-talent.test（排序/过滤/只读断言）+ cli.test pool 用例（含非法 grade）+ review 结论 pass
- 边界：queryTalentPool 只读零写（评分-招聘回路消费侧，不自动注入）；docs:lean 为结构检查（warn 不影响退出码，转正项 feedback/README 索引由 W3 chunk-docs 处理）

## D118 — docs 收尾 + 流程教训（W3 chunk-docs）
- 2026-08-15 · 来源：W3 收尾（本 chunk）+ sysarch 分块方案（chunk-docs write_paths/acceptance）+ 前置四 chunk 合并（W1a a55e05f / W1b ab78cab+78d4aa4 / W2a 19e006c / W2b **待合并**）
- 决定：
  - **D113-D117 决策落档**：表行 + 详条（来源标注到 chunk/队：W1a dashboard-server（观澜）/ W1b process-items（铨衡）/ W2a chat-ui（雁书）/ W2b flow-ui（砥柱））；**D070/D071 行修订标注**——面板契约由「9 端点全 GET 只读」扩展为「+聊天室读/写 + 审批流/变更单数据源；写仅限 sponsor chat（D114）」，标注修订日期 2026-08-15
  - **decision-catalog §25 同步**：面板端点面（bus 读/写 + approvals/change-orders）+ 聊天室前端 + 流程可视化数据源 + 流程项落地条目；operations.md 监控面板节更新（新端点清单 + 前端聊天室 tab + 运维要点：POST 写代理仅 sponsor chat、ACL fail-closed、CORS POST）
  - **E19 纪要** `docs/knowledge/evolve/run-2026-08-15T04-00-00-DASHBOARD.md`（goal 背景 / 分块方案 5 chunks / 波序 W1(2组并行)+W2(2组)+W3 / 决策编号 D113-D118 / 9 视图增强清单 / 聊天室化清单 / 流程项落地清单 / 验收结果；flow-ui 部分留占位「W2b 合并后补充」，run-lead 收尾）
  - **`--land` 闭环**：watermark run-2026-08-15T04-00-00-DASHBOARD reserved → landed（next_number 119）；**git push origin main**（本 run 收尾含 push，rev-list origin/main..main = 0）
- 验证：decision-lint **0 error**（docs/** 全量扫描）；`node scripts/doc-lean-check.mjs`（docs:lean）OK；diff 门禁 = 5 写集文件 ⊆ write_paths（纯 docs 层 + watermark，零代码零配置）；决策编号闭环 `--reserve`（113-118，count 6，已由 run-lead 预留）→ 落档 → `--land`（status=landed）
- 剩余风险（E19 终态）：**W2b flow-ui 待合并**（D115 实测数字与最终视图增强清单由 run-lead 在合并门后收尾补录 E19）；serve 侧会话累积 GC（D109 遗留，跨轮候选延续）；流程简化 A 级试点排下一轮流程优化 run（D112/E18 后续候选延续，本轮不实施）
- commit: 本提交（chunk-docs / W3）
