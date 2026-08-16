# run-lead 自治规划 — Dashboard 界面视觉与体验全面检修（run-2026-08-13T15-08-28-705Z · delivery · scale L）

> 目标（product_acceptance，sponsor 反馈 + 监督者基线）：
> 1. 整体视觉显著提升（布局/间距/卡片/信息层级/主题色/响应式）
> 2. 所有文案通俗易懂（无技术黑话残留，按钮/菜单/空态/错误均可理解）
> 3. 用户体验流畅（导航/状态可见性/加载反馈/失败降级）
> 4. 保持只读语义与既有 API 契约不变（9 端点）
>
> 补充需求（sponsor 二轮反馈：「看不到房间/人员/进度」）：
> 5. 房间视图（rooms）：房间名/成员/消息数（statusSnapshot.rooms 已有 `{room, messages}`；
>    成员由 tasks 端点的 `work_room`+`triad` 派生 squad 房间成员、平台房间由前端 ROLE→ROOM 约定映射）
> 6. 人员视图（personnel）：三角成员归属（谁在哪个任务）+ 平台席角色说明（sessions.role_id + 前端角色描述常量）
> 7. 进度视图（progress）：任务进度（tasks 端点已有 progress 字段但 UI 未展示：phase/blocked/summary/updated_at）
>
> 基线保留：main = 5f9de08（监督者先行中文化：labels.ts 状态值/文案中文化 + 侧边栏精简）。本轮在基线之上全面检修。

---

## (a) 处置决策清单（设计方向）

### D71 设计读（Design Read）

> **Reading this as**: a local, read-only ops-monitoring cockpit for the picode
> orchestrator, for a sponsor who found the current UI ugly and cryptic. A calm,
> data-dense, Linear-style language, leaning on the vendored shadcn-vue design
> system with refined typography, semantic status colors, and generous whitespace.
> **Dials**: VARIANCE 3 / MOTION 2 / DENSITY 6（监控工具：稳定、克制、信息密度适中，
> 不引入落地页式花哨动效）。

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D71-1 | **视觉风格** | **保留 shadcn-vue 设计系统 + 精修**：默认主题 zinc 基座 + 单一强调色（蓝）；语义状态色编码（绿=正常/完成、琥珀=等待/进行、红=失败/阻塞、蓝=活跃）；统一圆角/边框/层级阴影；**不换设计系统、不引新 UI 库** | 模板已带整套 shadcn-vue ui（vendored，7.5k 行组件库），复用成本最低、一致性最好；sponsor 抱怨的是「丑/晦涩」而非技术栈。设计读明确为克制数据仪表盘 |
| D71-2 | **布局骨架** | **保留 sidebar + header 壳**（模板 layout 已正确），修三处：① 侧边栏从 1 项扩为分组导航（总览/运行实例；详情内各视图入口）；② 详情页 9 个视图横向可滚 TabsList；③ 首屏空态引导卡 | 监督者观察「侧边栏只有 1 项」+「首屏无引导」——导航与引导是 UX 主缺 |
| D71-3 | **信息层级** | **卡片化层级**：run 卡片 = 状态色条 + 徽章 + 标题 + 元数据行 + 进度暗示；详情总览 = 目标卡 + 统计卡带（KPI 数字卡）+ 告警条（失败/阻塞醒目）+ 三视图摘要；看板列**加宽**（min-w 提升 + 卡内显进度） | 直接命中「run 卡片信息层级平」「看板列窄」「详情页 6 tabs 纯文本表」三项监督者观察 |
| D71-4 | **新视图数据源** | **三视图全部基于既有 9 端点派生，dashboard-server 零改动**：<br>· 进度：`/tasks` 已有 `progress{phase,blocked,summary,updated_at}`（仅 UI 未展示）<br>· 人员：`/tasks.triad`（三角归属）+ `/sessions.role_id`（平台席）+ 前端角色描述常量<br>· 房间：`/runs/:id` `snapshot.rooms`（房间+消息数）+ `/tasks` `work_room`+`triad`（squad 房间成员）+ 前端 ROLE→ROOM 约定（平台房间成员） | **验收 #4 硬约束「9 端点契约不变」**：不新增端点、不改既有响应形状。房间成员/角色描述属「系统静态知识」（成员表/人设 frontmatter），作为前端常量常量映射维护（注释标注与 `rooms/*/members.json` 同步），个人/进度数据全部为真实 run 数据 |
| D71-5 | **文案通俗化** | **扩展 `labels.ts` + 新增角色/房间中文常量**：run 级术语已中文化（基线），补 ① 角色→通俗职责（run-lead「统筹规划」/pm「产品管理」/engineer「软件实现」等，取自 `.picode/agents/*.md` frontmatter 描述）；② 房间→通俗名（`squad-task-X` →「X 任务小组」/architecture→「架构」…）；③ 按钮/菜单/空态/错误全部人话 | 命中验收 #2 + sponsor「按钮菜单描述晦涩」 |
| D71-6 | **加载/失败降级** | **骨架屏（skeleton）替换通用 spinner**（列表/表格/卡片各配形状匹配的 skeleton）；所有视图错误态 = 内联 Alert + 重试按钮 + 后端未启动引导（告诉怎么起 server）；serve 失联 tokens 已有降级 | 命中验收 #3「加载反馈/失败降级」 |
| D71-7 | **响应式** | 断点按模板既有体系（sm/md/lg/xl/2xl）；看板列在 xl 以下横向滚动不挤爆；卡片栅格自适应列数；移动端侧边栏折叠逻辑沿用 | 命中验收 #1「响应式」 |
| D71-8 | **组件选型** | **新增薄域组件**（`components/dashboard/`）：`StatCard`（KPI 数字卡）、`StatusBadge`（语义色徽章）、`SectionCard`（分区卡壳）、`EmptyState`/`ErrorState`/`SkeletonTable`（复用 ui/empty + 新 skeleton 组合）。**复用既有 ui 组件**：Card/Badge/Table/Tabs/Alert/Empty/Progress/ScrollArea/Skeleton/Avatar/Tooltip/Kbd；图标沿用 `@lucide/vue`；**不引新依赖** | 模板 ui 组件库已足；域组件只为统一视觉与降重复；无新依赖避免锁文件/构建面膨胀 |
| D71-9 | **非目标（范围外）** | 不改 dashboard-server；不新增端点；不引入图表库重集成；不做鉴权/部署；不做写操作 | 验收 #4 + 只读语义不变量延续（D002/D057/D070） |
| D71-10 | **决策归档** | 新增 **D071**（本轮视觉/UX 检修决策）；decision-catalog §13 补检修节；operations.md/README 更新（三视图 + 设计约定）；E7 纪要 | 决策门禁 + 运维/知识面完整（前轮惯例） |

