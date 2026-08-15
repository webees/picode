# 调研简报：DeepSeek Harness（论文与资料）

- 调研角色：行业分析 ind-res（调研小组，唯一联网岗）
- 检索时间：2026-08-15T15:45–16:58（+07:00，即 08:45–08:58 UTC；末轮为补充核实窗口）
- 提交对象：工程主责（run-lead）
- 检索方式说明：web_search / web_fetch 工具在本会话不可用（API key 失效 / 无 provider），改用 curl 直连 arXiv API、GitHub REST API / raw 内容、HuggingFace API、deepseek.com 完成全部检索；所有来源均为一手（官方仓库/官方文档/官方首页/arXiv 官方论文页）。
- 标注约定：每条结论标 **[事实]**（有来源）或 **[推断]**（无直接来源的推理）；所有 URL 后附 retrieved_at。

---

## 0. 检索结论速览（"DeepSeek Harness" 是什么）

1. **官方产品（主结论）**："DeepSeek Harness"（`dsh`）是 **DeepSeek AI 官方开源 agent harness（智能体运行时/多智能体编码运行时）**，仓库 `github.com/deepseek-ai/deepseek-harness`，MIT 协议、TypeScript、约 10.4 万 star，2026-08-13 发布，处于"开发者预览"阶段，主页 `deepseek.com/harness`。**[事实]** https://github.com/deepseek-ai/deepseek-harness （retrieved 2026-08-15）
2. **架构口号**：官方定位"一切皆插件（Everything is a Plugin）"——模型、工具、技能、会话、沙箱、存储、循环、调度、UI 等所有 Agent 能力均由 Cordis 插件组合而成，配置层可替换、可重组；"Agent = Model + Harness"。**[事实]** https://deepseek.com/harness （retrieved 2026-08-15）
3. **同名论文不存在**：arXiv 全字段精确检索 `all:"DeepSeek Harness"` 返回 **0 篇**；HuggingFace 模型/数据集搜索 "deepseek harness" 为空。即：无题为"DeepSeek Harness"的论文。**[事实]** arXiv API 检索（retrieved 2026-08-15）；https://huggingface.co/api/models?search=deepseek+harness
4. **训练/eval 侧"harness"语义**：DeepSeek 官方论文（V3/R1/V3.2/V4 技术报告）中**未公开命名**其评测/训练 harness；"harness"在评测语义下是行业通称（如 EleutherAI lm-evaluation-harness 一类的评测框架），DeepSeek 论文只报告 benchmark 结果、不声明评测工具链名称。**[推断]**（基于论文文本未提及；检索范围内无 DeepSeek 官方评测框架命名）
5. **替代依据（DeepSeek 系）**：与 agent/harness 运行时设计最相关的官方论文为 DeepSeek-V3.2（agentic 后训练数据合成管线）、DeepSeek-R1（RL + 可验证奖励，即"测试门禁"式奖励信号）、DeepSeek-V4（百万 token 上下文）、DeepSeek-Prover-V2（子目标分解）。**[事实]** 见 §4 来源清单。
6. **本地佐证**：本机（工程主责工作区所在机器）装有官方发行版 `/Applications/DeepSeek Harness.app`（本会话即运行于其 host 之上，环境变量 DSH_HOME/DSH_WEB_URL/DSH_SESSION_* 可证）。**[事实]** 本机观测。
7. **SPCT 术语未能在官方来源核实（补充核实，重要）**：在 arXiv DeepSeek-V3.2 论文全文（2512.02556，ar5iv 文本全文检索）、DeepSeek-V3.2-Exp GitHub README、HF 模型卡、api-docs 发布页中**均未检索到 "SPCT / self-play / co-evolution" 字样**；官方对 agentic 后训练的表述是"冷启动统一推理+工具使用 → 大规模 Agentic 任务合成（1,800+ 环境 / 85,000 提示词）→ RL 后训练"。**方案中建议不引用 "SPCT" 缩写**，或明确标注为第三方表述。**[事实-负面]** arxiv 2512.02556 全文（retrieved 2026-08-15T08:58Z）。
8. **与"评测 harness"最接近的官方设施**：仓库 `BENCHMARK.md` 规定用 Python SDK 运行最小 `jsonrpc-agent` 基准变体、独立 workspace/session 隔离；官网"极简模式"（仅持久 bash + str_replace_editor）明示用于"最小化环境下的模型基准测试"。**[事实]** https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/BENCHMARK.md ；https://deepseek.com/harness （retrieved 2026-08-15T08:58Z）。

