# run-lead 自治规划 — checkpoint 自动捕获接线（guardian_tick 周期 + pre_merge 事件）+ 决策编号机制自验（run-2026-08-14T08-55-08-366Z · self_evolve · scale L · 合并 E 纪要）

> 目标（宽松，run-lead 自主决策）：
> 1. **checkpoint 自动捕获接线**：guardian tick 周期捕获（`boundary: guardian_tick`，限流防抖）+ merge 前事件驱动捕获（`boundary: pre_merge`）——**快照只读、文件为准边界不变**（D082 核心约束）：自动捕获只是**写侧**新增，恢复/续跑/调度/合并仍只读 session.yaml / task.yaml / transcripts / git，checkpoint 绝不反向驱动任何状态决策
> 2. **决策编号机制自验**：本轮 run 用 `reserve.mjs` 领号（watermark 实测）→ 实测已暴露一个真实缺陷（`reserve.mjs` 写 `from`/`count`，`decision-lint` 解析 `start`/`count`，E12 已知风险显形）→ 本轮一并修复对齐
> 3. 既有 429 单测全绿（`npm run build && npm test`）+ `npm run check` 三 lint（persona+skill+decision）通过
>
> 背景：D082 落地 checkpoint MVP 后，E11 纪要缓项「自动捕获接线需先验证手工捕获价值」——本轮即验证+落地；本 run 自身的 guardian 也会自动捕获本 run 任务的 checkpoint（dogfood 实测自动捕获，作为验证载体）。
>
> 依据：`packages/orchestrator/src/checkpoint-store.ts`（captureTaskCheckpoint 已支持 `boundary` 注入，本轮只接线不改原语）、`self-drive.ts` guardianTick（现有确定性 step 序）、`merge.ts` mergeNext（merge.lock 临界区）、`packages/core/src/config.ts`（`self_evolve.continuation` 配置面可类比新增 `self_evolve.checkpoint`）；决策编号自验缺陷见 docs/decisions/reserve.mjs vs packages/core/src/validate/decision-lint.ts（`parseReservationEntry` 仅认 `start`/`count`、`start`/`end`、`numbers[]`）。
> 基线：main = 1b149f9（编号 run 装配脚本后），实测 429 tests。
>
> 编号约定：本 run 决策按水位预留 **D091-D094**（已 `reserve --run run-2026-08-14T08-55-08-366Z --count 4` 实测，见 D092）。

---

## (a) 处置决策清单

### D091 checkpoint 自动捕获接线（guardian_tick 周期 + pre_merge 事件驱动 · 本轮核心 1）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D091-1 | **guardian tick 周期捕获**：guardian 热路径自动写，tick 60s 一轮，若每 tick 每 task 都捕获会写爆 append-only 目录 | **`sweepAutoCheckpoints(dir, config, now)` 周期捕获 + 限流防抖**：遍历 chunks 的非终态 task（跳过 `TERMINAL_TASK_STATUSES`），距该 task 最新 checkpoint `captured_at` 超过 `interval_sec` 才捕获（`latestTaskCheckpoint` 判距，天然防抖；`interval_sec=0` → 每 tick 捕获，须显式声明）；`boundary: "guardian_tick"`；**best-effort 不抛**——单 task 捕获失败仅记 skipped，绝不中断 tick 其余 step | 观测物写侧自动化的最低侵入形态；防抖用既有 checkpoint 文件自身判距（不新增状态文件，D002 文件真相）；失败容错对齐 D082「best-effort 观测物」 |
| D091-2 | **merge 前事件驱动捕获**：merge 是把任务工作合入 main 的关键时刻，此刻快照价值最高（回滚/审计基线） | **`mergeNext` 锁内、`git merge` 执行前 `captureTaskCheckpoint(..., {boundary: "pre_merge"})`**；best-effort——捕获失败记 warn 不阻断 merge（checkpoint 是观测物，绝不让 merge 因观测失败挂起） | 事件驱动补周期捕获盲区（merge 时刻的状态常与 tick 时刻不同）；写入在 merge.lock 临界区内天然串行；只读边界不变（恢复路径零改动） |
| D091-3 | **配置面**：开关/频率需可调，默认值须保守不炸盘 | **`self_evolve.checkpoint.auto_capture`** 新增：`enabled`（默认 **true**，本轮有意行为变更：自动捕获默认开）、`interval_sec`（默认 **300**，guardian 周期捕获最小间隔，非负整数校验，0=每 tick）、`capture_pre_merge`（默认 **true**）；`validateConfig` 校验；默认值注释注明变更 | 与 continuation 配置面同构（`self_evolve.continuation` 先例）；默认开+300s 限流 = 有界低噪，本 run 自身即 dogfood 验证 |
| D091-4 | **边界保持** | 自动捕获**仅写侧**：`guardianTick` 结果扩 `checkpoints` 字段（captured/skipped）供观测；**任何代码路径不得读 checkpoint 驱动状态决策**（恢复/续跑/调度/合并零改动）；`boundary` 字段区分捕获来源（manual/guardian_tick/pre_merge） | D082「快照只读、文件为准」不变量延续；本轮不读、不恢复、不扩 statusSnapshot 顶层 |