**总纲**：前端 `packages/dashboard` 全面检修（视觉/层级/文案/加载降级 + 三新视图），
dashboard-server 与 9 端点**零改动**（验收 #4 硬约束）；所有新数据从既有端点派生 +
前端静态知识常量（角色/房间描述）。基线 5f9de08 中文化保留。

---

## (b) chunk 分块建议（4 个；C1 先行，C2/C3 写集互斥可并行，串行 merge 列车 D036，C4 收尾）

### C1 `chunk-dashboard-design-system`（设计系统 + 布局壳 · 代码层）

- **write_paths**：
  - `packages/dashboard/src/assets/index.css`（主题精修：语义状态色、边框/阴影层级、骨架屏动画基元）
  - `packages/dashboard/src/assets/themes.css`（去重重复 theme-yellow；统一 radius/边框 token）
  - `packages/dashboard/src/constants/themes.ts`（默认主题 zinc→精修强调色；radius 默认收敛）
  - `packages/dashboard/src/stores/theme.ts`（默认值收敛）
  - `packages/dashboard/src/layouts/default.vue`（header 精修：面包屑/标题/状态点）
  - `packages/dashboard/src/components/global-layout/basic-header.vue` / `basic-page.vue`（标题层级 + 操作区）
  - `packages/dashboard/src/components/dashboard/**`（**新增**域组件：`StatCard.vue`/`StatusBadge.vue`/`SectionCard.vue`/`EmptyState.vue`/`ErrorState.vue`/`SkeletonTable.vue`/`SkeletonGrid.vue`）
- **read_paths**：模板 `/private/tmp/shadcn-vue-admin`（设计参考）；既有 ui 组件（复用契约）
- **public_contract**：`@/components/dashboard/*` 域组件可用（props 稳定）；语义色/间距/骨架 token 就位；默认主题精修后可全局应用
- **depends_on**：无
- **验收口径**：
  - C1-a `command`：`cd packages/dashboard && pnpm build && pnpm lint` 通过（vue-tsc + vite + eslint）
  - C1-b 机械核查：`components/dashboard/` 下域组件存在且被 `pnpm build` 引用无误
  - C1-c 机械核查：`themes.css` 无重复 theme 块（去重）；默认主题 = 精修后的单一强调色
  - C1-d 人工：浅色/深色下语义色（绿/琥珀/红/蓝）对比可读（WCAG AA 主体 ≥4.5:1）
  - C1-e `command`：`pnpm test`（vitest 既有用例）通过，不破坏既有测试

