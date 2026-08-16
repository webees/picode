<!-- 精简批2（2026-08-15）：E 纪要已摘要化——教训/风险去向见 evolve/E1-E15-SUMMARY.md 对应行，细节见 git 历史。 -->
<!-- 已摘要（见 E1-E15-SUMMARY.md，2026-08-15；plans 侧同名文件缺失，未按 2a 合并），细节见 git 历史。 -->

# Evolve run-2026-08-13T01-15-17-073Z

- goal: 会话续跑机制（continuation）：picode 无输入长时自治闭环
- kind: self_evolve · layers: knowledge/prompts/docs/tests/code · risk: medium
- baseline: main
- status: 已完成（R1：C1/C2/C3 合并入 main = eb8ec2e；R2：三硬化 chunk 合并入 main = d81b547）

## Intent

让 picode 会话完成单回合后由**机械层自动续跑**，不再空等（长时编程能力）；续跑有界（预算/最大续跑次数）且断连可恢复（可靠性）；本轮 run 自身作为验证载体：无人干预完成至少 2 个任务并合并。

依据：监督者观察记录（run-2026-08-12T23-36-04-362Z：单任务投喂后会话自主闭环但回合结束停住，tokens 12 分钟零增长）；prime-agent 研究（Q1 budgets 续跑侧）；sys-arch 评估（心跳重附/会话 checkpoint）。决策清单：docs/plans/2026-08-13-r1-continuation.md（N1–N7）。

决策要点（D066）：
- N1 continuation 缺口 → 修（本轮核心）：guardian 机械层对已 awake 空闲会话投喂固定续跑 prompt（D061 noReply）
- N2 续跑无界 → 修：`self_evolve.continuation.max_per_session`（0=不限，保守默认）+ 每会话 `budget.continuations` 计数持久化，耗尽即停
- N3 断连/重启丢续跑状态 → 修：计数落盘 session.yaml（文件真相 D002），serve 恢复后从持久化计数续发（不重算不超发）
- N4 daemon → 缓：guardian 周期性 sweep + probeServeHealth 心跳重附替代
- N5 会话 checkpoint → 缓：第二轮
- N6 maxTokens 计量 → 缓：上游 serve 无 token 拉取契约（D058），本轮以次数+时间计价
- N7 续跑内容语义化 → 缓：v1 固定模板 + 现有任务上下文，不做 LLM 生成指令

## 产出（3 chunk，串行 merge D036）

- C1 `chunk-continuation-core`（代码）：`continuation.ts`（deriveContinuationTargets 纯函数 + feedContinuation）+ guardianTick 接线 + `budget.continuations` 计数 + `self_evolve.continuation` 配置
- C2 `chunk-continuation-recovery`（代码）：续跑与 P1 serve 恢复衔接 + `self-drive continuation` CLI（--status/--feed）+ MCP 工具
- C3 `chunk-continuation-docs`（本文档）：D066 + decision-catalog 续跑默认值 + operations 续跑运维规程 + prime-agent-study continuation 落地小节

## Diff

- **C1 `merge task-continuation-core` = 9ec46c3**（10 文件，+767/−3）：`packages/orchestrator/src/continuation.ts`（新，`deriveContinuationTargets` 纯函数 + `feedContinuation` + `sweepContinuations`）、`continuation.test.ts`（新，383 行）、`self-drive.ts`（guardianTick 接线：checkBudgets 之后 / probeServeHealth 之前执行续跑 sweep）、`session-store.ts`（`budget.continuations` 计数持久化到 session.yaml）、`packages/core/src/session.ts`（`SessionBudgetUsed.continuations`）/`config.ts`（`self_evolve.continuation` 配置 + 校验 + 默认值 `max_per_session: 0` 不限 / `idle_sec: 300`）及测试
- **C2 `merge task-continuation-recovery` = eb8ec2e**（7 文件，+417/−1）：`self-drive.ts` 续跑与 P1 serve 恢复衔接（error 清后从持久化计数续发，不重算不超发）、`commands/self-drive.ts`（`continuation` 子命令：`--status` 只读预览 / `--feed <agent>` 手动单次投喂）、`commands/self-drive.test.ts`（新，214 行）、`mcp-server/src/management.ts`（`continuation_status` / `continuation_feed` 工具）、test 脚本递归发现 commands/ 下测试（1c5e7ec）
- **C3 `merge task-continuation-docs` = 35bb1e4**（5 文件，+144/−3）：`docs/DECISIONS.md`（D066）、`docs/reference/decision-catalog.md`（§12 续跑默认值）、`docs/guides/operations.md`（续跑运维规程）、`docs/knowledge/pi-agent-study.md`（continuation 落地小节）、本文档（E6）