---

## 1. 结论摘要：Top 10 可借鉴设计点（按对 picode 的价值排序）

### ① 会话 = 仅追加事件日志（append-only SessionEvent log），"模型可见即已入日志"
**[事实]** 官方文档将 Session 定义为 append-only 的 `SessionEvent` 日志，是 Agent 全部交互历史的**单一事实源**；LLM 消息历史由日志**派生**（`deriveMessages()`），从不另存；恢复、分叉（fork）、续跑（resume）、回放、遥测、持久化全部派生自同一事件流；运行时不变量断言"任何进入模型请求的内容必须可由日志重建"（Model-visible means logged）；原始 `assistant/chunk` 事件保留逐 token 回放保真。官方首页亦宣称"每一次运行都有迹可循"（Trajectory 视图按来源查看）。— 这是**审计 + 可恢复 + 可复现**的地基，picode 的交接包/进度/评分都可落在这条日志上。
来源：https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/architecture.md ；…/docs/subsystems/session.md ；https://deepseek.com/harness （均 retrieved 2026-08-15）

### ② 可续子代理（continuable subagent）：持久子会话 + 进程内 Activation + 冷恢复 + 单一 inbox FIFO
**[事实]** 一个可续子代理 = 一个持久子 Session，最多一个进程内 Activation（常驻期）；`followup()` 按 Activation 状态 入队/唤醒/冷恢复；**Agent inbox 是唯一队列**（一条消息一个 FIFO turn）；`interrupt()` 保留 Activation 与未认领的 inbox 工作（暂停而非杀死）；子→父 `report()` 通道（quiet=inject / wakeup=followup）；子结算时运行时向父投递 `subagent-settled` 通知（独立来源 kind，避免把运行时叙述冒充为子代理自己写的内容）；`listChildren/listDescendants` 直接从持久头部枚举、**不加载/不恢复 Agent**；委托深度 `delegationDepth` 持久且单调（冷恢复不可降低）；fork 型 provider 用父日志的"平衡完整回合前缀"做种子。— picode 的三人群组（小队主责/开发/测试）可映射为这种"可续 + 冷恢复 + 可枚举 + 可中断"模型。
来源：https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/subagent.md （retrieved 2026-08-15）

### ③ 持久目标域（same-session goals）：修订号 CAS + 轮次上限 + 机器可路由的阻塞码
**[事实]** Goal 是事件溯源域：每次持久变更都是 `goal/change` 会话事件；`GoalRef` = id + 自增 revision（compare-and-set）；相位 `active | paused | blocked | complete`；阻塞带 `blockedReason`（**稳定小写 kebab-case 机器码 + 人/模型可读说明**）；`maxGoalRounds` 总轮次上限、`roundsStarted` 由"被准入的续跑轮次"推进；**进程内激活态（activation）与持久相位分离**——`disarm()` 移除续跑权但不改持久状态，后续经 `resume` 重建；回放拒绝非正轮次/空档/过期修订/停止相位/超上限。— 直接对应 picode 的 goal 状态机（intake→draft→active⇄blocked→completed）与"每轮续跑"语义。
来源：https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/goal.md （retrieved 2026-08-15）

### ④ 沙箱与审批：三档沙箱模式 + fail-closed 审批 + 每调用策略解析
**[事实]** 沙箱模式 `read-only | workspace-write | danger-full-access`（只约束文件效应；网络/进程可见性在此词汇表之外）；**每次能力调用都解析完整策略**（Per-call，可并发不同边界 + 单次提升重试），根目录以调用会话的不可变 cwd 为准（先 fs 语义规范化）；强制完整性分 `full | partial`（旧 Landlock ABI / Windows ACL 属 partial，要求绝对边界的调用方须拒绝）；后端：Linux bwrap/Landlock、macOS Seatbelt、Windows ACL 受限令牌；confine 失败**必须 fail-closed**（禁止静默非受限直通）。审批结果封闭集 `allowed-once | rejected | cancelled | unavailable`，仅 `allowed-once` 放行、其余一律拒绝；每会话策略 `ask | never`（never = 严格无头 CI 立场，确定性拒绝）；`approval/asked`+`approval/decided` 审计对写入会话日志（log-only，不进模型转录）；权限预设把"沙箱模式+审批策略"捆绑为命名预设（默认 `workspace-write`+`ask` 与 `danger-full-access`+`never`）。— picode 的"双门闩/写集纪律/批准流"可照此建模。
来源：…/docs/subsystems/sandbox.md ；…/docs/subsystems/approval.md ；…/docs/subsystems/permission-presets.md （retrieved 2026-08-15）

