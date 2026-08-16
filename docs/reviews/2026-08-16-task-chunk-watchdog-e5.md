# 审查记录 — task-chunk-watchdog（E5 审查门）

- task_id: task-chunk-watchdog（chunk-watchdog, W2, **高风险：orchestrator 自治循环核心**）
- run: run-2026-08-16T09-30-00-EFFICIENCY
- 工作房: `.picode/worktrees/squad-task-chunk-watchdog`
- HEAD: `05f3201`（实现完成，run-lead 代实现——队内 engineer/squad-lead 失联）
- 基线: `9f93100`（env-gate 合并后 main）
- diff: `git -C <工作房> diff 9f93100..HEAD`（9 文件，含新文件 session-watchdog.ts）
- 审查方式: 逐文件读（9 个 diff 文件全量）+ 关键依赖源码核验（bus RoomStore ACL / run-store 房间成员 / continuation.composeSteerPrompt / config 布局 / progress 类型）+ 验收逐条对照（chunks.yaml:96-102 权威）+ CHECKLIST 逐项
- Reviewed-by: code-review（门禁层，E5 审查门）
- 审查日期: 2026-08-16

## 0. 结论

**needs-work（需修改）** — 1 项 **P0 阻塞**（bus 投递被 ACL 恒拒 → 看门狗核心动作静默失效）+ 5 项 P1（平台席误计、转录 incoming 信号缺失、notify 失败不重试、drain 锁外截断丢命令、supervise 验收 3 未完成）+ 10 项 P2。打回意见见 §6。

## 1. 审查范围（write_paths 12 项，diff 9 文件）

diff 文件（用户声明 + 逐文件核实均 ⊆ chunks.yaml:77-89 写集）：

```
packages/orchestrator/src/session-watchdog.ts      （新，273 行）
packages/orchestrator/src/session-watchdog.test.ts （9 用例）
packages/orchestrator/src/self-drive.ts            （P1-3 + watchdog 接线）
packages/orchestrator/src/self-drive.test.ts       （P1-3 容错 +1）
packages/orchestrator/src/rules-engine.ts          （P1-2 消费语义）
packages/orchestrator/src/rules-engine.test.ts     （P1-2 适配）
packages/orchestrator/src/session-store.ts         （P1-7）
packages/orchestrator/src/session-store.test.ts    （P1-7 ×2）
scripts/supervise/lib.mjs                          （P1-5 REPO_ROOT 派生）
```

- **diff 门禁（R8/R9）**：bash/git 不可用（spawn ENOENT），无法独立跑 `git diff --name-only`；已逐文件核实 9 个 diff 文件全部落在写集内，无越写迹象。写集内 `supervise.mjs` / `feed.mjs` / `continuation.test.ts` 未出现在 diff（验收 3 部分未完成，见 P1-5）。
- **sdet evidence**：`progress/acceptance-matrix.md` 七项验收断言**全部 pending**（未勾选）；`progress.md` 显示 sdet 等待 engineer 交付后被 run-lead 代实现。**sdet 证据尚未产出，交接包（summary/artifact_index/known_issues/diff_scope/evidence/acceptance）亦未生成** —— 按流程 ④ 顺序（evidence → 审查门 → 交接 → 签收），本审查先行；结论不豁免 sdet evidence 与交接门槛（合并门前置，见 §6）。
- **回归复核**：run-lead 报告 orchestrator 402/402 + 6 包绿 + 三 lint 0。本审查 bash/glob/grep 全部故障无法复跑，做**计数一致性核验**：env-gate r2 时 orchestrator 390/390（基线 9f93100）→ 本 diff 新增用例 = session-watchdog 9 + session-store 2 + self-drive 1 + rules-engine 0（改既有用例）= 12 → **390+12=402，与报告一致**。不替代 sdet 验证，采信 run-lead 全绿 + 计数吻合。

## 2. CHECKLIST 逐项

- [x] 行为符合目标：watchdog 纯规则（2 轮 at_risk+steer / 4 轮 takeover+notify / error 前缀立即 at_risk / 恢复归零 / 终态跳过）与 M1 设计一致；但**验收 1/3 有缺口**（见 P1-2/P1-5）；边界错误路径覆盖不足（见 P1-1/P1-3/P2 各项）
- [ ] 输入校验在信任边界：**P0**（bus 投递身份未经任何成员校验预判，全量被 ACL 拒绝）；`../../..` 推导 repoRoot 脆弱（P2-8）
- [ ] 改动有测试守护：session-watchdog.test.ts 9 用例只覆盖 evaluateWatchdog 纯函数；**detectOutputSignal / runWatchdogCheck 零用例**（含 bus 投递、幂等去重、失败降级）；P1-3 错误分支零用例（P2-4）；无 .only/.skip
- [ ] 文档同步：本 chunk 无 docs 写集（operations.md 属 chunk-docs 只读引用）；known_issues 待交接包产出
- [x] 无密钥/secret 入库；diff ⊆ write_paths（§1）
- [x] 死代码：`detectOutputSignal` 的 `base` 参数恒为 null（调用方 L230 传 null），判定路径恒走 `HEAD~1`——参数是死参数（P3-1）
- [x] 重复：无（readJsonl / withFileLock / readYamlFile 复用既有 helper）
- [x] 过度设计：WatchdogState/OutputSignal/WatchdogVerdict 类型分层合理；`base` 参数属 speculative generality（P3-1）
- [x] 度量：9 文件，约 +550/-30（session-watchdog.ts 273 + 测试约 150 + 既有文件增量）；对照 ponytail 基准无显著超线

## 3. 验收对照（chunks.yaml:96-102 → 实现核验）

