# 14 — 基于 Pi 生态的开发手册（可直接开工）

本文件把规范落到 **可安装的 Pi 包 + 编排 CLI**。开发者/AI 按本文即可在 Pi 上做出 picode agent。

## 1. 仓库布局（已落地）

```text
picode/
  docs/                          # 规范（权威）
  packages/
    core/                        # 配置加载、路径、schema 类型、原子写
    bus/                         # RoomStore + token + ACL
    orchestrator/                # 状态机 CLI：run init / brief / spawn 准备
    pi-extension/                # Pi 扩展：bus_* / repo_write / request_* 工具
  .picode/
    config.yaml                  # 项目配置
    agents/                      # Pi subagents 风格角色定义（.md）
    prompts/                     # 角色/房间 prompt 模板
  package.json                   # workspaces
```

## 2. 环境准备

```bash
# Node >= 20
node -v

# 安装 Pi（官方）
npm install -g @earendil-works/pi-coding-agent
# 或项目文档中的当前包名；以 https://pi.dev 为准
pi --version

# 配置模型 API Key（按你使用的 provider）
# 参见 pi 文档：providers / auth

# 本仓库
cd picode
npm install
npm run build
```

### 推荐一并安装的 Pi 包

| 包 | 用途 |
|----|------|
| `@tintinweb/pi-subagents` 或 `pi-subagents` | Claude 风格子代理 / 自定义 `.pi/agents` |
| `pi-messenger`（可选） | Bus 的 messenger 适配后端 |

```bash
pi install npm:@tintinweb/pi-subagents
# 可选
pi install npm:pi-messenger
```

开发时加载本地扩展（无需全局 install 包时）：

```bash
pi -e ./packages/pi-extension/src/index.ts
# 或在项目 .pi 配置中声明 extensions
```

## 3. 双进程模型（与 06 一致）

```text
┌─────────────────────────────┐
│ picode CLI (orchestrator)   │  无 LLM：状态机、worktree、brief 门闩
│ npx picode / npm run picode │
└─────────────┬───────────────┘
              │ 1) 写 runs/ 状态
              │ 2) git worktree add
              │ 3) 生成 session env（token、write_paths）
              │ 4) spawn: pi -e picode-ext ...
              ▼
┌─────────────────────────────┐
│ Pi 会话（某角色实例）         │  有 LLM：读 brief、调 bus/repo 工具
│ + @picode/pi-extension      │
└─────────────────────────────┘
```

**不要** 让单个 Pi 会话既当全局状态机又当全部工人（上下文会炸、难恢复）。

## 4. 角色文件（Pi agents）

路径：`.picode/agents/<role-id>.md`  

兼容 pi-subagents 惯例：YAML frontmatter + 正文 system prompt。

```markdown
---
name: engineer
description: Implementation doer for a single task write set
# tools: restricted via picode extension tool profiles, not free bash
---
你是实现三角中的软件开发（doer）。
只执行已批准的 WORK_BRIEF。
禁止联网；需要资料用 request_info。
...
```

展示名以 `.picode/config.yaml` 为准；frontmatter `name` = 逻辑 id。

## 5. 最小命令流（MVP-1）

```bash
# 在目标 git 仓库内（必须是 git repo）
cd /path/to/your-git-project

# 链到 picode（开发期）
export PICODE_HOME=/path/to/picode
export PATH="$PICODE_HOME/packages/orchestrator/dist:$PATH"

# 1. 初始化 run
node $PICODE_HOME/packages/orchestrator/dist/cli.js init \
  --repo . \
  --goal-title "Example goal" \
  --scale S

# 2. 模拟 intake 完成（或交互）
node .../cli.js goal set-status --run <run_id> --status active

# 3. 注册单 chunk + task
node .../cli.js chunk add --run <run_id> --id chunk-a \
  --write "src/**" 

# 4. 工程主责 brief（文件）+ approve
node .../cli.js brief draft --run <run_id> --task <task_id>
# 编辑 runs/.../tasks/.../brief/WORK_BRIEF.md
node .../cli.js brief approve --run <run_id> --task <task_id> --by run-lead

# 5. 准备 worktree + 打印 spawn 命令
node .../cli.js task prepare --run <run_id> --task <task_id>
node .../cli.js task spawn-print --run <run_id> --task <task_id> --seat engineer
# 按打印的 pi 命令启动三个会话（squad-lead/engineer/sdet）

# 6. 校验 evidence / handoff（编排器侧）
node .../cli.js task check-evidence --run <run_id> --task <task_id>
node .../cli.js task check-handoff --run <run_id> --task <task_id>
```

