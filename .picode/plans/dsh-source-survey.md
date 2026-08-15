# DSH 源码勘察报告（sys-arch · dsh-source-survey）

> 产出：软件架构师（sys-arch，兼代码勘察 scout）
> 提交对象：工程主责（run-lead）→ P02 分块输入
> 日期：2026-08-15（与 run-2026-08-15T02-08-48-06-DSH-intake 对齐）
> 约束：只读勘察（DSH checkout + picode docs）；未联网；未改业务代码。
> 关联：run-lead 纪要 `run-2026-08-15T02-08-48-06-DSH-intake.md`（候选点 A–I 与验收口径）；浅层笔记 `dsh-preliminary-notes.md`。
> 勘察基线：`/Applications/DeepSeek Harness.app/Contents/Resources/host/node_modules/@deepseek-ai/`（197 包，版本 0.1.0-rc.5）。所有行号以 2026-08-15 的 `lib/*.js`（构建产物）为准；源码同名于 `src/`。

---

## 0. 阅读结论（TL;DR）

DSH 与 picode 是两套技术栈：DSH = Cordis 插件栈 + **事件溯源会话日志**；picode = Pi 平台 + **文件真相状态机**（D002）。因此本文产出**机制语义清单**而非移植代码。Top 12 与 run-lead 的 P0（A goal 跨轮 / B skill 按需 / E 沙箱审批）完全对齐，并补充了 4 项"基础设施级"高杠杆机制（事件日志纪律、inbox 续跑控制、原子写+读前编辑守卫、durability checkpoint），其中多项是**纯增量、S 成本、可顺手并入**。

**冲突总标注**：
- 🔴 **与 D002（文件真相）冲突**：#4 事件日志纪律（DSH"日志即状态"）——picode 只可借其**机件**（修复/打包/checkpoint），不可借其**真相模型**；run-lead 已定：日志仅审计（D082 边界延续）。
- 🟡 **双轨需定义**（非冲突、需明界）：#2 沙箱模式 vs picode 写集纪律（静态白名单 write_paths = 现有；动态 mode 围栏 = 兜底叠加）；#3 skill_load 按需 vs persona `skills[]` 声明注入（双轨并存，不重复注入）。
- 🟢 **纯增量**：#1（goal 增量字段）、#5–#12 多数为新增机制，不触碰既有不变量。

---

## 1. DSH 架构一页图

### 1.1 包依赖简图（按能力面分组，实线 = 直接 import 关系）

```text
                          ┌──────────────────────────────────────────────────────┐
                          │  dsh-app-boot（boot 序列：.env→profile→patch→loader）  │
                          │  loadLayeredEnv / loadProfile / composeEntries /      │
                          │  mountRootInclude / installFailLoud / assertEntriesAct │
                          └───────────────┬──────────────────────────────────────┘
                                          │ 裸配置树 = cordis.patch.yml 行（id/name/config）
                  ┌───────────────────────▼────────────────────────────────────────┐
                  │  dsh-base（bundle：cordis.patch.yml，~60 行插件行 = 每个 profile │
                  │  的第一补丁层；web/headless profile 均以其为底座）                │
                  └──────┬───────┬───────┬───────┬───────┬─────────┬────────┬───────┘
                         │       │       │       │       │         │        │
        ┌────────────────┼───────┼───────┼───────┼───────┼─────────┼────────┼───────────┐
        ▼                ▼       ▼       ▼       ▼       ▼         ▼        ▼           ▼
  ┌───────────┐  ┌────────────┐ ┌─────┐ ┌──────┐ ┌────────┐ ┌──────────┐ ┌──────┐ ┌──────────┐
  │ dsh-agent │  │ dsh-session│ │dsh- │ │dsh-  │ │ dsh-    │ │ dsh-     │ │dsh-  │ │ dsh-      │
  │ 注册表/   │  │ 事件日志+  │ │llm  │ │tools │ │sandbox  │ │sandbox-  │ │scope │ │settings  │
  │ initiator │  │ surface 投影│ │     │ │      │ │升级阶梯 │ │policy    │ │      │ │命名空间  │
  │ inbox     │  └─────┬──────┘ └─────┘ └──────┘ └────┬───┘ └────┬─────┘ └──────┘ └────┬─────┘
  └─────┬─────┘        │                              │         │                       │
        │ 驱动          │ 事件                      沙箱实现    策略                    热重载
  ┌─────▼───────────┐  │                         ┌────▼──┐  ┌──▼───────────┐      ┌─────▼─────┐
  │ dsh-agent-loop  │  │                         │fs-sand│  │user-approval │      │settings-  │
  │ ReactLoopAgent  │  │                         │bash-  │  │(ask/never)   │      │file       │
  │ turn/step/inbox │  │                         │sandbox│  └──┬───────────┘      └───────────┘
  │ tool-call 调度  │  │                         └────┬──┘     │ 预设捆绑
  └────────┬────────┘  │                              │      ┌──▼────────────┐
           │ 领域包     │                              │      │permission-    │
  ┌────────▼────────┐  │  ┌──────────┐  ┌──────────┐  │      │presets        │
  │ dsh-goal        │◄─┼──┤          │  │          │  │      │(sandbox+approv│
  │ dsh-goal-round- │  │  │ dsh-skill│  │ dsh-jobs │  │      │ 捆绑+pin)     │
  │ driver          │  │  │ filesys  │  │ tool-jobs│  │      └───────────────┘
  └─────────────────┘  │  └────┬─────┘  └──────────┘  │
                       │       │ 工具面               │
  ┌────────────────────┼───────┼──────────────────────┼───────────────────────────────┐
  │ 工具消费者层：dsh-tool-bash / dsh-tool-fs / dsh-tool-skill / dsh-tool-subagent /   │
  │ dsh-tool-workflow / dsh-tool-goal / dsh-tool-jobs / dsh-tool-todo / dsh-tool-ralph │
  │ （每个工具 = defineTool{name,parameters,execute,output.render}，经 ctx.tools 注册； │
  │   escalation 走 ctx.sandbox→ctx.approval，输出渲染统一 [sandbox:…] 标记）           │
  └────────────────────────────────────────────────────────────────────────────────────┘
  子代理/编排面：dsh-subagent（spawn/fork provider + continuation）│ dsh-workflow + dsh-workflow-worker-thread
  观测面：dsh-session-projection（注册表）│ dsh-session-query-sqlite │ dsh-token-meter │ dsh-compaction
  远程面：dsh-typert-protocol → dsh-api-gateway（Remote 分发）→ dsh-api-remotes（BFF 解析）
  预设面：dsh-agent-presets（每 session 从 preset cordis.yml 组合插件集，standing mount）
```

### 1.2 核心机制列表（包 → 机制 → 精确位置）

