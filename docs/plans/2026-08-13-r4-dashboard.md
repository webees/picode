# run-lead 自治规划 — picode 监控面板（Dashboard）（run-2026-08-13T12-16-26-548Z · delivery · scale L）

> 目标（product_acceptance，sponsor 投喂 + pm 确认）：
> 1. 基于 shadcn-vue-admin 技术栈（Vue3+Vite+TS+shadcn-vue）的监控面板
> 2. 直观展示 run 工作细节（goal/chunks/任务/会话/tokens 活跃度/merge 列车/门禁 evidence·E4）
> 3. 数据源为 `.picode/runs` YAML + opencode serve API（实时活跃度）
> 4. 可本地运行并接入真实 run 数据
>
> 技术参考（已 clone）：`/private/tmp/shadcn-vue-admin`（Vue3+Vite+TS+Tailwind+shadcn-vue+
> vue-router 文件路由+pinia+tanstack vue-query/pnpm workspace）。
> 数据现状（实测）：当前 run 本体位于 dogfood 克隆 `/private/tmp/picode-dogfood`，
> runs_root=`/private/tmp/picode-dogfood/.picode/runs/run-2026-08-13T12-16-26-548Z/`；
> opencode serve `127.0.0.1:7788` 可用，`GET /session/{serveId}/message` 返回
> `info.tokens.{total,input,output}` + `time.created`（实时活跃度契约，D058 实测）。

---

## (a) 决策清单（技术选型 / 架构 / 范围）