| acceptance | 实现 | 核验 |
|---|---|---|
| ① M1：按 agent_id 追踪产出信号（git 提交 / 工作房文件 mtime / **转录 incoming**），2 轮 at_risk（composeSteerPrompt 投 steer，I1 档），再 2 轮 bus 通知 run-lead + takeover_candidate；零 LLM；幂等；终态跳过 | `evaluateWatchdog` 纯规则 ✓；`detectOutputSignal` 仅 git+mtime，**无转录 incoming**；steer/notify 动作经 `bus.post("leadership","watchdog",…)` 被 ACL **恒拒**（P0） | **不通过**：P0（动作失效）+ P1-1（平台席误计）+ P1-2（转录信号缺失）+ P1-3（notify 不重试） |
| ② M3：guardianTick 集成 watchdog（复用既有节奏）；probeServeHealth 复活扩展不破坏 | guardianTickInner L766 接线 runWatchdogCheck ✓；probeServeHealth 既有 P1 恢复语义未破坏（既有测试全绿回归） | ✓ 接线成立；probeServeHealth 扩展属既有代码，本 diff 未触碰（基线已含 ERR-01 恢复） |
| ③ supervise 陈旧路径修复 + 接线 watchdog | lib.mjs REPO_ROOT 用 `git rev-parse --git-common-dir` 推导 ✓（主仓/工作房内均正确，P1-5 验收主体达标）；**supervise.mjs:82 旧布局残留 + 无 watchdog 接线**；feed.mjs 无旧路径 | **部分不通过**：P1-5 |
| ④ 测试：watchdog 计数/升级/幂等/终态/steer 触发；self-drive 复活 + 错误边界（**tick 内抛错不退出、错误落盘退避续跑**）；continuation 增量 | watchdog 9 用例 ✓（纯函数）；self-drive P1-3 用例**仅容错路径**（缺 goal 不炸），**未注入抛错** | **部分不通过**：P2-4 |
| ⑤ 修复波：P1-2 至多执行一次；P1-7 重置/衰减 + 重注册；P1-5 派生 | P1-2 截断实现但锁外截断（P1-4）；P1-7 register/wake 实现 ✓ 测试 ✓；P1-5 lib.mjs ✓ | **部分不通过**：P1-4 |
| ⑥ 全量 npm test 绿 + npm run check 三 lint 0 | run-lead 报告 402/402 + 6 包绿 + lint 0（计数核验一致，未能独立复跑） | 采信（待 sdet evidence 正式确认） |

## 4. 审查重点逐项结论（对照任务书 6 项）

1. **watchdog 判定逻辑**：`silent_rounds` 计数与升级（2→steer、4→notify）、error 前缀 `startsWith`（非 includes，符合 env-gate 契约 `TOOL_ENV_BROKEN: <msg>` 前缀）✓、恢复归零 ✓、at_risk 后不重复 steer ✓、幂等（last_action 去重）基本成立。**但**：bus 投递恒被 ACL 拒绝（P0）；notify 失败不重试（P1-3）；error 持久会话 silent_rounds 冻结于 2 永不升级接管（P2-3）；平台席/非活跃会话误计（P1-1、P2-2）。
2. **detectOutputSignal**：`execFileSync("git", ["-C", wt, ...])` 参数数组无 shell 注入 ✓；mtime 兜底合理但有两个边界误判（首提交工作房 P2-1；全树遍历性能 P2-6）；**平台席跳过语义未实现**——注释自称"只跟踪 task 会话"，实际返回 `has_output:false` 进入计数（P1-1）。
3. **P1-2 截断并发**：enqueue（appendSessionCommand）与 drain 同锁 `.session_commands.lock` ✓，但 drain 的**读在锁外（L275）、截断在锁外（L329）** → 两条命令丢失窗口（P1-4）；处理异常（LOCK_TIMEOUT 等）时截断跳过 → 下轮重放，违反"至多执行一次"（P3）。
4. **P1-3 错误边界**：guardianTick 顶层 try/catch 返回对象与 GuardianTickResult 字段一致（`satisfies` 编译期校验；progress/checkpoints/events 形状逐一核对 ✓）；错误落盘路径 `dir/guardian-errors.log` 安全 ✓；runGuardian 保底 catch 形状一致但**未落盘日志**（P3-3）；**无显式退避**（沿用 intervalMs，"退避续跑"字面未达，P2-4）。
5. **P1-7 语义**：24h 窗口常量正确（>24h → turns 从 1 重计，continuations 不重置）；terminated 重注册放行且 budget 归零，**不破坏既有契约**——既有测试 "duplicate register throws SESSION_ALREADY_REGISTERED"（非 terminated 重复注册仍拒绝）语义保留 ✓；watchdog 状态不随重注册重置（P3）。
6. **回归**：见 §1（计数一致，未能独立复跑）。

## 5. 问题清单

### P0（阻塞）

**P0-1 看门狗全部 alert/notify 被 bus ACL 恒拒 → 核心机制静默失效**
- 位置：session-watchdog.ts:250/:262（`bus.post("leadership", "watchdog", {type:"alert"})`）+ run-store.ts:170-178（leadership 成员表）
- 事实链：
  1. `RoomStore.post`（room-store.ts:245-259）先查 `canPost`：`loadMembers("leadership").find(x.id === "watchdog")` → 成员表 = [run-lead, sponsor(chat only), sess-mgr, tpm, proc-audit(drift/alert), pm(read), ind-res]，**无 "watchdog"** → `ROOM_POST_DENIED` 抛错。
  2. runWatchdogCheck 两处 catch（L254-257 steer / L266-268 notify）**静默吞错**——steer 分支仅重复 push at_risk，notify 分支空 catch。
  3. 结论：每一次 2 轮/4 轮升级动作都以抛错收场，**run-lead 永远收不到任何看门狗告警**；watchdog.yaml 状态照常落盘（silent_rounds/at_risk/takeover_candidate 正常推进），机制表现为"有状态、无动作"。
  4. 写集约束：run-store.ts 不在本 chunk 写集 → 修复需变更单授权（选项见 §6）。