| # | 机制 | 包 | 关键位置 |
|---|---|---|---|
| M1 | 事件溯源会话日志（append-only，seq 连续，surface 投影） | dsh-session | `lib/index.js:1054`（事件词汇表）、`444`（foldSurface）、`219`（surface 类型） |
| M2 | 崩溃修复（interruptedTurnClosers） | dsh-session | `lib/index.js:626` |
| M3 | chunk 存储打包（run→单行，~56× 压缩） | dsh-session | `lib/index.js:877`（packChunkRuns）`1029`（decodeStorageRecord） |
| M4 | durability checkpoint（请求/工具前 flush，fail-closed） | dsh-session-checkpoint-policy | `lib/index.js:34`（afterCheckpoint）`70`（apply） |
| M5 | turn/step 双层循环 + inbox 三原语 + wake 门闩 | dsh-agent-loop | `lib/index.js:335`（ReactLoopAgent）`390`（send）`516`（turn）`606`（step） |
| M6 | tool-call 调度（exclusive barrier + parallel pool，模型序提交） | dsh-agent-loop | `lib/index.js:117`（executeToolCalls）`162`（runGroup）`747`（默认 10） |
| M7 | agent 注册表 + initiator 因果 scope（AsyncLocalStorage） | dsh-agent | `lib/index.js:415`（AgentRegistry）`490`（withInitiator）`460`（currentInitiator） |
| M8 | inbox 增量投影（next-turn/next-step，事件先于变更） | dsh-agent | `lib/index.js:12`（Inbox）`117`（splice） |
| M9 | 消费工作核算（foldConsumedWork：turn 是否结清其 claim） | dsh-agent | `lib/index.js:218` |
| M10 | goal 事件溯源域（CAS revision/回合预算/blocked 政策码/clear 墓碑） | dsh-goal | `lib/index.js:285`（foldGoal）`421`（GoalService）`776`（commit） |
| M11 | goal 激活语义（armed/disarmed，session-start 即 disarm，显式 resume） | dsh-goal | `lib/index.js:519`（session-start）`552`（disarm）`616`（resume） |
| M12 | 自动续跑 driver（quiescence 触发 + reservation race fence） | dsh-goal-round-driver | `lib/index.js:55`（apply）`103`（drive）`276`（validReservation） |
| M13 | 沙箱模式三态 + 每调用策略解析（会话 `sandbox/mode` 事件覆盖） | dsh-sandbox-policy | `lib/index.js:101`（SandboxPolicyService）`138`（resolve）`39`（fold） |
| M14 | 升级阶梯（严格更宽 + 一次性授权 + 拒绝标记/提示词汇） | dsh-sandbox | `lib/index.js:29`（WIDER_MODES）`92`（approveEscalation）`63/75`（标记） |
| M15 | 审批服务（ask/never，approval/asked+decided 审计对，turn 内封闭） | dsh-user-approval | `lib/index.js:85`（ApprovalService）`144`（request）`62`（hasOpenTurn） |
| M16 | 权限预设（sandbox+approval 捆绑，pinInitialPermission） | dsh-permission-presets | `lib/index.js:79` `272`（apply）`285`（pin） |
| M17 | 文件沙箱围栏（canonicalize-then-contain，结构化 FS_SANDBOX_DENIED） | dsh-fs-sandbox | `lib/index.js:107`（SandboxedFileSystem）`157`（checkedTarget） |
| M18 | read-before-edit 版本守卫（观察→写意图 CAS） | dsh-fs-observation-policy | `lib/index.js:16`（ObservedStateGate）`66`（writeIntent）`89`（editIntent）；dsh-fs-local `lib/index.js:783/803`（FS_STALE_VERSION） |
| M19 | 原子写 + 跨进程写锁 | dsh-atomic-write | `lib/index.js:30`（writeFileAtomic）`72`（withFileLock） |
| M20 | bash 执行器（超时/输出 spill/进程组 SIGTERM→KILL） | dsh-bash-local | `lib/index.js:127`（LocalBashExecutor）`129`（Config）`81`（ENV_OVERRIDES） |
| M21 | bash 沙箱封装（confine + denial 分类 + runner 失败识别） | dsh-bash-sandbox | `lib/index.js:110`（SandboxBashExecutor）`143`（run） |
| M22 | 技能注册表 + 分层覆盖 + invocation policy | dsh-skill / dsh-skill-filesystem | `lib/index.js:119`（SkillRegistry）；skill-filesystem `lib/index.js:21-25`（rank） |
| M23 | 技能按需加载工具（渐进披露：目录→取 body） | dsh-tool-skill | `lib/index.js:37`（skill 工具） |
| M24 | 后台 job 注册表（start/read/kill/wait，owner 隔离） | dsh-jobs / dsh-tool-jobs | `lib/index.js:58`（JobRegistry）；tool-jobs `lib/index.js:167` |
| M25 | continuable 子代理（descriptor/depth/冷恢复/父子权限边界） | dsh-subagent | `lib/index.js:43`（depth）`328`（descriptor）`547`（delegation context）`1678`（listChildren） |
| M26 | workflow 脚本编排（worker-thread 隔离执行，parallel/pipeline，fatal 分级） | dsh-workflow / dsh-workflow-worker-thread | `lib/index.js:35`（WorkflowError）`59`（WorkflowEngine）；worker `lib/index.js:844` |
| M27 | 分层配置 patch 模型（bundle 层→profile 层→overlay，id 定位最后写胜） | dsh-base + dsh-app-boot | base `cordis.patch.yml`；app-boot `lib/index.js:57`（applyEntryPatches）`575`（composeEntries） |
| M28 | boot 守卫（fail-loud / 激活审计 / 快照感知解析 / .env 引导白名单） | dsh-app-boot | `lib/index.js:1042`（installFailLoud）`1106`（assertEntriesActivated）`599`（resolveConfigPath）`619`（BOOTSTRAP_NAMES） |
| M29 | 会话投影注册表（init/apply/view 纯函数单元，stateVersion 门闩） | dsh-session-projection | `lib/index.js:37`（SessionProjectionRegistry）`58`（register） |
| M30 | 设置文档热重载（settings.yaml 节区覆盖，namespace+path op） | dsh-settings / dsh-settings-file | settings `lib/index.js:618`（installSettingsSection）；file `lib/index.js:69` |
| M31 | AGENTS.md 工作区指令基线（发现/哈希/字节预算/替换语义） | dsh-agent-instructions | `lib/index.js:15-19`（候选/预算）`110-114`（system-reminder 框） |
| M32 | tool-call/result 配对平衡 + 压缩检查点 | dsh-compaction | `lib/index.js:85/96`（toolPairingBalancedBefore/After） |
| M33 | 远程 RPC 分发（typert Remote，边界校验/lookup/context/取消） | dsh-api-gateway / dsh-api-remotes | gateway `lib/index.js:49`（TypertGatewayService）`92`（invoke）；remotes `lib/index.js:101`（resolver） |
| M34 | 预设组合（每会话从 preset cordis.yml 组合工具/提示，standing mount） | dsh-agent-presets | `lib/index.js:804`（AgentPresets）`954`（mount）`1130`（ensureStanding） |

---

## 2. Top 12 可移植机制（按对 picode 的价值排序）

> 价值排序依据：run-lead 纪要的优先级（P0→P3）× 机制对 picode 现状的差距缺口 × 移植杠杆比。每项给：DSH 实现方式（包+文件+行号/签名）、picode 现状、候选移植设计（S/M/L 成本）、风险。成本口径：S=单包/单工具内 ≤0.5 周，M=跨 2 包+文档 1–2 周，L=跨包+动会话/状态模型 3+ 周。

### #1 goal 事件溯源域：CAS revision + 回合预算 + blocked 政策码 + disarm/resume 激活语义 —— 【P0 A · 成本 M】

