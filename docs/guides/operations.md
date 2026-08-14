# 运维规程（serve/会话/续跑/guardian 重启/会话生命周期/真相关于文件）

> 来源：run-lead 决策 C7（ERR-04 缓解 + 监督过程固化）+ D066（会话续跑机制）+ R2-C3（guardian 重启信号）+ R3-C2/C3（续跑 gate / 续跑遥测）+ D072/D073（run 收尾自动休眠 + session audit 跨 run 残留审计）+ D077/D078（摘要窗口去噪 / 平台席预算分流）+ D082（会话 checkpoint）+ D083（re-spawn 摘要去噪）+ D089/D090（决策编号全局分配器 + decision-lint）。
> 遵循本规程可避免已知的 serve 类故障人工踩坑，并正确观察/调整续跑、重启守护热载、管理 run 收尾与跨 run 会话残留。

## 决策编号规程（D089 / D090）

新决策编号由机器状态水位 ledger 全局分配（`docs/decisions/watermark.yaml` + `docs/decisions/reserve.mjs`，D089），完整性由 decision-lint 机器校验（D090）。**run-lead 在规划前须先领号，决策落地后标记占用**，避免并行 run 撞号（D084-089 曾因并行合并冲突重排）。

```
1. 规划前领号：   node docs/decisions/reserve.mjs --reserve --run <run-id> --count N
                  # 领取 N 个连续编号段并推进水位；同 run 重复 reserve 幂等返回既有预留
2. 引用/落地：    plan 与 DECISIONS 的 D0xx 引用用预留编号；决策写入 docs/DECISIONS.md（表行 + 详条）
3. 标记占用：     node docs/decisions/reserve.mjs --land --run <run-id>
4. 完整性验证：   node packages/core/dist/validate/decision-lint.js <repo>
                  # 全绿（0 error）：表行/详条唯一 + 详条↔表行对应 + 水位一致 + 引用可解析
```

要点：

- `watermark.yaml` 是**机器状态**，勿手改；规划前未领号就落地决策会触发 `RESERVATION_COLLISION`
- `decision-lint` 是 `npm run check` 的一环（persona-lint + skill-lint + decision-lint 三 lint），
  `--plan <file>` 可在写 plan 前对 plan 的 D0xx 引用预检碰撞
