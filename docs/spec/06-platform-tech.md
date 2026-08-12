# 06 — 平台技术选型（索引）

横切厚主题已拆到 `domains/`，便于实现时按域阅读。

## 选型结论（摘要）

|主题|方案|
|------|------|
|并行与原子写码|Git worktree + 分支 + 串行 merge|
|编排|无 LLM 的 orchestrator + Pi 子会话|
|外部接入|MCP 服务器（stdio · 编排面 36 + 执行面 20 工具，ACL 全保留，D064）|
|通信|Tool Bus + token；RoomStore 默认 jsonl（可选 messenger）|
|写集|工具 allowlist + worktree + git diff 门禁|
|进度|小队主责定时 progress|
|成本|不熔断（产品策略）|

## 分册

|文档|内容|
|------|------|
|[domains/git-worktree.md](../domains/git-worktree.md)|worktree 生命周期、并发边界、失败回收|
|[domains/bus-system.md](../domains/bus-system.md)|Bus 分层、token、存储|
|[domains/tool-system.md](../domains/tool-system.md)|工具画像与写安全|
|[spec/14-pi-development.md](./14-pi-development.md)|如何用 Pi 包开发|
|[guides/mcp-quickstart.md](../guides/mcp-quickstart.md)|MCP 服务器接入（D064）|
|[ARCHITECTURE.md](../ARCHITECTURE.md)|一页架构图|

行为变更须同步 PROCESSES / 08 不变量与相关 domains。