### D092 决策编号机制自验（watermark 实测 + reserve.mjs 字段对齐 · 本轮核心 2 处置记录）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D092-1 | **E12 已知风险显形（实测发现）**：`reserve.mjs` 写水位条目 `{run, from, count}`，`decision-lint` `parseReservationEntry` 仅解析 `start`/`count`、`start`/`end`、`numbers[]`——本轮实测 `--reserve` 后 `decision-lint .` 报 `WATERMARK_INVALID: unparseable reservation entry ({"from":91,...})` | **reserve.mjs 字段对齐 `start`/`count`**：写入条目改为 `{run, start, count, status}`；返回对象保持 `from` 兼容（调用方/测试用的 `res.numbers` 不变）；`reserve.test.mjs` 补断言（写入条目含 `start` 且无 `from`）；**修复当前 watermark.yaml 本 run 条目** `from: 91 → start: 91` | 根因 = 两实现字段名不一致（D089 E12 已留档）。对齐到 decision-lint 契约（机器门禁为准），杜绝「脚本写的状态 lint 读不了」的静默漂移 |
| D092-2 | **机制其余自验项** | 本轮全程用官方路径自验：规划前 `reserve` 领号（已实测）、plan 引用预留号（本文件）、C3 落地后 `--land`、`decision-lint --plan <file>` 预检 | D090 机器门禁闭环实测；后续 run 可照抄本 run 流程 |

### 处置：缓 / 拒（本轮不做，留档）

| # | 候选 | 处置 | 理由 |
|---|---|---|---|
| D093 | **checkpoint 进 statusSnapshot 三面**（status/CLI/MCP 同源展示最新 checkpoint 概览） | **缓** | D082 明确「不扩 statusSnapshot 顶层（三面一致性留后续候选）」；自动捕获接线先跑一版验证写入代价后，再评估三面展示契约变更（动 status 契约 + mcp-server）。留档 |
| D094 | **checkpoint 保留/清理策略**（append-only 目录随长 run 无上限累积） | **缓** | 自动捕获（尤其 interval_sec 小/0）会加速目录增长；保留策略（如按 task 保留最近 N 个/压缩）需单独设计，本轮控面不扩。留档 |

---

## (b) chunk 分块建议（3 个；C1/C2 代码并行实现、串行 merge 列车 D036，C3 文档收尾）

### C1 `chunk-checkpoint-auto`（guardian_tick 周期捕获 + merge 前 pre_merge · 代码+测试）

- **write_paths**：
  - `packages/core/src/config.ts`（新增 `SelfEvolveConfig.checkpoint.auto_capture` 类型 + DEFAULTS 默认 `{enabled:true, interval_sec:300, capture_pre_merge:true}` + validateConfig 校验 interval_sec 非负整数/enabled 布尔）
  - `packages/core/src/config.test.ts`（默认值断言 + 校验：interval_sec 负数/非整数拒绝）
  - `packages/orchestrator/src/self-drive.ts`（`sweepAutoCheckpoints(dir, config, now?)`：读 chunks 非终态 task + `latestTaskCheckpoint` 判距 + `captureTaskCheckpoint(..., {boundary:"guardian_tick"})`，best-effort 返回 `{captured, skipped}`；guardianTick 接线：**续跑 sweep 之后、run-close 之前**新增 step；`GuardianTickResult` 扩 `checkpoints` 字段）
  - `packages/orchestrator/src/merge.ts`（mergeNext 锁内、E4 verify 后、`git merge` 执行前，`captureTaskCheckpoint(dir, req.task_id, {boundary:"pre_merge"})`，try/catch best-effort）
  - `packages/orchestrator/src/self-drive.test.ts`（sweep：非终态捕获/终态跳过/interval 防抖/0=每 tick/disabled 不捕获/失败不抛；guardianTick 接线：结果含 checkpoints 字段）
  - `packages/orchestrator/src/merge.test.ts`（pre_merge：merge 前落盘 boundary=pre_merge；捕获失败不阻断 merge）
