<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-16T09-30-00-EFFICIENCY · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-16 -->
<!-- 三帽折叠留痕：role: tech-writer（起草）→ checked_by: docs-qa（质检：事实与 R17 进度/证据/修复波记录逐条核对） -->

# 流程快赢规范（R17 固化 · process-quickwin）

> 性质：流程纪律规范（W3 chunk-docs 落档）。与 `r17-fix-wave-record.md`（本轮调整全记录）、
> `DOC-LIFECYCLE.md`（文档生命周期）、`tour-check.sh`（巡检三查脚本化）衔接；后续 run 的
> 简报/人设/巡检必须引用本文。数据事实来自 R17 三队进度（progress/progress.md）、交接证据
> （handoff/evidence.yaml）、修复波记录与 W2 watchdog 机制（D119-D124）。

## 1. 增量进度报告格式（追加式）

小队（squad-lead 主责，三席共用同一 `progress/progress.md`）**只追加、不覆盖**，每条一行：

```
<ISO8601 时间戳> <phase 变更/动作> + <关键判断/事实> + <WIP: 产物相对路径> + <阻塞: 原因（如有）>
```

R17 实证格式（env-gate progress.md 逐条可查）：

- `2026-08-16T17:35+08:00 kickoff 简报全量已读（WORK_BRIEF.md 105 行 + brief.yaml approved）+ 开工自检通过 + 核心上下文读毕（pi-adapter.ts/task.ts/staffing.ts/errors.ts + 基线测试 353/545 行）；WIP: progress/progress.md`
- `2026-08-16T19:20+08:00 engineer 帽（鱼钥）补充说明：…；③ 阻塞：bash spawn ENOENT 持续（>15 次）无法跑测试/提交；根 node_modules @picode/core dist 旧（无新错误码）需 build 主仓 core 同步。请 run-lead 裁决 ② 并留意 ③。`

要点：

- **时间戳**用本地时区 + 偏移（如 `2026-08-16T19:20+08:00`），与 evidence 的 ISO 全量时间戳口径一致
- **phase 变更**写动作（kickoff / TDD-1 红→绿 / 方案定稿 / 验证全绿 / 阻塞），不写感想
- **WIP 产物路径**必带相对路径，让巡检可直接定位改动物
- **阻塞**必须写明原因 + 需要的裁决/资源（R17 实证：bash ENOENT、stale dist、写集外 fixture 冲突均留痕并上报 run-lead）
- 追加式 = 进程真相序列，禁止改写/删除历史行（接管时以此还原轨迹）

## 2. 接管前置三查核验（先核验再接管）

**接管（run-lead 代实现/代修）前 MUST 三查**，全部通过才可动手；三查不通过不得接管（防「误杀」与「盲修」）：

| # | 查 | 命令/证据 | 判定 |
|---|---|---|---|
| 1 | progress 增量 | `tasks/<id>/progress/progress.md` 最近一条时间戳距现在 ≤ 巡检窗口 | 有近期增量 = 队内在动，先催办不接管 |
| 2 | git status + log | 工作房 `git status --porcelain` 非空 **或** 分支独有提交（`git rev-list --count <merge-base>..HEAD`）| 有产出 = 交接/审查门处理，不代实现 |
| 3 | sdet evidence | `handoff/evidence.yaml` 存在且已签（signed_by/verdict）或 progress 标 BLOCKED | 证据已签 = 走审查门；BLOCKED = 定位阻塞点再介入 |

**变更单式留痕**：接管本身就是流程事件，须留痕——

- 进度追加一条 `接管（run-lead）：<三查结论> → <接管动作>`（含三查逐项结论）
- 代实现提交信息带 `task id` 并注明 `run-lead 代修/代实现，<原因>`（R17 实证：`fix(env-gate): worktreePath canonical 对齐顶层 squad-<taskId>（E5 P1）+ …（task-chunk-env-gate；run-lead 代修，队内会话失联）`）
- 走既有合并门（`approvals/merge.yaml` + `docs/reviews/<task>-e5.md` 审查记录），**不因代实现豁免门禁**（R17 watchdog E5 四轮审查即 run-lead 代实现后仍全程走审查门）
- 交接包（summary/artifact_index/known_issues/diff_scope/evidence/acceptance）仍须齐备（R4）

## 3. at_risk 阶梯动作（1 通知 / 2 红灯 / 3 接管）

run-lead 巡检侧的人工阶梯（W2 起由 M1 看门狗机制化自动触发，见 D119）：

