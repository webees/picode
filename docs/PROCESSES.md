# picode 流程总册

**本文是所有业务流程步骤的唯一权威正文。**

| 相关 | 文档 |
|------|------|
| 权威 / 分类 | [AUTHORITY.md](./AUTHORITY.md) |
| 术语（on） | [standards/terminology.md](./standards/terminology.md) |
| 岗位全目录 | [reference/glossary.md](./reference/glossary.md) |
| 组织登记 | [spec/02-organization.md](./spec/02-organization.md) |
| 文档小组 | [spec/15-docs-cell.md](./spec/15-docs-cell.md) |
| 人事 | [spec/16-hr-cell.md](./spec/16-hr-cell.md) |
| 状态机 | [spec/01-runtime.md](./spec/01-runtime.md) |
| 信息 / Git | [domains/](./domains/) |
| 架构一页 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| agent / 唤醒 / 人设 | [spec/17-agent-runtime.md](./spec/17-agent-runtime.md) |
| 自我进化 | [spec/19-self-evolution.md](./spec/19-self-evolution.md) |
| 选项与默认 | [reference/decision-catalog.md](./reference/decision-catalog.md) |

规范用语：MUST / MUST NOT / SHOULD / MAY（见 [AUTHORITY.md](./AUTHORITY.md)）。  
**改流程只改本文**；改会话调度/人设维度只改 **17**；改 ★默认只改 **decision-catalog** 并回写权威正文。

---

## 目录

