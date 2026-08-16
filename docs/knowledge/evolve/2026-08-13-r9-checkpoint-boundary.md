<!-- 精简批2（2026-08-15）：E 纪要已摘要化——教训/风险去向见 evolve/E1-E15-SUMMARY.md 对应行，细节见 git 历史。 -->
# Evolve run-2026-08-13T23-48-54-042Z

- goal: 会话 checkpoint 边界决策先行 + 最小可行落地 + re-spawn 摘要去噪（宽松目标，run-lead 自主决策）
- kind: self_evolve · scale: L（run-lead 自主决策，宽松目标）
- baseline: main（50fdd0a 后）
- status: 已完成（C1 checkpoint-store 合并 = 93a2bc7；C2 respawn-stripnoise 合并 = 3eb8434；C3 本文档）

## Intent

E10 剩余候选 #3（checkpoint 快照，D081 缓项延续）与候选 #1（re-spawn 摘要去噪一致化，D079 缓项）
本轮落地。D081 留档「checkpoint 先定快照只读、文件为准边界」；sys-arch 评估点名「快照与文件真相
双源分歧」风险；prime-agent 研究 M6 对照「picode 状态落盘文件真相，比进程级恢复更严」。本轮把边界
决策落到可运行的最小实现：checkpoint 只作**观测/审计产物**，绝不反向驱动任何状态决策。product_acceptance：

1. checkpoint 边界决策先行：「快照只读、文件为准」双源分歧防护
2. 落地最小可行实现：task 级 checkpoint 捕获/只读查询（`checkpoint-store.ts` + CLI `picode checkpoint`），
   纯函数派生、不可变落盘、无守护自动写
3. 附带高价值小项：re-spawn 摘要去噪一致化（E10 后续候选 #1 / D079 缓项落地）
4. 既有续跑/预算/门禁语义不回归（既有 385 单测全绿）

## 决策要点（D082 / D083）

- **D082 会话 checkpoint 边界 + 最小可行落地**（C1 task-checkpoint-store）：
  - **快照只读**：checkpoint = 捕获时刻对文件真相的**只读投影**，写入后不可变（timestamped 单文件、
    append-only 目录）；**任何代码路径不得读 checkpoint 驱动状态决策**——恢复/续跑/调度/合并仍只读
    session.yaml / task.yaml / transcripts / git（D002 文件真相不变量）
  - 纯函数 `deriveTaskCheckpoint`（now 注入确定性，同输入同输出）+ 不可变落盘
    `runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml`（schema v1 + 自指纹 sha256）；task 不存在 → null
  - **MVP 仅显式捕获**：`picode checkpoint capture --task <id>` + `picode checkpoint status [--task <id>]`；
    guardian/merge/serve 恢复路径**零改动**；`boundary: manual` 字段预留
  - 捕获内容：task_status + 三角会话 state/budget + 各会话 historySummary（stripNoise 剔模板）+
    git worktree 指纹（非 git 仓 → null 容错）
  - 消费面最小化：只读 CLI 两个子命令，不扩 statusSnapshot 顶层（三面一致性留后续候选）
  - 缓/拒留档：自动捕获接线（guardian/merge 前）缓、进 statusSnapshot 三面缓、从 checkpoint 恢复/回滚
    拒（违背快照只读边界，远期若做恢复目标仍为文件真相）
- **D083 re-spawn 摘要去噪一致化**（C2 task-respawn-stripnoise）：
  - `wakeWithOpencode` 重 spawn 的 `historySummary` 传 `stripNoise: [READY_MESSAGE_TEXT]`，剔除重投喂
    ready 模板句，与 feed 路径（D077）口径一致；`maxEntries` 保持默认 20（全量恢复语义，不强行统一）
  - `opencode-adapter.ts` 本轮显式纳入 write_paths（D079 越界教训：上轮该改动越出 write_paths 被 P07 回退）

## Diff（2 chunk + docs，串行 merge 列车 D036）

- **C1 `task-checkpoint-store`**（93a2bc7）：`checkpoint-store.ts`（schema v1 / deriveTaskCheckpoint /
  captureTaskCheckpoint / listTaskCheckpoints / latestTaskCheckpoint / listCheckpointTasks）、
  `commands/checkpoint.ts`（capture + status 两个只读子命令）、`commands/index.ts`（注册 + DOMAIN_ORDER）；
  对应测试（捕获内容/纯函数幂等/不可变/ts 排序/task 缺失→null/git 非仓→null/now 注入确定性/
  stripNoise 生效）+ cli.test 命令表断言（D074 模式）
- **C2 `task-respawn-stripnoise`**（3eb8434）：`opencode-adapter.ts`（wakeWithOpencode historySummary
  传 stripNoise:[READY_MESSAGE_TEXT]）+ 对应测试（重 spawn 摘要不含 ready 模板句；转录仅模板句时
  整条跳过）
- **C3 `task-checkpoint-docs`（本任务）**：DECISIONS D082/D083（含 D079/D081 状态更新）、
  decision-catalog §12.8 re-spawn 已定 + §12.9 会话 checkpoint、operations.md checkpoint 小节 +
  re-spawn 去噪句、本 E11 纪要

## Verification

- C1：`npm run build && npm test` 全绿（既有 385 无回归 + 新增 checkpoint 用例）；`picode checkpoint`
  注册进 --help 命令表（D074 断言模式）；`git diff --name-only base...HEAD ⊆ write_paths`（P07 门禁通过）
- C2：`npm run build && npm test` 全绿（既有 opencode-adapter / wake / spawn / 恢复用例无回归）；
  diff 仅 `opencode-adapter.ts` + 其测试（P07 门禁通过）
- C3（本任务）：文档不破坏构建；`npm run check`（persona-lint）通过

## 剩余风险

- **checkpoint 无自动捕获**：MVP 仅手工 `capture`——观测价值需经真实 run 验证写入代价后，再评估
  guardian/merge 前自动接线（缓项）
- **三面不展示 checkpoint**：status/CLI/MCP 不同源展示 checkpoint（仅 CLI 消费面）；需要时再动
  status 契约（缓项）
- **re-spawn 与 feed 摘要窗口仍不同**：re-spawn `maxEntries=20` vs feed 8，为有意保留（全量恢复语义），
  非差量

## 后续候选

1. **checkpoint 自动捕获接线**（guardian tick / merge 前 / 会话休眠前）：先经一版手工捕获验证观测价值
   与写入代价；guardian 热路径自动写须另行评估（避免 tick 副作用扩大）
2. **checkpoint 进 statusSnapshot 三面**（status/CLI/MCP 同源）：MVP 仅 CLI 消费面；三面同源需动
   status 契约 + mcp-server
3. **从 checkpoint 恢复/回滚（远期）**：恢复目标仍为文件真相（git/文件备份），checkpoint 仅作回滚前
   对照基线
4. **maxTokens 真计量**：待 serve token 契约（D058）就绪