**DSH 实现**：`@deepseek-ai/dsh-goal/lib/index.js`
- 事件溯源域：每次变更 = 一条 `goal/change` 全量快照事件（`operation: create|edit|pause|resume|complete|block|clear`，`commit` @776），重放折叠 `foldGoal` @285 严格校验迁移（非法转换 fail-loud，`validateSnapshotTransition` @176）。
- **CAS 围栏**：`ref = {id, revision}`，`expectCurrent` @689 拒绝陈旧 revision（`GOAL_STALE_REVISION`）——并发写方必须携带当前 revision。
- **回合预算**：`roundsStarted`（由 `user/message` 的 `source.kind==="goal"` 事件推进，@272-278）+ `maxGoalRounds`（默认 256，`Config` @513）；达上限 `resume` 拒绝（@626）且 driver 自动 `block(code:"round-limit")`（round-driver @125）。
- **激活语义（关键创新）**：`activation: armed|disarmed` 是**进程内**状态，不持久化；`agent/session-start` 即 disarm（@519-521），跨会话重启后**默认不自动续跑**，必须显式 `resume` 才 arm——防僵尸续跑。`blockedReason = {code: lower-kebab, message}`（`resolveBlockReason` @410）政策码结构化。
- 投影：`applyGoalProjection` @376（last-wins 投影单元，供观测）。

**picode 现状**：`goal.yaml` 文件真相，status 状态机（intake→draft→active⇄blocked→completed→cancelled）+ CLI `picode goal set-status`；**缺**：无 revision CAS（并发写 = 最后写胜）、无 roundsStarted/maxGoalRounds 预算、无 disarm/resume 激活语义（跨进程恢复即静默续跑风险）、blocked 只有自由文本 park_reason 无政策码。guardian 会话级续跑（continuation.ts）≠ goal 级激活。

**移植候选设计（M）**：goal.yaml 增**增量字段**（D002 保持文件真相）：`revision`、`rounds_started`、`max_goal_rounds`、`activation`（`armed|disarmed`，默认 disarmed）、`blocked_reason: {code, message}`；`picode goal resume/disarm/block` 子命令做转换校验 + revision 递增（读-改-写加文件锁，见 #7）；旧格式向后兼容可读（run-lead A1）。模型侧只读可见：pi-extension 复用 state_read 或新增 goal_get（run-lead A5 待定）。**guardian 只对 armed 的 goal 续跑**；跨会话恢复时若 goal=active 但 activation=disarmed → 不动作（A2 验收）。

**风险**：🟡 与 D002 冲突面已由 run-lead 决策收敛（文件仍真相，无独立事件日志；revision 仅作 CAS 围栏不重建状态）；guardian 续跑与 goal resume 须在 17-agent-runtime 文档明界（run-lead 已列）。revision 递增在多人写 goal.yaml 时需锁（#7 文件锁复用）。

---

### #2 沙箱权限模式 + 一次性升级审批阶梯 —— 【P0 E · 成本 M】

**DSH 实现**（这是 DSH 最自洽的机制组，四包分层）：
- **策略**：`@deepseek-ai/dsh-sandbox-policy/lib/index.js` — `SandboxPolicyService(ctx.sandboxPolicy)` @101；三态 `SANDBOX_MODES = ["read-only","workspace-write","danger-full-access"]` @26；**每调用** `resolve({session})` @138 产出 `{mode, workspaceRoot, sessionId}`（会话 `sandbox/mode` 事件覆盖 > 部署默认）；策略以 `renderPolicyContext` @83 注入 runtime-context 快照（模型可见，非系统提示常驻）。
- **围栏**：`@deepseek-ai/dsh-fs-sandbox/lib/index.js` — `SandboxedFileSystem.checkedTarget` @157：canonicalize-then-contain；`workspace-write` 允许写 `writableRoots(policy)`（workspace 根 + /tmp + tmpdir，`@deepseek-ai/dsh-sandbox/lib/index.js:154`，与 bash 同源不漂移）；越界抛结构化 `FS_SANDBOX_DENIED`；`read-only` 拒一切变更。**同一 writableRoots 供 fs 围栏与 bash Seatbelt 共用**（根函数 @sandbox/roots.js:154）——"写工具写不了 /tmp 但 bash 能"的不对称不会发生。
- **升级阶梯**：`@deepseek-ai/dsh-sandbox/lib/index.js` — `WIDER_MODES` @29（read-only→[workspace-write, full]；workspace-write→[full]，**严格更宽、执行时校验**）；`approveEscalation` @92：先验更宽性 → 走审批 → `allowed-once` 才授该次调用的更宽 mode；模型可见词汇 `sandboxDenialMarker(mode)` @63 `[sandbox: file access denied under <mode> mode]` 与 `escalationHintMarker(subject)` @75（同轮升级提示，拒绝后"retry once with sandbox_permissions+justification"是**唯一**豁免）。
- **审批**：`@deepseek-ai/dsh-user-approval/lib/index.js` — `ApprovalService(ctx.approval)` @85；策略 `ask|never`（会话 `approval/policy` 事件折叠 @49）；`request` @144 要求**turn 内**（`hasOpenTurn` @62，裸事件在 turn 间 = 崩溃尾会被丢弃），审计对 `approval/asked` + `approval/decided` @148/155 持久成对；无 answerer 或拒绝 = fail-closed（`unavailable`/`rejected`）；`allowed-once` 是唯一授权。
- **捆绑**：`@deepseek-ai/dsh-permission-presets/lib/index.js` — 预设表（sandbox+approval 捆绑，默认 `workspace-write/ask`），`pinInitialPermission` @285 在会话发布前补齐缺失事实。
- 模型侧工具参数化：`@deepseek-ai/dsh-tool-bash/lib/index.js` — `sandbox_permissions`（enum=ESCALATION_TARGETS）+ `justification` 成对校验（`validateEscalationArgs` @50，**无理由的升级请求 = malformed**），`approveBashEscalation` @238 在 execute 前完成授权，`renderResult` @54 统一渲染标记。

**picode 现状**：`write_paths` 静态白名单机械校验（repo_write + E2/E7 + diff 门禁）；越界 = 直接拒绝，**无升级通道**；无 mode 概念、无 read-before-edit。

**移植候选设计（M）**：三层叠加，不替代 write_paths（run-lead E4 明确：沙箱为动态兜底围栏）：① repo_write 加 `sandbox mode` 每会话可配（默认 workspace-write 映射 write_paths 为 writable root）；② 越界写 → 结构化拒绝（含生效 mode）→ 可申请一次性升级 → answerer 审批（默认 run-lead 代批，policy 层 sponsor，run-lead Q4 待确认）→ 审计记录落盘（复用 evidence/audit 目录）；③ read-before-edit 守卫（#7）。模型侧工具描述注入拒绝/升级词汇（仿 `[sandbox: …]` 标记）。

**风险**：🟡 与写集纪律**双轨**——必须文档明确定位（write_paths=静态承诺，sandbox=动态兜底），否则两套拒绝语义混淆（run-lead 风险表已列）；🟡 answerer 通道：picode 无实时人类通道 → run-lead 代批是务实默认，但 policy 层动作仍须 sponsor（Q4 决策）；审批审计对要求"turn 内"——picode 无 turn 概念，落盘点改为"请求-决策成对写 audit 文件"即可。

---

### #3 按需 skill 加载（渐进披露 + 分层覆盖 + invocation policy）—— 【P0 B · 成本 S–M】