### ⑤ 一切皆插件 + 可逆效应（Cordis）：无特权内核，配置层自由组合
**[事实]** Cordis 内核只负责插件加载/卸载/依赖（时间可组合=卸载时完全回滚副作用；空间可组合=声明式依赖与响应式通知，见论文《A Programming Paradigm for Spatiotemporal Composability》，2026-08-13 预印本）；dsh 用 profile（命名组合，列 bundle 栈 + 用户 `cordis.patch.yml`）+ bundle（Cordis 配置行的分发格式）在启动时按序叠加成插件树；补丁按 id 替换整行配置或插入新行；注册是"卸载即回退的效应"（HMR 安全）。"**没有需要打补丁的特权内核**"：模型适配器、工具注册表、会话日志、agent 循环本身都是插件。— picode 的"角色/小组/能力"若按插件化组织，可获得同样的可替换性与热卸载。
来源：…/docs/architecture.md ；https://github.com/cordiverse/paper （retrieved 2026-08-15）

### ⑥ 技能系统（skills）：分层注册表 + 按需加载全文 + 模型只看到 name/description
**[事实]** `ctx.skills` 分层（host 层 + 各作用域层，最近层同名优先）；本地发现按 rank：项目 `.dsh/skills`(100) > 项目 `.agents/skills`(200) > 自定义目录(300) > 用户 `dshHome/skills`(400) > 用户 `agentsHome/skills`(500) > 内置 bundled(600)；模型会话目录**只含 name + description**（XML 转义），绝不含正文/路径/来源；`skill({name})` 工具按需 `get()` 读全量定义（正文 `SKILL.md` 按需加载，正文修改不影响目录消息）；调用策略 `modelInvocable / userInvocable`（frontmatter 可禁用模型调用）；watcher 使失效、不完整发现不缓存（保留 last-good）。— 正是"技能/工具按需加载"的完整参考实现。
来源：…/docs/subsystems/skills.md （retrieved 2026-08-15）

### ⑦ 后台任务运行时（jobs）：会话授权而非 id 保密 + 有界输出 + 可杀可等可读
**[事实]** `ctx.jobs` 注册表：JobId=`<kind>-N`（kind 可被插件扩展，registry 视作不透明命名空间）；**访问控制靠 owner 会话 id 比对（授权，不是保密）**；`JobHooks` = `cancel`（同步、幂等）+ `done`（资源释放后才算完，不是工作结束）+ `readOutput`（消费式流 / 终局单次输出）；状态机 `running→stopping→completed|killed|failed`；`outputLimitBytes` 防爆；本地 provider `maxConcurrentJobsPerOwner` 默认 10；结算 first-wins（一个终局记录、释放等待者、一轮受包含的监听通知，完成通知最后投递）；`kill` 记 reason 并转发给 producer；`attachController` 支持"无人认领就不允许开工"（start 拒绝无控制器的 owner）。— 与 picode 的后台小组/证据采集任务天然对应。
来源：…/docs/subsystems/jobs.md （retrieved 2026-08-15）

### ⑧ 模型写编排脚本的工作流引擎（workflow）：脚本即编排 + 子代理扇出 + 有界 dispose
**[事实]** `ctx.workflowEngine` 运行**模型编写的编排脚本**（顶层 await、`return <json>` 结尾），worker_threads 引擎（每 run 一个 worker，脚本 vm 上下文在内）；`meta` 字段词表与 **Claude Code dynamic-workflows meta 块同源**（name/description/whenToUse/phases）；脚本只能通过 `agent()` 启动子代理，`parent` 必填（cwd/谱系/深度全部透传子代理 seam）；`parallel()`/`pipeline()` 组合子，**fatal 错误重抛**（拼错的选项必须大声杀死脚本，而非静默化成 null）；`result` 永不 reject（失败以 `stopReason: error` 解析）、取消后有界宽限、`dispose()` 幂等且永不死锁；`workflow/*` 事件 observe-only（负载是数据快照，订阅者拿不到 live run 的 cancel/dispose）；持久 Chat 记录（run-start/agent-start/agent-end/run-end）+ `dsh-tool-workflow/invariant` 协议校验（一 run 一 start、成员序正、成对结束、结束后无更新）。— 是"多智能体编排"的可执行形式，picode 的并行组队阶段可考虑"脚本化编排 + 成对生命周期事件 + 协议不变量"。
来源：…/docs/subsystems/workflow.md （retrieved 2026-08-15）

