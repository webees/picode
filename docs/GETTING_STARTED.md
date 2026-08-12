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
npm test          # 单元测试（mock，隔离 HOME，~5s）
npm run test:e2e  # 真实 LLM 冒烟（需 opencode serve + key，见 docs/guides/e2e-smoke.md）
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

> 全部命令（按域分组）见 `picode --help`；单命令用法 `picode <cmd> <sub> --help`。
> 顶层也可直接运行 `npm run picode -- --help`（仓库根）。

## 3. 激活 goal 并创建任务

```bash
RUN=run-xxxx

node $PICODE/packages/orchestrator/dist/cli.js goal set-product-acceptance \
  --repo . --run $RUN --acceptance "编译通过; 测试全绿"   # pm 口径（P01，active 前置门闩）

node $PICODE/packages/orchestrator/dist/cli.js goal set-status \
  --repo . --run $RUN --status active

node $PICODE/packages/orchestrator/dist/cli.js chunk add \
  --repo . --run $RUN --id chunk-a --write "src/**"
# 输出 taskId，例如 task-chunk-a
```

## 4. 工程主责 work brief（双门闩之一）

```bash
TASK=task-chunk-a

node $PICODE/packages/orchestrator/dist/cli.js brief draft \
  --repo . --run $RUN --task $TASK

# 编辑：
#   .picode/runs/$RUN/tasks/$TASK/brief/WORK_BRIEF.md

node $PICODE/packages/orchestrator/dist/cli.js brief approve \
  --repo . --run $RUN --task $TASK --by run-lead
```

## 4.1 真招聘 staffing（双门闩之二，16-hr-cell）

```bash
node $PICODE/packages/orchestrator/dist/cli.js staffing request \
  --repo . --run $RUN --task $TASK --skills "typescript,node"

node $PICODE/packages/orchestrator/dist/cli.js staffing draft-personas \
  --repo . --run $RUN --task $TASK

node $PICODE/packages/orchestrator/dist/cli.js staffing check \
  --repo . --run $RUN --task $TASK        # people-qa 维度校验（应输出 ok: true）

node $PICODE/packages/orchestrator/dist/cli.js staffing approve \
  --repo . --run $RUN --task $TASK --by run-lead   # 批准后注册三角会话并唤醒（D030/D031）
```

## 5. 准备 worktree 并启动 Pi 角色

```bash
node $PICODE/packages/orchestrator/dist/cli.js task prepare \
  --repo . --run $RUN --task $TASK        # 双门闩未齐会被拒绝（T16/T18）

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

## 5.1 常用运维命令

```bash
node $PICODE/.../cli.js session list  --repo . --run $RUN            # 花名册（T20）
node $PICODE/.../cli.js session event --repo . --run $RUN --event intake_start   # 规则表事件（17 §5.3）
node $PICODE/.../cli.js status       --repo . --run $RUN            # run 只读快照（U12）
node $PICODE/.../cli.js progress check --repo . --run $RUN          # stale 巡检（无 daemon）
node $PICODE/.../cli.js merge enqueue --repo . --run $RUN --task $TASK   # 合并入队（T11）
node $PICODE/.../cli.js merge process --repo . --run $RUN           # 串行合并（merge.lock）
node $PICODE/.../cli.js window compress --repo . --run $RUN         # 窗口压缩（D043）
node $PICODE/.../cli.js staffing scores --repo . --run $RUN --task $TASK  # 评分档案（16 §9）
```

## 5.2 MCP 接入（D064）

外部 LLM/客户端可通过 MCP 服务器驱动同一套流程（stdio，56 工具：编排面 36 + 执行面 20）：

```bash
npm run build
PICODE_REPO=. npm run mcp        # stdio 服务器
```

客户端配置与完整工具清单见 [guides/mcp-quickstart.md](./guides/mcp-quickstart.md)。

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

## 7. 配置房间/角色名

编辑项目或 picode 仓库的 `.picode/config.yaml`（见 `docs/spec/13-configuration.md`；默认值摘录 `docs/reference/default-config.snippet.yaml`）。