**DSH 实现**：
- `@deepseek-ai/dsh-skill/lib/index.js` — `SkillRegistry(ctx.skills)` @119；`SKILL_NAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/` @17；`isModelInvocable/isUserInvocable` @37/45（invocation policy 双面）；`renderSkillContent` @57。
- `@deepseek-ai/dsh-skill-filesystem/lib/index.js` — 分层 rank：project `.dsh`=100 < project `.agents`=200 < custom=300 < user `.dsh`=400 < user `.agents`=500 < bundled=600（`@dsh-skill` @23），同 id 高层覆盖低层；发现根 + 健康巡检（broken skill 报目录行不静默跳过）。
- `@deepseek-ai/dsh-tool-skill/lib/index.js` — 模型侧 `skill` 工具 @37：**渐进披露**——系统提示只挂目录（名称+摘要），调用时按名取完整 body（`ctx.skills.get(name)` @126）；未知名/不可模型调用 → 结构化错误；目录也落 `session` 事件（durable catalog）。
- 目录描述长度上限 `catalogDescriptionMaxLength`（Config @27）——上下文有界。

**picode 现状**：`skills/` + SKILL.md + skill-lint（frontmatter 校验）+ `skills.ts`（D082：发现/索引/persona `skills[]` 声明接线，渐进披露**仅到 metadata 层**进系统提示）；**无运行时加载工具**。

**移植候选设计（S–M）**：pi-extension 新增 `skill_load <name>` 工具（ACL 受限），按名返回 SKILL.md body + 体积上限/截断（run-lead B2）；`skills.ts` 加 `loadSkill()`（含层级解析与健康校验）；与 persona `skills[]` 声明双轨并存（声明 = 系统提示常驻，skill_load = 按需补充，**不重复注入**，B2）；单测 + `skill-lint` 0 error（B3）。

**风险**：🟢 纯增量（不触碰会话/状态模型）；低。双轨语义（声明 vs 按需）需在 skills 文档一行界定即可。

---

### #4 事件溯源会话日志的**机件**：surface 投影 + 崩溃修复 + chunk 打包 + durability checkpoint —— 【基础设施 · 成本 M（拆 S 项可独立）】

> ⚠️ 只移植**机件**（存储与恢复纪律），不移植"日志即真相"模型（D002：picode 文件才是真相）。

**DSH 实现**：
- 日志模型：`@deepseek-ai/dsh-session/lib/index.js` — append-only 事件 `{type, seq, time, data, surfaceOp?, sourceEventSeqs?, ignorable?}`；事件词汇表 `KNOWN_SESSION_EVENT_TYPES` @1054（49 类，含 turn/step/tool/approval/goal/sandbox…——本文档即"事件词汇"蓝本）；seq 连续校验 + `ignorable` 前向兼容守卫。
- **surface 投影**：`foldSurface` @444 / `SurfaceManager` @457 — 只有 `user/message|assistant/message|tool/result` 三种事件进入模型可见面；`surfaceOp: append | {op:replace,start,end}` + `sourceEventSeqs` 溯源（替换必须声明遮蔽了哪些 seq，`assertProvenance` @320）；重放可精确重建"任何请求当时看到的消息序列"。
- **崩溃修复**：`interruptedTurnClosers` @626 — 扫描开放 turn/step/未决 tool-call，合成确定性收尾事件（`TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN` 错误结果 + step/end + `turn/end{reason:interrupted}`）——**恢复语义显式化**，不留半截。
- **chunk 打包**：`packChunkRuns` @877 — 连续同块 delta run（≥3 条）压成单行 `{seq0,time0,dt,texts|args}`，实测 ~56× 体积降；解码严格校验（坏行 fail-loud 不静默丢）。
- **checkpoint**：`@deepseek-ai/dsh-session-checkpoint-policy/lib/index.js` — `afterCheckpoint` @34：**模型请求首块前 / 顶层工具分派前 / pre-step 前** `ctx.sessions.flush(session)`；checkpoint 失败 = fail-closed（不派发适配器、不执行工具体）@70-89。

**picode 现状**：`@picode/bus` jsonl 消息日志 + 窗口压缩；`@picode/orchestrator` 文件状态（goal/chunks/task YAML）；dashboard 只读投影（D082 checkpoint）；**缺**：无"seq 连续 + ignorable"前向兼容纪律、无崩溃尾修复（写半截 YAML = 未知状态）、无模型可见面与日志面的分离、状态文件写前无 flush 门闩。

**移植候选设计（拆 3 个 S 项）**：① **崩溃修复**：orchestrator 读 run 状态前跑"尾修复"（task/chunk YAML 半写检测 + 上一条完整记录回退，或 evidence 文件对），S；② **日志纪律**：bus jsonl 加 seq/类型注册表/ignorable 字段（向后兼容），S；③ **checkpoint**：pi-extension 工具体执行前、模型请求前 flush 状态文件（沿用既有写队列），S；④ **chunk/压缩**：若 bus 记录 assistant 流式块则打包，M（低优先，依赖 D058 话题）。

**风险**：🔴 冲突**仅限真相模型**（不移植）；机件本身与 D002 无冲突（修复/打包/checkpoint 都是"让文件真相更可靠"）。实施时注意 bus 格式变更的兼容（现有 run 目录可直接读）。

---

### #5 inbox turn/step 三原语（followup/steer/inject）+ wake 门闩 —— 【sess-mgr 续跑升级 · 成本 M（语义借鉴 S）】

**DSH 实现**：`@deepseek-ai/dsh-agent-loop/lib/index.js` — `ReactLoopAgent` @335：
- 两级输入队列：`Inbox`（`@dsh-agent` @12）维护 `next-turn`（FIFO 整轮）+ `next-step`（下一步边界）两个 pending 列表；任何变更**先 append 事件再改投影**（`agent/inbox/spliced`，mutate @131）。
- 三原语 @390-404：`followup(msg)` = 入 next-turn + 唤醒（新用户输入/续跑）；`steer(msg)` = 入 next-step + 唤醒（引导下一步）；`inject(msg)` = 入 next-step **不唤醒**（策略变更通知、上下文快照）。
- **wake 门闩** @444：空闲才开新 driver；运行中 wake → 置 `wakeRequested` 在 idle 边界重开（不在 busy 中插队）；maintenance 期间 wake 也锁存；abort 后 wake 重分类到 next-turn。
- `cancel(cause, {keepInbox})` @405：可保留/清空队列。
- turn/step 生命周期：turn = 会话级轮（`turn/start…turn/end{reason:completed|blocked|aborted|error|max-tokens}`），step = turn 内模型往返；`claim(target, turn)` @56 一步内原子认领。

**picode 现状**：sess-mgr（17-agent-runtime：registered→sleeping⇄awake→terminated）+ guardian tick + continuation.ts（转录+摘要+投喂）；**缺**：next-turn/next-step 两级语义（picode 唤醒 = 整体重投喂）、wake 门闩（忙碌中重复唤醒）、cancel 保留队列、事件先于变更。

**移植候选设计（M，或先 S 借鉴）**：sess-mgr 唤醒决策引入两级输入：`wake_full`（新轮次，仿 next-turn）vs `steer`（下一步引导，如证据回执/审批结果回投，仿 next-step）vs `inject`（状态变更通知不唤醒，如 checkpoint 更新）；guardian tick 只在 idle 会话上动作（仿 readyToDrive 的 quiescence 检查）；cancel 保留 pending 消息（防 P14 强制解散丢请求）。**S 变体**：仅把续跑投喂从"整体重投"改"增量 steer"，不碰会话状态机。