### C2 `chunk-dashboard-overview`（总览 + run 列表 + 首屏引导 · 代码层）

- **write_paths**：
  - `packages/dashboard/src/pages/dashboard/index.vue`（**重写**：全局状态概览 KPI 带 + run 卡片栅格 + 首屏引导/空态 + 错误降级）
  - `packages/dashboard/src/constants/sidebar-data.ts`（**扩充**：总览/运行实例分组导航；各视图入口）
  - `packages/dashboard/src/pages/dashboard/index.components.ts`（**新增**：概览页组合逻辑/派生——跨 run 汇总运行中任务数/失败告警/活跃会话/已合并，全部由 `/api/runs` + 逐 run snapshot 派生，零新端点）
  - `packages/dashboard/src/pages/dashboard/__tests__/overview.test.ts`（**新增**：概览派生纯函数单测）
- **read_paths**：C1 域组件；`services/api/picode.api.ts`（既有 9 hooks 契约，只读）
- **public_contract**：`/dashboard` 首屏 = 全局状态总览（运行中任务/失败告警/活跃会话/已合并 4 KPI）+ 引导卡 + run 卡片；无 run 时显示可操作的引导（如何起 server、--repo 指向）
- **depends_on**：C1（域组件）
- **验收口径**：
  - C2-a `command`：`cd packages/dashboard && pnpm build && pnpm lint && pnpm test` 全绿
  - C2-b 单测：概览派生纯函数（跨 run 汇总 KPI）输入 fixture → 输出断言正确（运行中计数/失败告警汇总）
  - C2-c 人工/机械：`pnpm dev` 冒烟 5173，`/dashboard` 显示 4 KPI 卡 + run 卡片栅格（接入真实 dogfood run 数据）
  - C2-d 人工：空 run 目录显示引导卡（说明数据来源/如何启动）；后端未启动显示内联错误 + 重试 + 启动指引，不白屏
  - C2-e 机械核查：侧边栏导航 > 1 项且分组合理

### C3 `chunk-dashboard-run-detail`（详情页重构 + 三新视图 + 看板加宽 · 代码层）

