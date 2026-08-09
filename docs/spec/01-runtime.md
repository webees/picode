# 01 — 运行时契约

## 1. 目录布局（单 run 真源）

```text
runs/<run_id>/
  goal.yaml
  chunks.yaml
  boards/parallel.yaml          # max_parallel_triads, queue
  rooms/<room_id>/members.yaml
  tasks/<task_id>/
    task.yaml
    triad.yaml
    evidence/                   # 测试证据
    handoff/                    # 交接包（解散前 MUST）
  gates/                        # review.yaml, security.yaml, ...
  approvals/                    # goal.yaml, merge.yaml
  research/briefs/                 # 调研简报
  violations.log
  docs/                         # L1/L2 等过程文档输出
```

Skills / 可复用知识在仓库约定路径（如 `skills/`、`docs/knowledge/`），经知识库流程更新。

### 1.1 Git 布局（与 06-platform-tech 一致）

```text
# 每个实现 task 一个 worktree（路径可配）
.git/
worktrees/picode/<run_id>/<task_id>/   # cwd for 实现三角
branches: picode/<run_id>/<task_id>
```

主工作区对实现三角默认只读；合并仅 release-eng。

## 2. 状态机

### 2.1 Goal

```text
intake → draft ⇄ intake
         ↓
       active ⇄ blocked
         ↓
    completed | cancelled
```

| 状态 | 含义 | MUST |
|------|------|------|
| `intake` | 用户与工程领导讨论；调研并行 | MUST NOT spawn implement 三角 |
| `draft` | 工程主责已交 plan_draft，待用户确认 | MUST NOT spawn implement；`open_questions` 非空 MUST NOT → active |
| `active` | 用户已确认 | 允许规划与实现调度 |
| `blocked` | 外部阻塞 / halt | MUST NOT 新 spawn 实现 |
| `completed` / `cancelled` | 终态 | — |

### 2.2 Chunk

```text
planned → ready → in_progress → testing → handoff → done
                ↘ blocked
       → cancelled
```

| 状态 | 含义 |
|------|------|
| `planned` | 分块表中，依赖未齐或未排期 |
| `ready` | 依赖方均为 `done`（含交接 ack），等名额 |
| `in_progress` | 实现三角已组队 |
| `testing` | 测试验证出 evidence |
| `collab` | 证据已 pass，交接中（人未散） |
| `done` | handoff 已 ack；可解锁下游；**≠ 已合主干** |

### 2.3 Task

```text
created → queued → assigned → running → verifying → handing_over → closed
                                     ↘ failed → …
```

### 2.4 Triad

```text
forming → active → handing_over → dissolving → dissolved
```

`handing_over` 期间 work 房 post 仍有效。  
`dissolved` 后 MUST 收回 post、释放名额；MUST 保留 `tasks/<id>/evidence` 与 `handoff/`。

### 2.5 编排器自动迁移（MUST 不经 LLM 决策）

| 条件 | 动作 |
|------|------|
| goal=active 且依赖全 done | chunk planned→ready |
| ready 且名额>0 且 work brief 已批 且 staffing 已批 | spawn 实现三角；in_progress |
| evidence 合法 pass | → handoff / handing_over |
| handoff 包齐 + acceptance.yaml | 允许 dissolving |
| dissolving 完成 | chunk=done, task=closed, triad=dissolved, 释放名额 |
| 心跳超时 | blocked/failed + 红灯 |
| 小管理 progress 超时/无进展 | at_risk → 升级 tpm（见 06 §5） |

## 3. 主循环（伪代码）

```text
loop until goal in (completed, cancelled) or run.halt:
  if goal in (intake, draft):
    serve leadership dialogue
    allow/ensure research parallel
    allow docs notes
    MUST NOT spawn implement triads
    continue
  if goal == active:
    refresh ready chunks from depends_on
    spawn implement triads up to max_parallel_triads
    check heartbeats
  on schedule: spawn proc-audit (read-only)
  on schedule (scale): research refresh
  on task.closed: index docs; unlock dependents
  on integrate milestone: queue gate roles
  on merge approval: release-eng merge
  if goal acceptance met: wait run-lead completed
```

技术统筹 LLM：**例外**（重切块、冲突、失败升级），MUST NOT 对每个 ready 人工点头。

## 4. Schema 最小字段

完整样例见 `reference/schemas/`。

### goal.yaml

- `id`, `title`, `intent`, `status`, `scale` (S\|M\|L)
- `acceptance[]` {id, type: command\|file_exists\|manual, spec}
- `non_goals[]`, `open_questions[]`, `assumptions[]`
- `plan_draft_ref`, `user_confirmed_at`（**规范字段名**；语义 = sponsor 确认时间，见 terminology）, `run_lead_id`

### chunks.yaml 单条

- `id`, `write_paths[]`, `read_paths[]`, `public_contract`
- `depends_on[]`, `shared_files[]` {path, owner_chunk}
- `acceptance[]`, `status`, `task_id`

### task.yaml

- `id`, `chunk_id`, `goal_id`, `kind` (implement\|integrate\|explore\|design)
- `status`, `write_paths[]`, `acceptance[]`
- `triad` {lead, engineer, sdet}
- `work_room`, `retries`, `max_retries`, `heartbeat_at`

### evidence（成功关闭前）

- `result: pass|fail`
- `commands[]` {cmd, exit_code, log_ref}
- command 类 acceptance 的 exit_code MUST 为 0 才允许进入 handoff 成功路径

### handoff/acceptance.yaml

- `accepted_by[]`, `accepted_at`
- **无此文件 MUST NOT dissolved**

## 5. 人类操作面

| 动作 | 效果 |
|------|------|
| 提出需求 | → intake；启动调研并行 |
| 确认/驳回 draft | → active 或回 intake |
| halt | 停止新 spawn |
| manual acceptance | `human_ack` |
| 合并签名（L 可选） | approvals/merge |
| 仲裁 | 覆盖争议 |

## 6. 失败默认

| 事件 | 动作 |
|------|------|
| sdet fail | 同组返工；retries++ |
| retries > max（默认 3） | task failed；技术统筹例外处理 |
| 越界写 | 拒绝 + violations；超阈暂停 triad |
| 跨块死锁 | meeting 或改 depends_on |