**风险**：🟡 触碰 17 会话模型（唤醒语义是它的核心）——须 spec 修订 + 回归；与 continuation.ts 重叠面要合并（避免两套续跑逻辑）。

---

### #6 自动续跑 driver（goal-round-driver 的 quiescence + race fence 模式）—— 【guardian 升级 · 成本 S–M】

**DSH 实现**：`@deepseek-ai/dsh-goal-round-driver/lib/index.js` — `apply` @55：
- **quiescence 触发**：`readyToDrive` @79 = 进程活跃 ∧ 未停止 ∧ agent 仍 live ∧ `agent.status === "idle"` ∧ 无竞争消息——**只在空闲边界动作**；`agent/status` idle 事件驱动 @216。
- **reservation race fence**：driver 预占 `attempt = {goalId, revision, round, messageId, phase: queued→claimed→admitted}` @143；`agent/pre-step` 钩子 @281 校验提交的轮次消息仍满足 `validReservation` @276（agent live ∧ attempt 仍 claimed ∧ goal 同 id 同 revision ∧ active ∧ armed ∧ round 连续）；不满足 → `{kind:"reject"}` + 恢复其他被 claim 的消息（`restoreOtherClaimed` @95）。
- **竞争检测**：`agent/inbox/inserted` @239 检测他人消息入 next-turn → `competingQueued=true` 抑制本轮；`goal/changed` → 需 checkpoint → 重新 drive。
- **失败语义**：`agent/error` 或 max-tokens → disarm（不再自动续）；round 超限 → `block(code:"round-limit")`；queue-failed → `block(code:"queue-failed")`——**自动化的每个失败出口都有结构化落点**。
- 触发循环在 `ctx.agents.withoutInitiator` 中跑（@173，不带 initiator 因果，见 #8）。

**picode 现状**：guardian 定时 tick 投喂续跑 prompt（idle_sec）；无 race fence（多人/多会话并发续跑可能双投）、无"仅 quiescence 动作"门闩、失败出口无结构化落点（at_risk 有但续跑失败无 policy code）。

**移植候选设计（S–M）**：guardian 增加 quiescence 门闩（session idle 且无 pending 请求才投喂）+ attempt reservation（投喂消息带 goal_id/revision/round 源标记，投喂前校验仍有效）+ 竞争检测（房内有新请求则不续）；失败出口带 policy_code（`continuation-failed` / `round-limit`）落 blocked_reason（衔接 #1）。**与 #1 强耦合**：若无 goal 激活语义，attempt 至少校验"该 task 仍 running 且无新 brief"。

**风险**：🟢 纯增量（guardian 内部），低；与 #5 同源（quiescence 概念），两者设计同 chunk 避免重复。

---

### #7 原子写 + 跨进程写锁 + read-before-edit 版本守卫 —— 【写守卫增强 · 成本 S】

**DSH 实现**：
- `@deepseek-ai/dsh-atomic-write/lib/index.js` — `writeFileAtomic(filename, content, {mode, dirMode})` @30：同目录随机后缀兄弟文件 `wx` 独占创建（拒绝 symlink 植入 + 权限位经 rename 落地）+ rename 原子替换（读方只见旧或新完整内容）；失败清理临时文件。`withFileLock(filename, operation)` @72：`<file>.lock` 兄弟 `wx` 创建（写 `pid`），指数退避（20→200ms，2s 超时），**从不由竞争者删锁**（孤儿 = 操作员处理），readers 免锁（rename 即提交）。
- `@deepseek-ai/dsh-fs-local/lib/index.js` — 写意图守卫：`writeText(…, expected)` @779 支持 `expected.kind === "replaceIfVersion"`（版本不符 → `FS_STALE_VERSION` "file changed since it was read" @785）/ `"createIfAbsent"`（已存在 → `FS_NOT_OBSERVED` @786）；`editText` @798 读-改-写临界区带 CAS（版本陈旧拒绝）。
- `@deepseek-ai/dsh-fs-observation-policy/lib/index.js` — `ObservedStateGate` @16：owner（agent session）弱键记录**观察到**的文件（present/absent 都记）；`writeIntent` @66：观察过 present → replaceIfVersion，未观察 → createIfAbsent；`editIntent` @89：**未先读 → `FS_NOT_OBSERVED` "edit requires reading first"**——read-before-edit 纪律机制化，三个 `fs/*` 事件（write-intent/edit-intent/observed）可插拔。

**picode 现状**：`@picode/core` 有 writeAtomic（C2 写守卫，创建目录+写+改名）；**缺**：跨进程写锁协议（merge.lock 存在但状态文件写入无通用锁）、read-before-edit 版本守卫（sdet 改 evidence 前无"必须先读"校验）、写意图 CAS。

**移植候选设计（S）**：① `writeFileAtomic` 升级为 wx 独占创建 + mode 位（防 symlink 植入 + 收窄权限）；② 新增 `withFileLock`（用于 goal.yaml/chunks.yaml 读-改-写，衔接 #1 的 revision CAS）；③ repo_write 的 edit 类操作加 read-before-edit 守卫（会话内未读该文件 → 结构化拒绝，可配开/关，run-lead E3）。**纯工具层，零架构影响**。

**风险**：🟢 纯增量；①需回归既有写路径（C2 测试）；③默认开可能引起既有流（session 启动预读 write_paths 文件）适配，默认关则无风险。

---

### #8 agent 注册表 + initiator 因果 scope —— 【审计/门禁归因 · 成本 S】

**DSH 实现**：`@deepseek-ai/dsh-agent/lib/index.js` — `AgentRegistry(ctx.agents)` @415：
- 活动注册表：`register/enter/announce/get/list/roots/isOwnedBy`（@580-717）；`agent/created`/`agent/disposed` 事件（@660-682）；发布仲裁：同 id 并发 prepare，`enter` @601 先占位，败者回滚（agent-loop `prepare` @1088 中"先建 teardown 再 publish，setup 中途 unload 全回滚"）。
- **initiator scope（核心）**：`AsyncLocalStorage` 双栈 @418-419；`withInitiator(agent, op)` @490 / `withoutInitiator(op)` @504 / `currentInitiator()` @460（可选）/ `requireInitiator()` @472（必须）；驱动链上的任意异步工作**继承发起者**——"这个工具调用/日志/导出是哪个 agent 发起的"自动可得；teardown 时排干边界（`disposeInitiators` @723，防卸载中途留因果悬挂）。
- 语义明确："ambient presence is neither liveness proof nor authorization"（@410 注释）——因果只用于归因，授权仍靠显式 subject/owner。

**picode 现状**：bus token + 房间 ACL（身份=座位 token）；**缺**：进程内异步因果链（"这个 repo_write 来自哪个会话的哪个工具调用"要靠消息上下文显式传递）；门禁/审计归因靠 log 回溯。

**移植候选设计（S）**：orchestrator 执行工具时用 `AsyncLocalStorage` 包一层 `withActor(sessionId, taskId, op)`；审计/日志/门禁记录自动带上 `actor`（无需每个调用点传参）；`requireActor` 用于必须归因的私有路径（merge、审批）。与 bus token 正交：token=授权身份，ALS=归因链。

