# 运维规程（serve/会话/真相关于文件）

> 来源：run-lead 决策 C7（ERR-04 缓解 + 监督过程固化）。遵循本规程可避免
> 已知的 serve 类故障人工踩坑。

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
