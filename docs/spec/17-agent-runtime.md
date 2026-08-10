# 17 — Agent 运行时（唯一正文）

**本文是 agent 生命周期、会话、人设、唤醒策略的唯一权威。**  
流程步骤仍只在 [PROCESSES.md](../PROCESSES.md)；术语在 [terminology](../standards/terminology.md)。  
产品级选项与默认值总表：[reference/decision-catalog.md](../reference/decision-catalog.md)。

---

## 1. 角色分层（谁是什么）

| 层 | 是谁 | 是否 LLM 会话 | 说明 |
|----|------|---------------|------|
| **人类** | `sponsor` | **否** | 永远人类；CLI/UI 输入；不占模型 |
| **会话调度** | `sess-mgr` | **是** | 总管理 AI；决定其余岗 **唤醒/休眠/结束** |
| **平台岗** | 默认 on 的编制岗 | **是** | 每 run 一份；由 sess-mgr 调度 |
| **任务岗** | implement 三角实例 | **是** | 每 task 招聘；worktree 绑定 |
| **编排器** | orchestrator | **否** | 无 LLM；只执行状态机与机械门禁 |

```text
sponsor(人)
    │ 意图 / 确认
    ▼
orchestrator(无 LLM) ◄── 状态、token、worktree、双门闩机械校验
    │
    ▼
sess-mgr(LLM) ──唤醒/休眠──► 平台岗会话 + 任务岗会话
```

---

## 2. v1 产品目标（已定）

| 项 | 取值 |
|----|------|
| v1 目标 | **公司岗位仿真完整**（非「先只做最小合并链路」） |
| 产品房 | **要** → 房间 `product` |
| 默认 on 岗 | 见 terminology；**除 sponsor 外均为 LLM 会话** |
| 会话数量控制 | **不靠减岗**；靠 **`sess-mgr` 唤醒策略** |
| 平台 cell | **per-run**；跨 run 只沉淀到 `knowledge` + 仓库路径 |
| staffing | **真招聘**；人设多维（§6） |
| sponsor | **永远人类** |

---

## 3. 默认 on 会话清单

### 3.1 人类（非会话）

| ID | 中文 | 入口 |
|----|------|------|
| `sponsor` | 业务赞助 | CLI / UI；写入 leadership 仅允许的人类消息类型 |

### 3.2 元调度（每 run 一个）

| ID | 中文 | 职责 |
|----|------|------|
| `sess-mgr` | 会话调度 | 读 run 状态；按策略 **wake / sleep / terminate**；不得写业务代码、不得终裁 goal |

### 3.3 平台岗（每 run 注册；默认休眠直至 wake）

| ID | 中文 | 主房 | 典型唤醒触发 |
|----|------|------|----------------|
| `run-lead` | 工程主责 | leadership | run 创建、sponsor 消息、门闩、合并 |
| `tpm` | 技术统筹 | program · leadership | 多 task、进度、调度例外 |
| `proc-audit` | 流程审计 | leadership | 周期巡检、红灯、门禁前 |
| `pm` | 产品策划 | **product** | intake、验收口径、变更 |
| `ind-res` | 行业分析 | research | intake 并行、资料申请需外网 |
| `scout` | 代码勘察 | architecture | P02 本仓规划 |
| `sys-arch` | 软件架构 | architecture | P02、高风险变更 |
| `docs-lead` | 文档主责 | docs | brief 组装、Memory Brief、申请队列 |
| `tech-writer` | 技术写作 | docs | L1/L2 写作任务 |
| `docs-qa` | 文档质检 | docs | 发布 L2 前、门禁前 |
| `people-lead` | 人才主责 | people | 收到 staffing_request |
| `recruiter` | 招聘专员 | people | 起草人设 |
| `people-qa` | 编制合规 | people | 人设合规检查 |
| `code-review` | 代码审查 | quality | merge 前（按 scale） |
| `release-eng` | 发布执行 | release | merge 列车 |
| `sec-eng` | 安全工程 | security | 安全门禁触发 |

