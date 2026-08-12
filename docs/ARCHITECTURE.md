# picode 系统架构（一页）

细节：`spec/` · `domains/` · 步骤 [PROCESSES.md](./PROCESSES.md) · 术语 [terminology](./standards/terminology.md) · agent [17](./spec/17-agent-runtime.md) · 策划 [18](./spec/18-v1-completion-plan.md)

## 1. 定位

**picode** = 跑在 [Pi](https://pi.dev/) 上的 **可配置多智能体「公司岗位仿真」运行时**（编码交付为主线）。

|层|组件|LLM|
|----|------|-----|
|人类|`sponsor`|**否**|
|外部接入|`@picode/mcp-server`（stdio · 56 工具）|**是**（客户端侧）|
|编排|`@picode/orchestrator`|**否**（状态机、门闩、session 执行）|
|调度|`sess-mgr` 会话|**是**（唤醒/休眠决策）|
|平台/任务岗|Pi + `@picode/pi-extension`|**是**（仅 awake）|
|通信|`@picode/bus`|否|
|配置|`@picode/core`|否|
|隔离|Git worktree|—|

## 2. 逻辑架构

```text
┌──────────────────────────────────────────────────────────┐
│              sponsor（人类 · 非会话）                      │
└─────────────────────────┬────────────────────────────────┘
                          │ intake / 确认 / 变更
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌──────────────────┐            ┌──────────────────┐
│ product          │            │ leadership       │
│ pm 产品策划      │            │ run-lead · tpm   │
│                  │            │ proc-audit       │
└────────┬─────────┘            │ sess-mgr(调度)   │
         │                      └────────┬─────────┘
         │    ┌────────────┬─────────────┤
         │    ▼            ▼             ▼
         │  people       docs         research / architecture
         │  真招聘        记忆/下发      ind-res / scout·sys-arch
         │    └────────────┴─────────────┘
         ▼
┌──────────────────────────────────────────────────────────┐
│ orchestrator：状态机 · session 执行 · token · worktree    │
│              · 双门闩 · merge.lock · 规则调度表             │
└─────────────────────────┬────────────────────────────────┘
                          │ wake → Pi session
┌─────────────────────────▼────────────────────────────────┐
│ squad-* ：squad-lead · engineer · sdet  (真招聘实例)       │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ release / quality / security 门禁岗（按 scale 唤醒）       │
└──────────────────────────────────────────────────────────┘
```

## 3. 包职责

|包|职责|
|----|------|
|`@picode/core`|配置（schema/默认/校验/加载）、路径、工具画像、命名校验、错误码注册表|
|`@picode/bus`|token、房间 ACL、消息 type 注册表、jsonl、窗口压缩|
|`@picode/orchestrator`|run/task/brief/staffing/session/merge/evolve/window CLI（命令注册表按域分组）|
|`@picode/pi-extension`|bus_* · repo_* · git_* · request_* · session_* · state_read · web_* · run_allowlisted（09 矩阵 20 工具）|
|`@picode/mcp-server`|MCP 服务器（stdio）：编排面 36 工具（包装 store 函数）+ 执行面 20 工具（复用 pi-extension，ACL 全保留，D064）|

## 4. 往哪读

|问题|文档|
|------|------|
|流程|[PROCESSES.md](./PROCESSES.md)|
|会话/人设/唤醒|[17-agent-runtime](./spec/17-agent-runtime.md)|
|未完成怎么做|[18-v1-completion-plan](./spec/18-v1-completion-plan.md)|
|房/岗 ID|[terminology](./standards/terminology.md)|
|选项默认|[decision-catalog](./reference/decision-catalog.md)|
|不变量|[08-invariants](./spec/08-invariants.md)|
|Git/Bus/工具|[domains/](./domains/)|
|MCP 接入|[guides/mcp-quickstart](./guides/mcp-quickstart.md)|
