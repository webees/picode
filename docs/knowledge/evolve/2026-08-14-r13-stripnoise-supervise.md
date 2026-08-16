<!-- 精简批2（2026-08-15）：E 纪要已摘要化——教训/风险去向见 evolve/E1-E15-SUMMARY.md 对应行，细节见 git 历史。 -->
# Evolve run-2026-08-14T10-07-06-439Z

- goal: 续跑摘要 ready/re-spawn 收拢 + 监控守护正式化 + 其他 run-lead 评估项（宽松）
- kind: self_evolve · scale: L（run-lead 自主决策，宽松目标）
- baseline: main（b2a0321；C1/C2 合并后 = 本 run 前基线）
- status: 已完成（C1 summary-noise-unify 合并 = ea6982e；C2 supervise-command 合并 = b2a0321；C3 本文档）

## Intent

product_acceptance（宽松）：run-lead 自主决策本轮优化范围（E13 留档候选：摘要收拢/守护正式化/
其他）。决策编号走水位机制（D089/D090）。run-lead 选定的高价值项为：

1. 摘要剔噪口径统一收敛到 `summary-noise.ts`（C1 task-summary-noise-unify）——根治 re-spawn
   （D083 只剔 ready）与 feed/checkpoint（D077/D082 剔 ready+续跑）的口径漂移
2. 监控守护正式化：`picode supervise` 命令 + live tokens 原语上移（C2 task-supervise-command）——
   取代硬编码 dogfood 脚本，无 daemon（D037 不变量延续）
3. 其余 run-lead 评估项归 D094 缓项（feed 映射文档化 / checkpoint 进 status 三面等）

## 决策要点（D092 / D093 / D094）

- **D092 摘要剔噪口径统一**（C1 task-summary-noise-unify）：
  - 新建 `packages/orchestrator/src/summary-noise.ts`（**零 import 零依赖**）收敛
    `READY_MESSAGE_TEXT`/`CONTINUATION_PROMPT`/`CONTINUATION_SUMMARY_HEADER` 常量 +
    导出 `SUMMARY_STRIP_NOISE` 统一剔噪清单（`[READY_MESSAGE_TEXT, CONTINUATION_PROMPT]`）
  - feed（`feedContinuation`）/ checkpoint（`CHECKPOINT_NOISE`）/ re-spawn（`wakeWithOpencode`
    摘要）三处统一消费，剔噪口径单一来源；opencode-adapter/continuation 保留 re-export
    兼容既有引用
  - **re-spawn 行为变更**：`wakeWithOpencode` 摘要由仅剔 ready（D083）改为统一剔 ready+续跑
    模板，与 feed/checkpoint 语义对齐
- **D093 supervise 监控命令正式化**（C2 task-supervise-command）：
  - live tokens 原语（`fetchLiveTokens`/`lastTokenSample`/`serveSessionIdOf`/`stripOcPrefix`）
    自 dashboard-server 上移至 `orchestrator/live.ts`（dashboard-server 改薄壳 re-export）
  - `supervise.ts`：`deriveSuperviseObservation`（statusSnapshot + 每 awake 会话 live tokens +
    worktree `.ts` 计数，纯读、fetchImpl 可注入）+ `isIdleStopped`（total 连续 3 轮零增长，
    **POLL_FAIL 不计入**）
  - CLI：`picode supervise --once`（默认单次 JSON）/ `--interval <sec>` 循环 + STOPPED 退出 /
    `--log` JSONL 追加；命令表注册 + DOMAIN_ORDER
  - **无 daemon（D037）延续**：操作者前台调用，非平台守护
- **D094 缓项留档**：feed 映射文档化 / checkpoint 进 statusSnapshot 三面（E13 候选 1）/
  自动捕获默认开启评估（E13 候选 2）/ 摘要语义化（D080 延续）——未立项不实现，实施须重新
  立项并走 D089 领号

## Diff（2 chunk + docs，串行 merge 列车 D036）

- **C1 `task-summary-noise-unify`**（ea6982e）：`packages/orchestrator/src/summary-noise.ts`（新，
  零依赖常量 + `SUMMARY_STRIP_NOISE`）+ `summary-noise.test.ts`（含零 import 结构校验）+
  `opencode-adapter.ts`/`continuation.ts`/`checkpoint-store.ts` 接线（re-export 兼容）+
  `checkpoint-store.test.ts` 追加 `CHECKPOINT_NOISE === SUMMARY_STRIP_NOISE` 统一口径断言
- **C2 `task-supervise-command`**（b2a0321）：`packages/orchestrator/src/live.ts`（自 dashboard-server
  迁移）+ `live.test.ts`、`supervise.ts` + `supervise.test.ts`、`commands/supervise.ts`、
  `commands/index.ts`（注册 + DOMAIN_ORDER）、dashboard-server `live.ts` 薄壳 + `index.test.ts` 同步
- **C3 `task-supervise-docs`（本任务）**：DECISIONS D092/D093/D094 表行 + 详条；decision-catalog
  §12.8 剔噪口径统一（D092）+ §12.9 checkpoint 内容引用 `SUMMARY_STRIP_NOISE` + §17 监督观测
  （D093）；operations 新增 supervise 命令规程 + 续跑剔噪口径（D092）；watermark 92–94 landed；
  本 E14 纪要

## Verification

- C1：`npm run build` 全量通过；`npm test` 全绿（core 111 / orchestrator 285 / mcp-server 17 /
  dashboard-server 16，0 fail）；tsc 干净；summary-noise 零 import 结构由单测校验
- C2：`npm run build` && `npm test` 全绿（478 断言，orchestrator 298）；`npm run check` 三 lint
  0 error；对真实 run 仓 `--once` 实测输出观测（含本会话 live tokens）
- C3（本任务）：`node packages/core/dist/validate/decision-lint.js .` 全绿（0 error）——
  表行/详条唯一、详条↔表行对应、水位一致（next_number=95 ≥ max 94）、引用可解析、
  预留 landed 无冲突；`reserve.mjs --status` 水位 92–94 landed

## 剩余风险

- **re-spawn 摘要口径变化**：D092 把 re-spawn（`wakeWithOpencode`）摘要由仅剔 ready 升级为
  同剔续跑模板——恢复摘要比 D083 更「干净」，若后续有消费方依赖旧行为需重新评估
- **live tokens 迁移**：dashboard-server `live.ts` 改为薄壳 re-export，若 orchestrator live 契约
  后续变化，dashboard 须跟进（同一实现，消除双份漂移）
- **STOPPED 判定边界**：total=0（全 POLL_FAIL/空观测）不判空闲——serve 失联时 supervise 不会
  自动 STOPPED，需 operator 介入（有意保守）
- **docs/** 引用为 warning 级**：历史债需人工清理（沿用 E12 记录）

## 后续候选

1. **feed 映射文档化**：summary-noise 消费方（feed/re-spawn/checkpoint）剔噪口径映射图鉴文档
2. **checkpoint 进 statusSnapshot 三面**：MVP 仅 CLI 消费面；三面同源需动 status 契约 + mcp-server
3. **自动捕获默认开启评估**：观测价值验证后考虑翻转 `checkpoints.enabled` 默认值（现保守 false）
4. **摘要语义化/关键动作提取**（D080 延续）