**风险**：🟢 纯增量，JS 内置能力；注意跨 worker/进程不传递（DSH 同样注明 identity at worker/process/persistence boundaries 显式化）——picode 的 Pi 会话是独立进程，归因只在 orchestrator 进程内有效，跨进程仍走显式字段。

---

### #9 后台 job 注册表 —— 【P2 F · 成本 M】

**DSH 实现**：`@deepseek-ai/dsh-jobs/lib/index.js` — `JobRegistry(ctx.jobs)` @58（`JobId` 品牌 @19）；`@deepseek-ai/dsh-tool-jobs/lib/index.js` — `apply` @167 注册 `job_output`/`job_kill`/`job_list` 工具：
- 任务形状：`{kind, label, owner, run: () => {cancel, done, readOutput}}`（tool-bash 后台适配 @dsh-tool-bash/lib/index.js:414 `jobs.start`）。
- **owner 隔离**：job 归属发起 agent；读取/杀除限 owner（避免跨会话干扰）。
- **输出有界**：`retainTail/retainHead/fitWithSuffix` @84-113（字节预算内保留头尾 + 省略标记）；流式增量读（`readOutput` 返回 delta）；完成通知（完成摘要）。
- 语义：后台任务与 tool-call signal 解耦（返回 jobId 后取消走 `job_kill`）。

**picode 现状**：串行 merge（merge.lock）无通用后台任务；长命令只能前台等；dashboard 监控数据缺任务视图。

**移植候选设计（M）**：orchestrator 增加 job 注册表（start/list/read/kill/wait CLI，run 形状仿上）；owner=发起会话；输出字节预算 + 增量读；**与 merge.lock 兼容**（合并任务作为特殊 job，仍持锁串行）；dashboard 视图可选（受 D071 约束，需决策新增端点）。

**风险**：🟢 纯增量；中低。与 #7 文件锁配合（job 写状态文件走锁）。若本轮只做 P0，此项排 P2（run-lead 已定）。

---

### #10 continuable 子代理（durable descriptor + depth 围栏 + 冷恢复 + 父子权限边界）—— 【P1 C 蓝图 · 成本 L】

**DSH 实现**：`@deepseek-ai/dsh-subagent/lib/index.js`：
- 语义：one-shot（独立上下文，返回结果）vs **continuable**（背景运行，返回 durable subagent id，父可 `send_message` 继续同一子会话；`@dsh-tool-subagent/lib/index.js:26 backgroundMode`）。
- **depth 围栏**：`delegationDepthOf` @43 / `resolveChildDepth` @486 / `SubagentDepthError` @466（`maxDepth` 默认 3，tool-subagent Config @29）；session header 记录 `origin:"subagent"`、`parentSession`、`delegationDepth`（dsh-session header 校验 @1122-1123）。
- **durable descriptor**：`parseSubagentDescriptor` @382（版本化 @328，含 tool filter allow/deny @370），经 `subagent/descriptor` 事件溯源折叠 @449——子代理的能力边界持久可重放。
- **冷恢复**：`listChildren` @1678 / `listDescendants` @1695 从持久会话投影枚举子代理树（COLD_READ_CONCURRENCY=4 @1660）；`@dsh-api-remotes` `hasApiRemoteSubagentOwner` @55：子代理会话对普通 API 路由**所有权围栏**（`agent-busy`，必须走 subagent 通道）。
- **权限边界**：`SUBAGENT_DELEGATION_CONTEXT` @547（"you are a delegated subagent: your permission scope was fixed when you were started and cannot be widened…state the limitation in your reply"——当前会话的这段提示即来自此）；`captureDelegatedPolicyOverrides` @594（子继承父的策略覆盖，仅可收窄）。

**picode 现状**：`@picode/orchestrator` spawn 三个 Pi 会话（三角）+ continuation.ts 转录重投喂；**无**：子代理树/深度围栏、durable 子会话身份、父子权限继承、所有权路由围栏。**Pi 平台是否支持持久会话 cold-resume 未核实**（run-lead C 调研项）。

**移植候选设计（L，本轮只出蓝图）**：基于 ind-res 的 Pi 持久化可行性结论二选一：① 若 Pi 支持 → 会话 header 加 `parent_session/delegation_depth/origin` + 子会话管理（仿 durable descriptor 存 task 目录）；② 若不支持 → continuation.ts 增强（增量 steer 而非整体重投，衔接 #5）。两者共同：深度围栏（三角嵌套子任务 ≤N）、父子写集继承（子 ⊆ 父 write_paths，只收窄不放宽）、所有权围栏（子会话不被普通房间路由）。

**风险**：🔴/🟡 高风险面：Pi 能力未核实；触碰 17 会话模型与 continuation.ts；D002 文件真相 vs durable 会话投影——蓝图阶段必须给出"转录+摘要"与"事件溯源"的取舍论证（run-lead C2 验收）。

---

### #11 分层配置 patch 模型（bundle→profile→overlay，id 定位最后写胜）+ boot 守卫 —— 【配置层增强 · 成本 M】

**DSH 实现**：
- 插件行模型：`@deepseek-ai/dsh-base/cordis.patch.yml` — 每行 `{id, name, config, disabled}`（~60 行 = 每个 profile 的第一补丁层）；**补丁语义**：`applyEntryPatches`（`@deepseek-ai/dsh-app-boot/lib/index.js:57`）——按 `id` 定位行，整行替换 `config`（**不深合并**）、`name` 不匹配即跳过告警、`insert` 可进组、id 索引动态构建（后 patch 可打前 patch 插入的行）；**最后写胜 per row**。
- 分层序：空根 → bundle 层（`dsh.profile.bundles` 顺序，`loadProfile` @539）→ profile 用户层（`cordis.patch.yml`，HMR 热重载 `watchUserPatches` @760）→ launcher overlay（`--patch`/flag 派生）；`composeEntries` @575 同一 applyEntryPatches 单次调用（dump 与 boot 永不漂移）。
- **`!!js` YAML 表达式方言**：`@dsh-app-boot` JsExpr @15-21 + entryListSchema @28——配置值可写 `!!js process.env.X ?? default` / `!!js dshHomePath('sessions')`，Loader 激活时求值（base patch 大量使用，见 telemetry/sandbox/policy 行）。
- **boot 守卫**：`installFailLoud` @1042（未处理 rejection → 标签化 stderr + exit(1)，带 terminal release 超时）；`assertEntriesActivated` @1106（settled 后审计：failed 收原栈、pending 列缺失服务名）；`resolveConfigPath` @599（`$DSH_SNAPSHOT=replay` 时切 `cordis.snapshot.yml`）；`.env` 引导白名单 `BOOTSTRAP_NAMES`/`BOOTSTRAP_PREFIXES` @619/670（PATH/HOME/DSH_/XDG_/DYLD_… 只许继承环境设置，防 `.env` 劫持进程）。

**picode 现状**：`@picode/core` loadConfig（schema/默认/校验/加载分层）；**缺**：id 定位补丁语义（现在整文件覆盖或深合并）、`!!js` 表达式求值、boot 守卫（fail-loud/激活审计）、.env 引导白名单。