- 影响面：本 task 的核心产物（自动 at_risk 催办 + 接管通知）在全部真实 run 上不可达——M1 目标整体落空。

### P1（需修改）

**P1-1 平台席/非 @task- 会话被计入 silent_rounds 并升级 at_risk/takeover（与注释"只跟踪 task 会话"矛盾）**
- 位置：session-watchdog.ts:155-158（平台席 `has_output:false`）+ evaluateWatchdog L126-135
- `detectOutputSignal` 对无 `@task-` 的会话（run-lead/pm/sess-mgr/docs-lead 等全部平台席 + 子代理）返回 `has_output:false`，注释（L157）声称"看门狗只跟踪 task 会话"，但 `runWatchdogCheck`（L228-235）对**所有** `store.list()` 会话计 silent_rounds → 2 tick 后每席一条 steer、4 tick 后每席一条 takeover 通知。`sess_mgr.always_register: true`（config.ts:338 默认）→ 真实 run 起手即注册 17 平台席。
- 后果（修复 P0 后即显性）：run 启动 4 个 tick 内领导房收到约 34 条误报（含"建议接管 run-lead 自己"）；且平台席永远无法产出（信号源只有工作房）→ 永久 at_risk 滞留。
- 修复方向：非 task 会话应"跳过"而非"无产出"（如 evaluateWatchdog 对无 task 绑定 agent 直接返回 none，或 detectOutputSignal 返回不参与计数的信号）。

**P1-2 转录 incoming 信号未实现（验收 1 明文三信号之一）**
- 位置：session-watchdog.ts:149-201（仅 git rev-list + mtime 两种信号）
- 验收原文（chunks.yaml:97）："按 agent_id 追踪最近产出信号（git 提交 / 工作房文件 mtime / 转录 incoming）"。实现缺转录信号，且这是**唯一按 agent_id 归因**的信号：git/mtime 都是工作房级（triad 共享 `squad-<taskId>` 房），任何一席提交/写文件会同时"洗白"其余两席的 silent 计数——与"按 agent_id 追踪"语义不符（squad-lead 全程不干活只要 engineer 提交就永不触发）。转录 `transcripts/<agent>.jsonl` 为逐 agent 信号源，缺失导致 per-agent 判定无法成立。

**P1-3 notify_takeover 投递失败后永不再重试（与 steer 分支不对称）**
- 位置：session-watchdog.ts:236（states.set 先于动作）+ L258-268（notify catch 空）+ L271（落盘）
- `takeover_candidate=true` 在 bus 投递**之前**已写入 state 并落盘；投递失败后下一 tick `evaluateWatchdog` 因 `takeover_candidate` 已真不再产出 notify（L127 `!next.takeover_candidate` 条件不满足），`runWatchdogCheck` L259 `if (prev?.takeover_candidate) continue` 直接跳过 → **该通知永久丢失**。steer 分支的失败语义是"last_action 未置 → 下轮重试"（L246 dedup 条件不成立），notify 分支无对应机制；空 catch 注释"同上"误导。

**P1-4 P1-2 截断/读取在锁外 → 命令丢失窗口（"至多执行一次"退化为"可能零次"）**
- 位置：rules-engine.ts:275（读在锁外）+ L277-322（处理在锁内）+ L329（截断在锁外）
- 时序：drain 先 `readJsonl` 快照 → 获锁处理 → 释放锁 → `fs.writeFileSync(file, "")` 截断。两条丢失窗口：(a) 读快照之后、获锁之前 enqueue 的命令；(b) 锁释放之后、截断之前 enqueue 的命令——均被截断清掉且从未执行。enqueue 与 drain 虽同锁，但读/截断不在锁内，互斥不完整。
- 修复：读 + 处理 + 截断整体移入同一把锁（appendSessionCommand 同锁天然串行）。

**P1-5 supervise 验收 3 未完成：supervise.mjs:82 旧布局残留 + 未接线 watchdog**
- 位置：scripts/supervise/supervise.mjs:82（`${REPO}/.picode/worktrees/${RUN_ID}`——env-gate E5 r2-2 残留清单 item 3，WORK_BRIEF §5.3 明文本 chunk 应修）+ 全文件无 watchdog 调用
- lib.mjs 的 REPO_ROOT 派生修复正确（`--git-common-dir` 主仓/工作房内均准确，`path.posix.resolve(common, "..")` 语义正确；非 git 环境回退 import.meta.url 上溯 ✓），但验收 3 的完整范围（supervise.mjs/feed.mjs 路径 + 接线）只完成 1/3：supervise.mjs:16 RUN_DIR 经 REPO 间接修复，**:82 仍按旧布局 `<runId>` 找工作房**（真实布局为顶层 `squad-<taskId>`，find 恒空 → worktrees 计数恒 0），且 `supervise 接线 watchdog` 一项完全未做（supervise.mjs 仍只是 token 轮询循环）。
- 写集内可修（supervise.mjs/feed.mjs 均在写集），属验收未完成，非越界。

### P2（非阻塞建议）

