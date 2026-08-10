# 术语标准（运行时权威）

**本文是默认启用（on）的术语唯一正文。**  
**岗位全量目录 / 分层：** [reference/glossary.md](../reference/glossary.md)  
**命名律（强制）：** [glossary §0](../reference/glossary.md)

其它文档 MUST 使用本文逻辑 id；中文为默认 `display_name`，可配置覆盖。

---

## 0. 命名原则（摘要）

1. 中文展示名 **四字**（`-*` 后缀另计）。  
2. **房间 ID ≠ 岗位 ID**；作用域前缀 `org-*` / `run-*` / `squad-*`。  
3. 门禁岗用 `*-eng` / `*-audit` / `code-review` 等，禁止与房名撞车。  
4. 外部情报 `ind-*`；本仓方案 `sys-*` / `scout`。  
5. 人 `tpm` vs 调度台房间 `program`。  
6. 完整 7 条律见 glossary §0；配置加载校验 role∩room=∅。

---

## 1. 产品与运行

| 术语 | ID | 含义 | 禁止混用 |
|------|-----|------|----------|
| picode | picode | 多智能体编码运行时 | — |
| 运行实例 | run | `runs/<run_id>/` | Pi session |
| 目标 | goal | 赞助方确认后的交付目标 | — |
| 赞助确认时刻 | `user_confirmed_at` | goal 上字段；**语义固定为 sponsor（人类）确认时间** | 勿理解成「任意 user 角色」 |
| 目标类型 | goal.kind | `delivery`（业务交付）\| `self_evolve`（升级 picode 自身） | 见 [19](../spec/19-self-evolution.md) |
| 分块 | chunk | 写集隔离单元 | — |
| 任务 | task | 可调度工作单元（实体） | 房 `program`、小队 |
| 交付小队 | squad | 单次招聘的实现三人组 | 勿与 task 实体、房 `program` 混称 |
| 进化层 | evolve.layers | knowledge/prompts/docs/tests/code/policy | 自我进化写集边界 |

---

## 2. 默认启用岗位（on）

| 中文 | ID | 企业对应 | 职责一句 |
|------|-----|----------|----------|
| 业务赞助 | `sponsor` | Stakeholder | **人类**；提需求、确认 goal（非 LLM） |
| 会话调度 | `sess-mgr` | Session Manager | 总管理 AI；唤醒/休眠其余会话 |
| 工程主责 | `run-lead` | Engineering Lead | goal/brief/合并终裁 |
| 技术统筹 | `tpm` | TPM | 进度、确认项、催办 |
| 流程审计 | `proc-audit` | Process Auditor | 防偏、红灯 |
| 产品策划 | `pm` | Product Manager | 需求口径、优先级、验收 |
| 文档主责 | `docs-lead` | Head of Tech Writing | 记忆策略、汇报、下发责任 |
| 技术写作 | `tech-writer` | Technical Writer | L1/L2、brief 组装执笔 |
| 文档质检 | `docs-qa` | Docs QA | 文档与证据一致 |
| 人才主责 | `people-lead` | People Lead | 用工、呈报、建组 |
| 招聘专员 | `recruiter` | Recruiter | 三人设与实例 id |
| 编制合规 | `people-qa` | People Compliance | 席位/画像合规 |
| 行业分析 | `ind-res` | Industry Researcher | **外部**调研 |
| 代码勘察 | `scout` | Codebase Scout | 本仓地图 |
| 软件架构 | `sys-arch` | Software Architect | **本仓**方案 |
| 小队主责 | `squad-lead` | Squad Lead | 仅本 task |
| 软件开发 | `engineer` | Software Engineer | 写集内实现 |
| 测试验证 | `sdet` | SDET | 验收与允许命令 |
| 发布执行 | `release-eng` | Release Engineer | 构建与串行合并 |
| 代码审查 | `code-review` | Code Reviewer | 门禁 review |
| 安全工程 | `sec-eng` | Security Engineer | 安全门禁 |

扩展岗（`org-ceo`、`sre`、`ux`…）见 **glossary**，默认 **不启用**。  
（`pm` / `sess-mgr` 已是默认 **on**，勿再当扩展岗。）

---

## 3. 默认启用房间（on）

