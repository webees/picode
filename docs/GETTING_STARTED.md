# 快速开始（Pi 生态开发 picode）

## 0. 前置

- Node.js ≥ 20  
- Git  
- Pi CLI（见 [pi.dev](https://pi.dev)）并已配置模型  

```bash
npm install -g @earendil-works/pi-coding-agent   # 以官网当前包名为准
pi --version
```

可选：

```bash
pi install npm:@tintinweb/pi-subagents
```

## 1. 安装本仓库

```bash
cd /path/to/picode
npm install
npm run build
npm test
```

## 2. 在任意 git 项目中初始化 run

```bash
cd /path/to/your-git-repo
export PICODE=/path/to/picode

node $PICODE/packages/orchestrator/dist/cli.js init \
  --repo . \
  --goal-title "My goal" \
  --scale S
# 记下 runId，例如 run-2026-...
```

## 3. 激活 goal 并创建任务

```bash
RUN=run-xxxx

node $PICODE/packages/orchestrator/dist/cli.js goal set-status \
  --repo . --run $RUN --status active

node $PICODE/packages/orchestrator/dist/cli.js chunk add \
  --repo . --run $RUN --id chunk-a --write "src/**"
# 输出 taskId，例如 task-chunk-a
```

## 4. 工程主责工作 brief（必做）

```bash
TASK=task-chunk-a

node $PICODE/packages/orchestrator/dist/cli.js brief draft \
  --repo . --run $RUN --task $TASK

# 编辑：
#   .picode/runs/$RUN/tasks/$TASK/brief/WORK_BRIEF.md

node $PICODE/packages/orchestrator/dist/cli.js brief approve \
  --repo . --run $RUN --task $TASK --by run-lead
```

## 5. 准备 worktree 并启动 Pi 角色

```bash
node $PICODE/packages/orchestrator/dist/cli.js task prepare \
  --repo . --run $RUN --task $TASK

# 打印 engineer 会话环境 + pi 命令
node $PICODE/packages/orchestrator/dist/cli.js task spawn-print \
  --repo . --run $RUN --task $TASK --seat engineer
```

将输出的 `export ...` 粘贴到终端，再：

```bash
pi -e $PICODE/packages/pi-extension/src/index.ts
```

在 Pi 中粘贴 `.picode/agents/engineer.md` 正文 + WORK_BRIEF 内容开始工作。  
对 `squad-lead` / `sdet` 重复 spawn-print。

## 6. 规范索引

- 文档地图：`docs/README.md` · 权威：`docs/AUTHORITY.md`  
- **流程总册：`docs/PROCESSES.md`**  
- **Agent / 会话：`docs/spec/17-agent-runtime.md`**  
- **v1 策划：`docs/spec/18-v1-completion-plan.md`**  
- **自我进化：`docs/spec/19-self-evolution.md`**  
- Schema 索引：`docs/reference/schemas/README.md`  
- 选项默认：`docs/reference/decision-catalog.md`  
- 术语：`docs/standards/terminology.md`  
- 架构：`docs/ARCHITECTURE.md`  
- 实现阶段：`docs/spec/11-implement-playbook.md`  

> **注意：** 完整双门闩（staffing 真招聘）与 sess-mgr 自动调度见 17/18；当前 CLI 可能仅覆盖 brief + worktree 骨架。  

## 7. 配置房间/角色名

编辑项目或 picode 仓库的 `.picode/config.yaml`（见 `docs/spec/13-configuration.md`）。