- **P2-1** 首提交工作房误判：`git rev-list --count HEAD~1..HEAD` 在单提交工作房抛错（HEAD~1 不存在）→ mtime 兜底中 `.git` 的 mtime ≥ 全部文件 mtime（文件先于提交写入）→ 判"无产出" → 首个提交后静默 2 tick 即 at_risk（假阳性）。session-watchdog.ts:166-177/:194-200。
- **P2-2** 排队/未开工任务会话被误标：任务会话注册后尚未被 task_ready 唤醒（等 max_awake/审批）期间，工作房不存在或为空 → `has_output:false` → 2 tick 即 at_risk。看门狗未以"会话活跃（awake/任务已开工）"为前提，健康 run 的排队期也会触发。session-watchdog.ts:161-164 + L126-135。
- **P2-3** error 前缀持久会话无接管升级：`Math.max(silent_rounds, 2)` 冻结计数（L110），后续 error tick 不再递增 → 阈值 4 永不可达 → TOOL_ENV_BROKEN/WORKTREE_MISSING 会话只有首次 steer 一条通知，永不 escalate 接管。与"跳过 2 轮等待"（只跳过到 at_risk 的等待）的语义衔接需 run-lead 定稿（若"再 2 轮 → takeover"应让计数继续递增）。
- **P2-4** P1-3 错误分支零测试 + 无显式退避：self-drive.test.ts "P1-3" 用例仅覆盖容错路径（缺 goal 文件不炸，readGoal 本身容错），**未注入 tick 内抛错**（坏 yaml / LOCK_TIMEOUT / sleepAgent 失败），error 字段/guardian-errors.log 落盘/循环不退出均无断言——验收 4 明文要求注入抛错用例；runGuardian 错误后沿用 intervalMs，无额外退避（"退避续跑"字面未达）。
- **P2-5** detectOutputSignal/runWatchdogCheck 零测试覆盖：验收 1"信号源可注入（便于单测）"未落实——header 注释自称"依赖注入友好"，但无 detector 注入点，且 runWatchdogCheck 的幂等去重/失败降级/状态落盘全部无用例（P0-1 正是因此漏网）。
- **P2-6** mtime 全树遍历性能：每 tick 对每个 task 会话递归遍历整个工作房（仅排除 .git/node_modules/dist），同 task 三席重复遍历同一工作房；大仓库下每 60s tick 开销显著，无缓存/上限。
- **P2-7** watchdog.yaml 终态条目不清理：terminated 会话的状态永久留存（evaluateWatchdog terminal 分支返回原 state，runWatchdogCheck 照常 set+落盘）→ 状态文件随 run 增长；且 P1-7 重注册后 watchdog 状态不随新会话重置（重注册 agent 从旧 silent_rounds 续计）。
- **P2-8** 通知 payload 未结构化携带 agent_id + takeover_candidate：验收 1"bus 通知 payload 含 agent_id + takeover_candidate"——实现消息无 meta 字段，body 文本含 agent_id 但无 "takeover_candidate" 字样/结构化字段，消费方无法机器读取。
- **P2-9** `../../..` 推导 repoRoot 脆弱：session-watchdog 调用点 self-drive.ts:766 `path.resolve(dir, "../../..")` 硬编码三层布局（.picode/runs/<id>），runs_root 可配置（config.ts:360）时推导错误 → 全部会话判"工作房不存在"。建议经 config/paths 或调用方传 repoRoot。
- **P2-10** bus 失败 catch 重复 push：session-watchdog.ts:256 catch 内 `result.at_risk.push` 无 includes 守卫（L240 已 push）→ WatchdogRunResult.at_risk 重复条目。

### P3（次要）

- **P3-1** detectOutputSignal 的 `base` 参数恒为 null（L230 实参），死参数（speculative generality）；"HEAD~1" 语义使 `base` 未来接线上有语义风险（`HEAD~1..HEAD` 只测最近一步）。
- **P3-2** watchdog 状态 RMW 无锁（loadWatchdogStates → mutate → saveWatchdogStates 无 withFileLock；单进程顺序 tick 下安全，与 store 层约定不一致）。
- **P3-3** runGuardian 保底 catch（self-drive.ts:852-875）不写 guardian-errors.log（仅返回 error 字段；guardianTick 内层已捕获，正常不可达）。
- **P3-4** watchdog.yaml 损坏（readYamlFile 抛错，yaml-io.ts:21）→ runWatchdogCheck 抛错 → 整轮 watchdog 失效（guardian 顶层 catch 兜住 fail-visible，但无自愈/重建路径）。
- **P3-5** 验收 3 字面 grep 项"旧路径 0 命中"：lib.mjs:11 注释含 `/Users/x/Desktop/iOS/picode` 与 `/tmp/picode-dogfood` 字样（解释性注释）→ 字面 grep 会命中；建议验收口径改为"代码路径无旧路径"或注释用占位符。
- **P3-6** 处理异常（如 withFileLock LOCK_TIMEOUT）时截断跳过 → 下轮重放同批命令，破坏"至多执行一次"（防丢与防重二选一的既有限制，建议注释留痕）。

## 6. 结论与打回意见

**结论：needs-work（打回）** — Reviewed-by: code-review（门禁层，E5 审查门）。

放行前置条件：

1. **P0-1 裁决（阻塞）**：看门狗告警必须真实可达 run-lead。建议 run-lead 以变更单授权其一：(a) run-store.ts leadership 成员表追加 `watchdog`（post + alert）；或 (b) 改投递身份为既有成员（如 sess-mgr）并在消息 meta 标注机械来源（对齐 postSettledSubagentNotices 的来源标注纪律）；或 (c) 复用 compressWindow 直写模式但须走房间锁。**修复后必须补 bus 投递用例**（runWatchdogCheck 集成测试，断言 alert 落 bus 文件）。
2. **P1-1**：平台席/非 task 会话不得进入计数升级（实现"只跟踪 task 会话"注释承诺的语义）。
3. **P1-2**：补转录 incoming 信号（per-agent 归因）或 run-lead 正式收窄验收（书面裁决：信号仅工作房级）。
4. **P1-3**：notify 失败重试语义与 steer 对齐（失败不置 takeover_candidate 阻断、下轮重试，或显式台账）。
5. **P1-4**：drain 读+处理+截断整体入锁。
6. **P1-5**：supervise.mjs:82 按顶层 `squad-*` 布局修复 + 完成 watchdog 接线（或在交接材料中显式声明验收 3 部分放弃并获 run-lead 批准）。

P2/P3 不阻断，建议随修改或后续轮次处理（P2-1 一行 mtime 判定调整 + P2-4 错误分支测试为最低要求）。