| 中文 | ID | 一句话 | 边界 |
|------|-----|--------|------|
| 工程领导 | `leadership` | 共创、终裁、跨域批准 | 不写业务码、不做招聘执行 |
| 产品共创 | `product` | 产品口径、优先级、验收 | ≠ 工程实现方案（architecture） |
| 全员公告 | `announce` | 只读广播 | 非讨论场 |
| 项目统筹 | `program` | 队列、进度、门闩 | ≠ task 实体；≠ 人 tpm |
| 人力资源 | `people` | 招聘与人设 | 不定业务方案 |
| 行业研究 | `research` | **外部**研究 | 不写本仓方案 |
| 架构设计 | `architecture` | **本仓**方案 | 不做外部调研主责 |
| 知识管理 | `knowledge` | **跨 run** 沉淀 | ≠ 本 run 记忆主仓 |
| 技术文档 | `docs` | **本 run** 记忆/下发 | ≠ 跨 run 知识主仓 |
| 跨组协同 | `collab` | 契约与交接通知 | ≠ handoff 文件目录 |
| 发布工程 | `release` | 构建与串行合并 | ≠ 广义运维 |
| 质量保障 | `quality` | 门禁级质量议题 | ≠ 席位 sdet |
| 安全合规 | `security` | 安全门禁 | ≠ 岗 sec-eng 同名 |
| 交付小队 | `squad-*` | 实现三人组 | 仅本 task 写集 |
| 专题会议 | `meeting-*` | 临时跨域会 | TTL 解散 |

---

## 4. 编制（cell）

| cell | 领导 | 执行 | 监督 | 主房 | 细节 |
|------|------|------|------|------|------|
| 治理 | `run-lead` | `tpm` | `proc-audit` | `leadership`+`program` | 本文 + 02 |
| 产品 | `pm`（主） | — | run-lead/sponsor 可检 | `product` | [17](../spec/17-agent-runtime.md) |
| 文档 | `docs-lead` | `tech-writer` | `docs-qa` | `docs` | **[15](../spec/15-docs-cell.md)** |
| 人才 | `people-lead` | `recruiter` | `people-qa` | `people` | **[16](../spec/16-hr-cell.md)** |
| 实现 | `squad-lead` | `engineer` | `sdet` | `squad-*` | 按任务招聘 |

---

## 5. 流程产物（名）

| 术语 | 含义 |
|------|------|
| 工作简报 work brief | run-lead 签发；docs 组装；小队消费 |
| 人设 persona | people 为 seat 定制的 prompt 约束 |
| 人设名 codename | persona 实例的名字/代号（16 §8；确定性生成，可覆盖） |
| 团队名 team_name | 三人小组（triad）的名字（16 §8；确定性生成，可覆盖） |
| 用工单 staffing request | run-lead → people |
| 编制锁定 staffing | 批准后的三人绑定 |
| 人设分 persona score | task 结束后对单席人设的 0–100 评分（16 §9） |
| 团队分 team score | task 结束后对三人组合的 0–100 评分（16 §9） |
| 下发包 packet | 过滤后资料 |
| 交接包 handoff package | `tasks/*/handoff/`（≠ 房 collab） |
| 记忆简报 Memory Brief | docs → leadership |
| 双门闩 | brief 批准 ∧ staffing 批准 |

---

## 6. 平台术语

| 术语 | 含义 |
|------|------|
| 编排器 orchestrator | 无 LLM 状态机 |
| Bus | 唯一发言 API |
| 工具画像 tool_profile | 席位工具白名单 |
| 写集 write_paths | 允许修改路径 |
| worktree | Git 工作树隔离 |

---

## 7. 运行时必分（短）

| 对 | 分法 |
|----|------|
| `sponsor` / 任意 LLM 岗 | 人类赞助 vs 模型会话 |
| `sess-mgr` / `run-lead` | 调度唤醒 vs 业务终裁 |
| `pm` / `run-lead` / 房 `product` | 产品口径 vs 工程终裁 vs 产品房 |
| `run-lead` / `squad-lead` / `org-cto` | run 终裁 / task 小队 / 公司技术官 |
| `tpm` / `program` | 人 / 调度房 |
| `ind-res` / `sys-arch` | 外部 / 本仓 |
| `sdet` / `quality` | 小队席 / 质量房 |
| `release-eng` / `release` | 岗 / 房 |
| `sec-eng` / `security` | 岗 / 房 |
| `docs` / `knowledge` | 本 run / 跨 run |
| `proc-audit` / `code-review` / `corp-audit` | 流程 / 代码 / 企业内审 |

完整易分对 → [glossary §6](../reference/glossary.md)。

---

## 8. 文档写作

- 正文只用 **本文 / glossary 已列 ID 与中文**。  
- 流程只改 `PROCESSES.md`。  
- 扩展岗写入 `glossary` + 配置；升为默认 on 时同步本文与 defaults。  
- Agent 生命周期 / 人设 / 唤醒：**仅** [17-agent-runtime](../spec/17-agent-runtime.md)。  
- 选项与默认：[decision-catalog](../reference/decision-catalog.md)。  
- 自我进化：[19-self-evolution](../spec/19-self-evolution.md)。  
