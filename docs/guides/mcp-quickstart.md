# MCP 服务器接入（D064）

picode 提供 MCP 服务器 `@picode/mcp-server`（stdio 传输），外部 LLM/客户端可以像调用工具一样驱动 picode 的完整生命周期。

## 启动

```bash
npm run build          # 全仓构建（含 mcp-server）
PICODE_REPO=/path/to/repo npm run mcp
# 或直接：
PICODE_REPO=/path/to/repo node packages/mcp-server/dist/index.js
```

|环境变量|说明|
|--------|------|
|`PICODE_REPO`|目标仓库根（默认 process.cwd()）|
|`PICODE_RUN_ID`|可选默认 run id（工具仍可传 `run_id` 覆盖）|

## 客户端配置

任何支持 stdio MCP 的客户端（ZCode / Claude Desktop / opencode 等）：

```json
{
  "mcpServers": {
    "picode": {
      "command": "node",
      "args": ["/path/to/picode/packages/mcp-server/dist/index.js"],
      "env": { "PICODE_REPO": "/path/to/repo" }
    }
  }
}
```

## 工具面（56 个）

### 编排面（~36）—— 公司流程全生命周期

`init_run` → `goal_set_product_acceptance` → `goal_set_status` → `chunk_add` → `brief_draft/approve`（双门闩一）→ `staffing_request/draft_personas/check/approve`（双门闩二）→ `task_prepare`（建 worktree+token）→ `evidence_submit` → `handoff_package/ack` → `merge_enqueue/process`（E4 验证门）→ `task_dissolve`。

另有只读：`board_view`（看板）、`run_status`、`session_roster`、`staffing_scores`、`self_drive_events`、`evolve_write_paths`；
记忆与进化：`memory_brief_write/ack`、`change_order_create`、`knowledge_ingest`、`evolve_log`（E6）、`self_drive_tick`、`progress_sweep`；
会话：`session_register`、`session_wake_direct`/`session_sleep_direct`（直接控制，副作用）、`session_terminate`。

> 会话控制工具与 `merge_process`、`task_prepare`、`task_dissolve` 有真实副作用（进程/HTTP/git），描述中已标注。

### 执行面（20）—— pi-extension 工具 1:1，ACL 全保留

`bus_post/bus_history` · `repo_read/repo_write/repo_glob/repo_grep` · `git_status/git_diff/git_log/git_commit` · `state_read` · `run_allowlisted` · `progress_report` · `request_info/request_cross_room` · `session_wake/session_sleep/session_list` · `web_search/web_fetch`。

执行工具带 `_` 前缀的传输参数（调用时与工具参数分离）：

|参数|说明|
|----|------|
|`_run_id`|run id（默认取服务器环境）|
|`_agent_id`|agent 身份：token 主体 + 房间成员 id + profile 判定|
|`_token`|agent token（缺省由服务器代签：`issueToken(agentId, secret)`）|
|`_tool_profile`|工具画像，默认 `implement.engineer`；未知名 fail-closed 只读|
|`_cwd`|repo_* / git_* 根（默认 repo 根；建议传 `task_prepare` 返回的 worktree）|
|`_write_paths`|repo_write 写集 glob（默认 `[]`）|
|`_read_paths`|读集（默认 `[]`）|
|`_run_allowlist`|run_allowlisted 白名单|
|`_task_id` / `_squad_room`|progress_report 用|

示例：以 run-lead 身份发消息：

```
bus_post  { _run_id: "run-…", _agent_id: "run-lead",
            room: "leadership", type: "chat", body: "hello" }
```

ACL 拒绝（伪造 token / 越写集 / 非 sess-mgr 发会话指令 / state 越权）以 `{ok:false, code}` 结构化返回。

## 身份与安全

- MCP 服务器是**可信本地进程**（与 orchestrator CLI 同等信任级）；token 由服务器代签，run 级 `secret.txt` 兜底 `dev-secret`
- 执行面 ACL 六层全保留：profile 矩阵 → HMAC token → 房间成员 → 路径 glob + cwd 逃逸 → state 白名单 → allowlist token 边界
- `sponsor` 永远人类（D018）；MCP 客户端驱动 run 时 sponsor 合入闸门不变

## 自优化闭环（picode 通过 MCP 优化自己）

MCP 客户端作为「受管工位」驱动 `goal.kind=self_evolve` run（spec 19）：

```
init_run (kind=self_evolve, layers, target_repo)
→ goal 双动作 → chunk/brief → staffing → task_prepare
→ 执行面侦查/改码（repo_glob/grep/read/write）
→ run_allowlisted 跑验证 → git_commit → evidence → handoff → merge（E4 门）
→ evolve_log（E6 知识入库）→ dissolve
```

E1–E7 门闩与 sponsor 合入闸门不变；先 E1（知识）→ E2（文档/提示）→ E3（代码）。
