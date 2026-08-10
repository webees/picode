# 09 — 工具画像（Tool Profiles）

编排器 spawn / wake 时 MUST 绑定 `tool_profile`。未列出的工具默认 **拒绝**。  
画像可配置覆盖（见 [13-configuration.md](./13-configuration.md)）。  
会话生命周期见 [17-agent-runtime](./17-agent-runtime.md)（sleeping 岗 MUST NOT 调模型）。

**权威关系：**

|层|位置|职责|
|----|------|------|
|**允许矩阵（规范）**|**本文**|默认 on 岗可有哪些工具|
|生命周期|17|何时 awake；sleeping 不得调模型|
|实现默认值|`@picode/core` `tool-profiles.ts`|MUST 与本文语义一致；新增岗先改本文再改代码|
|项目覆盖|配置 `tool_profiles`|只收紧或按 13 显式扩展，不得静默放开写集/web|

图例：`Y`=允许 · `-`=禁止 · `L`=仅 listed paths · `W`=仅 write_paths · `G`=仅 gates/

## 1. 画像矩阵（默认 on 岗）

|Tool|sess-mgr|run-lead|tpm|proc-audit|pm|ind-res|scout|sys-arch|squad-lead|engineer|sdet|docs*|people*|code-review|release-eng|sec-eng|
|------|----------|----------|-----|------------|-----|---------|-------|----------|------------|----------|------|-------|---------|-------------|----------------|--------|
|bus_post|Y|Y|Y|Y†|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|
|bus_history|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|
|repo_read|-|Y|Y|Y|Y|Y|Y|Y|L|L|L|Y|Y|Y|Y|Y|
|repo_write|-|-|-|-|-|-|-|-‡|-|W|-|-§|-|-|-|-|
|repo_glob/grep|-|Y|Y|Y|-|Y|Y|Y|L|L|L|Y|-|Y|Y|Y|
|git_status/diff/log|-|Y|Y|Y|-|-|Y|Y|Y|Y|Y|Y|-|Y|Y|Y|
|git_commit|-|-|-|-|-|-|-|-|Y|Y|-|-|-|-|Y|-|
|run_allowlisted|-|-|-|-|-|-|-|-|-|-|Y|-|-|MAY|Y|MAY|
|web_search/fetch|-|-|-|-|-|**Y**|-|-|-|-|-|-|-|-|-|-|
|request_info|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|
|request_cross_room|-|Y|Y|Y|Y|-|-|-|Y|-|-|-|-|-|-|-|
|progress_report|Y|Y|Y|-|Y|Y|-|-|**Y**|-|-|Y|Y|-|Y|-|
|state_read|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|Y|
|bare_bash|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|

\* docs\* = docs-lead / tech-writer / docs-qa；people\* = people-lead / recruiter / people-qa（people 默认无 web、无业务写）。  
† proc-audit 的 bus_post 宜限红灯/drift 类 type 或配置允许房。  
‡ sys-arch 可写 run 内规格/public_contract 路径（配置列出），**不是**业务 write_paths。  
§ docs 写 `runs/.../docs`、`skills/`、`docs/knowledge/` 等配置根。  

**sponsor：** 人类通道，**不**绑定 LLM tool_profile 调用；仅经 CLI/UI 注入允许的 bus 消息。  

**sess-mgr：** 仅调度；MUST NOT 有 repo_write / git_commit / approve_merge 类能力（批准仍走 run-lead + 编排器机械门闩）。

## 2. 路径集合

|集合|定义|
|------|------|
|write_paths|task.yaml / chunk|
|read_paths|chunk + 下发包 `inbox/**` + public_contract|
|listed L|read_paths ∪ write_paths ∪ 明确授权的 specs|

## 3. 启动注入（MUST 字段）

```yaml
agent_id: engineer@task-a-1
agent_token: "..."
run_id: run-001
tool_profile: implement.engineer
cwd: /path/to/worktree
write_paths: ["src/module-a/**"]
read_paths: ["src/shared/public/**", "tasks/task-a-1/inbox/**"]
rooms_post: ["squad-task-a-1"]
rooms_read: ["squad-task-a-1", "program"]
progress_interval_sec: 300
session_state: awake   # sleeping 时宿主 MUST NOT 调模型
```

## 4. 拒绝响应

```json
{
  "ok": false,
  "code": "WRITE_PATH_DENIED" | "TOOL_DENIED" | "ROOM_POST_DENIED" | "TOKEN_INVALID" | "COMMAND_NOT_ALLOWLISTED" | "SESSION_SLEEPING",
  "message": "...",
  "details": {}
}
```