### ⑨ 测试门禁体系：验证世界而非自报 + 逐文件 100% 覆盖率门 + 运行时不变量
**[事实]** 官方测试政策四层：Unit（vitest，含 HMR 安全测试）→ **覆盖率门（per-file 100%，逐行覆盖只是必要非充分）** → 真实 API e2e（无 key 套件自跳过，keyless CI 保持绿）→ 快照测试（JSONL 会话回放 + 浏览器快照，CI 强制只读回放、绝不写预期）。铁律："**验证世界，不要验证自报**"——e2e 断言要外部重跑命令/重读文件，禁止用 agent 自己输出的关键字探测；断言未触碰文件字节级一致；mock 只用于昂贵/非确定边界（LLM 适配器、网络、时钟），其余全走真实实现；"真实入口路径"= 跑构建产物 `lib/bin.js` 而非 tsx。另有包级**运行时不变量注册表**（`ctx.invariants`：每包一个 `./invariant` companion、断言"权威事件流/可变数据"而非"服务存在性"、`verify-package-invariants` 机械校验）。— 这就是 picode"证据必须 command+exit_code=0+log_ref、审计/合并门"的强化版。
来源：…/docs/testing.md ；…/docs/subsystems/invariants.md （retrieved 2026-08-15）

### ⑩ 上下文管理（compaction）+ 计划模式 + 人类交互（长任务生存三件套）
**[事实]** (a) Compaction：`compaction/start→summary→end` 三事件加锁括号（崩溃留下可检测的孤儿锁）、摘要以 `user/message` + `surfaceOp: replace` 进入会话面、shadowedRange/shadowedSeqs/TokenCount 全记录、`compactCheckpointSource` 事务标识——**压缩本身可审计可重建**；(b) Plan Mode：软指导（`plan:policy` 提示段），`exit_plan_mode` 工具要求完整 markdown 计划（`#` 开头）经用户问答 `plan-review` 审批，keep-planning 是带反馈的失败调用；(c) user-questions：批量提问 + 稳定 id 路由 + 表现意图（plan-review/approve）；**子代理不可问人**（`CALLER_NOT_LIVE`/`DELEGATED_CALLER`，被拥有的 child 无人类作答者，会永久阻塞）。— 支撑"长任务目标持续跟踪"与"人类在环"。
来源：…/docs/subsystems/compaction.md ；…/docs/subsystems/plan.md ；…/docs/subsystems/user-questions.md （retrieved 2026-08-15）

---

## 2. 附：值得关注的其它设计点（未进 Top 10，仍与多智能体编码运行时相关）

