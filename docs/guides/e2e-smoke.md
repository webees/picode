# E2E 冒烟（真实 LLM 闭环）— 使用指南

`scripts/e2e/smoke.sh` 在**临时 git 业务仓**上跑完整交付闭环，并让规则引擎
经 **opencode serve 真实唤醒 LLM 会话**（不是 mock）——这是对「v1 可正式运行」
的最直接验证。命令：`npm run test:e2e`。

## 前置条件

1. **构建**：`npm run build`（脚本调用 `packages/orchestrator/dist/cli.js`）
2. **opencode serve 已启动并注入 LLM 凭据**（key 只存在于 serve 进程环境，
   脚本不接触 key）：

   ```bash
   export OPENCODE_GO_API_KEY=<你的 key>
   ~/.opencode/bin/opencode serve --port 7788
   ```

   **建议用独立实例**（`SERVE_URL` 覆盖），避免与其他 opencode 流程排队抢
   模型资源——脚本会自动用临时 HOME 生成指向该实例的全局配置，完全不碰
   你真实的 `~/.picode/config.yaml`：

   ```bash
   SERVE_URL=http://127.0.0.1:7799 ~/.opencode/bin/opencode serve --port 7799 &
   npm run test:e2e   # 或用 SERVE_URL=http://127.0.0.1:7799 npm run test:e2e
   ```

3. **LLM 后端已启用**（二选一，13 §2 层级）：
   - 用户全局 `~/.picode/config.yaml`（推荐，所有业务仓免配）：

     ```yaml
     opencode:
       enabled: true
       base_url: "http://127.0.0.1:7788"
       provider_id: opencode-go
       model_id: deepseek-v4-flash
     ```

   - 或业务仓 `.picode/config.yaml` 同结构

## 覆盖的链路

|步|断言|
|----|------|
|1–3|init → P01 产品口径 → goal active → chunk add|
|4|brief draft + run-lead approve（双门闩之一）|
|5|staffing request → draft-personas → people-qa check → run-lead approve（双门闩之二）|
|6|**三角会话真实 awake，`pi_session_id = oc-<id>`**（规则引擎经 opencode 建会话，D057）|
|7|向 engineer 会话发消息，模型真实产出（LLM 链路）|
|8|task prepare → worktree 提交交付文件（模拟 engineer 产出）|
|9|三角 sleep（服务端会话 DELETE）→ evidence → handoff package+ack → dissolve|
|10|merge enqueue → **串行 merge 真实合入 main**（文件在 main 上可见）|
|11|status 快照一致性|

## 运行时特性

- **耗时**：真实模型调用较慢（staffing request 唤醒 people 三角 + approve 唤醒
  实现三角 = 6 次 LLM 调用，串行），全流程约 **3–12 分钟**。
- **清理**：`trap EXIT` 自动删除本次创建的服务端 `picode:*` 会话与临时仓；
  进程被强杀（Ctrl-C 后 kill -9）时残留会话需手动清理：

  ```bash
  curl -s http://127.0.0.1:7788/session \
    | python3 -c "import sys,json;print('\n'.join(s['id'] for s in json.load(sys.stdin) if str(s.get('title','')).startswith('picode:')))" \
    | while read -r id; do curl -s -X DELETE "http://127.0.0.1:7788/session/$id" -o /dev/null; done
  ```

## 与单元测试的关系

- `npm test`（快，~5s）：纯 mock，**隔离 HOME**（不读 `~/.picode/config.yaml`），
  不含任何真实 LLM 调用——CI/日常回归用。
- `npm run test:e2e`（慢，真实成本）：验证真实 LLM 后端接入后的完整闭环——
  发布/验收用。
