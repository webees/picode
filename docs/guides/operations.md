# 运维规程（serve/会话/续跑/真相关于文件）

> 来源：run-lead 决策 C7（ERR-04 缓解 + 监督过程固化）+ D066（会话续跑机制）。
> 遵循本规程可避免已知的 serve 类故障人工踩坑，并正确观察/调整续跑。

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

- `picode self-drive continuation --status`：只读预览当前候选会话数（不投喂，安全）
- 会话文件 `runs/<id>/sessions/<agent>.yaml`：`budget.continuations` 为累计续跑计数；`error` 字段可见预算耗尽停靠（`budget exceeded`）或 serve 失联（ERR-01 watchdog）
- 转录归档 `runs/<id>/transcripts/<agent>.jsonl`：每次续跑投喂落盘（含固定续跑 prompt 与响应）

### 预算调整

- `self_evolve.continuation.max_per_session`：每会话续跑上限（0=不限，保守默认）。续跑耗尽即停且**不等于任务成功**——若会话被 `budget exceeded` 停靠，需人工研判是否重投喂/提额
- `self_evolve.continuation.idle_sec`：空闲触发间隔。调小 = 续跑更勤（回合更紧凑）；调大 = 空等更久；**须小于 `idle_sleep_sec`**，否则会话先被 idle-sleep 休眠，续跑永不触发
- 改配置后重启/下次 tick 生效（guardian 每次 tick 重读配置）

### 手动单次投喂

- `picode self-drive continuation --feed <agent>`：手动投喂 1 次续跑 prompt 并计数（不阻塞、noReply 异步）。用于：会话空闲但未触发续跑、或预算耗尽后人工研判决定再投喂
- 断连/重启衔接：serve 重启（见上）→ P1 恢复重投喂 ready → 清 error → 续跑 sweep 从持久化计数续发，不重算不超发（幂等）

### 续跑不触发的排查

1. 会话是否 `sleeping`/`terminated`/`error`？续跑只对 awake 且无 error 会话投喂
2. 任务是否已终态（done/dissolved）？终态不续跑
3. `budget.continuations` 是否已 ≥ `max_per_session`？预算耗尽即停
4. `idle_sec` 是否 ≥ `idle_sleep_sec`？若是则先被休眠，调小 `idle_sec`
5. 进程形态：续跑由 guardian tick 驱动，**无 daemon**——guardian 未运行则无续跑（检查 self-drive 进程存活）