- **工具注册表（scoped tool registry + 守卫执行管线）**：`ctx.tools` 按作用域注册、工具 schema 加入提示组装、执行经 pre/post 事件守卫；agent preset 可为单会话组合不同能力集（`isolate` realm）。**[事实]** …/docs/architecture.md ；…/docs/subsystems/tools.md
- **Code Mode / PTC 模式（run_code）**：模型写一段 TypeScript 程序，经 `tools` 绑定（lossless JSON、typed return）组合多步工具调用；失败是结果字段而非异常（`exception|timeout|abort|worker-exit|invalid-output|output-limit` 正交分类）；`isolation` 是诊断标签而非安全声明。**[事实]** …/docs/subsystems/code-runtime.md ；https://deepseek.com/harness
- **会话内调度（schedule）**：持久提醒（after/at/every，UTC 规范化），session-local 交付（原会话必须 live），追补只取最近到期一次，批量成轮有界；至少一次交付、无回执。**[事实]** …/docs/subsystems/schedule.md
- **capability seam 三件套**：任何可换能力 = Service Definition（接口）+ Service Provider（实现）+ Consumer（模型侧工具），三者齐全才算 seam；fs 与 subprocess 共享同一执行世界，换远程沙箱即随迁 Bash/PTY/LSP。**[事实]** …/docs/architecture.md
- **PTC/极简/创造模式**：标准（完整工具）、PTC（代码组合工具）、极简（仅 bash + str_replace_editor，用于最小环境基准）、创造（运行时内检查/试验 Cordis 插件并创作新 preset）。**[事实]** https://deepseek.com/harness
- **训练/论文侧的相关机制**（可移植理念，非运行时实现）：
  - DeepSeek-R1：纯 RL + **规则可验证奖励**（数学/代码判题器），即"测试门禁作为奖励信号"；GRPO 组相对策略优化。**[事实]** https://arxiv.org/abs/2501.12948
  - DeepSeek-V3.2：DSA 稀疏注意力 + 可扩展 RL 框架 + **大规模 Agentic 任务合成管线**（把推理融入工具使用场景的系统性合成训练数据，提升复杂交互环境中的泛化与指令遵循鲁棒性）。**[事实]** https://arxiv.org/abs/2512.02556
  - DeepSeek-V4：百万 token 上下文（混合注意力 CSA/HCA），长上下文 agent 记忆支撑。**[事实]** https://arxiv.org/abs/2606.19348
  - DeepSeek-Prover-V2：**子目标分解**（把复杂问题拆成子目标链做冷启动 + RL），与 picode"分块/子代理拆解"同构。**[事实]** https://arxiv.org/abs/2504.21801
  - 第三方佐证论文：《Plans Don't Persist: Why Context Management Is Load Bearing for LLM Agents》（2606.22953，replay pairing 诊断显示计划最早被上下文淘汰——支持"持久目标 + 上下文管理"的取舍）；《GRPO Does Not Close the Multi-Agent Coordination Gap》（2606.07845，多智能体共享资源协调仍开环——提示编排层需显式资源/仲裁机制）。**[事实]** arXiv 摘要页

---

## 3. 事实 / 推断标注汇总

