<!-- 已合并至 plans/2026-08-13-r4-dashboard.md（2026-08-15 精简 · 批 2）：决策 D070 / chunk 分块 / 验证数字以 plans 为主干，本纪要的剩余风险/后续候选已并入 plans 合并节；细节见 git 历史。 -->

# Evolve run-2026-08-13T12-16-26-548Z

- goal: picode 监控面板（Dashboard）
- kind: delivery · scale: L
- baseline: main（16ced37 规划 commit 后）
- status: 已完成（C1/C2/C3 已合并，C4 文档收尾）

## Intent

sponsor 指令：基于 shadcn-vue-admin 技术栈的监控面板，直观展示 run 工作细节
（goal/chunks/任务/会话+tokens 活跃度/merge 列车/门禁 evidence·E4），数据源为
`.picode/runs` YAML + opencode serve API，可本地运行并接入真实 run 数据。
四 product_acceptance：技术栈（Vue3+Vite+TS+shadcn-vue）/ 直观展示 run 细节 /
数据源 = YAML + serve / 可本地运行接真实 run。
决策清单：docs/plans/2026-08-13-r4-dashboard.md（(a) 决策 D1–D10）。

## 决策要点（D070）

- **D070 面板架构**：
  - 两包分置 monorepo：`packages/dashboard`（前端 UI）+ `packages/dashboard-server`（只读 HTTP）
  - 包管理器分离：server = npm workspace 成员（tsc，进根 build/test）；前端 = 自包含 pnpm 项目（vendor 模板），根 `workspaces` 显式五包+server 排除前端；E4 对前端 `pnpm -C packages/dashboard build`
  - 无 daemon 只读：全部 GET、无写、无锁；复用 orchestrator 纯读投影（statusSnapshot/buildBoard/readMergeQueue/readProgress/readGoal），面板 = 薄 HTTP 包装
  - 9 端点投影复用 + serve tokens 代理（`oc-` 剥离，D044；ERR-01 5s 超时降级 `{error}`）
  - 联调：Vite proxy `/api` → 8788 + CORS 兜底；tanstack/vue-query 轮询（无 WebSocket/SSE）
  - 非目标：无写操作、无鉴权、无部署打包（第二轮）

## Diff（4 chunk，串行 merge 列车 D036）

- **C1 `merge task-dashboard-server` = 1af542e**（feature e7caf20，9 文件 +878/−5）：`packages/dashboard-server/`（新包：`src/index.ts` 启动入口 `--repo/--port`、`src/router.ts` 9 只读端点、`src/live.ts` serve tokens 代理 `fetchLiveTokens`/`stripOcPrefix`/`lastTokenSample`、`index.test.ts` 379 行单测）；根 `package.json` workspaces 显式六包 + build/test/typecheck 接 `-w @picode/dashboard-server`；根 `tsconfig.json` references + dashboard-server tsconfig
- **C2 `merge task-dashboard-scaffold` = 7cd3aa5**（feature d8b2284，538 文件 +24849）：`packages/dashboard/` vendor 模板裁剪为 `@picode/dashboard`（保留 pnpm-workspace/pnpm-lock/vite/tsconfig/ui 组件库）；删除演示页（auth/marketing/apps/users/tasks/ai-talk/prop-components/billing/help-center/errors/settings）；navData 替换为 picode 分区（Dashboard/Runs/运行中/合并列车/门禁）；vite proxy `/api` → 127.0.0.1:8788；骨架页 `/dashboard` + `/dashboard/runs/[runId]`（六 tab 占位）；移除 simple-git-hooks postinstall
- **C3 `merge task-dashboard-pages` = 54ff3b9**（feature 308864c，10 文件 +1328/−30）：`packages/dashboard/src/services/api/picode.api.ts`（9 个 vue-query hooks——useRuns/useRun/useBoard/useChunks/useTasks/useSessions/useMerge/useGates/useLiveTokens，类型与 dashboard-server 9 端点契约一一对应）；`pages/dashboard/index.vue`（run 列表卡片：status/scale/kind/验收数/创建时间，点击进详情）；`runs/[runId]/index.vue`（tabs 布局：概览/chunks/看板/会话+tokens/merge/门禁）；6 面板组件（goal-overview 含 goal+snapshot 统计、chunks-table、tasks-board 7 列看板复用 `BOARD_COLUMNS`、sessions-live 会话表+实时 tokens 轮询 3s、merge-train 队列+计数、gates-panel 门禁文件+evidence）；异常降级 Alert 不白屏、空态 Empty 组件
- **C4 `chunk-dashboard-docs`（本任务）**：DECISIONS D070 + decision-catalog §13 面板节 + operations.md 面板运维 + README Dashboard 章节 + 本 E6 纪要

