# 16 — 人事部（按任务招聘 · 人设 · 建组）

## 1. 原则

1. **工作组不预置常驻编制**（实现类）：每个 implement/integrate task 需要时再 **招聘** 一支三人组。  
2. **工程主责提需求，人事做人设，工程主责拍板，人事建组**。  
3. 人设（persona）决定：角色 prompt 侧重、tool_profile、model、展示名、约束条款；逻辑 seat 仍为 squad-lead/engineer/sdet。  
4. 平台岗 **per-run** 注册（见 [17-agent-runtime](./17-agent-runtime.md)）；**实现三角每个 task 真招聘新建**。  
5. v1 staffing 模式：**真招聘**（`staffing.mode: real_recruit`）；人设多维 MUST 见 17 §6。  

## 2. 人事部编制（三三制）

| 席位 | ID | 中文 | 职责 |
|------|-----|------|------|
| 领导 | `people-lead` | 人才主责 | 接收工程主责用工单、把关人设质量、向工程主责呈报候选编制、建组后登记 |
| 执行 | `recruiter` | 招聘专员 | 起草人设（persona）、生成 agent 实例 id、写 triad 档案、准备 prompt 片段 |
| 监督 | `people-qa` | 编制合规 | 校验三人席位完整、tool_profile 合法、无越权工具、与 write_paths/brief 匹配 |

主房：`[room:people]` **人力资源**（可配置 display_name）。

## 3. 招聘流程（MUST）

**步骤权威正文：** [PROCESSES.md](../PROCESSES.md) **P04**（及 spawn **P05** 双门闩）。

硬规则摘要：

- 无工程主责对 **staffing 包** 的 approve → MUST NOT spawn 实现三角。  
- 无 work_brief 批准与 staffing 批准 **双门闩**。  
- 人事 MUST NOT 绕过工程主责直接开工。  
- 实现组默认每 task 新招，不预置常驻三人。

## 4. 产物路径

```text
tasks/<task_id>/staffing/
  request.yaml          # 工程主责用工单（可含命名覆盖，见 §8）
  personas/
    squad-lead.md       # 人设正文（frontmatter 含 codename 人设名，见 §8）
    engineer.md
    sdet.md
  staffing.yaml         # 机器可读：三角绑定、team_name、profile、status
  scores.yaml           # task 结束后的评分档案（见 §9）
```

### 4.1 request.yaml（工程主责 → 人事）

```yaml
id: staff-req-001
task_id: task-chunk-a
from: run-lead
status: submitted   # submitted | in_hr | run_lead_review | approved | rejected
skills_wanted: ["typescript", "testing"]
constraints: ["no network", "write_paths only"]
notes: "Prefer careful sdet"
reuse_persona_ids: []   # optional past persona templates
team_name: "北辰"        # optional 团队名覆盖（缺省确定性生成，§8）
codename_overrides: { engineer: "白泽" }   # optional 人设名覆盖（§8）
```

### 4.2 staffing.yaml（人事 → 工程主责批准后锁定）

```yaml
schema_version: "1"
task_id: task-chunk-a
status: approved
approved_by: run-lead
approved_at: "..."
team_name: "北辰"    # 团队名（§8）：request 覆盖或按 task_id 确定性生成
triad:
  squad-lead: { role_template: squad-lead, agent_id: squad-lead@task-chunk-a, tool_profile: implement.squad-lead, persona_file: personas/squad-lead.md }
  engineer: { role_template: engineer, agent_id: engineer@task-chunk-a, tool_profile: implement.engineer, persona_file: personas/engineer.md }
  sdet: { role_template: sdet, agent_id: sdet@task-chunk-a, tool_profile: implement.sdet, persona_file: personas/sdet.md }
```

## 5. 人设（Persona）内容

**维度权威清单（MUST 字段）：** [17-agent-runtime §6](./17-agent-runtime.md)（身份/使命/边界/能力/风格/工具/协作/质量/禁区/记忆/检查）。

本节不重复展开，避免双源。摘要：

- 模板：`.picode/agents/<role_id>.md`  
- 实例：`staffing/personas/*.md`（**以批准后的实例为准**；身份维含 `codename` 人设名，见 §8）  
- `people-qa` MUST 校验维度齐全后再呈报 `run-lead`  

### 5.1 最低可读清单（与 17 对齐的检查表）

| 检查 | 说明 |
|------|------|
| mission | 本 task 使命 |
| scope_in / scope_out | 边界 |
| skills / stack | 能力 |
| codename | 人设名（身份维，§8） |
| tool_profile + paths | 与配置一致 |
| forbidden | 禁区 |
| must_read_refs | brief/packet |
| collaboration | 与另两席 |
| DoD / check_rubric | 成功标准 |

## 6. 与其它部门协作

| 部门 | 在招聘中的角色 |
|------|----------------|
| 工程主责 | 提用工标准；核对人设；批准建组 |
| 人事部 | 人设生产与建组执行 |
| 文档小组 | 提供 brief 结构、历史任务记忆摘要（供人设「必读」refs）；不替代人事做人设 |
| 调研 | 若用工需要特殊技能背景资料，由工程主责/人事 `request_info` 触发，不直接招人 |
| 技术统筹 | 登记 task 与 staffing 状态；名额与依赖；催办 |

