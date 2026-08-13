# 运维规程（serve/会话/续跑/guardian 重启/真相关于文件）

> 来源：run-lead 决策 C7（ERR-04 缓解 + 监督过程固化）+ D066（会话续跑机制）+ R2-C3（guardian 重启信号）+ R3-C2/C3（续跑 gate / 续跑遥测）。
> 遵循本规程可避免已知的 serve 类故障人工踩坑，并正确观察/调整续跑、重启守护热载。

## serve 重启规程（ERR-04 缓解）

1. 停旧 serve：kill <pid>；确认退出（ps 检查）
2. 取 key：`python3 -c "import json; print(json.load(open('$HOME/.local/share/opencode/auth.json'))['opencode-go']['key'])"`（不回显到日志）
3. 启动（cwd 必须是克隆仓根，否则会话 cwd 偏差 ERR-03）：
   ```bash
   cd <repo> && OPENCODE_GO_API_KEY=<key> nohup ~/.opencode/bin/opencode serve --port 7788 --print-logs > /tmp/opencode-serve.log 2>&1 &
   ```
4. 重建 picode 会话：对全部 awake 会话 `session sleep` → `session wake`（serve 重启后 oc-ses_* 失效，须重新 attach）
5. 重投喂未完成的任务消息（serve 重启丢会话上下文——上游限制，D058 契约）

## 会话 cwd 与权限（ERR-03 防护）

- serve 以克隆仓为工作目录启动（会话 directory = 克隆仓根）
- 权限配置 ~/.config/opencode/opencode.jsonc：webfetch deny、edit ask、bash allow（监督模式）
- 会话是裸 build agent（无 PICODE env/工具）——**只做思考与决策输出，文件写入由监督者经 MCP 执行**

## 文件系统才是真相（HTTP 000 假象）

- curl/HTTP 超时 ≠ 消息失败；以 run 状态文件与 worktree git 状态为准
- serve 日志 /tmp/opencode-serve.log 是故障定位第一现场（stream 挂起/权限 ask/key 缺失均在此可见）

## watchdog（ERR-01）

- self-drive tick 内置 probeServeHealth：serve 失联时标记 awake opencode 会话 error（不自动重 spawn 防风暴）
- 排查顺序：serve 日志 → 会话 tokens（0 = 消息未处理）→ 权限 ask（GET /permission）→ key（auth.json）

## 续跑（continuation，D066）

续跑 = guardian 对「已 awake ∧ 无 error ∧ 任务未终态 ∧ 预算未耗尽 ∧ 空闲超 `idle_sec`」的 opencode 会话按 D061 noReply 语义投喂固定续跑 prompt。全部状态落盘、幂等、可恢复。

### 观察续跑状态

- `picode self-drive continuation --status`：只读预览当前候选会话数（不投喂，安全），并输出全会话续跑遥测列（见下）
- `picode status --run <id>`：快照含 `continuation` 段——`max_per_session` / `idle_sec` 配置值与 `sessions[]` 逐会话遥测
- MCP `continuation_status`：与 CLI 同源派生（同一函数），返回候选 + 全会话遥测列；三面口径一致、纯读零写

逐会话遥测列（三面同名同义）：

| 列 | 含义 |
|---|---|
| `continuations_used` | 累计自动续跑投喂次数（`session.budget.continuations`，持久化） |
| `max_per_session` | 每会话续跑上限（配置值，0=不限） |
| `last_continuation_at` | 上次投喂时间（最近一条 outgoing 转录 ts；无转录为 `null`） |
| `in_flight` | 投喂后尚无 incoming 响应（回合进行中，该会话不会被继续投喂） |
| `platform_seat` | 平台席（未绑定任务，默认 `platform_seats: skip` 不进续跑候选） |

- 会话文件 `runs/<id>/sessions/<agent>.yaml`：`budget.continuations` 为累计续跑计数；`error` 字段可见预算耗尽停靠（`budget exceeded`）或 serve 失联（ERR-01 watchdog）
- 转录归档 `runs/<id>/transcripts/<agent>.jsonl`：每次续跑投喂落盘（含固定续跑 prompt 与响应）

### 预算调整

- `self_evolve.continuation.max_per_session`：每会话续跑上限（0=不限，保守默认）。续跑耗尽即停且**不等于任务成功**——若会话被 `budget exceeded` 停靠，需人工研判是否重投喂/提额
- `self_evolve.continuation.idle_sec`：空闲触发间隔。调小 = 续跑更勤（回合更紧凑）；调大 = 空等更久；**须小于 `idle_sleep_sec`**，否则会话先被 idle-sleep 休眠，续跑永不触发
- 改配置后重启/下次 tick 生效（guardian 每次 tick 重读配置）