- **read_paths**：`checkpoint-store.ts`（captureTaskCheckpoint/latestTaskCheckpoint/TERMINAL 语义）、`continuation.ts`（TERMINAL_TASK_STATUSES）、`run-store.ts`（readChunks/readTask 模式）、`config.ts`（self_evolve 现有段）、`merge.ts` 既有结构
- **public_contract**：`self_evolve.checkpoint.auto_capture` 三个配置键；`GuardianTickResult.checkpoints`；merge 前自动落 `boundary: pre_merge` checkpoint；**读侧零改动**
- **depends_on**：无
- **验收口径**：
  - C1-a `command`：`npm run build && npm test` 全绿（既有 429 无回归）
  - C1-b 单测：sweep 仅捕获非终态 task；两次调用（now 未过 interval）第二次 skipped；`interval_sec=0` 每 tick 捕获；`enabled=false` 零捕获；task 缺失/捕获失败不抛
  - C1-c 单测：guardianTick 结果 `checkpoints` 含 captured/skipped；mergeNext 对 merged 任务落 `pre_merge` checkpoint（boundary 断言），capture 抛错时 merge 仍成功
  - C1-d 核查：`git diff --name-only base...HEAD ⊆ write_paths`（P07 门禁）；未触碰 checkpoint-store.ts 原语 / statusSnapshot / mcp-server
- **P07 门禁**：diff 仅 `packages/core/src/config.ts` + `config.test.ts` + `packages/orchestrator/src/{self-drive,merge}.ts` + 对应 test

### C2 `chunk-decision-reserve-schema`（reserve.mjs 字段对齐 · 代码+测试）

- **write_paths**：
  - `docs/decisions/reserve.mjs`（写入条目 `{run, from, count}` → `{run, start, count}`；返回对象保留 `from` 兼容 + 新增 `start`）
  - `docs/decisions/reserve.test.mjs`（补：写入条目含 `start` 无 `from`；现有断言不回归）
  - `docs/decisions/watermark.yaml`（本 run 预留条目 `from: 91 → start: 91`，保持 `count: 4` + `status: reserved`）
- **read_paths**：`packages/core/src/validate/decision-lint.ts`（parseReservationEntry 契约）、既有 watermark 结构
- **public_contract**：watermark 条目字段与 decision-lint 解析一致（`start`/`count`）；reserve 返回兼容旧调用方
- **depends_on**：无（与 C1 并行；字段不同文件）
- **验收口径**：
  - C2-a `command`：`node docs/decisions/reserve.test.mjs` 全绿 + `node packages/core/dist/validate/decision-lint.js .` 零 `WATERMARK_INVALID`（修复后）
  - C2-b 核查：watermark.yaml 本 run 条目为 `start: 91, count: 4, status: reserved`
  - C2-c 核查：diff ⊆ write_paths（P07）
- **P07 门禁**：diff 仅 `docs/decisions/{reserve.mjs,reserve.test.mjs,watermark.yaml}`

### C3 `chunk-checkpoint-docs`（DECISIONS + catalog + operations + 知识归档 · docs 层）

- **write_paths**：
  - `docs/DECISIONS.md`（本 run 决策 D091（自动捕获接线）+ D092（编号机制自验/字段对齐处置）+ D093/D094 缓项行；D082 详条「MVP 仅显式捕获」更新为「自动捕获已接线」并在缓项段移除「自动捕获接线」条目）
  - `docs/reference/decision-catalog.md`（§12.9 表格：`boundary` 枚举补 `guardian_tick`/`pre_merge`；「checkpoint 自动捕获」行从缓项改为已定（D091）并注明配置键）
  - `docs/guides/operations.md`（决策编号规程补 `start`/`count` 字段说明 + `--plan` 预检提示；checkpoint 小节补自动捕获：配置键、boundary 枚举、防抖语义、merge 前捕获）
  - `docs/knowledge/evolve/run-2026-08-14T08-55-08-366Z.md`（E12 纪要：D091/D092 diff/验证/剩余风险/后续候选 + 编号机制自验实测记录 + D092-1 缺陷修复对照）
  - `docs/plans/2026-08-14-r12-checkpoint-auto.md`（本规划，已含）
