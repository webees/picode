# R17 规划草案：会话失能修复 + 运行效率提升（run-2026-08-16T09-00-00-EFFICIENCY）

## 1. 需求来源（sponsor 指令）

> 「继续推进并向 picode 反应这个问题（砥柱队/雁书队零产出），尝试改进和修复。注意需要进一步提高整个 picode 的运行效率。需要想办法。」

## 2. 双份分析结论（sys-arch + proc-audit，只读）

### 2.1 零产出根因（按证据支持度）
| # | 根因 | 证据 |
|---|---|---|
| 1 | **子代理工具运行时不可用**：bash/glob/grep spawn ENOENT（会话 cwd 失效）+ node/npm 不在 PATH（PATH 仅 runtime-commands/bin、/usr/bin、/bin） | chat-ui evidence.yaml blocked_reason；process-items progress.md 环境故障声明；durable-session known_issues「带 workdir 即正常」；本次实测 node command not found |
| 2 | **工作房从未真实创建**：chat-ui/flow-ui 只有分支，`git worktree list` 无对应目录；人设声明的 worktree 路径不存在 → 无房可做、无法 git 提交 | reflog 仅 1 条 branch 记录；personas/engineer.md:44 指向不存在路径；sdet 取证「分支零提交、4 文件全缺」 |
| 3 | **无自动 at_risk/催办/接管机制**：rules-engine 仅 progress_due→wake，无「零产出 N 轮」检测；巡检靠 commit subject 扫描（2 次误报）+ 误接管 1 次（铨衡并发互覆） | proc-audit 巡检证据；design-deficiencies L49 |
| 4 | orchestrator 会话机制（guardian/续跑/预算）与 DSH-subagent 模式脱节；serve 会话累积 10,836 个无 GC | find 实证；E18 记录 |
| 5 | 接管路径绕开审查门文档轨迹（W2a/W2b 无 review 记录、无 merge.yaml）；评分回路断裂（全 run 零 scores.yaml） | proc-audit §一.5/.6 |

**核心结论：零产出不是模型拒绝，是「会话活着但啥都干不了」（工具死 + 无房可做 + 无人发现）。**

### 2.2 修复设计（M1-M5 机制 + C 工具链 + 流程快赢 D/E/F/G/I）

| 编号 | 机制 | 落点 | 说明 |
|---|---|---|---|
| M1 | 会话健康看门狗：零产出 2 轮→at_risk+steer 投喂；再 2 轮→bus 通知 run-lead + takeover_candidate；零 LLM 决策 | orchestrator/src/session-watchdog.ts（新）+ self-drive.ts 接线 + supervise.mjs | 自动检测+自动干预 |
| M2 | 工具环境自检：wakeAgent 前置探测 bash/node/git；失败→结构化错误码 TOOL_ENV_BROKEN → guardian 立即 at_risk | pi-adapter.ts + core errors.ts | 修复根因 #1 |
| M3 | 会话复活重投喂：probeServeHealth 扩展，error 会话超阈值自动 re-wake + resume | self-drive.ts | 修复根因 #5 |
| M4 | 工作房存在性门闩：双门闩加「worktree 已建」校验，缺失拒绝 spawn | task.ts + staffing.ts | 修复根因 #2 |
| M5 | 开工自检：简报/人设模板加「先 node -v && git rev-parse」步骤 | docs 模板层 | 预防 |
| C-0 | node/npm/npx 入 DSH runtime-commands（已完成 ✅） | 仓外软链 | 一切命令的前提 |
| C-1 | worktree-setup.sh（add+自链 node_modules+冒烟）、test-iso.sh（mktemp HOME+先 tsc -b 防 stale dist 假红）、env.sh、merge-gate.sh、tour-check.sh（三查巡检） | scripts/ | 效率 |
| C-2 | 根 package.json 测试编排：workspace concurrency + 并入 dashboard vitest | package.json | 一命令全量测试 |
| F | spawn 前三工具探活，失败即上报 | 人设/简报模板 + M2 | 快赢 |
| G | 解散即评分：people 一次任务（分+一句话画像+聚合）；收尾 checklist 强制 scores 齐 | 执行纪律 + docs | 快赢（本轮执行） |
| I | 接管留痕：接管=变更单式记录；接管后合并必补 merge.yaml+review | docs 规范 | 快赢 |

## 3. 分块方案（写集互斥）

| chunk | 内容 | write_paths（关键） | depends_on | wave |
|---|---|---|---|---|
| C2-env-gate | M2（工具探测+TOOL_ENV_BROKEN）+ M4（工作房门闩） | orchestrator/src/pi-adapter.ts(+test)、task.ts、staffing.ts(+test)、core/src/errors.ts(+test) | [] | W1 |
| C3-toolchain | worktree-setup/test-iso/env/merge-gate/tour-check + package.json 编排 | scripts/{worktree-setup,test-iso,env,merge-gate,tour-check}.*、package.json | [] | W1 |
| C1-watchdog | M1（看门狗分级干预）+ M3（复活重投喂）+ supervise 接线与陈旧路径修复 | orchestrator/src/session-watchdog.ts(+test)、self-drive.ts(+test)、scripts/supervise/supervise.mjs | C2-env-gate | W2 |
| C4-docs | M5 模板、流程快赢规范（增量进度格式/接管留痕/at_risk 红灯）、D119+ 决策、operations.md、E20 纪要 | docs/**、.picode/goal.yaml 等状态 | C1+C2+C3 | W3 |

共享文件：errors.ts owner=C2；package.json owner=C3；supervise.mjs owner=C1；operations.md owner=C4。

## 4. 非目标（下轮）
- 双人组试点（A 级，D112 决议延续）
- 人设程序化生成、简报半自动（B/H）
- 2 件交接包（C）
- serve 会话 GC（D109 遗留，独立立项）

## 5. 本轮执行纪律（run-lead 承诺）
- spawn 前核验：worktree 真实存在（git worktree list）+ 探活命令可执行
- 巡检改用三查（progress 增量 / git status+log / sdet evidence），废除 commit subject 扫描
- 每轮结算盯增量；2 轮零产出即红灯；3 轮接管（先三查核验）
- 接管必留痕（变更单式记录 + merge.yaml + review）
- 结束时评分回路闭合（people 评分 + scores.yaml + talent.yaml 聚合）