### 手动单次投喂

- `picode self-drive continuation --feed <agent>`：手动投喂 1 次续跑 prompt 并计数（不阻塞、noReply 异步）。用于：会话空闲但未触发续跑、或预算耗尽后人工研判决定再投喂
- 断连/重启衔接：serve 重启（见上）→ P1 恢复重投喂 ready → 清 error → 续跑 sweep 从持久化计数续发，不重算不超发（幂等）

### 平台席策略（D068）

- 平台席 = 无 task 绑定会话（scout/sys-arch/run-lead 等）。默认 `platform_seats: "skip"` **不进续跑候选**，防无界空转烧 token（E6 gap 3 根治）
- 需对平台席启用续跑时显式配置 `platform_seats: "allow"`；逃生路径仍受 `max_per_session` 有界，且无任务产出时继续消耗预算，运维应留意
- 观测：遥测列 `platform_seat=true` 即平台席；候选数与投喂数应为 0（skip 默认）

### 续跑 gate 运维规程（D068 / R3-C2）

`gate_commands` 默认空（不启用）。启用 = 续跑投喂前对每个候选跑 gate 命令，防止「上次失败后没改代码、agent 反复重跑同一失败步骤」烧 token。

- **配置**：`self_evolve.continuation.gate_commands: ["<cmd>", ...]`（如 `["npm run build"]` / `["npm test"]`）；单条命令有界超时 60s，超时视为 gate 失败
- **行为**：
  - gate **通过** → 该会话本轮不投喂（视为可停靠，`gate_passed`）
  - gate **失败** → 本轮不投喂但**保留候选**（下轮可重试）；失败快照指纹按 agent 落盘 `runs/<id>/continuation-gate.jsonl`
  - **快照未变**（上次失败指纹 === 当前）→ 不重跑 gate、本轮不投喂（防没改代码反复重跑）
  - gate 关闭（默认）→ 与无 gate 行为完全一致（回归 C1）
- **快照原理**：`git status --porcelain` + `git diff HEAD` + untracked 内容 sha256 聚合；**须为 git 仓库**，否则快照不可得 → 保守每次重跑 gate（去重失效但不误判）
- **排查**：会话不投喂且日志无预算耗尽时，查看 `runs/<id>/continuation-gate.jsonl` 的 `reason`（`snapshot_unchanged` / `gate_failed` / `gate_passed`）判断是 gate 拦截还是停靠
- 注意：启用 gate 后续跑节奏由 gate 命令执行时间主导，命令本身须有界（shell 超时 60s 兜底）

### 续跑不触发的排查

1. 会话是否 `sleeping`/`terminated`/`error`？续跑只对 awake 且无 error 会话投喂
2. 任务是否已终态（done/dissolved）？终态不续跑
3. `budget.continuations` 是否已 ≥ `max_per_session`？预算耗尽即停
4. `idle_sec` 是否 ≥ `idle_sleep_sec`？若是则先被休眠，调小 `idle_sec`
5. 是否平台席（无任务绑定）？默认 `platform_seats: skip` 不进候选；需续跑显式配置 `"allow"`
6. 是否 in-flight（投喂后未响应）？进行中回合不重复投喂，等待响应落盘后由 idle 时钟判定
7. 是否被续跑 gate 拦截（`gate_commands` 非空时）？查 `runs/<id>/continuation-gate.jsonl` 的 `reason`（`snapshot_unchanged` / `gate_failed` / `gate_passed`）
8. 进程形态：续跑由 guardian tick 驱动，**无 daemon**——guardian 未运行则无续跑（检查 self-drive 进程存活）

## guardian 重启规程（R2-C3，代码更新热载）

守护进程（`picode self-drive run`）是长时进程，import 缓存使 TS dist 热载复杂且有中途退出风险（违背「无 daemon」不变量）。因此 guardian **不自动热载、不自动退出**——只做观测：启动时记录 repo HEAD 基线，每 tick `git rev-parse HEAD` 对比，main HEAD 前移（合并落地）即置 `code_updated: { detected, base_sha, head_sha }` 并 `console.warn` 一次，运维据此重启。

### 何时需要重启