- **read_paths**：C1/C2 产出、DECISIONS 现状、catalog §12.9、operations 现有 checkpoint 节、D082/D083 详条
- **depends_on**：C1、C2（机制落地才写得准；`npm run check` 三 lint 在 C2+C3 齐后全绿）
- **验收口径**：
  - C3-a `command`：`npm run build && npm test` 全绿 + `npm run check` 三 lint 通过（decision-lint 零 error）
  - C3-b 核查：DECISIONS 含 D091（详条+表行）、D092（处置记录）、D093/D094（缓项行）；无重复编号、表↔详条对齐
  - C3-c `command`：`node docs/decisions/reserve.mjs --land --run run-2026-08-14T08-55-08-366Z`（C3 收尾标记占用）+ `node packages/core/dist/validate/decision-lint.js .` 零 error
  - C3-d 核查：E12 纪要含 D092-1 缺陷实测证据 + 修复对照；catalog §12.9 与 operations 更新
  - C3-e 核查：D082 详条更新为「自动捕获已接线」，移除「自动捕获接线」缓项行

**编排**：C1（checkpoint 自动捕获）与 C2（reserve 字段对齐）文件无重叠，可并行实现、串行 merge（D036）；C3（docs）在 C1/C2 合并后收尾。E4 gate：代码层显式 `npm run build && npm test`；merge_ready 强制唤醒 code-review（E5，code 层 MUST）。C2 修复后决策门禁全绿（`decision-lint` 无 WATERMARK_INVALID）；C3 land 后 reservations 标记 landed。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 D091–D094） | run-lead（本会话） | 已产出；编号已 reserve 实测（D092 载体） |
| C1 checkpoint-auto | **三角 A**（squad-lead/engineer/sdet，真招聘） | config 键 + sweepAutoCheckpoints + guardianTick 接线 + mergeNext pre_merge；engineer 主实现，sdet 验证防抖/失败容错/boundary 断言 |
| C2 decision-reserve-schema | **三角 B**（squad-lead/engineer/sdet，真招聘，小任务） | reserve.mjs `start`/`count` 对齐 + watermark 条目修复 + 测试；sdet 验证 decision-lint 零 WATERMARK_INVALID |
| C3 checkpoint-docs | **文档小组**（docs-lead/tech-writer/docs-qa） | DECISIONS D091-D094 + catalog §12.9 + operations + E12 纪要 + `--land` 收尾 |
| 评审 | code-review（E5 code 层 MUST） | C1/C2 merge_ready 机械唤醒 |

人员调度：C1/C2 各一三角经标准 staffing 真招聘（D025/D030），可并行开工；C3 文档小组在 C1/C2 合并后收尾。改动集中在 `packages/core/src/config.ts` + `packages/orchestrator/src/{self-drive,merge}.ts` + `docs/decisions/` + docs 层，**不触碰** checkpoint-store.ts 原语 / statusSnapshot / mcp-server / bus / dashboard / 规则表。

---

## (d) 后续候选（本轮不做，留档）

1. **checkpoint 进 statusSnapshot 三面（D093）**：status/CLI/MCP 同源展示最新 checkpoint 概览；需动 status 契约 + mcp-server，先经本轮自动捕获验证写入代价
2. **checkpoint 保留/清理策略（D094）**：append-only 目录随长 run 累积，需 retention 设计（按 task 保留 N 个/压缩）
3. **从 checkpoint 恢复/回滚（远期，D082 拒项延续）**：恢复目标仍为文件真相（git/文件备份），checkpoint 仅作回滚前对照基线
4. **maxTokens 真计量**：待 serve token 契约（D058）就绪

---

## 本轮验证载体