### 3.4 任务岗（每 task 招聘后注册）

| ID 模式 | 中文 | 主房 |
|---------|------|------|
| `squad-lead@<task>` | 小队主责 | `squad-<task>` |
| `engineer@<task>` | 软件开发 | 同上 |
| `sdet@<task>` | 测试验证 | 同上 |

---

## 4. 会话状态机（每 agent 实例）

```text
registered → sleeping ⇄ awake → terminated
                 ▲         │
                 └─ sleep ─┘
```

| 状态 | 含义 | 谁可改 |
|------|------|--------|
| `registered` | 本 run 花名册已有；未分配 Pi session | orchestrator |
| `sleeping` | 有身份/token；无活跃 Pi 会话；不烧推理 | **sess-mgr** 或超时策略 |
| `awake` | 活跃 Pi 会话；可收 post / 调工具 | **sess-mgr** wake |
| `terminated` | 本 run 内不再唤醒（task dissolved 等） | orchestrator + sess-mgr |

**MUST：**

- 非 `awake` MUST NOT 消耗模型调用。  
- `sponsor` 不进入此状态机。  
- `sess-mgr` 自身策略：run 打开期间 SHOULD 保持可唤醒；空闲可 sleep，但 sponsor 消息 / 状态机事件 MUST 能再 wake。  
- orchestrator 在机械门禁失败时 MAY 强制 wake `run-lead` / `proc-audit`（配置 `sess_mgr.allow_orch_force_wake`）。  

状态落盘：`runs/<id>/sessions/<agent_id>.yaml`（样例 [session.yaml](../reference/schemas/session.yaml)）。

---

## 5. 会话调度 `sess-mgr` 策略

### 5.1 输入（只读）

- `goal` / `chunks` / `tasks` 状态  
- bus 未读与 type  
- staffing / brief 门闩  
- 超时与 progress  
- scale S/M/L  

### 5.2 输出（经 orchestrator API，禁止私自杀 OS 进程）

| 动作 | 含义 |
|------|------|
| `wake(agent_id, reason)` | 确保 awake；注入 system+persona+brief 切片 |
| `sleep(agent_id, reason)` | 结束 Pi 会话；保留 token 与记忆指针 |
| `terminate(agent_id, reason)` | 任务结束/解散后不再唤醒 |

### 5.3 默认策略（可配置覆盖）

| 事件 | 默认动作 |
|------|----------|
| run 创建 | wake: `sess-mgr`, `run-lead`, `pm`；sleep 其余平台岗 |
| intake 开始 | wake: `run-lead`, `pm`, `ind-res`（若 `research.parallel_on_intake`） |
| sponsor 新消息 | wake: `run-lead`（及当前负责对接岗） |
| goal → active | wake: `scout`,`sys-arch`；其后 sleep 至下一触发 |
| staffing_request | wake: people 三角 |
| brief 需组装 | wake: docs 三角 |
| task 双门闩齐 | wake: 该 task 实现三角 |
| progress 到期 | wake: 对应 `squad-lead` |
| merge_ready | wake: `release-eng`；按 scale wake `code-review`/`sec-eng` |
| 无事件且 idle > `sess_mgr.idle_sleep_sec` | sleep 非关键岗 |
| task dissolved | terminate 该 task 三实例 |

**sess-mgr MUST NOT：** 改 goal.status 为 active、批 merge、改 write_paths、写业务代码。

---

## 6. 人设（Persona）— 真招聘 · 多维

**权威流程：** PROCESSES P04 + [16-hr-cell](./16-hr-cell.md)。  
**本文钉：人设必须覆盖的维度（MUST 字段）。**

