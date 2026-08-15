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
5. 是 → **owner 围栏（I5，叠加在 ACL 之上，更严）**：
   - **目标侧（子代理会话房仅父可路由）**：`rooms/<room>/meta.yaml` 声明 `owner_session`
     （该房间归属的会话）且该会话为子代理（`delegation_depth>0` 且 `parent_session` 非空）
     → 发送者非其 `parent_session` → `ROOM_POST_DENIED`（agent-busy 语义等价物，
     消息含 owner 围栏标记）；父→子经父→子消息通道，其它成员须经父转达或显式授权。
   - **发送侧（子代理不可问人）**：发送者为子代理（`delegation_depth>0` 且
     `parent_session` 非空）→ 仅可向其父会话可发言的房间发言（成员/类型校验兜底）——
     子代理不得直接向 sponsor/领导层房提问，须经父转达。
6. 是 → 锁文件后 append 到 RoomStore

非子代理房间（无 `owner_session` 元数据 / 发送者非子代理）语义零变更。

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

**子代理只收窄（I4）**：子代理任务（task.yaml 声明可选 `parent_task`）有效写集 =
父 task `write_paths` ∩ 本 task 声明 `write_paths`（**只收窄、不放宽**）——
staffing `draftPersonas` 生成子代理 persona 时即落有效写集；people-qa `checkPersonas`
校验子 persona `write_paths` ⊆ 父 task `write_paths`，子宽于父 → 结构化拒绝；
父 task 缺失 → fail-loud。无父链（顶层任务）时规则退化为上述静态白名单语义（零变更）。

> **沙箱叠加（E，§10）**：`write_paths` 静态白名单语义不变（机械校验仍是第一道门）；
> 会话级 sandbox mode（read-only / workspace-write / danger-full-access）叠加其上作
> **动态兜底围栏**——read-only 拒一切写；workspace-write（默认）白名单内可写、越界可申请
> 一次性升级（run-lead 代批，allowed-once）；danger-full-access 工作房内任意写（仍拒 path
> escape 出 cwd）。越界无授权仍以 `WRITE_PATH_DENIED` 结构化拒绝。  

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

## 10. 沙箱三态 + 升级审批 + read-before-edit（E）

> 实现域：`core/src/sandbox.ts` / `core/src/approval.ts`（单写者 chunk-c3-sandbox-approval）；
> 会话 env 由 orchestrator pi-adapter `buildPiEnv` 注入。本轮不新增 config 键（D104）。

### 10.1 定位（E4：双轨）

`write_paths` 静态白名单语义不变（§2.1 机械校验仍为第一道门），sandbox mode 是叠加其上的
**动态兜底围栏**：

| mode | 行为 |
|---|---|
| `read-only` | **拒一切写**（含 write_paths 内）；mode 围栏先于白名单，`SANDBOX_DENIED`（含生效 mode 标记） |
| `workspace-write`（默认） | write_paths 内可写；越界拒绝（`WRITE_PATH_DENIED` 含生效 mode），可申请一次性升级 |
| `danger-full-access` | 工作房（cwd）内任意路径可写（仍拒 path escape 出 cwd） |

每调用 resolve：会话 env `PICODE_SANDBOX_MODE` 覆盖 > 默认 `workspace-write`；非法 env 值
fail-loud（`SANDBOX_MODE_INVALID`）。

### 10.2 越界与一次性升级阶梯（E2）

- 越界写（write_paths 外且无授权）→ `WRITE_PATH_DENIED` 结构化拒绝，错误码含生效 mode：
  消息含 `[sandbox: file access denied under <mode> mode]` 标记与升级提示。
- 升级参数成对：`repo_write` 增 `sandbox_permissions` + `justification`：
  - 无理由升级（缺一/空白 justification）= `ESCALATION_MALFORMED`（malformed 拒绝）；
  - 非法 mode 值 = `ESCALATION_MALFORMED`；
  - 非严格更宽（`WIDER_MODES` 执行时校验：read-only→[workspace-write, danger-full-access]、
    workspace-write→[danger-full-access]、danger-full-access→[]）= `SANDBOX_ESCALATION_INVALID`。
- 审批策略 `PICODE_APPROVAL_POLICY`（默认 `ask`）：
  - `ask` → 请求落 `runs/<id>/approvals/pending-<id>.json`（asked 记录：from_agent/task_id/path/mode/reason）；
  - `never` → fail-closed 直接拒绝（`APPROVAL_DENIED`）且**不落请求文件**。
- 决策：`picode approval list [--status …]` 观测；`picode approval decide --id <id> --approve|--reject`
  （answerer=**run-lead** 代批；policy 层动作走 sponsor 人工）。决策写回**同一文件**成对审计
  （asked+decided 同文件 status：decided.by/decision/at）。
- **allowed-once**：重试 `repo_write` 带 `approval_id`（且 `sandbox_permissions`+`path` 与请求一致）
  单次放行，消费后 status=`used`；重试再验拒绝（`APPROVAL_ALREADY_USED`）。pending / rejected /
  未知 / 无 answerer 一律 fail-closed（`APPROVAL_PENDING`/`APPROVAL_REJECTED`/`APPROVAL_NOT_FOUND`）。
- 落盘一律经 `withFileLock`（atomic.ts，与 goal/checkpoint CAS 同源）。
- **D071**：审批观测走 run 目录文件（approvals/*.json），零 dashboard 端点新增。

### 10.3 read-before-edit 守卫（E3）

- `repo_read` 记录本会话（extension 进程内 observed 集）读过的文件；
- `repo_write` 目标为**已存在**文件且本会话未读过 → `FS_NOT_OBSERVED`
  （"edit requires reading first"）；
- 新建文件（createIfAbsent 语义）无需预读；
- 开关 `PICODE_READ_BEFORE_EDIT`（默认**开**；`0/false/off/no` 显式关闭，其余 fail-closed 保持开）。

### 10.4 配置旋钮（D104）

沙箱/审批/守卫三处开关全部走会话 env（`PICODE_SANDBOX_MODE` / `PICODE_APPROVAL_POLICY` /
`PICODE_READ_BEFORE_EDIT`，默认 workspace-write / ask / 开）+ `core/src/sandbox.ts` 常量，
本轮不新增 config 键。