交互式 Pi 内：扩展注册的工具 `bus_post`、`repo_write` 等自动可用。

## 6. Pi 扩展必须注册的工具

| Tool | 实现包 |
|------|--------|
| `bus_post` / `bus_history` | `@picode/bus` + pi-extension |
| `repo_read` / `repo_write` | pi-extension（读 write_paths / read_paths） |
| `request_info` / `request_cross_room` | pi-extension → 写 runs 申请队列 |
| `progress_report` | pi-extension → bus type progress |
| `run_allowlisted` | pi-extension |

**MUST NOT** 在实现三角会话中依赖未包装的通用 write 作为唯一写入口（可在扩展里 `tool_call` 拦截或覆盖）。

## 7. 扩展加载方式（项目级）

在目标仓库或 picode 开发仓库：

```json
// package.json（项目）
{
  "pi": {
    "extensions": [
      "/abs/path/to/picode/packages/pi-extension/src/index.ts"
    ]
  }
}
```

或：

```bash
pi -e /abs/path/to/picode/packages/pi-extension/src/index.ts
```

环境变量（spawn 时由 orchestrator 注入）：

| 变量 | 含义 |
|------|------|
| `PICODE_RUN_ID` | 当前 run |
| `PICODE_RUNS_ROOT` | runs 根目录 |
| `PICODE_AGENT_ID` | 如 engineer@task-a-1 |
| `PICODE_AGENT_TOKEN` | HMAC/随机 token |
| `PICODE_TOOL_PROFILE` | implement.engineer |
| `PICODE_WRITE_PATHS` | JSON 数组 |
| `PICODE_READ_PATHS` | JSON 数组 |
| `PICODE_CWD` | worktree 路径 |
| `PICODE_CONFIG` | 合并后 config 路径 |

## 8. 与规范章节映射

| 要实现 | 读 spec | 代码位置 |
|--------|---------|----------|
| 配置合并 | 13 | `packages/core` |
| Bus ACL | 04, 07, 10 | `packages/bus` |
| 状态机 | 01, 08 | `packages/orchestrator` |
| 工具画像 | 09 | `packages/pi-extension` + core |
| worktree | 06, 07 | `packages/orchestrator` |
| 全部业务流程 | [PROCESSES.md](../PROCESSES.md) | orchestrator 状态机 |
| brief / 人事门闩 | PROCESSES P03–P05 | `packages/orchestrator` |

## 9. 完成定义（可开发）

当下列成立时，视为「可用 Pi 开干」：

1. `npm run build` 通过  
2. `picode init` 在 git 仓生成 `runs/`  
3. Pi 能加载 `pi-extension` 并列出 `bus_post`  
4. 无 token 的 bus_post 失败（单测）  
5. write 越界失败（单测）  
6. 无 brief approve 不能 `task prepare` 进入 spawn 就绪  

## 10. 已知限制（v0.1 代码）

- 真·Pi `ExtensionAPI` 类型以本机安装的 `@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent` 为准；扩展入口做宽松类型以免未装 Pi 时无法编译。  
- spawn 真 LLM 需本机已配置 Pi provider。  
- messenger 适配器 v0.1 可仅 file adapter。  