| 维 | 字段建议 | 说明 |
|----|----------|------|
| 身份 | `display_name`, `instance_id`, `seat`, `codename` | 如 engineer@task-a；codename 人设名见 16 §8 |
| 使命 | `mission` | 本 task 一句话目标 |
| 边界 | `scope_in`, `scope_out` | 做什么/不做什么 |
| 能力 | `skills[]`, `stack[]` | 技术栈与专长 |
| 风格 | `communication`, `risk_posture` | 沟通与风险偏好 |
| 工具 | `tool_profile`, `write_paths`, `read_paths` | 与配置一致 |
| 协作 | `reports_to`, `handoff_to`, `rooms_post[]` | 汇报与房间 |
| 质量 | `acceptance_focus[]`, `definition_of_done` | 何谓完成 |
| 禁区 | `forbidden[]` | 与 brief 对齐 |
| 记忆 | `must_read_refs[]` | packet / brief 路径 |
| 检查 | `check_rubric`（仅 check 席） | 打回标准 |

`recruiter` 起草 → `people-qa` 校验维度齐全 → `people-lead` 呈报 → **`run-lead` 批准** → 落盘 `tasks/<id>/staffing.yaml` + `personas/*.md` → 方可 spawn。

---

## 7. Agent 模板与实例

| 路径 | 用途 |
|------|------|
| `.picode/agents/<role_id>.md` | **角色模板**（静态职责/禁止） |
| `runs/.../personas/<instance_id>.md` | **实例人设**（招聘产出；含 codename 人设名） |
| `runs/.../staffing/scores.yaml` | **评分档案**（16 §9；task 结束后沉淀） |
| `docs/knowledge/hr/…` | **人设/团队评分聚合**（16 §9；跨 run 优化用） |
| spawn 时 system | 模板 ⊕ 人设 ⊕ 当前 brief 切片 ⊕ 房间规则 |

**MUST：** 每个默认 on 的 LLM 岗有对应 `agents/<id>.md`。  
**MUST NOT：** 用模板代替已批准人设（实现三角 spawn 时）。

---

## 8. 与编排器分工

| 能力 | orchestrator | sess-mgr |
|------|--------------|----------|
| 状态机合法迁移 | ✅ | 只读建议 |
| token / members | ✅ | 否 |
| worktree | ✅ | 否 |
| brief/staffing 文件门闩 | ✅ 机械 | 可提醒 wake |
| 何时跑哪个模型会话 | 执行 wake 请求 | ✅ 决策 |
| goal/merge 终裁 | 否 | 否 → `run-lead` + 人类 sponsor |

---

## 9. 房间（agent 相关增量）

| 房 | 用途 |
|----|------|
| `product` | 产品共创：需求口径、优先级、验收；主 post：`pm`；`sponsor`/`run-lead` 按成员表 |
| 其余 | 见 terminology |

---

## 10. 配置键（约定）

```yaml
sess_mgr:
  enabled: true
  idle_sleep_sec: 600
  allow_orch_force_wake: true
  max_awake: 8              # 同时 awake 上限（调度目标，非成本熔断）
  always_register: true     # on 岗全部 registered

sponsor:
  human_only: true          # MUST true in v1

staffing:
  mode: real_recruit        # real_recruit | template（v1 固定 real_recruit）
  persona_dimensions: full  # 见 §6

cells:
  lifetime: per_run         # v1 固定
```

---

## 11. 实现检查清单

分阶段与 DoD 见 **[18-v1-completion-plan](./18-v1-completion-plan.md)**（A–H / U1–U12 / T20+）。

摘要：

- [ ] sessions 落盘 + wake/sleep API（阶段 A）  
- [ ] 规则调度 + sess-mgr 仲裁（阶段 B）  
- [ ] Pi 进程绑定（阶段 C）  
- [ ] 真招聘多维人设 + 双门闩（阶段 D）  
- [ ] product intake 产物（阶段 E）  
- [ ] progress / merge 门禁（阶段 F）  
- [ ] 记忆与变更（阶段 G）  
- [ ] 观测 status（阶段 H）  

---

## 12. 非目标（v1）

- 成本自动熔断（产品策略：不因钱杀任务）  
- sponsor 的 LLM 伪装  
- 跨 run 常驻同一 Pi 会话（仅 knowledge 沉淀）  
- sess-mgr 拥有 merge/goal 终裁权  