| 阶梯 | 触发 | 动作 | 留痕 |
|---|---|---|---|
| 1 通知 | 首查无实质进展（或 M1 第 2 轮 at_risk）| send_message 催办，附三查结论 | bus/`squad-<task>` 房消息 + progress 追加 |
| 2 红灯 | 2 轮零产出（或 M1 第 4 轮通知）+ 三查确认无产出 | 红灯标记（run 级 README/登记），通知 sponsor | 登记 + 队列内标记 takeover_candidate（D119）|
| 3 接管 | 红灯后仍无进展/会话失能 | 按 §2 三查 → 代实现/代修 → 审查门 → 合并门 | 变更单式留痕（§2）+ evidence.yaml run-lead 复核节 |

机制化衔接：W2 watchdog（D119）把「2 轮 at_risk+steer / 4 轮通知+takeover_candidate / 错误前缀立即 at_risk」
机械化为 session-watchdog.ts；**人工阶梯保留为兜底**——M1 通知未达 run-lead 前，巡检仍按 1/2/3 执行。
R17 实证：金汤队 3 轮内接管验证（fix-wave §3），watchdog 队内 2/3 会话失联 → run-lead 代实现 + E5 四轮审查。

## 4. 评分回路收尾 checklist（R5 评分不阻断、解散即评分）

run 收尾时按序核对（供 people 评分与 run-lead 验收）：

- [ ] 各 task 交接包齐备且已签收（acceptance accepted_by 非空，merge-gate 签收门硬校验）
- [ ] 各 task `staffing/scores.yaml` 已生成（0-100，base 50，按 evidence/handoff/ack/retries 信号）
- [ ] `docs/knowledge/hr/personas/<codename>.yaml` 三席聚合落库（无重名，name-ledger 同步）
- [ ] `docs/knowledge/hr/teams/<team_name>.yaml` 团队聚合落库
- [ ] name-ledger.yaml 补录本 run 全部 team_name/codename（schema v1，含 first_used_at）
- [ ] talent 聚合（talent.md）已消费/更新（D117 queryTalentPool 输入侧）

缺口处理：评分不阻断流程（R5），但收尾 checklist 须在 E 纪要「评分回路」节显式记录缺口与补办时机。

## 5. 巡检三查与 tour-check.sh 衔接

人工巡检与脚本化巡检同口径（tour-check.sh 已固化，D123）：

| 三查 | 人工 | tour-check.sh |
|---|---|---|
| progress 增量 | 读 `tasks/<id>/progress/progress.md` 最近条目 | 检查文件存在且非空（`grep` 最近时间戳）|
| git status + log | `git -C <工作房> status --porcelain` + `rev-list --count` | 同上机械执行；**不扫描 commit subject**（R16 两次误报教训）|
| sdet evidence | 读 `handoff/evidence.yaml`（signed_by/verdict）| 文件存在 或 progress 标 BLOCKED（`grep -qw BLOCKED` 词边界，P2-14⑥）|

衔接规则：脚本输出「有待关注项」（exit 非 0）→ 人工按 §2 三查逐项复核 → 走 §3 阶梯；
`BLOCKED` 词边界用 `grep -qw`（修 UNBLOCKED 误报）；脚本不替代人工判断（产出信号务实化）。

## 6. 开工自检模板（M5 · spawn 前核验）

实现小组**开工第一动作**（人设内置，R17 全程执行，实证于三队 progress.md 自检节）：

```
1. 工具探活：node -v / git rev-parse --show-toplevel / pwd 三探（bash 可用性自证）
2. 工作房核验：pwd 在 <repo>/.picode/worktrees/squad-<taskId>（canonical 布局，D120 裁决）；
   git branch 显示 picode/<run>/<task>；git status 工作树 clean
3. 基线确认：git rev-parse HEAD = 简报基线；写集文件存在性
4. 环境事实留痕：任何工具故障（spawn ENOENT / ripgrep 缺失）如实记录（R17 实证：金汤队
   progress 自检节记录「本会话 bash 工具曾出现 1 次 spawn bash ENOENT（间歇），重试恢复」）
5. 首条增量进度按 §1 格式落盘（含 WIP 路径）
```

> 机械层兜底：wakeAgent 前置 probeCoreTools（M2，D120）与 worktree 门闩（M4，D120）会拒绝
> spawn——开工自检是**第一道人工防线**，机械门闩是第二道，两者不互替。