- guardian 日志出现 `[guardian] 检测到仓库 HEAD 前移` 警告（含 base/head SHA）
- 或通过 `picode self-drive run` 退出 summary 的 `ticksRun[].code_updated.detected: true` 确认（runGuardian 面）

> 注：`picode self-drive tick` 为单次调用、无启动基线（不传 baseSha），其输出 `code_updated` 恒为 `null`，不能用于观测代码更新信号；观测须走 runGuardian 面（日志警告 / summary.ticksRun）。

### 合并后重启步骤

1. 停旧守护：向 `picode self-drive run` 进程发 SIGTERM（或写 halt 文件 `runs/<id>/guardian.halt`），确认退出（ps 检查）
2. 拉新代码：`git fetch` + `git checkout main` + `git pull`（工作区在 base 分支，见 `git.base_branch`）
3. 重建 dist（守护 import 的是 dist）：`npm run build`（守护重启后运行新代码）
4. 重启守护：`cd <repo> && nohup node packages/orchestrator/dist/cli.js self-drive run --repo <repo> --run <id> > /tmp/picode-guardian.log 2>&1 &`
5. 验证：重启后新守护启动时记录**新** HEAD 为基线 → 首个 tick `code_updated` 回到 `null`（无警告）

### 为何不热载

守护长时运行，代码（dist）在启动时 import 进内存；就地替换文件不会生效。真正的热载需重 import 模块并重入循环——中途退出会让当前 tick 半途而废，破坏会话状态机（「无 daemon」不变量）。合并→重启是最小闭环：一次重启即热载新代码、重置基线、恢复观测。

## 监控面板（Dashboard，D070）运维

面板 = `packages/dashboard-server`（只读 HTTP）+ `packages/dashboard`（前端 UI）。数据源 = `.picode/runs` YAML（文件真相 D002）+ opencode serve 实时 tokens（D058）。面板**只读**：全部 GET、无写、无 daemon、不持锁。

### 前置

- Node `>=20`（server）；前端另需 Node `>=22.15` + pnpm `>=10`
- server 依赖主仓 build：`npm run build`（含 `@picode/dashboard-server`）
- serve 在线（tokens 实时页才有值；`opencode.base_url` 缺省 `http://127.0.0.1:7788`）

### 起后端（dashboard-server）

```bash
# 指向任意真实 run 仓（--repo 默认 cwd；读其 .picode/config.yaml 的 runs_root 与 opencode.base_url）
node packages/dashboard-server/dist/index.js --repo /private/tmp/picode-dogfood
# 默认监听 http://127.0.0.1:8788；换端口：--port 9000
```

冒烟验证：

```bash
curl -s localhost:8788/api/runs                 # run 列表（含当前 run id）
curl -s localhost:8788/api/runs/<runId>         # goal + run.yaml + statusSnapshot
curl -s localhost:8788/api/live/<runId>/<agent> # {ok,tokens:{total,input,output},at}；serve 失联 → {ok:false,error}
```

### 起前端（dashboard）

```bash
cd packages/dashboard && pnpm install && pnpm dev   # Vite 5173，dev proxy /api → 127.0.0.1:8788
```

浏览器打开 `http://localhost:5173/dashboard` → 选择 run → 六面板（概览 goal / chunks / 任务看板 / 会话+tokens 实时 / merge 列车 / 门禁 evidence·E4）。

### 观察 tokens 活跃度

- 前端会话页按 `refetchInterval`（2–5s）轮询 `/api/live/:runId/:agent`；tokens = 最近一条 assistant 消息的 `info.tokens.total`（serve 契约 D058）
- serve 失联 / 会话未挂 serve（无 `pi_session_id`）→ 面板显示降级提示（`{error}`），不白屏
- 排查顺序：`picode status` → serve 日志 `/tmp/opencode-serve.log` → serve 是否在线（`curl 127.0.0.1:7788/`）→ 会话 `pi_session_id` 是否存在（`sessions/<agent>.yaml`）

### 排查清单

1. `curl localhost:8788/api/runs` 非 200？server 未起或 `--repo` 错（`npm run build` 先行）
2. 前端页面空态/报错？`pnpm dev` 是否在跑；proxy 是否指向 8788（vite.config.ts）；CORS 兜底已开
3. tokens 列为空？serve 未在线或该会话无 `oc-` serve 会话（D044）；`/api/live` 返回 `{ok:false,error}` 即说明
4. 端口冲突？server 换 `--port` 后需同步改 `packages/dashboard/vite.config.ts` 的 proxy target
