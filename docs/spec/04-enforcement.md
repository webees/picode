# 04 — 强制层（MUST 机械执行）

> 约定若只写在 prompt 里，并行 LLM 下不可靠。本节全部为 **MUST**，除非标明 SHOULD/MAY。

## 1. 发言总线

完整架构见 **07-hardening §2** 与 **06-platform-tech §3**。

### 1.1 API

Agent **MUST** 仅通过受控接口发言/读史：

```text
bus.post({ room, type, body, refs[] })
bus.history({ room, limit })
```

**MUST NOT** 直接写 messenger 原始存储以绕过校验。  
**MUST** 携带编排器签发的 `agent_token`。

### 1.2 post 校验

1. 校验 token ↔ agent_id  
2. 加载 `rooms/<room>/members.yaml`  
3. `from` 是否 `access` 含 `post`  
4. 否 → 拒绝；追加 `violations.log`  
5. 是 → 锁文件后 append 到 RoomStore

### 1.3 history 校验

调用方 MUST 具备 `read` 或 `post`；lobby 可配置全体 read。

### 1.4 消息

- body SHOULD 短；长内容用 `refs` 指文件。  
- 建议 type：`status|ready|objection|blocked|handoff|doc_issue|vuln_report|drift|ingest|...`

## 2. 写集（详解与选型见 06-platform-tech §4）

### 2.1 写入路径

对 engineer（及任何改业务文件的工具）：

1. 规范化路径  
2. MUST 命中本 task `write_paths`  
3. MUST NOT 写入其它 chunk 的 write 集（除非 shared 且本 chunk 为 owner）  
4. 否则拒绝 + violation  
5. 实现 MUST 在 **task worktree** 内写入（06 §1）  

### 2.2 关闭前

成功 closed 前 MUST 校验：

```text
git diff --name-only <base_sha>...HEAD
```

全部路径 ⊆ `write_paths`（允许配置忽略列表仅用于 shared 协议内路径）。

### 2.3 shared_files

```yaml
shared_files:
  - path: "src/shared/x"
    owner_chunk: chunk-a
```

非 owner MUST NOT 写；变更须 handoff 提议 + owner lead ack。

## 3. 测试证据

### 3.1 pass 条件

`sdet` 宣称 pass **当且仅当**：

1. `tasks/<id>/evidence/` 存在合法结果文件；且  
2. 所有 `type:command` acceptance 的 `exit_code==0` 且 log_ref 存在；且  
3. 所有 `type:manual` 已有 `human_ack`（若有）。  

聊天「通过」**无效**。无合法 evidence MUST NOT 进入 handoff 成功路径。

## 4. 交接

无 `handoff/` 最低集 + `acceptance.yaml` MUST NOT `dissolved`、MUST NOT 释放名额、MUST NOT 将 chunk 标 `done`。

## 5. 合并门禁

合并入口 MUST 只读：

- chunk/task 状态与 evidence  
- `gates/*`  
- `approvals/merge.yaml`  
- 阻塞级 doc_issue / 高危 violation  

详见 03-workflows §6。

## 6. Intake 禁令

`goal.status ∈ {intake, draft, blocked, cancelled}` 时：

- MUST NOT spawn `kind=implement|integrate` 三角  
- MUST 允许 `ind-res`（调研）与 `docs` 房纪要  

`status=intake` 时 SHOULD 自动或立即启动至少 `ind-res` 实例。

## 7. 联网与资料

- `web_*`：**仅** 调研三角（07 §1）。  
- 其它角色需要信息：`request_info` 流水线（07 §3）。  
- 跨房：`request_cross_room` + run-lead 批准（07 §4）。  

## 8. 违规

`violations.log` 追加结构化行。  
单 triad 越界次数超阈（配置，默认建议 3）→ 暂停该 triad，红灯 task/leadership。

## 9. 状态文件

`runs/` 写 MUST 经 atomic rename + flock（07 §5）；worktree **不**免除该要求。