**合并门附加前置（不豁免）**：sdet evidence（acceptance-matrix 七项）与交接包（summary/artifact_index/known_issues/diff_scope/evidence/acceptance）尚未产出；回归 402/402 仅 run-lead 报告 + 计数核验一致，未独立复跑（本审查 bash/glob/grep 故障）。按流程 ④ 顺序，sdet evidence pass + 审查门通过 + 交接齐全后方可进入合并门（P10/R9）。

---

## R2 复审（第二轮，2026-08-16）

- 审查对象：`.picode/worktrees/squad-task-chunk-watchdog` HEAD=`35d10aa`；增量 `05f3201..HEAD`（4 文件：session-watchdog.ts / session-watchdog.test.ts / rules-engine.ts / supervise.mjs）
- 审查方式：bash/git/glob/grep 全部不可用（spawn ENOENT / ripgrep launch failed，与 r1 同）——逐文件全量读 + 依赖源码核验：run-store.ts 成员表（leadership L170-178）、room-store.ts post ACL（BUS_MESSAGE_TYPES L37 含 `alert` + canPost L233-238 + bus 文件 L110-113）、transcript-store.ts 转录布局（`runs/<id>/transcripts/<agent>.jsonl`，L42-48）、session-store.ts register/setError/list 签名、config.ts 路径默认（runs_root=`.picode/runs` L360 / worktree_root=`.picode/worktrees` L367）、continuation.ts composeSteerPrompt(summary,guidance) 签名（L87）
- 回归：orchestrator 404/404 = r1 的 402 + 新增 2 集成用例，计数吻合；本审查工具链故障无法独立复跑，采信 run-lead 报告（仍待 sdet evidence 正式确认）
- Reviewed-by: code-review（门禁层，E5 审查门 r2）

### 修复核对逐项

| # | 修复项 | 结论 | 核验 |
|---|---|---|---|
| 1 | **P0-1** 投递身份 watchdog→sess-mgr + 集成测试 | **PASS** | session-watchdog.ts:275/:287 两处 post 均改投 `sess-mgr`；run-store.ts:173 成员表 `{id:"sess-mgr",access:"post"}`（无 post_types_allow 限制）→ room-store.ts canPost 放行、`alert` 在类型目录；不再被 ACL 恒拒。集成测试 1（session-watchdog.test.ts:104-122）＝真实 RoomStore + saveMembers + TOOL_ENV_BROKEN 会话 → 断言 leadership.jsonl 末行 `from=sess-mgr`/`room=leadership`/`type=alert`/body 含"看门狗"；测试所用 register/setError/saveMembers/bus 文件路径与源码签名逐一核对成立 |
| 2 | **P1-1** runWatchdogCheck 跳过非 @task- 会话 + 平台席防御返回 | **PASS** | session-watchdog.ts:251 `!/@task-/.test(agent_id) → continue`（平台席不进计数升级）；detectOutputSignal L155-159 平台席返回 `has_output:true`（防御双保险）。集成测试 2（test L124-131）注册 pm → 断言结果四字段全空 |
| 3 | **P1-2** 转录 incoming 信号 | **FAIL**（新 P1） | 见 **P1-A** |
| 4 | **P1-3** 投递成功后才置 takeover_candidate | **FAIL**（新 P1） | 见 **P1-B** |
| 5 | **P1-4** drain 截断移入 withFileLock 内 | **部分**（P1 残留） | 截断已入锁（rules-engine.ts:321-327）✓；**读快照仍在锁外**（L275）→ 见 **P1-C** |
| 6 | **P1-5** supervise 旧布局 worktrees/${RUN_ID} → squad-* 计数 | **PASS** | supervise.mjs:81-91：读 `${REPO}/.picode/worktrees` 过滤 `squad-` 前缀逐房计 `*.ts` 文件数；旧 `worktrees/${RUN_ID}` 布局残留已清除。注：E5 §6.6「接线 watchdog」本轮任务单未含、仍未落实，需在交接材料声明放弃或后续补做（不阻塞本项） |
| 7 | 新增集成测试 2 个 | **PASS**（缺口见 P2-C） | 2 个集成用例在（P0-1 投递 / P1-1 平台席）；404 = 402 + 2 计数吻合 |

### r2 新问题

**P1-A（P1-2 修复无效：转录信号是死代码 + 增量判定是死三元）** — session-watchdog.ts:170-178
- 路径错：`runDir = path.resolve(repoRoot, config.paths.runs_root)` 是 **runs 根**；`transcriptDir = path.join(runDir, path.basename(path.dirname(wt)), "transcripts")` 中 `basename(dirname(wt))` 恒为 `"worktrees"` → 实际查找 `<repoRoot>/.picode/runs/worktrees/transcripts`。真实转录在 `runs/<runId>/transcripts/<agent>.jsonl`（transcript-store.ts:42-48；self-drive.ts:244 refs 同口径）。该目录永不存在 → `fs.existsSync` 恒假 → **转录信号永不触发，整段死代码**。
- 判定错：L178 `newestT > (base === null ? 0 : 0)` 两分支恒 0（死三元），且调用点 `base` 恒传 null（L253）——即便路径修对，语义也是「文件存在即有产出」而非「mtime 增量」：某 agent 一旦有转录文件即被永久视为有产出（false-negative，看门狗永不触发其升级）。
- 修复方向：把 run dir（runWatchdogCheck 已有 `dir` 参数）传入 detectOutputSignal，取 `<runDir>/transcripts/`，以跨 tick 基线做 mtime 增量；补转录增量用例。