1. [端到端总览](#1-端到端总览)
2. [P01 需求 Intake](#2-p01-需求-intake)
3. [P02 本仓规划与分块](#3-p02-本仓规划与分块)
4. [P03 工作提示词 Work Brief](#4-p03-工作提示词-work-brief)
5. [P04 人事招聘实现组](#5-p04-人事招聘实现组)
6. [P05 调度与开工 Spawn](#6-p05-调度与开工-spawn)
7. [P06 实现执行与进度](#7-p06-实现执行与进度)
8. [P07 证据 · 交接 · 解散](#8-p07-证据--交接--解散)
9. [P08 资料申请与信息过滤](#9-p08-资料申请与信息过滤)
10. [P09 跨房沟通](#10-p09-跨房沟通)
11. [P10 门禁与串行合并](#11-p10-门禁与串行合并)
12. [P11 文档小组：记忆 · 知识 · 汇报](#12-p11-文档小组记忆--知识--汇报)
13. [P12 Active 后需求变更](#13-p12-active-后需求变更)
14. [P13 Draft 空闲](#14-p13-draft-空闲)
15. [P14 强制解散 / 失败回收](#15-p14-强制解散--失败回收)
16. [P15 调研周期](#16-p15-调研周期)
17. [P16 自我进化（索引）](#17-p16-自我进化索引)
18. [双门闩与状态速查](#18-双门闩与状态速查)

---

## 1. 端到端总览

```text
sponsor（人类）提出需求
  ├─ sess-mgr 注册花名册；按策略唤醒 run-lead / pm / …
  ├─ P01 Intake：product + leadership ↔ sponsor ║ ind-res 并行
  │     → plan_draft → draft → sponsor 确认 → active
  ├─ P02 本仓规划：scout / sys-arch → chunks.yaml
  │
  │  对每个 ready chunk / task：
  ├─ P03 run-lead brief（docs 组装，ind-res 可供料）→ run-lead approve
  ├─ P04 people 真招聘多维人设 → run-lead approve → 建组
  ├─ P05 双门闩齐 → worktree + sess-mgr wake 实现三角 + spawn
  ├─ P06 实现 + squad-lead progress
  ├─ P07 evidence → handoff → dissolve → chunk done
  │
  ├─ P08 缺资料 → 申请过滤下发
  ├─ P09 跨域 → run-lead 监督 meeting-*
  ├─ P10 串行 merge + 门禁岗唤醒
  ├─ P11 docs 记忆 / knowledge 沉淀 / Memory Brief
  └─ goal acceptance → completed → announce
```

**平台岗：** per-run 注册；默认 sleep，由 **sess-mgr** 唤醒（见 17-agent-runtime）。  
**任务岗：** 每 task **真招聘** 实现三人组。

---

## 2. P01 需求 Intake

### 触发

sponsor（人类）提出需求 → `goal.status = intake`；sess-mgr 唤醒相关岗。

### 并行轨道（MUST）

| 轨道 | 房间 | 动作 |
|------|------|------|
| A 产品共创 | `product` | pm ↔ sponsor 澄清要什么、优先级、验收口径 |
| B 工程领导 | `leadership` | run-lead ↔ sponsor/pm；tpm 记确认项与 `open_questions` |
| C 行业研究 | `research` | **同时** 外部检索（若 `parallel_on_intake`）；brief 须 URL + retrieved_at |

- 实现小队：此阶段 **MUST NOT** spawn。  
- 文档小组：MAY 记 intake 纪要。  
- 人力资源：此阶段通常不招交付小队。  

### 步骤

1. run-lead 综合 sponsor 意图 + pm 口径 + 调研简报 → 产出 `plan_draft`。  
2. `goal.status → draft`。  
3. sponsor 确认 → 写 `approvals/goal.yaml`，字段 `user_confirmed_at`（规范字段名；语义 = sponsor 确认时间，见 terminology），`status → active`。  
4. sponsor 驳回 → 回 `intake`（调研可继续补洞）。  

### 清单（draft 前 SHOULD 覆盖）

成功标准、non_goals、约束、验收方式、scale、调研约束摘要。  
未覆盖标 `assumption` 或 `open_question`。  
`open_questions` 非空 → **MUST NOT** `active`。

### 产出

- `goal.yaml`（status、scale、acceptance…）  
- `plan_draft` 文件（路径可配）  
- `research/briefs/*`（若有）  

---

## 3. P02 本仓规划与分块

**前提：** `goal.status = active`。

1. `scout` / `sys-arch` 产出 `chunks.yaml` 与规格（L1 由文档小组收口）。  
2. 写集默认互斥；`shared_files` 须 `owner_chunk`。  
3. 编排器/工具 SHOULD 校验：写集相交、依赖环。  
4. run-lead 或 tpm 确认分块。  
5. 无依赖或依赖已 `done` 的 chunk → `ready`。  

### 公式

```text
1 chunk = 1 task(implement|integrate) = 1 work room = 1 实现三角（招聘所得）
```

---

## 4. P03 工作提示词 Work Brief

**签发人：工程主责。** 文档小组组装；调研可按需供料。

```text
tpm：task 进入可 brief 状态（依赖将就绪或已 ready）
  → run-lead：起草/审定意图（目标、边界、acceptance、禁区、必读 refs）
  → 需要外部依据？ → research 产出要点 → run-lead 删减
  → 技术写作：WORK_BRIEF.md + brief.yaml + attachments/
  → 文档质检：结构/引用完整
  → run-lead：approve（brief.yaml.approved_by + approved_at）
  → 文档小组：bus type work_brief_ready
```

### 路径

```text
tasks/<task_id>/brief/
  WORK_BRIEF.md
  brief.yaml
  attachments/
```

### 席位裁剪（SHOULD）

| 席位 | 侧重 |
|------|------|
| squad-lead | 全量 + 汇报/交接 |
| engineer | 实现、写集、技术 refs |
| sdet | acceptance、证据格式 |

### 硬规则

- 无 run-lead 批准 brief → **MUST NOT** spawn 实现三角。  
- **MUST NOT** 把未批准调研全文塞进 engineer prompt。  

---

## 5. P04 人事招聘实现组

**实现组不预置；每 task 新招（默认）。** 详见编制 `16-hr-cell`。

```text
工程主责 → people：staffing_request（标准、技能、约束、想法；可带 team_name / codename_overrides，见 16 §8）
  → recruiter：三人设 personas（frontmatter 含 codename 人设名，确定性生成）
  → people-qa：合规（含命名覆盖项）
  → people-lead：呈报工程主责
  → 工程主责：approve | revise | reject
  → recruiter：建组
       agent_id、team_name、staffing.yaml、personas/*
  → 通知编排器可 prepare
```

### 路径

```text
tasks/<task_id>/staffing/
  request.yaml
  personas/squad-lead.md | engineer.md | sdet.md
  staffing.yaml
```

### 硬规则

- 无 staffing 工程主责批准 → **MUST NOT** spawn。  
- 与 P03 **双门闩**（可同批会签，字段都要有）。  
- 人事 MUST NOT 绕过工程主责开工。  
- 文档小组可提供历史记忆摘要作人设必读 refs。  

### 可配

`hr.default_mode`: `hire_fresh`（★默认）| `pool_reuse`（不推荐；仍须 run-lead 批准，见 16 §7）。

---

## 6. P05 调度与开工 Spawn

### 前提（全部 MUST）

1. `goal.status = active`  
2. chunk 依赖满足 → ready  
3. work brief **approved**  
4. staffing **approved**  
5. 并行名额 &lt; `max_parallel_triads`  

### 步骤

1. 编排器 `git worktree add` + 分支 `picode/{run}/{task}`。  
2. 签发各 seat 的 `agent_token`，写 `triad.yaml`。  
3. work 房 members = 三角三席 + tpm（可选 post）+ run-lead read。  
4. Spawn 三个 Pi 会话（或等价），cwd=worktree。  
5. Prompt 注入：**brief 裁剪版 + persona + 运行时约束**（write_paths、房间、禁止项）。  
6. **MUST NOT** 注入未批准调研原文/全仓摘要。  
7. task → `assigned` / `running`；chunk → `in_progress`。  

---

## 7. P06 实现执行与进度

### 执行中

| 席位 | 动作 |
|------|------|
| squad-lead | 协调；`progress_report` 定时（默认 300s）上报 task/work 房 |
| engineer | `repo_write` 仅 write_paths；commit |
| sdet | `run_allowlisted`；写 evidence |

### 进度

- 连续 N 次（默认 2）无实质进展 → `at_risk`，升级 tpm。  
- 超时 `task_timeout_sec` → 技术统筹：延长 / failed / 触发 P14。  

### 缺资料 / 跨房

- 走 **P08** / **P09**，禁止自助联网与串房。  

---

## 8. P07 证据 · 交接 · 解散

### 顺序（MUST）

```text
verifying：sdet evidence pass（command exit_code=0 + log_ref）
  → handing_over（人未散，work 仍可 post）
  → 交接包齐全 + acceptance.yaml
  → dissolving → dissolved
  → staffing score：人事按 16 §9 评分沉淀（非阻断；scores.yaml + docs/knowledge/hr/）
  → chunk.status = done（解锁下游 depends_on）
```

**evidence pass ≠ 可解散。**

### 交接包 `tasks/<id>/handoff/`

| 文件 | 主责 |
|------|------|
| summary.md | squad-lead |
| artifact_index.md | engineer |
| public_contract 更新（若需） | engineer/lead |
| known_issues.md | 三人 |
| diff_scope.md | lead/编排器（⊆ write_paths） |
| 证据索引 | sdet |
| acceptance.yaml | 接收方 |

### 接收方

| 场景 | ack |
|------|-----|
| 有下游 | 下游 `squad-lead`；超时：tpm + **docs-lead 代持** |
| 无下游 | **docs-lead 或 tpm** |

交接材料由 **文档小组** 归档进 run 记忆，并评估是否入库知识管理。

### diff 门禁

交接成功前 MUST：`git diff --name-only base...HEAD` ⊆ write_paths。

---

## 9. P08 资料申请与信息过滤

工作组 **MUST NOT** 自助拉未授权资料、私自 `web_*`、扫无关全仓。

```text
任意角色 request_info
  → docs 申请队列（文档小组）
  → 若需外部：research 调研（仅调研可 web_*）
  → 调研 brief（来源+时间）
  → leadership 工程主责：approve | redact | deny
  → 文档小组：打包 packet → tasks/<id>/inbox/
  → 可选：升 work_brief 版本
  → bus 通知申请方
  → 工作组只读 packet + 当前 brief + 原 read/write 集
```

| 工程主责决策 | 含义 |
|----------|------|
| approve | 下发 |
| redact | 删减后再下发 |
| deny | 不下发细节 |

---

## 10. P09 跨房沟通

### 默认

MUST NOT post 到非成员房间。

### 申请

```text
request_cross_room
  → leadership 工程主责 approve
  → 编排器建 meeting-*：双方 + run-lead（监督 post）+ 可选 proc-audit read
  → TTL（默认 1800s）内沟通
  → resolve/cancel → 纪要进 docs → 撤销临时 post
```

### 无需申请的例外

- 本 squad 房三角内部  
- lead → progress 到 program  
- proc-audit 红灯 → leadership  
- request_* 系统申请消息  

---

## 11. P10 门禁与串行合并

### 合并策略：集成列车

```text
chunk done → 分支 merge_ready
  → 依赖拓扑排序进入队列
  → release-eng 持 merge.lock 逐个：
       rebase/merge → 烟测
       失败：abort/revert，task 回修
  → 可选 tag release/<run>/chunk-<id>
```

- **允许** 部分 chunk 先上主线（半合并）。  
- **MUST** 串行 merge，禁止并行合 main。  
- 未 done 的 chunk MUST NOT merge。  
- 实现三角 MUST NOT 自己合主干。  

### 门禁检查（读状态文件，不读聊天）

| 检查 | S | M | L |
|------|---|---|---|
| chunk done + evidence | ✅ | ✅ | ✅ |
| 集成 task（若有） | 若有 | 若有 | 通常 |
| gates/review.yaml | — | 里程碑/高风险 | ✅ |
| gates/security.yaml | — | 风险触发 | ✅ |
| 无阻塞级 doc_issue | — | ✅ | ✅ |
| 无高危 violation | ✅ | ✅ | ✅ |
| approvals/merge.yaml | ✅ | ✅ | ✅ |
| 人类签名 | — | — | MAY |

---

## 12. P11 文档小组：记忆 · 知识 · 汇报

编制与职责见 `15-docs-cell`。本文只列流程。

### 记忆运营

```text
L0 各方产出 → 技术写作 → L1
  → 文档质检
  → 文档主责批准 L2 发布给工程主责
```

### 知识入库

```text
候选（handoff 成功 / 调研高价值 / 工程主责点名）
  → 技术写作起草
  → 文档质检（来源、TTL）
  → 文档主责提交 knowledge
  → 可选 require_run_lead_skill_enable
```

### 向工程主责汇报

| 触发 | 动作 |
|------|------|
| 每 N 个 task closed（默 3） | L2 增量 |
| 审计红灯后 | 记忆是否需更正 |
| 阶段门禁前 | 完整 Memory Brief |
| goal 完成前 | docs-qa：记忆面可关闭 |

投递：`leadership`，type `memory_brief`。

---

## 13. P12 Active 后需求变更

```text
用户 ──只进──► leadership 工程领导（与工程主责）
  → goal 可标 change_review
  → run-lead 出 change_orders/<id>.yaml
  → tpm 下发受影响 chunk/task
  → 未开工：改 chunks；进行中：通知 lead 暂停/更新 acceptance
  → 实现三角 MUST NOT 直接听用户改需求
```

---

## 14. P13 Draft 空闲

配置 `draft_idle_policy`：

| 值 | 行为 |
|----|------|
| `park`（默认） | 本 run 挂起；编排器可跑其它 active run |
| `stop` | blocked/cancelled |
| `run_lead_advance` | 工程主责+调研更新 draft 后仍须用户确认（除非危险开关 force） |

超时提醒：`draft_idle_sec`（默认 86400）。  
**禁止** 静默 draft→active。

---

## 15. P14 强制解散 / 失败回收

### 强制解散 / halt / 超时

1. 通知三角 cancel  
2. dirty：auto-commit WIP 或 stash，写 `backup_ref`  
3. `git worktree remove --force` + prune  
4. triad=dissolved；task failed|cancelled  
5. 分支保留 failed TTL（默认 7d）后可 GC  
6. **禁止** 静默丢未备份脏改  

### failed 后

可新建 task + 重新 P03+P04 招聘与 brief。

---

## 16. P15 调研周期

- **触发：** intake 并行（MUST）；方案前、安全门禁前、知识请求、周期 cron（L/M 可配）。  
- **产出：** `research/briefs/*`（URL + time）。  
- **消费：** 工程主责 / 文档小组整理后进入 brief 或知识库；**不**直灌实现组。  

---

## 17. P16 自我进化（索引）

**权威正文：** [spec/19-self-evolution.md](./spec/19-self-evolution.md)（本文不展开步骤）。

| 项 | 现行规则摘要 |
|----|----------------|
| 触发 | `goal.kind = self_evolve`；target 为 picode 仓 |
| 流程 | 仍走 P01–P15；写集受 `evolve.layers` 约束 |
| 人类 | sponsor 批合入；policy 层额外确认 |
| 知识 | merge 后 SHOULD 写 `knowledge/evolve/<run_id>.md` |
| 成熟度 | E0→E1→E2→E3，见 19 §7 |

---

## 18. 双门闩与状态速查

### 实现 spawn 前（MUST 全满足）

| # | 条件 |
|---|------|
| 1 | goal = active |
| 2 | chunk ready（依赖 done） |
| 3 | work brief approved by run-lead |
| 4 | staffing approved by run-lead |
| 5 | 并行名额可用 |

### Chunk 状态

`planned → ready → in_progress → testing → handoff → done`

### Task 状态（含人事）

`created → queued → staffing → staffed → assigned → running → verifying → handing_over → closed`  
（`staffing`/`staffed` 可与 brief 并行推进）

### 房间与岗位

**不在此表维护。** 默认 on 列表 → [terminology](./standards/terminology.md)；全目录 → [glossary](./reference/glossary.md)。  
流程中出现的 ID 以 terminology 为准。

---

## 修订

| 改什么 | 改哪里 |
|--------|--------|
| 流程步骤 | **仅本文** |
| 流程编号索引 | `spec/03-workflows.md`（指针） |
| 编制细节 | `15` / `16` / `02` |
| 术语 | `standards/terminology.md` |

步骤冲突时以 **本文** 为准。
