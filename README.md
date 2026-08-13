# picode

基于 [Pi](https://pi.dev/) 的 **通用多智能体编码运行时**（可配置 · 领域中立）。

## 文档（实现必读）

|文档|说明|
|------|------|
|**[docs/README.md](./docs/README.md)**|文档中心与地图|
|**[docs/PROCESSES.md](./docs/PROCESSES.md)**|全部业务流程|
|**[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**|系统架构一页纸|
|**[docs/standards/terminology.md](./docs/standards/terminology.md)**|术语口径|
|**[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)**|安装与 CLI|

## 代码

```bash
npm install && npm run build && npm test
```

|包|职责|
|----|------|
|`@picode/core`|配置、路径、工具画像|
|`@picode/bus`|token + 房间 ACL|
|`@picode/orchestrator`|状态机 CLI|
|`@picode/pi-extension`|Pi 工具扩展|
|`@picode/dashboard-server`|只读监控面板后端（node:http，9 端点）|
|`@picode/dashboard`|监控面板前端（Vue3+Vite+shadcn-vue，自包含 pnpm）|

## 监控面板（Dashboard）

只读监控面板，直观展示 run 工作细节（goal / chunks / 任务看板 / 会话 + tokens 活跃度 / merge 列车 / 门禁 evidence）。数据源 = `.picode/runs` YAML + opencode serve 实时 tokens。选 run 后进入详情页 **9 视图**：概览（KPI 统计卡 + 告警）、进度（逐任务 phase/受阻）、房间（成员/消息数）、人员（平台席 + 任务三角）、分块、看板、会话实时 tokens、合并、门禁——三视图（进度/房间/人员）由既有 9 端点前端派生，**不新增后端端点**（D071）。

### 前置

- Node `>=20`（server）、Node `>=22.15` + pnpm `>=10`（前端）

### 安装与运行

```bash
npm install && npm run build   # 主仓（含 dashboard-server）

# 起后端（--repo 指向任意真实 run 仓，默认 cwd）
node packages/dashboard-server/dist/index.js --repo <path-to-repo>

# 起前端（另开终端）
cd packages/dashboard && pnpm install && pnpm dev
```

打开 `http://localhost:5173/dashboard` 选择 run 即可。详见 [docs/guides/operations.md](./docs/guides/operations.md) 面板运维节（含三视图数据来源与设计约定）与 [docs/DECISIONS.md](./docs/DECISIONS.md) D070/D071。

## 状态

文档按 A–F 分类（见 `docs/AUTHORITY.md`）：流程 / 术语单源；岗位全目录在 `docs/reference/glossary.md`。  
MVP 骨架可编译测试；真 Pi 会话需本机安装 Pi 与模型。

## License

[MIT](./LICENSE) — Copyright (c) 2026 webees