**P1-B（P1-3 修复无效：takeover_candidate 仍先于投递置位，失败不重试）** — session-watchdog.ts:258-259 + :287-296
- evaluateWatchdog 在 verdict 状态内已置 `takeover_candidate=true`（L127-129）；runWatchdogCheck L258-259 在投递**之前**即 `states.set(s.agent_id, next)`；bus.post 失败时 catch（L294-296）**为空**，不回滚 `next.takeover_candidate` → saveWatchdogStates（L299）照常落盘 true。下一 tick evaluateWatchdog 因 `prev.takeover_candidate=true`（L127 `!next.takeover_candidate` 不满足）不再产出 notify → **通知仍永久丢失**。L288-289/L295 注释声称的语义与代码行为不符（注释"失败则下轮重试"未实现）。
- 修复方向：catch 内 `next.takeover_candidate = false;`（L284 `prev?.takeover_candidate` 守卫已保证成功后不重发）；补「投递失败 → 下轮重试成功」用例。

**P1-C（P1-4 半修：读快照仍在锁外，丢失窗口 (a) 残留）** — rules-engine.ts:275
- 截断已移入锁内（L321-327）✓ 关闭 r1 P1-4 窗口 (b)；但 `const lines = readJsonl(file)`（L275）仍在锁外——「读快照之后、获锁之前 enqueue 的命令」会被锁内截断清掉且从未执行（r1 P1-4 明文窗口 (a) 原样保留）。打回意见「读+处理+截断整体入锁」只完成 2/3。修复：读移入同一把 withFileLock。

### r2 P2（不阻塞）

- **P2-A**：投递 payload 无 `meta` 机械来源标注——E5 §6.1 打回意见 option (b) 原文要求「meta 标注机械来源（对齐 postSettledSubagentNotices 的来源标注纪律，self-drive.ts:248-254 meta.source/derived_from 先例）」；现 post（L275/:287）为 `{type:"alert",body,refs:[]}` 零 meta；r1 P2-8（结构化 agent_id/takeover_candidate）亦未解决。建议 `meta:{source:"watchdog", agent_id, takeover_candidate}`。
- **P2-B**：r1 P2-10 仍在——steer 失败 catch L281 `result.at_risk.push` 无 includes 守卫（L263 已 push）→ 失败路径重复条目。
- **P2-C**：P0-1 集成测试仅覆盖 steer 路径；notify 投递、P1-3 失败重试、P1-2 转录增量均无用例（P1-A/P1-B 正是因此漏网）；r1 P2-4 错误分支注入用例仍缺（本轮任务单未列）。
- **P2-D**：supervise.mjs:88 `execSync` find 路径未引号包裹（REPO 含空格即断），既有风格延续，非本轮引入。

### r2 结论

**needs-work（需修改）** — P0 已清零（P0-1 修复成立且有集成测试守护，leadership 成员表/ACL/类型目录三方核验通过）；**但 P1-2 修复无效（死代码）、P1-3 重试语义未实现、P1-4 只修一半**，3 项未达放行标准。

放行前置：
1. **P1-A**：转录信号接入真实 run 目录 + 真实 mtime 增量基线（或 run-lead 书面收窄验收 1 的信号口径）；补用例
2. **P1-B**：notify 投递失败回滚 takeover_candidate；补失败→重试成功用例
3. **P1-C**：drain 读移入与截断同一把锁
4. **P2-A** 建议随修改补 meta 来源标注（打回意见 option (b) 字面要求）；supervise 接线 watchdog 或交接材料显式声明放弃（E5 §6.6）

Reviewed-by: code-review（门禁层，E5 审查门 r2）

---

## R3 复审（第三轮，2026-08-16）

- 审查对象：工作房 `.picode/worktrees/squad-task-chunk-watchdog` HEAD=`39c0d9d`；增量 `35d10aa..HEAD`（3 文件：session-watchdog.ts / session-watchdog.test.ts / rules-engine.ts）
- 审查方式：bash/git/glob/grep 全部不可用（spawn ENOENT / ripgrep launch failed，同 r1/r2）——逐文件全量读 + git 日志核验（`.git/worktrees/squad-task-chunk-watchdog/logs/HEAD`：39c0d9d 提交信息 =「P1-A 转录路径接真实 run 目录、P1-B takeover 判定/执行分离（投递成功才置位）、P1-C 读快照入锁」）+ 真实布局核验（transcript-store.ts:42-48 / self-drive.ts:244 refs / self-drive.test.ts:215 同口径 `<runDir>/transcripts/<agentId>.jsonl`）+ chunks.yaml:77-89 写集对照 + runWatchdogCheck 接线核验（self-drive.ts:766）
- 回归：orchestrator **404/404 计数核验一致**——r2=404（402 + 2 集成用例）；r3 无新增/删除用例（session-watchdog.test.ts 仍 11 用例：9 纯规则 + 2 集成；rules-engine.test.ts 不在 diff）→ 与 run-lead 报告吻合。本审查工具链故障无法独立复跑，采信 run-lead 报告（仍待 sdet evidence 正式确认，合并门前置不变）。
- Reviewed-by: code-review（门禁层，E5 审查门 r3）

### 修复核对逐项