| 结论 | 类型 | 依据 |
|---|---|---|
| "DeepSeek Harness" 是 DeepSeek 官方开源 agent harness（2026-08-13，MIT，TypeScript，开发者预览） | 事实 | GitHub 仓库元数据 + 官方 README + deepseek.com/harness |
| 一切皆插件、Cordis 驱动、Agent=Model+Harness | 事实 | 官方首页/README/架构文档 |
| arXiv/HF 无同名论文与同名模型 | 事实 | arXiv API 精确短语检索 0 篇；HF API 搜索为空 |
| DeepSeek 官方论文未公开命名训练/eval harness | 事实 | V3/R1/V3.2/V4 论文文本未提及（检索范围内） |
| "评测 harness = 行业通称（如 lm-evaluation-harness）"的解读 | 推断 | 论文未声明；属社区惯用语义 |
| 全部 10 个可借鉴设计点的机制描述 | 事实 | 官方 docs/subsystems/*.md（含生成自源码的 Cordis API 段） |
| 本地安装 `/Applications/DeepSeek Harness.app` | 事实 | 本机观测（DSH_* 环境变量） |
| 第三方生态（桌面壳/awesome 列表/橙皮书实测）存在 | 事实 | GitHub 仓库搜索（deepseek-ai/deepseek-harness 10.4 万 star；awesome-dsh-plugin 等） |
| "SPCT/self-play" 缩写未在官方来源核实（V3.2 论文全文、V3.2-Exp README、HF 卡、发布页均无） | 事实-负面 | arxiv 2512.02556 ar5iv 全文检索；DeepSeek-V3.2-Exp 各官方来源 |
| 官方评测设施 = 仓库 BENCHMARK.md 的 jsonrpc-agent 最小变体 + 官网极简模式 | 事实 | …/BENCHMARK.md；https://deepseek.com/harness |
| DeepSeek-V3.1 官方定位"agent 时代第一步"（工具使用/多步 agent 任务后训练增强） | 事实 | https://api-docs.deepseek.com/news/news250821/ |

---

## 4. 来源清单（URL + retrieved_at + 一句话摘要）

**官方仓库与文档（主来源，全部 retrieved_at=2026-08-15T15:45–15:55+07:00）**
1. https://github.com/deepseek-ai/deepseek-harness — 官方仓库：DeepSeek Harness（dsh），"Everything is a Plugin"，MIT/TypeScript/104k+ star/开发者预览；也即本会话正在运行的运行时。
2. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md — 官方 README：npx @deepseek-ai/dsh web 启动、Web UI 默认 http://127.0.0.1:3080、Cordis 驱动、开发者预览声明。
3. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.zh.md — 中文 README（同上）。
4. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/architecture.md — 架构总览：Cordis 插件树、profile/bundle 分层、核心包表、turn/step 流程、会话日志派生、capability seam、扩展点清单（ctx.jobs/goals/sandbox/fs/subagents…）。
5. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/session.md — Session=append-only SessionEvent 日志；事件词汇表可经 declaration merging 扩展；request/header 全快照入日志（可重建不变量）。
6. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/goal.md — 目标域：GoalRef CAS 修订、active/paused/blocked/complete、maxGoalRounds、goal/change 事件溯源、activation 与持久态分离。
7. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/jobs.md — 后台任务注册表：owner 会话授权、JobHooks、first-wins 结算、maxConcurrentJobsPerOwner=10、attachController。
8. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/sandbox.md — 沙箱：read-only/workspace-write/danger-full-access、per-call 策略、full/partial 强制、bwrap/Landlock/Seatbelt/ACL 后端、fail-closed。
9. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/approval.md — 审批：allowed-once/rejected/cancelled/unavailable、ask/never 每会话策略、approval/asked+decided 审计对。
10. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/permission-presets.md — 权限预设：沙箱模式+审批策略捆绑命名预设，custom 为派生态。
11. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/subagent.md — 子代理 seam：多 provider 共存（spawn/fork/acp/codex/claude-code/dsh-sdk）、one-shot vs 可续、Activation 冷恢复、interrupt/report/subagent-settled、listChildren/listDescendants。
12. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/workflow.md — 工作流：模型写编排脚本、worker_threads、meta 同源 Claude Code dynamic-workflows、parallel/pipeline、observe-only 事件 + 持久记录 + invariant。
13. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/skills.md — 技能：分层注册表、rank 序发现、模型仅见 name/description、按需 get()、modelInvocable/userInvocable。
14. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/tools.md — 工具注册表（scoped + 守卫管线）。
15. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/plan.md — Plan Mode：软指导、plan:policy 段、exit_plan_mode、plan-review 审批。
16. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/compaction.md — 压缩：lock 括号事件、surface replace、shadowed range、可重建。
17. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/schedule.md — 会话内调度：after/at/every、session-local、追补一次。
18. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/user-questions.md — 人类交互：批量提问、plan-review 意图、子代理不可问人。
19. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/code-runtime.md — Code Runtime：模型写程序、bindings、失败正交分类。
20. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/invariants.md — 运行时不变量注册表：包级 companion、机械校验。
21. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/testing.md — 测试政策：覆盖率门、真实 API e2e 自跳过、快照、"验证世界非自报"、mock 边界。
22. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/tool-catalog.md — 完整工具目录（goal/job/subagent/workflow/skill/schedule/terminal/run_code/cordis_* 等，与 picode 工具面高度重合）。
23. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/AGENTS.md — 仓库级 Agent 约定（守卫、约定、防御模式、不变量断言原则）。
24. https://deepseek.com/harness — 官方首页：开发者预览、一切皆插件、标准/PTC/极简/创造四种运行模式、Trajectory 视图、Agent=Model+Harness。

**框架论文（retrieved 2026-08-15）**
25. https://github.com/cordiverse/paper —《A Programming Paradigm for Spatiotemporal Composability》（2026-08-13 预印本）：可逆效应 + 响应式协效应 → context type → 组件演算；Cordis 实现（效应追踪、配置调和、HMR）。

**DeepSeek 官方论文（arXiv 摘要页，retrieved 2026-08-15）**
26. https://arxiv.org/abs/2412.19437 — DeepSeek-V3 Technical Report：MoE 671B/37B、MLA、多 token 预测、无辅助损失负载均衡。
27. https://arxiv.org/abs/2501.12948 — DeepSeek-R1：纯 RL 激励推理、可验证奖励（"测试门禁即奖励"）、GRPO。
28. https://arxiv.org/abs/2512.02556 — DeepSeek-V3.2：DSA 稀疏注意力、可扩展 RL 框架、大规模 Agentic 任务合成管线（agent 后训练）。
29. https://arxiv.org/abs/2606.19348 — DeepSeek-V4（预览）：百万 token 上下文、CSA/HCA 混合注意力。
30. https://arxiv.org/abs/2504.21801 — DeepSeek-Prover-V2：RL 子目标分解（递归定理证明管线）。

**第三方相关论文（arXiv 摘要页，retrieved 2026-08-15）**
31. https://arxiv.org/abs/2606.22953 —《Plans Don't Persist》：计划最先被上下文淘汰，"replay pairing"诊断——佐证持久目标 + 上下文管理的必要性。
32. https://arxiv.org/abs/2606.07845 —《GRPO Does Not Close the Multi-Agent Coordination Gap》：多智能体共享资源协调开环——编排层需显式资源/仲裁。

**生态与负面证据（retrieved 2026-08-15）**
33. https://github.com/awesome-dsh-plugin/awesome-dsh-plugin — 官方生态插件精选列表（第三方收集）。
34. https://github.com/alchaincyf/deepseek-harness-orange-book — 社区"橙皮书"：对官方系统提示词的实测（PDF/EPUB，第三方一手观测，供交叉验证，非官方）。
35. https://github.com/search?q=%22deepseek+harness%22 — GitHub 仓库搜索（API 版）3710 条提及，榜首即官方仓库——佐证官方命名的主导地位。
36. https://huggingface.co/api/models?search=deepseek+harness — HF 模型/数据集搜索为空（负面证据）。
37. http://export.arxiv.org/api/query?search_query=all:%22DeepSeek%20Harness%22 — arXiv 精确短语检索 totalResults=0（负面证据，同名论文不存在）。

来源数量统计：**主来源 25 + 论文 7 + 生态/负面证据 5 ≈ 37 项**（去重后独立来源 33 个 URL 组）。

**来源补遗（本检索批次新增核实，全部 retrieved_at=2026-08-15T16:58+07:00 / 08:58Z）**
38. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/BENCHMARK.md — 官方基准说明：最小 `jsonrpc-agent` 变体 + 独立 workspace/session 隔离（评测 harness 语义的官方设施）。
39. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/agent-lifecycle.md — turn/step 完整时序（durable session/event vs live agent/*，authoritative pre-step）。
40. https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-primer.md — Cordis 五思想、dispatch modes（emit/waterfall/parallel/serial）、waterfall 语义、可逆效应。
41. https://deepseek-harness.github.io/deepseek-harness/guide/quickstart — VitePress 开发者文档站（官网"开发者文档"入口，HTTP 200 可达）。
42. https://github.com/topics/dsh-plugin — GitHub 官方 dsh-plugin 生态主题标签（插件可发现性入口）。
43. https://api-docs.deepseek.com/news/news250821/ — DeepSeek-V3.1 发布页："our first step toward the agent era"，Think/Non-Think 混合推理 + 工具使用/多步 agent 任务增强（HTTP 200 可达）。
44. https://ar5iv.labs.arxiv.org/html/2512.02556 — DeepSeek-V3.2 论文 HTML 全文（用于 SPCT/self-play 负面检索；agentic 合成管线原文 1,800+ 环境 / 85,000 提示词）。

更新后统计：**43 项来源条目，去重独立 URL 组 ≈ 39 个**。

---

## 5. 对 picode 的可落地建议（调研视角，供工程主责决策，非实现方案）

1. 会话/交接/评分统一落到**仅追加事件日志**（审计 + 回放 + 复现），与 picode 的 evidence/handoff/acceptance 对齐。
2. 目标工具按"持久相位 + 轮次上限 + 机器码阻塞原因"建模（现 picode goal.yaml 已有雏形，可补 CAS 修订与激活/持久分离）。
3. 子代理采用"可续 + 冷恢复 + 单一 inbox + interrupt 保活 + report 回传 + 运行时结算通知"模型。
4. 沙箱/审批 fail-closed + 每调用策略解析 + 命名权限预设（写集纪律可表达为预设）。
5. 测试门禁执行"外部验证世界、覆盖率门、运行时不变量、快照回放"四件套。
6. 技能/工具"目录只给 name+description、正文按需加载"以控上下文成本。
7. workflow 编排脚本的"成对生命周期事件 + 协议不变量 + 有界 dispose"可移植到并行小组编排。

（以上均为对官方设计的映射建议，标记为 **[推断]**：机制均引自官方文档=事实；映射到 picode 的价值排序=推断。）