**移植候选设计（M，或拆 S 项）**：① loadConfig 支持**节段补丁**（`config.patch.d/<n>-<name>.yaml`，按 `id` 定位行最后写胜——picode 的 decision 覆盖/用户覆盖现靠整文件或深合并）；② `!!js` 式环境引用（用安全子集 `$ENV` 或受限求值，不开任意 JS）；③ boot 时 `assertEntriesActivated` 等价物（配置加载后校验所有注册的域/命令就位，缺服务 fail-loud 列名）；④ `.env` 引导白名单（防 run 目录 .env 覆盖 DSH_/PATH 类）。

**风险**：🟢 纯增量；中低。①需兼容现有 config.yaml 格式（向后兼容读）；②安全面：`!!js` 是任意代码执行，picode 移植须用受限表达式或禁默认（风险差异标注）。

---

### #12 会话投影注册表 + settings 文档热重载 —— 【观测/可配性 · 成本 S–M】

**DSH 实现**：
- `@deepseek-ai/dsh-session-projection/lib/index.js` — `SessionProjectionRegistry(ctx.sessionProjections)` @37；单元 = `{key, schema, init, apply, view, stateVersion}`（`register` @58，stateVersion 冲突拒绝 @69）；驱动方负责 eager apply 与惰性 cell；checkpoint 带 `ver`（stateVersion 不匹配即重折 @162）——**纯函数单元，framework 拥有缓存/一致性**。注册示例：dsh-goal（`lib/index.js:522`）、dsh-permission-presets（`lib/index.js:143`）、dsh-tool-todo。
- `@deepseek-ai/dsh-settings/lib/index.js` — `settingsNamespace` @87 + `installSettingsSection(ctx, ns, schema, entry, {validate, setSource, onChange})` @618：每插件声明自己的**用户可写节区**（schema 校验 + 热重载生效，如 agent-loop 的 `maxParallelToolCalls` @dsh-agent-loop:989）；`@deepseek-ai/dsh-settings-file/lib/index.js` — 文件后端 `settings.yaml` @69（chokidar watch，原子写，单操作链）。

**picode 现状**：dashboard 只读投影（9 端点派生）；decision-catalog 集中默认值；**缺**：投影单元注册表（现为手写派生逻辑）、设置节区化热重载（配置改需重启）。

**移植候选设计（S–M）**：① 新增 `SessionProjectionRegistry` 等价物（`@picode/bus` 或 `core`）：投影单元 `{key, apply(event)→state, view()}`，checkpoint 带版本号——dashboard 三视图（进度/房间/人员）从手写派生改为注册单元（D071 不新增端点）；② 配置节区化：`config.yaml` 支持按域覆盖文件（`config.d/`）热重载（衔接 #11 的补丁模型）。

**风险**：🟢 纯增量；低。①需守住 D071（不新增后端端点，投影在现有端点内派生）。

---

## 3. 冲突 vs 纯增量 总标注

| # | 机制 | 与 picode 现有设计的关系 | 冲突/叠加细节 |
|---|---|---|---|
| 1 | goal CAS/预算/激活 | 🟡 叠加（增量字段） | 与 D002 文件真相冲突面已由 run-lead 决策收敛：文件仍真相，revision 仅 CAS 围栏；guardian 续跑 vs goal resume 需 17 文档明界 |
| 2 | 沙箱 mode + 升级审批 | 🟡 双轨叠加 | 与写集纪律**双轨需定义**：write_paths=静态白名单（现有），sandbox mode=动态兜底围栏（新增），越界语义两层不混；审批 answerer 需 Q4 决策（默认 run-lead 代批） |
| 3 | skill 按需加载 | 🟢 纯增量 | 与 persona `skills[]` 声明双轨并存，不重复注入 |
| 4 | 事件日志机件 | 🔴 半冲突（只借机件） | "日志即真相"模型**不移植**（D002）；surface 投影/崩溃修复/打包/checkpoint 为纯机件，与文件真相互补 |
| 5 | inbox 三原语 | 🟡 触碰 17 会话模型 | 需 spec 修订 + 回归；与 continuation.ts 合并（防双续跑逻辑） |
| 6 | 自动续跑 driver | 🟢 纯增量 | guardian 内部增强；与 #5 同设计空间，同 chunk |
| 7 | 原子写/锁/读前编辑 | 🟢 纯增量 | 升级既有 writeAtomic（C2）；新增文件锁 + 版本守卫 |
| 8 | initiator 因果 scope | 🟢 纯增量 | 与 bus token 正交（归因 vs 授权）；跨进程不传递，需显式字段 |
| 9 | 后台 job | 🟢 纯增量 | 与 merge.lock 兼容（合并任务=持锁特殊 job） |
| 10 | continuable 子代理 | 🟡 高风险叠加 | 触碰 17 会话模型 + continuation.ts；Pi 持久化能力未核实（本轮只蓝图） |
| 11 | 分层补丁配置 | 🟢 纯增量 | 需向后兼容现有 config.yaml；`!!js` 须降级为受限表达式（安全面差异） |
| 12 | 投影注册表 + 设置热重载 | 🟢 纯增量 | 守 D071（不新增后端端点）；投影在现有端点内派生 |

---

## 4. 引用路径速查（供实现组直接使用）

> 格式：`包名` — `文件`（行号）`关键符号`（签名/要点）。基线 = host checkout `node_modules/@deepseek-ai/` 下 `lib/` 构建产物。

### P0 A（goal）
- `dsh-goal` — `lib/index.js`（285）`foldGoal(events)`；`decodeGoalChange`（117）；`validateSnapshotTransition`（176）；`applyGoalChange`（229）；`GoalService`（421）`create(agent,{objective,maxGoalRounds})`（566）/`edit`（588）/`pause`（606）/`resume`（616）/`complete`（635）/`block(agent,ref,{code,message})`（649）/`clear`（664）；`expectCurrent`（689，`GOAL_STALE_REVISION`）；`commit`（775，append `goal/change` 全量快照）；`applyGoalProjection`（376）；`Config.defaultMaxGoalRounds=256`（513）；`blockedReason` 校验（410）
- `dsh-goal-round-driver` — `lib/index.js`（55）`apply`；`renderGoalRoundPrompt(goal,round)`（11）；`drive`（103）；`validReservation`（276）；`restoreOtherClaimed`（95）

### P0 B（skill）
- `dsh-skill` — `lib/index.js`（17）`SKILL_NAME`；`isModelInvocable`（37）/`isUserInvocable`（45）；`SkillRegistry`（119）；`renderSkillContent`（57）
- `dsh-skill-filesystem` — `lib/index.js`（21-25）rank（project .dsh 100 / .agents 200 / custom 300 / user .dsh 400 / .agents 500）；`FileSystemSkillProvider`（63）
- `dsh-tool-skill` — `lib/index.js`（37）skill 工具；`Config.catalogDescriptionMaxLength`（27）

