# Pi 最短开发路径

| 完整内容 | 链接 |
|----------|------|
| 安装与 CLI 命令流 | [GETTING_STARTED.md](../GETTING_STARTED.md) |
| Pi 包与扩展设计 | [spec/14-pi-development.md](../spec/14-pi-development.md) |
| 架构一页 | [ARCHITECTURE.md](../ARCHITECTURE.md) |

## 组件（30 秒）

| 组件 | LLM | 职责 |
|------|-----|------|
| `orchestrator` CLI | 无 | 状态、双门闩、worktree、spawn 环境 |
| Pi + `@picode/pi-extension` | 有 | 角色思考；bus / repo / request |
| `.picode/agents/*.md` | — | 角色 system 模板 |

## 一条龙（目标 git 仓）

```bash
# 已 npm run build 本仓库后：
export PICODE=/path/to/picode
node $PICODE/packages/orchestrator/dist/cli.js init \
  --repo . --goal-title "demo" --scale S
# 按 GETTING_STARTED 继续：active → chunk → brief → prepare → spawn-print
```

## 角色提示词

默认 agent 模板：`$PICODE/.picode/agents/`  
人设（persona）由人事 cell 按 task 再裁；逻辑 id 见 [terminology](../standards/terminology.md)。