## Verification

- C1：`npm run build && npm test` 全绿（362 tests，含 dashboard-server 单测）；单测覆盖 9 端点（真实 dogfood run fixture：`/api/runs` 返回 run id、`/api/runs/:id` 含 goal.status/sessions/merge_queue 计数、board 复用 buildBoard 7 列、tasks 含 brief/staffing latch + evidence、live mock fetch → `{tokens}`、serve 超时/非 200 → `{error}` 进程不崩）；curl 冒烟 `localhost:8788/api/runs` 200 且真实 serve 在线时 tokens 非空
- C2：`pnpm install && pnpm build`（vue-tsc+vite）通过；`pnpm dev` 冒烟 5173 出壳、侧边栏 picode 分区可导航；演示页目录已从 src/pages 移除；`pnpm lint` + `pnpm test`（25 通过）
- C3：`cd packages/dashboard && pnpm build`（vue-tsc + vite）通过、`pnpm lint`（eslint）零告警；C4 复查实测 build 1.58s 出包、lint 静默通过（D070 前端 E4 显式验收口径）
- C4（本任务）：`npm run build && npm test` 全绿（文档不破坏构建）；DECISIONS 含 D070；decision-catalog §13 面板节；operations.md 含起 server + 前端的完整命令；`npm run check`（persona-lint）通过

## 剩余风险

- **前端依赖重型**：`packages/dashboard` 自带 7.5k 行 pnpm-lock 与整套 shadcn-vue ui 组件库，构建面大；已隔离于根 npm 之外（D070 包管理器分离），根 gate 不受影响，但面板自身 `pnpm install/build` 耗时长
- **tokens 依赖 serve 在线**：serve 失联/无 `pi_session_id` 会话 → tokens 列为空（`{error}` 降级不白屏）；实时活跃度是「尽力而为」展示，非文件真相（D002）
- **只读边界靠自觉**：面板服务无鉴权、面向 localhost；若误暴露公网，只读端点可泄露 run 元数据（无 token 内容，但含任务/goal 摘要）——运维须保证不对外暴露（本轮非目标，第二轮补鉴权）
- **代理 serve 契约漂移**：live 端点依赖 opencode serve `GET /session/{id}/message` 的 `info.tokens` 形状（D058 实测），上游变更需同步（有界超时 + 非数组/无 tokens 均降级，不硬崩）
- **tokens 实时页 = 尽力而为**：sessions-live 3s 轮询依赖 serve 在线且会话已挂 `oc-` serve 会话（D044）；serve 失联/未挂载 → 降级 Alert（`{ok:false}`），非文件真相（D002），不阻塞其余只读面板
- **看板列语义为前端常量**：tasks-board 复用 `BOARD_COLUMNS`（C1 导出），列名变更需同步 dashboard-server 导出与前端——已有单测守护 server 面，前端构建守护类型，跨包语义未做机械化一致性校验

## 后续候选

1. **面板鉴权与部署**：非目标（D070）首项；本地外使用时需加 token/绑定 localhost
2. **多 run 聚合**：当前一次一个 run；聚合视图（历史 run 对比）列第二轮
3. **写面扩展**：第二轮评估是否加 sponsor 操作（受 D018/D035 边界约束）