## Verification

- **312 tests 全绿**（0 fail）：core 67 / bus 19 / orchestrator 193 / pi-extension 17 / mcp-server 16（C1 时 307，C2 增 commands/ 面后 312；`npm run build && npm test` 实测复跑通过）
- 单测覆盖：C1-b 空闲投喂恰好一次 POST（noReply:true + 转录落盘 + 计数）；C1-c 预算耗尽/error/sleeping/非 oc-/任务终态永不投喂（幂等）；C1-d `deriveContinuationTargets` 纯函数无网络副作用；C2-b 恢复后计数不重置不超发；C2-c 瞬时超时有界重试成功仅计数 1 次
- `npm run check`（persona-lint）通过（C3 变更后文档不破坏构建）

## 真实运行验证（acceptance 3：run 自身为验证载体）

- **02:07 / 02:12 两轮续跑 sweep 自动投喂** docs-lead / ind-res / run-lead / scout（及 sys-arch）：transcript 落盘确认消息为「固定续跑 prompt（角色提示 + `检测到本会话已空闲一段时间…继续推进或报告完成`）+ 续跑语义」；docs-lead session.yaml `budget.continuations: 3` 计数生效
- **无人干预推进验收**：C1（continuation-core）与 C2（continuation-recovery）两个代码任务由 guardian 唤醒三角 → 续跑使实现持续推进 → 自测 → 串行 merge 入 main；C3 文档沉淀经 docs cell 完成。监督者仅验证 + merge，未逐任务投喂

## 剩余风险

- **merge 后 task 未标记终态 → 续跑不停止**（本轮实测缺口）：C1/C2/C3 全部合并后，已 awake 的 run-lead 仍被续跑 sweep 每 5 分钟投喂至 02:42 才休眠——续跑候选派生只看「会话 awake + 任务未终态」，task 合并后未标记终态则守护层继续推进。第二轮需让 merge 完成即触发 task 终态（O005 终态推进），使续跑自然停靠
- **`max_per_session` 默认 0=不限 的 token 消耗**：配置默认保守值被对齐为 0（不限，靠既有 idle-sleep/budgets 停靠），实测中 run-lead 从 02:07 被连投 8 次（每 5 分钟）至 02:42 才休眠；预算门建议第二轮设保守默认上限或按 role 差异化
- **scout/sys-arch 等平台席空转**：无活动任务的平台会话同样命中续跑候选被投喂（02:07/02:12 两轮），消耗 tokens 且无产出——候选派生应排除无 task 绑定/无工作上下文的平台席
- **serve DB 写错误（02:34 Failed query）**：serve 侧一次查询失败记录，watchdog 可观测但有界恢复在代码合并前运行的是旧进程（见下）
- **守护进程需在代码合并后重启（新代码不热载）**：`opencode serve --port 7788` 进程为代码合并前启动的旧 dist（新代码不热载），续跑机制要作为生产形态需重启 serve 加载新代码
- **语义续跑未做**（N7 缓）：续跑 prompt 为空模板 + 任务上下文，无 transcript 摘要注入；会话多轮续跑后上下文稀释，agent 需依任务文件自判
- **会话 checkpoint 未做**（N5 缓）：「快照只读、文件为准」边界未定义前不引入
- **maxTokens 未计量**（N6 缓）：续跑以「次数+时间间隔」计价，token 维度依赖上游 serve 契约（D058 后续）
- **serve 单点**：续跑依赖 serve 在线；ERR-01 watchdog 已做可观测与有界恢复，根治依赖上游
- **续跑×idle-sleep 时序**：`idle_sec` 须小于 `idle_sleep_sec`，否则会话先休眠续跑不触发（运维规程已列排查项）

## 第二轮候选（承接 plan §d，按本轮实测增补）

1. **task 终态推进**：merge 完成即标记 task 终态，续跑随任务停靠（本轮「续跑不停止」缺口的根治）
2. **续跑预算门细化**：`max_per_session` 默认设保守上限或按 role 差异化（0=不限 实测连投），耗尽前跑 `gate_commands`
3. **候选派生排除平台席**：scout/sys-arch 等无任务绑定会话不进入续跑候选
4. **语义续跑**：续跑 prompt 注入 `TranscriptStore.historySummary`（P4）或窗口语义摘要（C3' summary）
5. **会话 checkpoint 快照**（prime-agent /refine 对应物）：task 级只读快照 + 回滚，先定「快照只读、文件为准」边界
6. **maxTokens 真计量**（N6）：等 serve 暴露 token 契约（D058 后续），续跑预算并入 token 维度
7. **续跑遥测看板**：`status` 增续跑计数/最近续跑时间列（D039 status 快照扩展）

