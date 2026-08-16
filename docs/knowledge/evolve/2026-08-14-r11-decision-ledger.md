<!-- 精简批2（2026-08-15）：E 纪要已摘要化——教训/风险去向见 evolve/E1-E15-SUMMARY.md 对应行，细节见 git 历史。 -->
# Evolve run-2026-08-14T07-27-45-654Z

- goal: 并行 run 决策编号冲突修复（全局编号分配器）+ 监督者评估项（宽松，run-lead 自主决策）
- kind: self_evolve · scale: L（run-lead 自主决策，宽松目标）
- baseline: main（12684b9 后；C1/C2 合并后对齐 = b154ca6）
- status: 已完成（C1 reserve 合并 = 4e004c0/2d39b37；C2 decision-lint 合并 = 8460427/a20dbd8；编号对齐修复 = b154ca6；C3 本文档）

## Intent

并行 run 各自向 DECISIONS 追加决策时按「当前最大编号+1」取号会撞号——D084-D089 曾因 skill docs
与 checkpoint docs 并行合并冲突重排，重复编号（D087-089）静默进入 main 无人拦截。product_acceptance
（宽松）：并行 run 决策编号不再冲突（全局分配或区间预留）。

1. 机器状态水位（watermark ledger）全局分配决策编号，杜绝并行撞号（C1）
2. 决策编号完整性机器门禁（decision-lint），把「碰撞/损坏从事后人工平移」变「merge 前拦截」（C2）
3. 规程与文档：catalog §16 决策编号管理 + operations 决策编号规程 + 本 E12 纪要（C3）

## 决策要点（D089 / D090）

- **D089 决策编号全局分配器**（C1 task-decision-reserve）：
  - `docs/decisions/watermark.yaml`（schema v1：`next_number` + `reservations[]`）+ `docs/decisions/reserve.mjs`
  - `--reserve --run <id> --count N` 在 flock 临界区原子领取连续编号段并推进水位；`--land` 标记占用；
    `--status` 只读快照；复用 `@picode/core` `withFileLock`+`writeAtomic`；同 run 重复 reserve 幂等
  - DECISIONS 顶部加水位说明：**勿手改 watermark（机器状态）**，新决策先领号、落地后 land
- **D090 decision-lint 决策编号完整性校验**（C2 task-decision-lint）：
  - `packages/core/src/validate/decision-lint.ts`（镜像 persona-lint 数据优先设计，损坏不抛错，
    返回 `{ok, problems, files}` + CLI）校验六项：表行唯一 / 详条唯一 / 详条↔表行对应 /
    watermark 水位一致 / docs/** 引用可解析（warning）/ reservations 幂等无冲突
  - `--plan <file>` 规划期预检；`index.ts` 导出 + `npm run check` 接线三 lint
- **编号对齐（b154ca6 + 本 C3）**：skill 决策按 catalog/skill-spec/skill-harness/E11 既有引用
  固定为 **D084 harness、D085 skills-ref、D086 打包、D087 skill-creator、D088 allowed-tools**，
  消除 b154ca6 平移产生的「D084=checkpoint 缓项、D085=harness」错位（冗余 checkpoint 缓项并入 D081）；
  D089/D090 留给本 run C1/C2 决策，watermark 水位推进至 91

## Diff（3 chunk + 编号修复 + docs，串行 merge 列车 D036）

- **C1 `task-decision-reserve`**（2d39b37 / 4e004c0）：`docs/decisions/watermark.yaml` +
  `reserve.mjs` + `reserve.test.mjs`（9 用例）+ `docs/DECISIONS.md` 顶部水位说明
- **C2 `task-decision-lint`**（a20dbd8 / 8460427）：`packages/core/src/validate/decision-lint.ts` +
  `decision-lint.test.ts`（全错误码覆盖 + 合法 fixture + `--plan` 预检 + 损坏样本防回归）+
  `index.ts` 导出 + `package.json` check 接线
- **编号修复 `b154ca6`**：DECISIONS 编号修正（D084-089 平移对齐 + D063 补表行），decision-lint 全绿；
  本 C3 再修正：冗余 D084（checkpoint 缓项，已被 D081 覆盖）移除 + skill 决策恢复 D084-D088 对齐 +
  新增 D089/D090
- **C3 `task-decision-docs`（本任务）**：DECISIONS D089/D090 表行 + 详条 + 编号对齐；
  decision-catalog §16 决策编号管理；operations 决策编号规程；watermark 推进至 91（landed）；
  本 E12 纪要

## Verification

- C1：`npm run build` + `npm test` 全绿（429 断言：core 92 / bus 19 / orchestrator 268 /
  pi-extension 17 / mcp 17 / dashboard 16）+ `reserve.test.mjs` 单独 `node --test` 9/9 通过；
  并发 claim 区间不相交（[90,91,92] vs [93,94,95]）、同 run 幂等、land 幂等、损坏文件拒读
  （evidence 见 task-decision-reserve/evidence/）
- C2：`npm run build` + `npm test` 全绿；decision-lint 对修复前损坏 DECISIONS 报 6 error
  （C3 修复后清零）；全错误码单测覆盖 + `--plan` 预检
- C3（本任务）：`node packages/core/dist/validate/decision-lint.js .` 全绿（0 error）——
  表行/详条唯一、详条↔表行对应、水位一致（next_number=91 ≥ max 90）、引用可解析、预留 landed 无冲突

## 剩余风险

- **reserve.mjs 与 decision-lint 预留 schema 不一致（from vs start）**：`reserve.mjs --reserve` 写
  `{run, from, count}`，而 `decision-lint` 只解析 `start`/`count`/`numbers`/`number`——用 reserve.mjs
  领号后直接跑 lint 会报 `WATERMARK_INVALID`（本次 watermark 按 lint 兼容格式 `start/count` 落地）；
  C1/C2 契约需对齐（后续候选 #1，涉及 `docs/decisions/reserve.mjs` + `decision-lint.ts`）
- **reserve.mjs 初始水位硬编码**：`DEFAULT_STATE.next_number=90`（D089 之后）——watermark 文件
  重建/损坏时会回退到 90，低于当前水位（91），后续领号可能与既有 D090 冲突；宜改为从现有
  watermark 恢复或 `--init` 可配（后续候选 #2）
- **docs/** 引用为 warning 级**：过期引用不阻断 merge，历史债需人工清理；新引用仍应指向 DECISIONS
  或预留编号
- **C1/C2 遗留 `--reserve` 未走规划期**：本 run 的 D089/D090 为 bootstrap 落地（watermark 预留直接
  标记 landed），首个按全流程领号的 run 需验证 `--reserve` → 落地 → `--land` → lint 全绿闭环

## 后续候选

1. **C1/C2 预留 schema 对齐（from ↔ start）**：`reserve.mjs` 与 `decision-lint` 统一字段名，
   领号→lint 全链路可闭环
2. **reserve.mjs 水位初始化动态化**：从现有 watermark 读取最大值或 `--init` 显式设定，消除硬编码 90
3. **run-lead 规划流程接入 `--plan` 预检**：规划工具机械调用 `decision-lint --plan`，写 plan 前拦截
   未预留/冲突的 D0xx 引用
4. **docs/** 过期引用清理**：把 warning 级历史债清零（对 D0xx 引用逐一核对 DECISIONS/预留）