- 编号冲突/重复/水位漂移（DUP_TABLE / DUP_SECTION / WATERMARK_DRIFT / RESERVATION_COLLISION）是
  **error**，须在 merge 前清零；docs/** 的过期引用为 warning（历史债不阻断）
- 排查：`node docs/decisions/reserve.mjs --status` 查看水位与全部预留；watermark 损坏时 reserve.mjs
  以初始状态引导（next_number=90）

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

## 会话 checkpoint（D082）

checkpoint = 捕获时刻对文件真相的**只读投影**，写入后不可变。**它是观测/审计产物，不参与任何
状态决策**——恢复/续跑/调度/合并仍只读 session.yaml / task.yaml / transcripts / git（文件为准，
D082 边界）。MVP 仅显式捕获，guardian/merge/serve 恢复路径零改动。

### 捕获

```bash
picode checkpoint capture --repo <path> --run <id> --task <task_id> [--boundary manual]
```

- 落盘 `runs/<id>/checkpoints/<taskId>/checkpoint-<ts>.yaml`（schema v1：task_status + 三角会话
  state/budget + 各会话转录摘要（已剔模板噪音）+ git worktree 指纹 + 自指纹 sha256）
- 重复捕获产生新 ts 文件，**不覆盖**既有（不可变）；task 不存在 → 报 `NOT_FOUND`
- 语义：同输入同输出（纯函数）；捕获内容可由文件真相重演，不产生第二事实源

### 只读查询

```bash
picode checkpoint status --repo <path> --run <id> --task <task_id>   # 该 task 全部（最新在前）+ 最新
picode checkpoint status --repo <path> --run <id>                    # 全部有 checkpoint 的 task 概览
```

### 排查指引

- 想确认「某个 task 在某时刻的会话/预算/摘要」→ `capture` 后 `status` 查看；checkpoint 只是
  留痕，**不作为当前状态判定依据**（以文件真相为准）
- checkpoint 目录缺失/文件损坏 → 不影响任何恢复/续跑路径（best-effort 观测物），无需修复；
  怀疑状态漂移时重 capture 一次即可
- 需要自动化定时捕获 → 属后续候选（本轮 MVP 仅手动）；需要三面（status/CLI/MCP）同源展示 →
  亦为后续候选

## watchdog（ERR-01）

- self-drive tick 内置 probeServeHealth：serve 失联时标记 awake opencode 会话 error（不自动重 spawn 防风暴）
- 排查顺序：serve 日志 → 会话 tokens（0 = 消息未处理）→ 权限 ask（GET /permission）→ key（auth.json）

## 续跑（continuation，D066）

续跑 = guardian 对「已 awake ∧ 无 error ∧ 任务未终态 ∧ 预算未耗尽 ∧ 空闲超 `idle_sec`」的 opencode 会话按 D061 noReply 语义投喂续跑 prompt。全部状态落盘、幂等、可恢复。

续跑 prompt 含上一回合要点摘要（`transcripts/<agent>.jsonl` 启发式派生，无 LLM，D076）。转录归档因此也是语义续跑的唯一数据源。摘要窗口可配（`summary_entries` 默认 8）且投喂时剔除固定模板文本噪音（`stripNoise`，D077），避免摘要被机械投喂记录淹没；serve 重启后重 spawn（`wakeWithOpencode`）的恢复摘要同样剔除 ready 模板句（D083），与 feed 路径口径一致。

### 观察续跑状态

- `picode self-drive continuation --status`：只读预览当前候选会话数（不投喂，安全），并输出全会话续跑遥测列（见下）
- `picode status --run <id>`：快照含 `continuation` 段——`max_per_session` / `idle_sec` 配置值与 `sessions[]` 逐会话遥测
- MCP `continuation_status`：与 CLI 同源派生（同一函数），返回候选 + 全会话遥测列；三面口径一致、纯读零写

逐会话遥测列（三面同名同义）：

| 列 | 含义 |
|---|---|
| `continuations_used` | 累计自动续跑投喂次数（`session.budget.continuations`，持久化） |
| `max_per_session` | 该会话**实际适用**续跑上限（D078：task 绑定会话 = `max_per_session`，平台席 = `max_per_session_platform`） |
| `last_continuation_at` | 上次投喂时间（最近一条 outgoing 转录 ts；无转录为 `null`） |
| `in_flight` | 投喂后尚无 incoming 响应（回合进行中，该会话不会被继续投喂） |
| `platform_seat` | 平台席（未绑定任务，默认 `platform_seats: skip` 不进续跑候选） |

- 会话文件 `runs/<id>/sessions/<agent>.yaml`：`budget.continuations` 为累计续跑计数；`error` 字段可见预算耗尽停靠（`budget exceeded`）或 serve 失联（ERR-01 watchdog）
- 转录归档 `runs/<id>/transcripts/<agent>.jsonl`：每次续跑投喂落盘（含固定续跑 prompt 与响应）

### 预算调整

- `self_evolve.continuation.max_per_session`：task 绑定会话续跑上限（0=不限，保守默认 5）。续跑耗尽即停且**不等于任务成功**——若会话被 `budget exceeded` 停靠，需人工研判是否重投喂/提额
- `self_evolve.continuation.max_per_session_platform`：**平台席独立续跑上限（默认 2）**（D078）。预算按角色分流——task 绑定会话用 `max_per_session`、平台席（无 task 绑定）用 `max_per_session_platform`。**行为变更注意**：现 `platform_seats: "allow"` 配置（原继承 5）升级后平台席收紧到 2，属有意保守收窄；遥测 session 级 `max_per_session` 列显示的是该会话**实际适用上限**
- `self_evolve.continuation.summary_entries`：续跑摘要窗口条数（默认 8，0 = 关闭摘要窗口回退固定模板）（D077）。调大 = 摘要带更多转录要点（上下文更全、更臃肿）；调小 = 更轻量；投喂时自动剔除固定模板文本噪音（stripNoise），无需人工维护
- `self_evolve.continuation.idle_sec`：空闲触发间隔。调小 = 续跑更勤（回合更紧凑）；调大 = 空等更久；**须小于 `idle_sleep_sec`**，否则会话先被 idle-sleep 休眠，续跑永不触发
- 改配置后重启/下次 tick 生效（guardian 每次 tick 重读配置）

### 手动单次投喂

- `picode self-drive continuation --feed <agent>`：手动投喂 1 次续跑 prompt 并计数（不阻塞、noReply 异步）。用于：会话空闲但未触发续跑、或预算耗尽后人工研判决定再投喂
- 断连/重启衔接：serve 重启（见上）→ P1 恢复重投喂 ready → 清 error → 续跑 sweep 从持久化计数续发，不重算不超发（幂等）

### 平台席策略（D068）

- 平台席 = 无 task 绑定会话（scout/sys-arch/run-lead 等）。默认 `platform_seats: "skip"` **不进续跑候选**，防无界空转烧 token（E6 gap 3 根治）
- 需对平台席启用续跑时显式配置 `platform_seats: "allow"`；逃生路径仍受 **`max_per_session_platform`（默认 2，D078）** 独立预算有界（低于 task 绑定会话的 5），且无任务产出时继续消耗预算，运维应留意
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
3. `budget.continuations` 是否已 ≥ 该会话适用上限？预算耗尽即停——task 绑定会话上限 `max_per_session`、平台席 `max_per_session_platform`（D078）
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

浏览器打开 `http://localhost:5173/dashboard` → 选择 run → 详情页 9 视图（概览 / 进度 / 房间 / 人员 / 分块 / 看板 / 会话+tokens 实时 / 合并 / 门禁）。总览页即 run 列表 + 统计条。

### 三视图数据来源（进度/房间/人员，D071-4/D071-5）

三视图**不新增端点**，全部由既有 9 端点派生；`dashboard-server` 零改动。数据不准确时先查源端点，再查前端派生：

|视图|数据源|派生|
|------|------|------|
|进度|`/api/runs/:id/tasks`（`progress` 段）|`deriveProgress`：逐任务 phase/blocked/summary/updated_at + in-flight/受阻计数（`views.data.ts`）|
|房间|statusSnapshot `rooms`（消息数）+ `/tasks`（`work_room`/`triad`）|`deriveRooms`：squad 房按 task 派生成员；平台房按 ROLE→ROOM 约定（`role-meta.data.ts` ROOM_META）|
|人员|`/api/runs/:id/sessions` + `/tasks`（`triad`）|`derivePersonnel`：平台席（sessions）+ 任务三角席（triad）|

- 角色/房间通俗名与阶段映射 = 前端静态知识常量 `role-meta.data.ts`（同步来源见文件注释：人设 frontmatter / ROLE_PRIMARY_ROOM / terminology §3）；上游成员表/人设描述变更时需同步该文件
- 单测守护：`packages/dashboard/src/pages/dashboard/runs/[runId]/__tests__/views.test.ts` fixture 断言派生纯函数；改派生须同步测试

### Dashboard 设计约定（D071）

- **语义状态色**：状态一律用 token（`--status-success/warning/danger/info`）或 `@/utils/labels` 的色点映射，禁止硬编码色值；浅深色均满足 WCAG AA ≥4.5:1
- **域组件复用**：新页面组件优先用 `components/dashboard/`（StatCard/StatusBadge/SectionCard/EmptyState/ErrorState/Skeleton*）；加载态用骨架屏而非 spinner；`--radius` 统一 0.5rem
- **文案**：面板文案中文通俗，走 `@/utils/labels` 单一事实源（RUN_STATUS/RUN_KIND/RUN_SCALE），不写机器化/英文拼接
- **只读不变量**：展示层只派生不改数据；新增数据需求先评估既有端点派生，不新增端点（D070 只读投影契约）

### 观察 tokens 活跃度

- 前端会话页按 `refetchInterval`（2–5s）轮询 `/api/live/:runId/:agent`；tokens = 最近一条 assistant 消息的 `info.tokens.total`（serve 契约 D058）
- serve 失联 / 会话未挂 serve（无 `pi_session_id`）→ 面板显示降级提示（`{error}`），不白屏
- 排查顺序：`picode status` → serve 日志 `/tmp/opencode-serve.log` → serve 是否在线（`curl 127.0.0.1:7788/`）→ 会话 `pi_session_id` 是否存在（`sessions/<agent>.yaml`）

### 排查清单

1. `curl localhost:8788/api/runs` 非 200？server 未起或 `--repo` 错（`npm run build` 先行）
2. 前端页面空态/报错？`pnpm dev` 是否在跑；proxy 是否指向 8788（vite.config.ts）；CORS 兜底已开
3. tokens 列为空？serve 未在线或该会话无 `oc-` serve 会话（D044）；`/api/live` 返回 `{ok:false,error}` 即说明
4. 端口冲突？server 换 `--port` 后需同步改 `packages/dashboard/vite.config.ts` 的 proxy target

## 会话生命周期：run 收尾自动休眠 + 跨 run 残留审计（D072/D073）

### run 收尾自动休眠（D072）

goal 进入终态（`completed`/`cancelled`）后，平台席（无 task 绑定的 scout/sys-arch/run-lead/pm 等）会被**自动休眠**，不残留 awake 占 `max_awake`。触发点有二：

- `goal set-status --status completed|cancelled`：状态迁移后立即 `closeRun`（补发 TASK_DISSOLVED + 休眠平台席，best-effort 幂等）
- guardian tick：终态 goal 分支调用 `sleepPlatformSeats`，结果入 `slept_platform`（`picode status` 的 continuation 段旁可见）

行为要点：

- 平台席 = `taskIdOfAgent === null` 的 awake 会话；**非终态 goal 不会触发**
- 幂等：任务已 dissolved / 席位已休眠均自然跳过，重复调用零副作用
- best-effort：单席/单任务失败不阻断整体；失败残留由下方 `session audit --clean` 兜底回收

### 跨 run 残留审计（session audit，D073）

`picode session audit` 只读审计 runsRoot 下**全部 run**（含 goal.yaml 的目录），输出逐 run
残留标记与跨 run 汇总 vs `max_awake`。**`noRun` 命令，不需要 `--run <id>`**。

```bash
picode session audit --repo /private/tmp/picode-dogfood          # 纯读审计
picode session audit --repo <path> --run <runId>                 # 只看指定 run
picode session audit --repo <path> --clean                       # 清理终态 run 残留
```

输出关键字段：

| 字段 | 含义 |
|---|---|
| `runs[].run_id / goal_status / terminal` | 逐 run 状态与是否终态（completed/cancelled） |
| `runs[].awake[] / residual` | 当前 awake 会话；终态且 awake 非空 = 残留 |
| `summary.residual_awake` | 全部终态 run 的残留 awake 总数 |
| `summary.max_awake_exhausted` | `residual_awake >= max_awake`：残留已占满唤醒预算 |
| `clean.cleaned[] / clean.skipped[]` | `--clean` 实际清理的 run / 跳过（非终态或无残留）或失败的 run |
| `clean.close_run_connected` | C1 closeRun 原语是否已接通（`--clean` 前置依赖） |

### 何时需要 audit / clean

1. **新 run 前例行检查**：`picode session audit --repo <path>`，看 `max_awake_exhausted`
2. 若 `true`（或存在残留）：`picode session audit --repo <path> --clean` 清理终态 run 残留，再跑一次确认 `residual_awake=0`、非终态 run 不受影响
3. 清理失败（`skipped[].reason`）：手动 `session sleep --run <id> --agent <agent>` 或重试

### 新 run 前清理规程（minimal）

```
1. picode session audit --repo <repo>            # 审计（只读）
2. picode session audit --repo <repo> --clean     # 清理终态 run 残留
3. picode session audit --repo <repo>             # 复检：residual_awake=0
4. 若仍有残留 → 逐个 session sleep / 人工研判（失败原因见 skipped[].reason）
```

- 说明：C1/C2 已使「正常收尾的 run」自动不残留（D072 自动休眠 + D073 兜底清理）；
  上述规程是**开新 run 前的快速闸门**，防止历史 run 的僵尸 awake 会话占满 `max_awake` 阻塞唤醒
- 非终态 run 不会被清理（`not-terminal` 跳过）；`--clean` 只处理终态 run 的残留
- `close_run_connected: false` 时 `--clean` 不可用（C1 未合并），先合并 C1 或只用审计
