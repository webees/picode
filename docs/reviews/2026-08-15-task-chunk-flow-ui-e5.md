# 审查记录 — E5 门 · task-chunk-flow-ui（992d487 vs 基线 19e006c）

- 审查对象：worktree `squad-task-chunk-flow-ui` 提交 `992d487`（feat(flow-ui)），diff `19e006c..992d487`
- 范围：flow.api.ts（新）、flow.data.ts（新）、flow.test.ts（新，17 用例）、9 个视图增强（gates-panel/tasks-board/merge-train/goal-overview/progress-view/personnel-view/chunks-table/sessions-live）
- 执行：`git diff --stat` 全貌（11 文件 +843/−16）→ 逐文件 diff + 关键上下文（router.ts apiApprovals/apiChangeOrders、approval.ts、memory.ts、merge.ts 拓扑语义、progress/staffing 状态词汇、tasks-board.data.ts amber 先例、ufo withBase 实测）→ vitest + vue-tsc + vite build
- 验证结果：vitest 6 文件 57 用例全绿（flow.test.ts 17/17）；`vue-tsc -b` **exit 2（build 不通过）**；基线 `19e006c` vue-tsc exit 0（失败为本 diff 引入）

## 合规确认（清单逐项）

- [x] diff ⊆ write_paths：11 文件与 chunk-flow-ui write_paths 完全一致；shared_files（picode.api.ts / index.vue / utils/labels.ts）零触碰（diff --name-only 确认），labels.ts 仅只读引用
- [x] flow.api.ts 3s 轮询（LIVE_POLL_INTERVAL_MS=3000）+ 类型对齐 router.ts/apiApprovals、apiChangeOrders 与 approval.ts、memory.ts（详见 P2-9 放宽）
- [x] 标签本地化于 flow.data.ts（APPROVAL_STATUS_ZH/CHANGE_ORDER_STATUS_ZH/SANDBOX_MODE_ZH/门禁阶段），不碰 utils/labels.ts
- [x] 文案中文通俗；amber 色值用法与 tasks-board.data.ts:34-35 既有先例同族（amber-600/700 + dark:amber-400），D071 语义色合规
- [x] 测试全绿、无 .only/.skip、worktree clean
- [x] ❌ build 通过 —— 不满足（见 P0-1）

## 问题清单

### P0（阻塞合并）

1. **build 不通过（验收 #5 直接失败）** — `flow.test.ts:183`
   `const allMerged = [mergedReq, { ...queuedReq, status: 'merged', merged_at: ... }]`：对象展开后覆盖的 `status` 被 TS 拓宽为 `string`，数组类型不符 `MergeRequest[]`，`vue-tsc -b` 报 TS2345（exit 2）。`pnpm build` = `vue-tsc -b && vite build` 第一步即失败。vitest 全绿是因为 esbuild 不做类型检查。修复一行级：`{ ...queuedReq, status: 'merged' as const, ... }` 或显式标注数组 `: MergeRequest[]`。

2. **门禁状态机展示未落地（验收 #2 未交付）** — `flow.data.ts:137-178`、`gates-panel.vue`（全文件）
   验收要求「门禁 tab（gates-panel.vue）：…门禁状态机展示：每任务流水（双门闩 → progress phase → evidence pass → 已合并），纯派生 flow.data.ts」。`deriveGateStages`/`GATE_STAGE_BADGE` 有定义、有 6 个测试（flow.test.ts:126-165），但 grep 全部 src 无任何 .vue 引用 —— 纯派生函数成了无调用方死代码；gates-panel.vue 只渲染统计卡/门禁文件/验收证据/审批流/变更单，没有每任务流水表。二选一：① 在 gates-panel.vue 接线（渲染 GateStageRow 流水表，含 latch/phase/evidence/merged）或 ② 与工程主责确认降级后删除派生+测试并修订验收。当前按验收文本属未交付。

### P1（应修）

3. **merge-train.vue:141 — TableEmpty colspan 与列数不符**
   表头 6 列（状态/任务/发起/排队时间/合并时间/等待原因或错误，:106-112，本次仅改文案未增列），但空态 colspan 被改成 7（基线为 6）→ 空态行跨列溢出。应 colspan=6。

4. **progress-view.vue:167 — TableEmpty colspan 未同步**
   新增「双门闩」列后表头 8 列（:112-120），colspan 仍为 7（基线 7 列）→ 空态行少跨一列。应 colspan=8。