| # | 问题 | 处置（决定） | 理由 |
|---|---|---|---|
| D1 | **面板包布局** | **两包分置主仓 monorepo**：`packages/dashboard`（前端 UI）+ `packages/dashboard-server`（后端只读 HTTP）。不合并单包 | 职责分离：前端依赖重（vue/vite/tailwind/shadcn），后端零 UI 依赖、可独立 build/test；后端复用 orchestrator 只读投影，耦合低、可单测。sponsor 明确「UI 放主仓 packages/dashboard（monorepo 内），后端 packages/dashboard-server（或合并）」 |
| D2 | **包管理器（npm vs pnpm）** | **dashboard-server 为 npm workspace 成员**（沿用主仓 npm+package-lock，`tsc` 构建，进根 build/test）；**dashboard 前端为自包含 pnpm 项目**（vendor 模板，保留其 pnpm-workspace.yaml/pnpm-lock），**从根 `workspaces` 显式排除**（根 workspaces 改为显式列表） | 主仓现为 npm workspace（`package-lock.json`，E4 gate=`npm run build && npm test` 由 merge 机械执行）。若把前端并入 npm 根安装，vue-tsc 需 TS6.0.3 而主仓 TS5.8.2，根 build/测试被重型前端依赖拖慢且冲突风险高。模板自带 pnpm workspace（sponsor 提示）→ 前端独立 pnpm，根 npm 不触碰；npm 不支持 `!` 排除，故根 `workspaces` 从 `packages/*` 改显式五包+server。E4 对前端 chunk 改用 `pnpm -C packages/dashboard build` 显式验收 |
| D3 | **后端形态** | **轻量只读 HTTP 服务（`node:http`，零新运行时依赖）**：读 `.picode/runs` YAML 投影 + 代理 serve `/session/{id}/message` 取 `info.tokens.total` | 遵守不变量：**无 daemon/常驻编排**（sys-arch 不变量，D002/D057），面板只读不改状态、不持锁。零框架依赖避免包膨胀；复用 orchestrator 纯读函数即得全部投影 |
| D4 | **数据投影复用** | **直接 import `@picode/orchestrator` 只读导出**：`statusSnapshot(dir,config)`（goal/sessions/tasks/merge_queue/continuation 遥测）、`buildBoard(dir)`（看板卡片 7 列）、`readMergeQueue(dir)`、`readProgress(dir,taskId)`、`readGoal`；`@picode/core`：`loadConfig`/`readYamlFile`/`runDir` | 这些已是 D039 纯读投影（无写无锁），面板 = 薄 HTTP 包装，避免第二份解析逻辑（知识重复最小化）。serve 会话 id = session.yaml 的 `pi_session_id` 去 `oc-` 前缀（D044） |
| D5 | **前后端联调** | Vite dev 用 **proxy `/api` → dashboard-server**（免 CORS）；dashboard-server 也开 CORS 兜底。前端通过 **tanstack/vue-query** 轮询（tokens 实时页 `refetchInterval` 2–5s），不做 WebSocket/SSE | 面板是本地只读工具，轮询足够；serve 无推送契约（D058 为单条 JSON），轮询最稳 |
| D6 | **前端页面范围（vue-router 文件路由）** | 页面：`/dashboard`（run 列表）、`/dashboard/runs/[runId]`（详情，tabs：概览 goal / chunks / 任务看板 / 会话+tokens 实时 / merge 列车 / 门禁 evidence·E4）。**删除模板演示页**（auth/marketing/apps/users/tasks/ai-talk/prop-components/billing/help-center/errors/settings 演示内容），保留布局/侧边栏/主题/文件路由/ui 组件库 | 直接命中 acceptance 2「直观展示 run 工作细节」；裁剪演示页控制范围（scale L 但重 UI 集成）。侧边栏 navData 替换为 picode 分区 |
| D7 | **后端路由面（只读 JSON）** | `GET /api/runs`（列 run）；`GET /api/runs/:id`（goal+run.yaml+statusSnapshot）；`/api/runs/:id/board`（看板）；`/api/runs/:id/chunks`；`/api/runs/:id/tasks`（含 brief/staffing latch+progress+evidence）；`/api/runs/:id/sessions`（含 continuation 遥测）；`/api/runs/:id/merge`；`/api/runs/:id/gates`（gates/ + tasks/*/evidence）；`/api/live/:runId/:agent`（代理 serve `GET /session/{id}/message` → tokens） | 全覆盖 acceptance 2 各维度；全部 GET 只读、无副作用；复用 D4 投影，server 代码 ~200 行级 |
| D8 | **运行方式** | dashboard-server：`npm run dev -w @picode/dashboard-server`（或 `node dist/index.js --repo <path>`，`--repo` 默认 cwd，读 `.picode/config.yaml` 的 `runs_root` 与 `opencode.base_url`）；dashboard 前端：`cd packages/dashboard && pnpm dev`（Vite 5173） | 命中 acceptance 4「可本地运行并接入真实 run 数据」；`--repo` 让面板可指向 dogfood 克隆等任意真实 run 仓 |
| D9 | **非目标（范围外）** | 不做写操作（无 POST 编排/唤醒/合并按钮）；不做鉴权（本地 localhost 工具）；不做部署打包/可视化图表库重集成（用模板既有 chart 能力即可）；不做多 run 聚合分析 | 只读监控面板，符合「不引入 daemon 编排逻辑」；鉴权/写面列第二轮 |
| D10 | **文档与决策归档** | 新增 DECISIONS **D070**；decision-catalog 增「监控面板」节；`docs/guides/operations.md` 增面板运行规程；README 增面板章节；E6 纪要 `docs/knowledge/evolve/run-2026-08-13T12-16-26-548Z.md` | 决策门禁 + 运维面完整（前轮惯例）；「可本地运行」需要文档支撑 |

**总纲**：面板 = `packages/dashboard-server`（薄只读 HTTP，复用 orchestrator 投影 + 代理 serve）+ `packages/dashboard`（vendor 模板裁剪，文件路由 + tanstack 轮询）。数据源只读、无 daemon、无写、无锁。E4 gate 对前端显式 pnpm 验收，后端并入 npm 根 build/test。

---

## (b) chunk 分块建议（4 个，串行 merge 列车 D036，C3 依赖 C1/C2）

### C1 `chunk-dashboard-server`（后端只读服务 · 代码层）

- **write_paths**：
  - `packages/dashboard-server/package.json`（`@picode/dashboard-server`，`"main":"./dist/index.js"`，依赖 `@picode/core`+`@picode/orchestrator`）
  - `packages/dashboard-server/tsconfig.json`（extends `../../tsconfig.base.json`，composite）
  - `packages/dashboard-server/src/index.ts`（`node:http` 启动；`--repo` 默认 cwd；读 `.picode/config.yaml`）
  - `packages/dashboard-server/src/router.ts`（只读路由分派，D7 九端点）
  - `packages/dashboard-server/src/live.ts`（代理 serve：`GET {base_url}/session/{id}/message` → 抽 `info.tokens.total`；`oc-` 前缀剥离）
  - `packages/dashboard-server/src/index.test.ts`（node --test）
  - `package.json`（根：`workspaces` 改显式五包+`packages/dashboard-server`；`build`/`test`/`typecheck` 加 `-w @picode/dashboard-server`）
  - `tsconfig.json`（根 references 加 dashboard-server）
- **read_paths**：`packages/orchestrator/src/status.ts`、`board.ts`、`merge.ts`、`progress.ts`（只读，不改）；`@picode/core` 导出
- **public_contract**：`GET /api/runs`、`/api/runs/:id`、`/api/runs/:id/{board,chunks,tasks,sessions,merge,gates}`、`/api/live/:runId/:agent` → JSON；`--repo` 定位 runs_root；serve 失联返回 `{error}` 而非 5xx 挂死（ERR-01 有界超时）
- **depends_on**：无
- **验收口径**：
  - C1-a `command`：`npm run build && npm test` 全绿（含 dashboard-server 单测）
  - C1-b 单测：`GET /api/runs` 返回真实 dogfood run id（`--repo /private/tmp/picode-dogfood`）；`/api/runs/:id` 含 goal.status + sessions + merge_queue 计数
  - C1-c 单测：`/api/runs/:id/board` 复用 `buildBoard` 7 列卡片；`/api/runs/:id/tasks` 含 brief/staffing latch 与 evidence
  - C1-d 单测：`/api/live/:runId/:agent` mock fetch → 返回 `{tokens}`；serve 超时/非 200 → 返回 `{error}`，进程不崩
  - C1-e `command`：`curl -s localhost:8788/api/runs` 冒烟 200（真实 serve 在线则 tokens 非空）

### C2 `chunk-dashboard-scaffold`（前端脚手架 · 代码层）

- **write_paths**：
  - `packages/dashboard/**`（vendor `/private/tmp/shadcn-vue-admin`：package.json 改名 `@picode/dashboard`、保留 pnpm-workspace.yaml+pnpm-lock、engines node>=22.15；保留 vite.config.ts/tsconfig.app+node/components.json/src/assets；**删除**演示页 auth/marketing/apps/users/tasks/ai-talk/prop-components/billing/help-center/errors/settings 演示内容）
  - `packages/dashboard/src/constants/sidebar-data.ts`（navData 替换为 picode 分区：Dashboard/Runs/运行中/合并列车/门禁）
  - `packages/dashboard/vite.config.ts`（dev proxy `/api` → `http://127.0.0.1:8788`）
  - `packages/dashboard/src/pages/dashboard/index.vue`（run 列表骨架）+ `src/pages/dashboard/runs/[runId]/index.vue`（详情 tabs 骨架，各 tab 占位组件）
- **read_paths**：模板源（只读参考）；`packages/dashboard-server`（API 契约，改 C1 后）
- **public_contract**：前端可 `pnpm dev` 起 5173 并经 proxy 达 server；文件路由 `/dashboard` 与 `/dashboard/runs/:id` 可导航；演示页清理后 `pnpm build` 通过
- **depends_on**：无（可与 C1 并行；C1 契约先行约定即可）
- **验收口径**：
  - C2-a `command`：`cd packages/dashboard && pnpm install && pnpm build` 通过（vue-tsc + vite）
  - C2-b `command`：`pnpm dev` 冒烟 5173 出壳，侧边栏为 picode 分区、页面可导航
  - C2-c 人工/机械核查：演示页目录（auth/marketing/apps/users/tasks 等）已从 `src/pages` 移除
  - C2-d `command`：`pnpm lint` 通过（保留模板 eslint 配置）

### C3 `chunk-dashboard-pages`（前端页面实现 · 代码层）

- **write_paths**：
  - `packages/dashboard/src/services/api/picode.api.ts`（tanstack/vue-query hooks：useRuns/useRun/useBoard/useChunks/useTasks/useSessions/useMerge/useGates/useLiveTokens，tokens 页 `refetchInterval`）
  - `packages/dashboard/src/pages/dashboard/index.vue`（run 列表卡片：run_id/status/created/目标摘要）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/index.vue`（tabs 布局）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/{goal-overview,chunks-table,tasks-board,sessions-live,merge-train,gates-panel}.vue`（6 面板，命中 acceptance 2）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/tasks-board.data.ts`（看板列复用 `BOARD_COLUMNS` 7 列语义）
- **read_paths**：C1 API 契约、C2 骨架、`packages/orchestrator/src/board.ts`（列语义只读参考）
- **public_contract**：接入真实 dogfood run 数据渲染各面板；tokens 页轮询展示活跃度；异常（server 未启/serve 失联）显示降级提示不白屏
- **depends_on**：C1（API）、C2（骨架）
- **验收口径**：
  - C3-a `command`：`cd packages/dashboard && pnpm build && pnpm lint` 通过
  - C3-b 人工/机械核查：对当前 run（run-2026-08-13T12-16-26-548Z）跑 `pnpm dev`，goal 概览显示 status=active/scale=L、chunks 表显示空数组、sessions 表显示 17 个平台席、tokens 页显示 serve 返回的实时 tokens（serve 在线）
  - C3-c 人工：merge 列车/门禁面板对真实 run 渲染（当前 run 无 merge 记录→显示空态提示，符合只读语义）

### C4 `chunk-dashboard-docs`（知识沉淀 · docs 层）

- **write_paths**：
  - `docs/DECISIONS.md`（新增 **D070**：面板架构决策，含 D2 包管理器分离、D3 无 daemon 只读、D4 投影复用、D7 路由面）
  - `docs/reference/decision-catalog.md`（增「监控面板」节：运行方式/端点/数据源）
  - `docs/guides/operations.md`（面板运维规程：如何起 server、如何起前端、`--repo` 指向任意 run、如何观察 tokens 活跃度）
  - `README.md`（增 Dashboard 章节：前置 node>=22.15/pnpm、安装与运行、截图占位）
  - `docs/knowledge/evolve/run-2026-08-13T12-16-26-548Z.md`（E6 纪要：意图/diff/验证/剩余风险）
- **read_paths**：C1–C3 产出、模板 README、spec/13 配置
- **depends_on**：C1–C3（机制落地才写得准）
- **验收口径**：
  - C4-a `command`：`npm run build && npm test` 全绿（文档不破坏构建）
  - C4-b 人工/机械核查：DECISIONS 含 D070；decision-catalog 含面板节；operations.md 含起 server+前端的完整命令
  - C4-c `command`：`npm run check`（persona-lint）通过
  - C4-d 机械核查：按 operations.md 命令可在本地起面板并接入当前真实 run（acceptance 4 最终闭环）

**编排顺序**：C1 → C2（可与 C1 并行，写集互斥，列车稳定取串行）→ C3（依赖 C1/C2）→ C4（收尾）。全程串行 merge（D036），E4 gate 后端=`npm run build && npm test`、前端 chunk 显式 `cd packages/dashboard && pnpm build`；E5 code 层 merge_ready 强制唤醒 code-review（goal 含 code 层）。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 C0/D1–D10） | run-lead（本会话） | 已产出 |
| C1 dashboard-server | **三角 A**（squad-lead/engineer/sdet，真招聘） | 只读 HTTP + 投影复用 + serve 代理 + 根 workspace 接线；engineer 主实现，sdet 验证命令（含 curl 冒烟） |
| C2 dashboard-scaffold | **三角 B**（squad-lead/engineer/sdet，真招聘） | vendor 模板 + 裁剪演示页 + proxy + 骨架页；写集与 C1 互斥可并行，列车取串行 |
| C3 dashboard-pages | **三角 C**（squad-lead/engineer/sdet，真招聘） | API hooks + 6 面板 + tokens 轮询；依赖 C1/C2 |
| C4 dashboard-docs | **文档小组**（docs-lead/tech-writer/docs-qa） | DECISIONS D070 + catalog + operations + README + E6 |
| 评审 | code-review（E5 code 层 MUST）/ sec-eng | C1/C2/C3 merge_ready 时机械唤醒 |

人员调度：三角 A/B/C 经标准 staffing 真招聘（`staffing request → draft-personas → check → approve`，D025/D030）；people-qa 校验 self_evolve persona 含 forbidden 且 write_paths ⊆ 层内（E7）。max_parallel_triads=3 支持 A/B/C 三三角；C4 由文档小组并行收尾。

---

## 本轮验证载体（acceptance 4）

本轮 run 自身即验证：dogfood 克隆真实 run（run-2026-08-13T12-16-26-548Z）是面板的**数据源兼验收靶**——C1 curl 冒烟直读该 run YAML；C3 `pnpm dev` 渲染该 run 的 goal/sessions/tokens（serve 127.0.0.1:7788 在线）；C4 后按 operations.md 一键起面板闭环「可本地运行并接入真实 run 数据」。无人干预下由 self-drive guardian 推进（三角会话 ready → 自主实现 → continuation 续跑 → 自测 → evidence/handoff → 串行 merge）。验收判定：C1+C2+C3 三个代码任务完成并合并入 main，C4 文档归档，acceptance 1–4 全满足。