### P0 E（沙箱+审批）
- `dsh-sandbox` — `lib/index.js`（29）`WIDER_MODES`；`ESCALATION_TARGETS`（41）；`validateEscalationArgs`（50）；`sandboxDenialMarker`（63）；`escalationHintMarker`（75）；`approveEscalation`（92）；`writableRoots(policy)`（154）；`canonicalPath`（138）；`SandboxUnavailableError`/`SANDBOX_UNAVAILABLE`（182/176）
- `dsh-sandbox-policy` — `lib/index.js`（26）`SANDBOX_MODES`；`effectiveSandboxMode`（39）/`setSandboxMode`（54）；`SandboxPolicyService`（101）`resolve({session})`（138）
- `dsh-user-approval` — `lib/index.js`（36）`APPROVAL_POLICIES=["ask","never"]`；`effectiveApprovalPolicy`（49）；`hasOpenTurn`（62）；`setApprovalPolicy`（76）；`ApprovalService`（85）`request`（144，审计对 approval/asked+decided）/`decide`（185）
- `dsh-permission-presets` — `lib/index.js`（79）`PermissionPresetService`；`apply`（272）；`pinInitialPermission`（285）；`Config.presets` 默认（86-99）
- `dsh-fs-sandbox` — `lib/index.js`（107）`SandboxedFileSystem`；`checkedTarget`（157）
- `dsh-fs-observation-policy` — `lib/index.js`（16）`ObservedStateGate`；`writeIntent`（66）；`editIntent`（89，FS_NOT_OBSERVED）；`observe`（108）
- `dsh-fs-local` — `lib/index.js`（779）`writeText` expected 守卫（FS_STALE_VERSION 785 / FS_NOT_OBSERVED 786）；（798）`editText`（FS_STALE_VERSION 803）
- `dsh-tool-bash` — `lib/index.js`（54）`renderResult`；（125）`bashDescription`（escalation 词汇）；（238）`approveBashEscalation`；（386）`execute`（先授权后执行）

### P1 C（子代理蓝图）
- `dsh-subagent` — `lib/index.js`（43）`delegationDepthOf`；（328）`SUBAGENT_DESCRIPTOR_VERSION=2`；（370）`parseToolFilter`；（382）`parseSubagentDescriptor`；（449）`foldSubagentDescriptor`；（466）`SubagentDepthError`；（486）`resolveChildDepth`；（547）`SUBAGENT_DELEGATION_CONTEXT`；（594）`captureDelegatedPolicyOverrides`；（699）`ChildLock`；（723）`SubagentContinuationManager`；（1660）`COLD_READ_CONCURRENCY=4`；（1678）`listChildren`/（1695）`listDescendants`
- `dsh-tool-subagent` — `lib/index.js`（23）`provider`；（26）`backgroundMode`；（29）`maxDepth`；（139）工具注册
- `dsh-api-remotes` — `lib/index.js`（55）`hasApiRemoteSubagentOwner`；（67）`apiRemoteSubagentOwnershipError`；（101）`createApiRemoteAgentResolver`
- `dsh-session` — `lib/index.js`（1122-1123）header `origin/parentSession/delegationDepth` 校验

### 基础设施（#4/#5/#7/#8）
- `dsh-session` — `lib/index.js`（37）`SESSION_FORMAT_VERSION`；（1054）`KNOWN_SESSION_EVENT_TYPES`；（219）`SURFACE_EVENT_TYPES`；（237）`isSurfaceEvent`；（278）`deriveEventMessage`；（320）`assertProvenance`；（444）`foldSurface`；（457）`SurfaceManager`；（626）`interruptedTurnClosers`；（877）`packChunkRuns`；（1029）`decodeStorageRecord`
- `dsh-session-checkpoint-policy` — `lib/index.js`（34）`afterCheckpoint`；（56）apply（llm/stream、tools/execute、agent/pre-step 三处 flush，fail-closed）
- `dsh-agent-loop` — `lib/index.js`（335）`ReactLoopAgent`；（390）`send`/（396）`followup`/（399）`steer`/（402）`inject`/（405）`cancel`；（444）`wakeDriver`；（460）`whenIdle`；（516）`turn`；（606）`step`；（117）`executeToolCalls`；（162）`runGroup`；（747）`DEFAULT_MAX_PARALLEL_TOOL_CALLS=10`；（26）`RuntimeContextProjection`（动态上下文快照）
- `dsh-agent` — `lib/index.js`（12）`Inbox`（splice@117/claim@56）；（218）`foldConsumedWork`；（415）`AgentRegistry`；（460）`currentInitiator`/（472）`requireInitiator`/（490）`withInitiator`/（504）`withoutInitiator`；（519）`setFactory`；（601）`enter`；（660）`announce`
- `dsh-atomic-write` — `lib/index.js`（30）`writeFileAtomic(filename, content, {mode, dirMode})`；（72）`withFileLock(filename, operation)`

### 配置/观测（#11/#12）
- `dsh-base` — `cordis.patch.yml`（插件行模型：id/name/config/disabled；`!!js` 表达式行：telemetry/sandbox-policy/approval/permission 等）
- `dsh-app-boot` — `lib/index.js`（15）`JsExpr`；（57）`applyEntryPatches`；（539）`loadProfile`；（575）`composeEntries`；（599）`resolveConfigPath`；（619）`BOOTSTRAP_NAMES`/（670）`BOOTSTRAP_PREFIXES`；（725）`loadLayeredEnv`；（760）`watchUserPatches`；（1042）`installFailLoud`；（1106）`assertEntriesActivated`；（1166）`boot`
- `dsh-session-projection` — `lib/index.js`（37）`SessionProjectionRegistry`；（58）`register({key,schema,init,apply,view,stateVersion})`；（162）checkpoint ver 门闩
- `dsh-settings` — `lib/index.js`（87）`settingsNamespace`；（618）`installSettingsSection`；`dsh-settings-file`（69）`FileSettingsProvider`
- `dsh-agent-presets` — `lib/index.js`（101）`PRESET_ID`；（146）`COMPOSITION_FILE="agent.cordis.yml"`；（762）`resolveSessionPreset`；（804）`AgentPresets`；（954）`mount`；（988）`composeFrom`；（1104）`recompose`；（1130）`ensureStanding`

---

## 5. 建议分块草案（供 P02，非最终）

| Chunk | 内容 | 写集（owner） | 依赖 |
|---|---|---|---|
| C1 | #1 goal 跨轮（CAS/预算/激活/政策码）+ #7 文件锁 | packages/core、packages/orchestrator、docs/spec、docs/PROCESSES | 无（先行） |
| C2 | #2 沙箱 mode + 审批阶梯 + #7 读前编辑守卫 | packages/pi-extension、packages/orchestrator、docs | C1 的锁工具（withFileLock）可先行独立 |
| C3 | #3 skill_load 工具 | packages/pi-extension、packages/core（skills.ts）、skills/ | 无 |
| C4 | #6 自动续跑 driver + #5（S 变体：quiescence+attempt） | packages/orchestrator、docs/spec/17 | C1（goal 激活字段） |
| C5 | #4 机件（崩溃修复/checkpoint） | packages/bus、packages/orchestrator | 无 |
| C6 | #8 initiator scope、#9 jobs、#11 配置补丁、#12 投影注册表 | 各 owner 包 | C1（可选） |
| — | #10 子代理蓝图 | docs/plans | ind-res 调研 brief |

> 写集默认互斥；C2 与 C3 同涉 pi-extension → 共享文件须 owner_chunk 或拆分执行面/编排面。C1 与 C6 的 orchestrator 文件须按命令域划分写集。

---

## 修订

| 改什么 | 状态 |
|---|---|
| 初版（sys-arch 勘察） | 2026-08-15 |
| 与 run-lead 纪要优先级对齐（P0=A/B/E，P1=C，P2=F/G） | 本版 |