| # | 修复项 | 结论 | 核验 |
|---|---|---|---|
| 1 | **P1-A** 转录路径接真实 run 目录 | **PASS** | `detectOutputSignal` 签名新增 `runDir?: string`（session-watchdog.ts:150-156，第 5 参）；L175 `transcriptDir = path.join(runDir, "transcripts")` 与 transcript-store.ts:43 `path.join(this.runDir, "transcripts")` 完全一致；agent 专属文件名为 `<agentId>.jsonl`（transcript-store.ts:47；self-drive.ts:244 refs 同口径）→ L178 按 agentId 过滤成立；runWatchdogCheck L258 传 `dir`（= guardianTick 的 run 目录，与 watchdog.yaml/session_commands/transcripts 同源，self-drive.ts:766 接线核验通过）。r2 的错路径（`runs/worktrees/transcripts`）与死三元（`newestT > (base===null?0:0)`）均已清除。信号语义 =「agent 专属文件存在即产出」（L182-184 `newestT > 0`）——mtime 基线收窄已由 run-lead 接受（验收语义：per-agent 归因信号存在），本审查按此口径确认。 |
| 2 | **P1-B** takeover 判定/执行分离 | **PASS（执行层引入 1 项新 P1，见 P1-D）** | evaluateWatchdog 4 轮分支（L127-131）只递增 silent_rounds、**不再置 takeover_candidate**（动作判定与状态更新分离，注释 L128-129 留痕）✓；执行层 notify（L288-302）：L292 `bus.post` → **成功后**（L295）才置 `takeover_candidate=true` + last_action ✓；catch（L299-301）不置位 → 下轮 prev.takeover_candidate=false 且 silent_rounds≥4 重新产出 notify → **失败可重试语义成立** ✓；幂等：成功后下轮 evaluateWatchdog L127 条件不满足 → 动作 none，不重发（L289 为防御冗余）✓；状态落盘时序：L263-264 `states.set` 与 L295 变更同引用对象，L304 `saveWatchdogStates` 在循环后统一持久化，成功/失败两种结局均正确落盘 ✓；测试断言同步：session-watchdog.test.ts:60-64 断言 notify 分支 `takeover_candidate === false`（原 r2 断言 true）✓ |
| 3 | **P1-C** drain 读入锁 | **PASS** | rules-engine.ts:275 withFileLock 回调内：L278 `readJsonl`（**读已移入锁内**）+ L281-321 处理 + L324-328 截断，同一把 `.session_commands.lock`（appendSessionCommand L256 同锁串行）→ r1 P1-4 窗口 (a)（读后/获锁前入队被截断清掉）与 (b)（锁释放后/截断前入队）**均关闭**；注释 L276-277 明文留痕「读快照也必须在锁内」。r2 打回意见「读+处理+截断整体入锁」3/3 完成。 |

### 新问题

**P1-D（新，r3）`result.takeover_candidates` 永为空——P1-B 分离把结果镜像留在旧时序** — session-watchdog.ts:269-270 + :295
- 事实链：L269-270 的推送检查在动作分发（L272）**之前**执行；notify 分支在 L295（post 成功）才置 `next.takeover_candidate=true`，此时 L269 已过 → 该轮不推送。此后每轮 verdict 因 prev.takeover_candidate=true 恒为 `none`（L127 条件不满足、L132 因 at_risk 已真也不进）→ L266 `continue` → 字段再无任何写入路径；steer 轮（2-3 轮）takeover_candidate 恒 false → 也不推送。**结论：`WatchdogRunResult.takeover_candidates` 在 r3 实现下任何路径都不会非空**——r2 时 evaluateWatchdog 在 verdict 状态内置位、推送检查可命中；r3 分离后该字段回归为死字段（契约字段静默说谎）。
- 影响面：`GuardianTickResult.watchdog`（self-drive.ts:786）的接管候选观测通道恒空。bus 通知（leadership.jsonl）+ watchdog.yaml 的 takeover_candidate 标记仍正常工作（机制未失效，故非 P0）；但结果契约字段静默失效，且**零用例守护**（self-drive.test.ts 1018 行无任何 watchdog 结果断言；r2 P2-C 点名的 notify 路径零覆盖正是此类缺陷漏网原因）。
- 修复方向（单行级）：notify 成功分支 L298 后追加 `result.takeover_candidates.push(s.agent_id)` 并移除 L269-270 的 takeover 检查（at_risk 检查保留）；或把结果推送整体移到动作分发之后基于最终 `next`。建议顺带补 1 条 notify 集成用例（断言 `notified`/`takeover_candidates`/watchdog.yaml 落盘三合一），同时收敛 r2 P2-C。

### 延续 P2（不阻塞，维持）

- **P2-A**：两处 post（L280/L292）仍零 `meta` 来源标注（r1 P2-8 / r2 P2-A 延续）。
- **P2-B**：steer 失败 catch L286 `result.at_risk.push` 无 includes 守卫（L268 已推）→ 失败路径重复条目（r1 P2-10 / r2 P2-B 延续）。
- **P2-C**：notify 投递、失败→重试、转录增量仍零用例（P1-D 的直接后果；r2 打回意见「补用例」本轮任务单未列，仍建议补）。
- **P2-E（新）**：session-watchdog.ts:178 用 `n.includes(agentId)` 子串匹配转录文件名——对前缀型 taskId（如 `task-1` vs `task-12`）存在跨 agent 误归因（`engineer@task-1` 会命中 `engineer@task-12.jsonl`），建议改精确匹配 `n === \`${agentId}.jsonl\``（文件命名即精确 `<agentId>.jsonl`，见 transcript-store.ts:47）。
- **P2-D**：supervise.mjs:88 `execSync find` 路径未引号包裹（r2 延续，非本轮引入）。
- supervise 接线 watchdog：仍未落实（r2 已注明不在本轮任务单，需交接材料显式声明或后续补做；不阻塞本项）。
- sdet evidence（acceptance-matrix 七项）与交接包：仍为合并门前置；本环境工具链故障未能定位 progress 文件复核，维持 r1 记录状态（pending，未勾选）。

### r3 结论

**needs-work（需修改）** — 三项 r3 修复逐项核验全部落实：**P1-A PASS、P1-B 核心语义 PASS（判定/执行分离 + 成功后置位 + 失败可重试 + 测试断言同步）、P1-C PASS**；写集合规（3 文件 ⊆ chunks.yaml:77-89），无越写；回归计数一致（404 无增删）。**但 P1-B 执行层实现引入 1 项新 P1（P1-D：`result.takeover_candidates` 死字段回归，session-watchdog.ts:269-270/:295）**——按门禁规则「无新 P0/P1 才放行」不满足，本审查不放行。