- **write_paths**：
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/index.vue`（**重构**：9 视图横向可滚 TabsList，总览默认）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/goal-overview.vue`（**重构**：目标卡 + KPI 统计卡带 + 告警条 + 房间/人员/进度三摘要卡）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/progress-view.vue`（**新增**：进度视图——逐任务 phase/blocked/summary/updated_at，来自 `/tasks.progress`）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/rooms-view.vue`（**新增**：房间视图——房间卡（通俗名 + 消息数 + 成员 chips），squad 房间成员由 `/tasks` work_room+triad 派生，平台房间成员由 ROLE→ROOM 约定映射）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/personnel-view.vue`（**新增**：人员视图——平台席（agent/role/状态/通俗职责）+ 任务三角（task_id + squad-lead/engineer/sdet））
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/tasks-board.vue` / `tasks-board.data.ts`（**重构**：列加宽、卡内显进度、状态色增强）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/components/{chunks-table,sessions-live,merge-train,gates-panel}.vue`（**精修**：骨架屏 + 语义色 + 文案润色，保留数据语义）
  - `packages/dashboard/src/utils/labels.ts`（**扩展**：角色/房间/phase 中文映射；按钮/空态/错误文案）
  - `packages/dashboard/src/constants/role-meta.ts`（**新增**：ROLE 描述 + ROLE→ROOM 约定映射，注释标注与 `rooms/*/members.json` 同步来源）
  - `packages/dashboard/src/services/api/picode.api.ts`（**仅类型扩展**：派生 selector 帮助函数，不动 9 端点调用）
  - `packages/dashboard/src/pages/dashboard/runs/[runId]/__tests__/views.test.ts`（**新增**：三视图派生纯函数单测）
- **read_paths**：C1 域组件；C2 侧边栏/概览；`/tasks` `/sessions` `/runs/:id` 契约（只读）
- **public_contract**：详情页 9 视图可见且数据真实；进度/房间/人员三视图接入真实 dogfood run 数据；看板列加宽；全部视图骨架屏 + 错误降级
- **depends_on**：C1（域组件）；C2（侧边栏入口/引导模式，可并行但 merge 在 C2 后）
- **验收口径**：
  - C3-a `command`：`cd packages/dashboard && pnpm build && pnpm lint && pnpm test` 全绿
  - C3-b 单测：三视图派生纯函数——triad→人员分组、work_room→房间成员、progress→进度行（fixture 断言）
  - C3-c 人工：对真实 dogfood run（`--repo /private/tmp/picode-dogfood`，如 run-2026-08-13T12-16-26-548Z 或当前 run）`pnpm dev`：进度视图显示各任务 phase/blocked/summary；房间视图显示房间+消息数+成员；人员视图显示平台席+三角归属
  - C3-d 人工：看板 7 列加宽后可读、卡内显进度；`/dashboard/runs/:id` 9 视图可导航、无白屏
  - C3-e 机械核查：`api/picode.api.ts` 未新增/删除任何 fetch 调用（9 端点契约不变，diff 检查）

### C4 `chunk-dashboard-docs`（知识沉淀 · docs 层）

- **write_paths**：
  - `docs/DECISIONS.md`（新增 **D071**：Dashboard 视觉/UX 检修决策——设计读 + 三视图数据派生方案 + 前端静态知识常量取舍）
  - `docs/reference/decision-catalog.md`（§13 补「检修与三视图」小节：设计约定/数据源/同步标注）
  - `docs/guides/operations.md`（面板运维补：三视图说明、--repo 指向、如何观察进度/人员/房间）
  - `README.md`（Dashboard 章节补检修说明 + 三视图）
  - `docs/knowledge/evolve/run-2026-08-13T15-08-28-705Z.md`（E7 纪要：意图/决策/diff/验证/剩余风险）
  - `docs/plans/2026-08-13-r5-dashboard-ui.md`（本决策归档，已含）
- **read_paths**：C1–C3 产出；基线 5f9de08 diff；`rooms/*/members.json` 与 `.picode/agents/*.md`（角色描述来源）
- **depends_on**：C1–C3（机制落地才写得准）
- **验收口径**：
  - C4-a `command`：`npm run build && npm test` 全绿（文档不破坏构建）
  - C4-b 人工/机械：DECISIONS 含 D071；catalog §13 含检修节；operations.md 含三视图运维命令
  - C4-c `command`：`npm run check`（persona-lint）通过
  - C4-d 机械核查：按 operations.md 命令可本地起面板并接入真实 run 数据（acceptance 闭环）

**编排**：C1（设计系统）→ C2/C3（写集互斥可并行实现；merge 列车串行 C1→C2→C3）→ C4（收尾）。
E4 gate：前端 chunk 显式 `cd packages/dashboard && pnpm build && pnpm lint && pnpm test`；
后端零改动故根 `npm run build && npm test` 仅作回归（C4 验证）。code 层 merge_ready 强制唤醒 code-review（E5）。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 D71-1~10） | run-lead（本会话） | 已产出 |
| C1 design-system | **三角 A**（squad-lead/engineer/sdet，真招聘） | 设计 token + 域组件 + 布局壳；engineer 主实现，sdet 验证（build/lint/对比度） |
| C2 overview | **三角 B**（squad-lead/engineer/sdet，真招聘） | 总览页 + 侧边栏 + 首屏引导；与 C3 写集互斥可并行，列车串行 |
| C3 run-detail | **三角 C**（squad-lead/engineer/sdet，真招聘） | 详情页重构 + 进度/房间/人员三视图 + 看板加宽 + 角色/房间常量；依赖 C1/C2 |
| C4 docs | **文档小组**（docs-lead/tech-writer/docs-qa） | DECISIONS D071 + catalog + operations + README + E7 纪要 |
| 评审 | code-review（E5 code 层 MUST） | C1/C2/C3 merge_ready 机械唤醒 |

人员调度：三角 A/B/C 经标准 staffing 真招聘（`staffing request → draft-personas → check → approve`，D025/D030）；
people-qa 校验 self_evolve persona 含 forbidden 且 write_paths ⊆ 层内（E7）。max_parallel_triads=3 支持 A/B/C 并行；
C4 由文档小组并行收尾。

---

## 本轮验证载体（验收 #5 三视图真实数据）

本轮 run 自身即验证载体：dogfood 克隆 `/private/tmp/picode-dogfood` 的既有真实 run
（run-2026-08-13T12-16-26-548Z 含 4 任务/三角/merge/门禁完整数据）是**三视图数据源兼验收靶**——
C3 对之 `pnpm dev` 渲染进度（tasks.progress）/人员（triad+sessions）/房间（snapshot.rooms+work_room）全为真实数据；
C4 后按 operations.md 一键起面板闭环「可本地运行并接入真实 run 数据」。
无人干预下由 self-drive guardian 推进（三角会话 ready → 自主实现 → 续跑 → 自测 → evidence/handoff → 串行 merge）。
验收判定：C1+C2+C3 三个代码任务合并入 main，C4 文档归档，acceptance 1–5 全满足。

> 精简批2（2026-08-15）：本 run E 纪要（r5）已摘要化，教训/风险去向见 evolve/E1-E15-SUMMARY.md；E 纪要细节见 git 历史。