---

# R2 区（continuation 硬化 · 2026-08-13）

> R2 承接 R1 实测「剩余风险」中 3 个小而明确项（merge 终态 / 预算默认有界 / 守护重启观测），
> 决策归档见 `docs/plans/2026-08-13-r2-continuation-hardening.md`（(a) 处置决策 1-5、(b) chunk、(c) 分配、(d) R3 候选）。

## R2 Diff（三 chunk，串行 merge 列车 D036）

- **R2-C1 `chunk-merge-terminal`**（merge = dac34d4，feature = 6e722d9）：4 文件 +84/−2。`merge.ts` 增 `markTaskMerged`（merge 成功置 task.yaml status="merged"，失败不动，复用 closure.ts writeYamlFile 写法）；`continuation.ts` `TERMINAL_TASK_STATUSES` 增 `"merged"`（continuation.ts:38-42），merged 任务席位不再产出续跑候选；merge.test / continuation.test 补单测
- **R2-C2 `chunk-continuation-bounded`**（merge = abd646d，feature = 7947447）：3 文件 +12/−11。`config.ts` `self_evolve.continuation.max_per_session` 默认 0 → 5（config.ts:468，0=不限显式声明）；config.test 断言默认 5 且可覆盖、仍拒绝 -1/1.5；decision-catalog 续跑默认值更新为 5
- **R2-C3 `chunk-guardian-reload-signal`**（merge = d81b547，feature = f46d66a + becb3fa）：3 文件 +180/−5。`self-drive.ts` 增 `detectCodeUpdated` 纯函数 + runGuardian 启动记录 base HEAD、每 tick 对比 `git rev-parse HEAD`，main HEAD 前移置 `code_updated` 警告一次（不退出不热载）；self-drive.test 补单测；operations.md 增「guardian 重启规程」；修正提交 becb3fa：tick 不传 baseSha 恒 null → 观测面修正

## R2 验证

- `npm run build && npm test` 实测全绿：**319 tests（0 fail）** core 67 / bus 19 / orchestrator 200 / pi-extension 17 / mcp-server 16（R1 时 312 → R2 三 chunk 后 +7）
- 单测覆盖：R2-C1-b merge 成功 task.status==="merged"；R2-C1-c status="merged" 的 awake oc- 会话不再被 `deriveContinuationTargets` 选中、sweep 不投喂；R2-C2-b 默认 `max_per_session===5` 且可覆盖；R2-C2-c validateConfig 仍拒绝 -1/1.5；R2-C3-b 初始 tick `code_updated===null` / HEAD 前移 detected===true 且 base/head SHA 正确 / 未变幂等 null
- `npm run check`（persona-lint）通过

## R2 实测（guardian merge 自动 merged）

- 本轮三个 code chunk（merge-terminal / continuation-bounded / guardian-reload-signal）全部经 guardian 串行 merge 列车完成：**merge 成功即自动置 task.status="merged"，已合并任务不再被续跑 sweep 投喂**——R1「续跑不停止」缺口根治（O005 终态推进落地）
- R2-C3 HEAD 检测实测：feature 提交落库即触发 `code_updated` 信号（base/head SHA 正确），becb3fa 修正观测面后幂等（HEAD 未变保持 null）
- R2-C2 默认有界生效：无任务角色（scout/sys-arch）续跑上限 5 次/会话，耗尽即停

## R2 剩余风险

- **默认有界仍未排除平台席**：候选派生仍不排除无 task 绑定会话，仅缓解为有界 5 次（R1 gap 3 非根治）；R3 候选「候选派生排除平台席」保留
- **guardian HEAD 检测依赖 git 仓库**：非 git 目录/无提交时 `repoHeadSha` 返回 null → 检测静默退化（不误报但不生效），运维需保证 run 目录为 git 仓库
- **检测只观测不自动重启**：`code_updated` 仅警告 + 文档规程，合并后仍须人工重启 serve 加载新代码（符合「无 daemon / 不热载」不变量，运维依赖）
- **merge 终态仅覆盖成功路径**：R2-C1 只对 merge 成功置 merged，abort / 依赖链失败的终态语义与 dissolve 一致性需回归关注
- **R1 遗留缓项保持 R3 候选**：语义续跑（N7）、会话 checkpoint（N5）、maxTokens 计量（N6）、serve 单点依赖（上游）