5. **flow.data.ts:210-213 — deriveMergeWaitReasons 拓扑语义与服务器不一致（D045）**
   服务器 `depSatisfied`（merge.ts:64-68）将 `merged` **或 `failed`** 均视为依赖已满足（防队列卡死）；前端只认 `status==='merged'` → 上游依赖任务合并失败时，前端持续显示「等待依赖：c1」，而服务器实际不会因该依赖跳过。展示与服务器合并门行为矛盾。建议对齐：`mergedTaskIds` 纳入 `failed`（或按 D045 语义命名改为 satisfied）。

### P2（建议）

6. **flow.data.ts:207 — `taskByChunk.get(m.task_id)` 兜底为死代码且注释误导**
   merge 队列 task_id 为 `task-<chunkId>`（或 chunk 显式 task_id，见 merge.ts:48-56），恒不等于 chunk id → 该兜底分支（`chunk?.depends_on`）实际不可达；注释「task_id 即 chunk 名空间下的任务」易误读。另：queued 任务不在 tasks 视图时 `chunkId` 为 undefined → deps=[] → 显示就绪，与服务器（读 chunks.yaml）可能相反。建议删兜底并显式处理未找到任务的 case。

7. **flow.data.ts:54-67 — latch 状态词汇不全**
   staffing 实际状态集为 `submitted|in_hr|run_lead_review|approved|rejected`（staffing.ts:33），brief 为 `draft|approved`（task.ts）。`latchBadge` 将 `in_hr`/`run_lead_review` 落「未就绪」（应为「审批中」）、`rejected` 落「未就绪」（应为「已拒绝」）；`dualLatchState` 把 rejected 也归「审批中」。建议补映射。

8. **tasks-board.vue:119-127 — 计算 variant 被丢弃 + 字符串判断**
   `dualLatchState` 返回的 `variant` 未用（模板硬编码 `variant="outline"`），用 `label.startsWith('门闩齐')` 做状态判断（脆）；null latch 任务（从未提交）显示「审批中」误导。amber 色值本身符合 tasks-board.data.ts:34-35 先例，合规。

9. **flow.data.ts:150-155 — 「待分块」命名与终态缺失**
   task 已存在（分块已完成），latched 且无 phase 更接近「待开工」/「已就绪」；且 `dissolved`/`failed` 终态任务（无 phase、latch 状态不定）会被归入「待分块」或「双门闩中」——终态未纳入 stage 判定。

10. **flow.api.ts:80-95 — hooks 与 repo 模式不一致**
    既有 hooks（picode.api.ts:280-337）均带 `enabled: !!runId` 与 `refetchIntervalInBackground: true`；本文件两者皆缺。当前 runId 恒有值、tab 内轮询无影响，纯一致性建议。

11. **gates-panel.vue:48 / goal-overview.vue:60-62 — `activeChangeOrders` 重复**
    `status !== 'closed'` 计数两处重复实现，可并入 flow.data.ts 作为共享派生（deriveActiveChangeOrders）。

12. **gates-panel.vue:92-94 — `timeline()` 纯透传包装（Middle Man）**
    模板可直接调用 `deriveChangeOrderTimeline(co)`。

13. **formatTime 三处重复**（gates-panel.vue:82 / merge-train.vue:57 / progress-view.vue:57）—— 既有重复的延续，可提公共 util。

14. **flow.api.ts:53,63 — 类型放宽**
    `kind: string`（core 为 `'sandbox_escalation'` 字面量）、`mode: string`（core 为 `SandboxMode` 联合）。只读容错可接受，建议用联合类型精确化以保持类型对齐验收字面达标。

15. **sessions-live.vue:174-182 — 「预算用尽」用 destructive**
    预算用尽非错误语义，D071 下更接近 warn（amber）级；终态也可辩护。留观项。

16. **路径前缀约定分裂** — flow.api.ts 用 `/api/runs/...`（与 fetchBus 先例一致），picode.api.ts 既有 fetcher 用 `/runs`；实测 ufo `withBase` 对两者均正确（不会双写 /api），纯风格一致性建议。

## 结论

**needs-work（需修改）** — Reviewed-by: code-review（E5 门）

- 阻塞项 2：P0-1 build 不通过（flow.test.ts:183 一行级修复）；P0-2 门禁状态机展示未接线（交付缺口，需与工程主责确认接线或降级）
- 放行条件：P0 清零（含 P0-2 的明确处置结论）；P1-3/4 colspan 同步、P1-5 拓扑语义对齐后复审
- 其余 P2 不阻塞，建议随修复一并处理
- 时间：2026-08-15T17:05Z