放行前置（单轮可达）：
1. **P1-D**：notify 成功分支补 `result.takeover_candidates.push`（或结果推送移到动作分发之后）；建议补 notify 集成用例
2. P2 项不阻断（P2-A/P2-B/P2-E 建议随修改顺手处理；P2-C 随 P1-D 用例补上）

Reviewed-by: code-review（门禁层，E5 审查门 r3）

---

## R4 复审（第四轮，2026-08-16）

- 审查对象：工作房 `.picode/worktrees/squad-task-chunk-watchdog` HEAD=`450990d`；增量 `39c0d9d..HEAD`（**1 文件：session-watchdog.ts，3 行改动**）
- 审查方式：bash/git/glob/grep 全部不可用（spawn ENOENT / ripgrep launch failed，同 r1-r3）——git 日志核验（`.git/worktrees/squad-task-chunk-watchdog/logs/HEAD`：`39c0d9d → 450990d` 单提交，信息=「fix(watchdog): E5 r3 修复——P1-D takeover_candidates 推送移至 notify 成功分支」）+ r4 全量逐行读 session-watchdog.ts（307 行）+ session-watchdog.test.ts（11 用例）+ 与 r3 记录行号逐项对照 + chunks.yaml:77-89 写集对照
- 回归：orchestrator **404/404 计数核验一致**——r4 diff 未触碰测试文件（session-watchdog.test.ts 仍 11 用例：9 纯规则 + 2 集成，无增删、无 .only/.skip）→ 用例数与 r3 相同，404 不变，与 run-lead 报告吻合。本审查工具链故障无法独立复跑，采信 run-lead 报告（sdet evidence 正式确认仍为合并门前置，维持 r1 记录）。
- Reviewed-by: code-review（门禁层，E5 审查门 r4）

### P1-D 修复核对

| 项 | 结论 | 核验 |
|---|---|---|
| takeover_candidates 推送移至 notify 投递成功分支 | **PASS** | session-watchdog.ts:299 `result.takeover_candidates.push(s.agent_id)` 与 :298 `result.notified.push` 同处 notify 成功分支（:292 bus.post 成功 → :295 置 takeover_candidate=true → :298-299 双推送）；:300-301 catch 空（失败不推送、不置位）→ r3 P1-B「失败下轮重试」语义不受扰动 |
| 原「动作分发前预检查」移除 | **PASS** | :269-270 原 takeover 检查已删除，仅留注释说明移除原因（「本处检查在动作分发前执行，而 takeover_candidate 是投递成功后才置位 → 此处恒不命中」——与 r3 P1-D 事实链逐字吻合）；r3 修复方向「移除 L269-270 的 takeover 检查」落实 |
| at_risk 推送保留原位置 | **PASS** | :268 `if (next.at_risk && !result.at_risk.includes(s.agent_id)) result.at_risk.push(...)` 原样保留——at_risk 在**判定层**（evaluateWatchdog :111 error 前缀 / :133 第 2 轮）已置入 verdict 状态，分发前检查有效；与 takeover_candidate 的「执行层置位」时序不同，语义成立 |

### notify 全路径语义重演（无新缺陷）

1. **成功路径**：第 4 轮 verdict.action=notify_takeover（:127 `silent_rounds>=4 && !takeover_candidate`）→ :288 `prev?.takeover_candidate` 不跳过 → :292 post 成功 → :295-299 置位 + notified/takeover_candidates 成对推送 → :305 循环后统一落盘 ✓
2. **幂等**：下轮 verdict 因 prev.takeover_candidate=true 恒 none（:127 条件不满足、:132 at_risk 已真不进）→ 不重发 ✓
3. **失败路径**：post 抛错 → catch 空 → takeover_candidate 未置 → 下轮重新产出 notify → 重试成立；失败轮 notified 与 takeover_candidates 成对缺席 ✓
4. **契约字段**：r3 P1-D 断言「任何路径恒空」已不成立（成功路径可非空）；notified 与 takeover_candidates 成对出现/缺席，无孤儿推送，字段不再说谎 ✓
5. **既有测试兼容**：test :124-131 P1-1 平台席用例 `deepEqual` 空结果仍成立（平台席 :256 continue 跳过，无动作）；9 纯规则用例不触碰 runWatchdogCheck 结果字段 ✓

### 延续项（不阻塞，维持 r3 状态）

- **P2-A**（post 零 meta 来源标注）/ **P2-B**（steer 失败 catch :286 `result.at_risk.push` 无 includes 守卫）/ **P2-D**（supervise find 引号）/ **P2-E**（:178 转录文件名 `n.includes(agentId)` 子串匹配）：非本轮范围，维持。
- **P2-C**：notify 成功路径集成用例（断言 notified/takeover_candidates/watchdog.yaml 三合一）仍未补——r3 建议项，本轮任务单未列；P1-D 已通过代码核验成立，用例缺口不阻断，建议交接前顺手补（可同时收敛 P2-C）。
- supervise 接线 watchdog：不在任务单，需交接材料显式声明或后续补做（r2 起注明）。
- sdet evidence（acceptance-matrix 七项）与交接包：合并门前置，维持 pending。

### r4 结论

**pass（放行）** — P1-D 修复逐项核验成立：推送已移至 notify 投递成功分支（与 notified 同处，:298-299）、原预检查移除（仅留注释）、at_risk 推送保留原位置且语义有效（判定层置位）；notify 全路径（成功/失败重试/幂等/落盘）重演无新缺陷；写集合规（diff 1 文件 = session-watchdog.ts ⊆ chunks.yaml:77-89）；回归计数一致（404 无增删，采信 run-lead 全绿）。**无新 P0/P1，满足放行条件**。P2 延续项不阻断。

合并门前置（不豁免）：sdet evidence（acceptance-matrix 七项）正式确认 + 交接包齐全（summary/artifact_index/known_issues/diff_scope/evidence/acceptance），按流程 ④ 顺序执行。

Reviewed-by: code-review（门禁层，E5 审查门 r4）