## 7. 复用策略（可配）

```yaml
hr:
  default_mode: hire_fresh    # ★ 默认；pool_reuse 不推荐
  pool_enabled: false
  require_run_lead_staffing_approval: true
```

| 模式 | 含义 | 建议 |
|------|------|------|
| `hire_fresh` | 每 task 新人设 + 新 agent_id | **★ 默认**（真招聘） |
| `pool_reuse` | 复用已解散三角的 persona **模板**，仍新签 token / 新实例 | **不推荐**；仅性能实验；仍 MUST run-lead 批准 |

v1 公司仿真以 `hire_fresh` 为准；开启 `pool_reuse` 不得跳过 people-qa 维度校验。

## 8. 命名（人设名 · 团队名）

1. 每个 persona 实例 **MUST** 有 `codename`（人设名/代号，身份维，见 [17 §6](./17-agent-runtime.md)）：`recruiter` 起草时确定性生成（`generateCodename(instance_id)`；池见 `@picode/core/src/naming.ts`），同一 instance_id 跨重写稳定。  
2. 每个已批准三角 **MUST** 有 `team_name`（团队名）：`approve` 时确定性生成（`generateTeamName(task_id)`）并锁定进 `staffing.yaml`。  
3. 工程主责可在 `staffing request` 中覆盖：`team_name`、`codename_overrides`（seat → 名）。覆盖项仍需 people-qa 维度校验通过后随 staffing 批准落盘。  
4. 命名用于跨 run 对话与评分档案聚合（`docs/knowledge/hr/…`，见 §9），**不改变逻辑 seat**（仍为 squad-lead / engineer / sdet），也不替代角色模板。

CLI：`staffing request --team-name <n> --codename seat:name`（`--codename` 可重复）。

## 9. 评分（人设分 · 团队分）

任务结束后（P07 dissolve 后）人事部执行 `staffing score`：对**每个 persona**（按 codename）与**整个三人团队**（按 team_name）各打 0–100 分，沉淀评分档案供后续优化人设与团队组合（17 §7 pool_reuse / 19 self-evolution 可引用）。

### 9.1 信号（全部为文件事实，无 LLM 参与）

- `evidence`（tasks/&lt;id&gt;/evidence/evidence.yaml）：pass / fail / 缺失
- `task.status`：dissolved / failed / cancelled
- handoff 包完整度（缺文件数，HANDOFF_FILES）
- acceptance ack 数
- `retries`

### 9.2 公式（0–100，base 50）

| 项 | 团队分与人设分共同 | 人设分额外（seat） |
|----|-------------------|--------------------|
| base | 50 | — |
| evidence | pass +30 / fail −30 / 缺失 −20 | engineer：pass +5；sdet：命令全绿 +5 或 fail −5 |
| status | dissolved +10 / failed −10 / cancelled −5 | squad-lead：dissolved +5 |
| handoff | 每缺 1 文件 −5 | — |
| ack | ≥1 个 +5 | — |
| retries | 每 1 次 −5（上限 −10） | — |

团队分 = 公共项之和（clamp 0–100）；人设分 = 公共项 + seat 项（clamp 0–100）。

### 9.3 产物与沉淀

- `tasks/<id>/staffing/scores.yaml`：本 task 评分档案（`scored_by` / `note` / `team_score` / `team_breakdown` / `persona_scores[]`）  
- `docs/knowledge/hr/personas/<codename>.yaml`：按**人设名**聚合历史记录（records + summary：count/avg/min/max）——支持同一人设跨 task 优化  
- `docs/knowledge/hr/teams/<team_name>.yaml`：按**团队名**聚合历史——支持团队组合优化  

评分默认由 `people-qa` 执行（`--by people-qa`），`run-lead` / `people-lead` 可复核；重评同 task 幂等（按 task+seat 覆盖）。评分**不阻断**任务流程，仅沉淀。

CLI：`staffing score --task <id> [--by people-qa] [--note "..."]`；`staffing scores --task <id>` 读取。

## 10. 房间 `people`

| 可 post | 用途 |
|---------|------|
| run-lead, people-lead, recruiter, people-qa | 用工单、人设稿、批准、评分 |
| tpm read/post 调度类 | 催办 |
| 实现三角 | **默认不可**（招好再进 work 房） |

## 11. 状态机衔接

```text
task: queued
  → staffing (人事中)
  → staffed (工程主责已批 staffing)
  → brief 已批（可并行于 staffing，但 spawn 前双齐）
  → assigned / prepare worktree
  → running ...
  → dissolved → staffing score（§9，人事评分沉淀）
```

编排器 `task prepare` / spawn MUST 检查：

1. goal active  
2. work brief approved  
3. staffing approved  

## 12. 实现检查

- [ ] `cells.templates.hr`  
- [ ] room `people` 默认启用  
- [ ] CLI: `staffing request|propose|approve`  
- [ ] 无 staffing 批准拒绝 prepare  
- [ ] 人设文件注入 Pi 启动 prompt  
- [ ] 命名：`codename` / `team_name` 确定性生成 + request 覆盖（§8）  
- [ ] 评分：`staffing score|scores` + knowledge 沉淀（§9）  
- [ ] 测试 T18–T19（+ 命名/评分测试）  