无人干预下由 self-drive guardian 推进（三角会话 ready → 自主实现 → 续跑 → 自测 → evidence/handoff → 串行 merge）。
验收判定：C1/C2 代码任务合并入 main（acceptance 1/2 达成——自动捕获接线 + 编号机制字段对齐），C3 文档合并（acceptance 3/4 达成——DECISIONS canonical + 既有单测全绿 + `npm run check` 三 lint 通过 + `--land` 完成），E12 纪要归档。**额外 dogfood**：本 run 自身任务的 guardian 会自动产生 `boundary: guardian_tick`/`pre_merge` checkpoint（证据链），即自动捕获的首次真实运行验证。

---

## 合并 E 纪要（2026-08-15 精简 · evolve/2026-08-14-r12-checkpoint-auto.md 增量并入）

> 原 plans（决策 D091-D094 / chunk 分块 / 验收 / (d) 后续候选）与 evolve（决策要点 D091 / Diff /
> 验证 / 剩余风险 / 后续候选）双写重复已去重，本计划为主干（决策/验收/编排/(d) 候选）。evolve 后续
> 候选 #1（status 三面）与计划 (d) #1 相同、#2（自动捕获默认开启）已被后续 run（D096，r14）落地、
> #3（docs 引用清理）为独有增量——合并节仅补 #3 与剩余风险。evolve 原文细节见 git 历史。

### 执行结果（merge commit 列表）

- **C1 `task-checkpoint-auto` = 7860df0**：`packages/core/src/config.ts`（CheckpointCaptureConfig + 校验 + DEFAULTS）、`packages/orchestrator/src/checkpoint-store.ts`（GUARDIAN/PRE_MERGE 边界 + guardianCaptureDue + captureDueGuardianCheckpoints）、`self-drive.ts`（guardianTick 接线）、`merge.ts`（mergeNext 前捕获）+ 对应测试（config/checkpoint-store/merge/self-drive）
- **C2 `task-decision-reserve-schema` = 3b99888**：`docs/decisions/reserve.mjs`（from→start + --plan 预检）+ `reserve.test.mjs`（12 用例）
- **C3 `task-ckauto-docs`（本任务）**：DECISIONS D091 表行 + 详条；catalog §12.9 自动捕获配置 + boundary 语义；operations 会话 checkpoint 自动捕获 + 决策编号规程；watermark 91 landed；本 E13 纪要

### 验证终态

- C1：`npm run build` + `npm test` 全绿（**445 断言**：core 111 / orchestrator 282），tsc -b 干净；D082 快照只读边界由 sdet 独立审计 PASS（checkpoint 仅写不读）
- C2：`npm run build` + `npm test` 445 断言全绿；`reserve.test.mjs` 12/12；`npm run check` 三 lint 全绿
- C3：`node packages/core/dist/validate/decision-lint.js .` 全绿（0 error）——表行/详条唯一、详条↔表行对应、水位一致（next_number=92 ≥ max 91）、引用可解析、预留 landed 无冲突
- 验收判定：acceptance 1–4 全满足（自动捕获接线 + 编号字段对齐 + DECISIONS canonical + 既有单测全绿 + --land）

### 剩余风险（evolve 纪要原文 · 下轮输入）

- **自动捕获默认关闭**：`self_evolve.checkpoints.enabled` 默认 false——开启后才有 guardian 周期 + merge 前捕获；显式捕获（D082）行为始终不变（注：D096 于 r14 已翻转默认 true）
- **guardian 周期捕获节流语义**：仅按「距上次 guardian 捕获」节流；手动 `capture` 不重置该时钟（boundary 不同，各自独立）；高频 tick（guardian_interval_sec=0）会每 tick 捕获——观测成本自担
- **merge 前捕获 best-effort**：捕获异常被 try/catch 吞掉，绝不阻断 merge——极端情况下 merge 落地的那个时点可能没有 pre_merge 快照（观测物，不影响 merge 正确性）
- **docs/** 引用为 warning 级**：历史债需人工清理（沿用 E12 记录）

### 后续候选增量（evolve 纪要 · 计划 (d) 未覆盖项）

- **docs/ 过期引用清理**：把 warning 级历史债清零（对 D0xx 引用逐一核对 DECISIONS/预留）——后续候选 #3（#1 status 三面见计划 (d) #1；#2 自动捕获默认开启已由 D096 落地）
