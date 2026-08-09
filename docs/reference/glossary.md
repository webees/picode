# 术语表 · 岗位全目录（参考类 D）

| 文档角色 | 说明 |
|----------|------|
| **运行时术语权威** | [standards/terminology.md](../standards/terminology.md)（默认 **on** 的房/岗） |
| **本文** | 命名律（强制）+ **全量岗位目录** + 分层/分组 |
| **流程** | [PROCESSES.md](../PROCESSES.md) |
| **选项默认** | [decision-catalog.md](./decision-catalog.md) |

| 约定 | 说明 |
|------|------|
| 中文 | 统一 **四字**（`-*` 另计） |
| 逻辑 ID | 遵守 §0；状态机只认 ID |
| `on` | 默认启用（与代码 defaults / terminology 对齐） |
| `off` / `ext` | 目录收录 ≠ 开工；配置方决定；`ext` 须补 profile/cell |

---

## 0. 命名律（强制）

| # | 律 | 规则 | 正例 |
|---|-----|------|------|
| R1 | 房间 ≠ 岗位 | 房间 ID = 领域名词；岗位 ID = 职务；二者永不共用同一字符串 | 房 `release` / 岗 `release-eng` |
| R2 | 作用域前缀 | 组织级 `org-*`；run 级 `run-*`；task 小队 `squad-*` | `org-cto` / `run-lead` / `squad-lead` |
| R3 | 门禁岗位后缀 | 产出 gates 的人：`*-eng` / `*-audit` / `code-review` | `sec-eng` · `proc-audit` · `code-review` |
| R4 | 外部 vs 本仓 | 外部 `ind-*`；本仓 `sys-*` / `scout` | `ind-res` / `sys-arch` |
| R5 | 人 vs 调度台 | 人用职务 ID；调度台用领域房 | `tpm` + 房 `program` |
| R6 | 专精从通用拆 | 通用 `engineer`；专精用域前缀 | `frontend` / `backend` |
| R7 | 中文四字 | 展示名 4 字；消歧靠 ID 不靠中文同义词 | 工程主责 · 业务赞助 |

**校验：** `roles[].id` ∩ `rooms[].id` = ∅。新增 ID MUST 符合上表，且只使用 [terminology](../standards/terminology.md) / 本文已列 ID。

---

## 1. 分层（Level）

自上而下权责递减；同层可并行，不互相替代。

| 层 | 代号 | 名称 | 含义 |
|----|------|------|------|
| L0 | 赞助层 | 需求赞助 | 提出/确认目标与边界；不写业务代码 |
| L1 | 经营层 | 公司经营 | CEO/COO/CFO 等；组织级，通常不进单次 run 三角 |
| L2 | 主责层 | 职能主责 | 某条线终裁或主责（工程/产品/文档/人才…） |
| L3 | 专业层 | 专业执行·监督 | 条线内 doer / check；per-run 注册，按需唤醒 |
| L4 | 小队层 | 任务交付 | 按 task 招聘的实现三人组；默认 hire_fresh |
| L5 | 门禁层 | 质量闸口 | 不占实现三角；产出 gates/* |

```text
L0 赞助 ──确认──► L2 工程主责 ──签发 brief / 用工──► L4 交付小队
                      │                              │
            L3 研究·架构·文档·人才·统筹              L5 审查·发布·安全
                      │
                 L1 经营层（可选，配置启用）
```

---

## 2. 分组（Domain）

| 组 | 代号 | 名称 | 主房间（若有） |
|----|------|------|----------------|
| A | sponsor | 赞助与干系人 | `leadership` |
| B | org | 经营班子 | `leadership`（可选挂靠；组织级岗默认 off） |
| C | product | 产品与体验 | `product` |
| D | eng-gov | 工程治理 | `leadership` · `program`（+ `sess-mgr` 调度） |
| E | research | 研究与架构 | `research` · `architecture` |
| F | delivery | 交付小队 | `squad-*` |
| G | docs | 文档与知识 | `docs` · `knowledge` |
| H | people | 人才与编制 | `people` |
| I | gate | 发布·质量·安全 | `release` · `quality` · `security` |
| J | go-to-market | 市场与客户 | （可扩） |
| K | corporate | 中后台支撑 | （可扩） |

---

## 3. 岗位全表

列说明：`层` = §1；`组` = §2；`状态` = on / off / ext。

### 3.A 赞助与干系人

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 业务赞助 | `sponsor` | L0 | A | on | Stakeholder / Sponsor | **人类**；提需求、确认 goal（非 LLM） |

### 3.A′ 会话调度（元 · 默认 on）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 会话调度 | `sess-mgr` | L2 | D | on | Session Manager | 唤醒/休眠平台与任务会话；无业务终裁 |

### 3.B 经营班子（组织级 · 默关）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 经营主责 | `org-ceo` | L1 | B | ext | CEO / 总经理 | 公司方向与经营终裁 |
| 运营主责 | `org-coo` | L1 | B | ext | COO | 日常经营与跨部门协同 |
| 财务主责 | `org-cfo` | L1 | B | ext | CFO | 预算、资金、经营分析 |
| 技术主官 | `org-cto` | L1 | B | ext | CTO | 公司级技术战略（≠ run 内 `run-lead`） |
| 产品主官 | `org-cpo` | L1 | B | ext | CPO | 公司级产品战略 |

> `run-lead` 是 **单次 run 的工程终裁**；`org-cto` 是 **公司级技术官**。可兼岗，ID 勿混。

### 3.C 产品与体验

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 产品主责 | `pm-owner` | L2 | C | ext | Head of Product | 产品条线主责 |
| 产品策划 | `pm` | L3 | C | **on** | Product Manager | 需求优先级、验收口径；主场 `product` |
| 产品运营 | `product-ops` | L3 | C | ext | Product Operations | 指标、活动、增长实验 |
| 体验设计 | `ux` | L3 | C | ext | UX Designer | 交互与体验方案 |
| 视觉设计 | `ui` | L3 | C | ext | UI Designer | 视觉与界面规范 |
| 用户研究 | `ux-research` | L3 | C | ext | User Researcher | 访谈、可用性、洞察 |

### 3.D 工程治理（默认 on）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 工程主责 | `run-lead` | L2 | D | on | Engineering Lead | goal/brief/合并终裁 |
| 技术统筹 | `tpm` | L3 | D | on | Technical Program Manager | 进度、依赖、确认项 |
| 流程审计 | `proc-audit` | L3 | D | on | Process Auditor | 防偏、红灯、流程合规 |

### 3.E 研究与架构（默认 on）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 行业分析 | `ind-res` | L3 | E | on | Industry Researcher | **外部**行业/规范/版本 |
| 代码勘察 | `scout` | L3 | E | on | Codebase Scout | 本仓地图、候选分块 |
| 软件架构 | `sys-arch` | L3 | E | on | Software Architect | **本仓**技术方案 |
| 战略分析 | `strategist` | L3 | E | ext | Strategy Analyst | 中长期方向与组合建议 |
| 竞品分析 | `competitor` | L3 | E | ext | Competitive Analyst | 竞品拆解（可并入 ind-res） |

### 3.F 交付小队（默认 on · 按 task 招聘）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 小队主责 | `squad-lead` | L4 | F | on | Squad Lead | 仅本 task 对齐/进度/交接 |
| 软件开发 | `engineer` | L4 | F | on | Software Engineer | 写集内实现 |
| 测试验证 | `sdet` | L4 | F | on | SDET | 验收与允许命令 |
| 前端开发 | `frontend` | L4 | F | ext | Frontend Engineer | 前端专精（可从 engineer 拆） |
| 后端开发 | `backend` | L4 | F | ext | Backend Engineer | 后端专精 |
| 移动开发 | `mobile` | L4 | F | ext | Mobile Engineer | 客户端专精 |
| 数据工程 | `data-eng` | L4 | F | ext | Data Engineer | 数据管道与仓 |
| 算法工程 | `ml-eng` | L4 | F | ext | ML Engineer | 模型与训练交付 |

**默认实现 cell：** `squad-lead` + `engineer` + `sdet`。

### 3.G 文档与知识（默认 on）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 文档主责 | `docs-lead` | L2 | G | on | Head of Technical Writing | 记忆策略、brief 组装、汇报 |
| 技术写作 | `tech-writer` | L3 | G | on | Technical Writer | L1/L2、handoff 整理 |
| 文档质检 | `docs-qa` | L3 | G | on | Docs QA | 文档与证据一致 |
| 知识运营 | `knowledge-ops` | L3 | G | ext | Knowledge Ops | 跨 run 知识库专岗 |
| 培训发展 | `trainer` | L3 | G | ext | L&D / Enablement | 技能与 onboarding |

### 3.H 人才与编制（默认 on）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 人才主责 | `people-lead` | L2 | H | on | People Lead | 用工单、呈报、建组 |
| 招聘专员 | `recruiter` | L3 | H | on | Recruiter | 三人设与实例 id |
| 编制合规 | `people-qa` | L3 | H | on | People Compliance | 席位/画像/约束 |
| 组织发展 | `org-dev` | L3 | H | ext | OD / Org Design | 编制与能力模型 |
| 薪酬绩效 | `comp-ben` | L3 | H | ext | Compensation | 薪酬绩效（运行时通常不用） |

### 3.I 发布 · 质量 · 安全（门禁 · 默认部分 on）

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 发布执行 | `release-eng` | L5 | I | on | Release Engineer | 构建与串行合并 |
| 代码审查 | `code-review` | L5 | I | on | Code Reviewer | 门禁 code review |
| 安全工程 | `sec-eng` | L5 | I | on | Security Engineer | 安全门禁 |
| 质量主责 | `qa-owner` | L2 | I | ext | QA Lead | 质量门禁策略（≠ sdet） |
| 平台运维 | `sre` | L3 | I | ext | SRE / Platform | 稳态、多环境、SLO |
| 法务合规 | `legal` | L3 | I | ext | Legal / Compliance | 合同、许可、监管 |
| 隐私保护 | `privacy` | L3 | I | ext | Privacy Officer | 个保与数据合规 |

### 3.J 市场与客户

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 市场增长 | `marketing` | L3 | J | ext | Marketing / Growth | 获客与品牌 |
| 销售拓展 | `sales` | L3 | J | ext | Sales | 成交与商务 |
| 售前方案 | `sol-eng` | L3 | J | ext | Solutions Engineer | 方案与投标技术支持 |
| 客户成功 | `cs` | L3 | J | ext | Customer Success | 续约与成功路径 |
| 客户支持 | `support` | L3 | J | ext | Support | 工单与售后 |

### 3.K 中后台支撑

| 中文 | ID | 层 | 组 | 状态 | 企业对应 | 一句话 |
|------|-----|----|----|------|----------|--------|
| 财务核算 | `finance` | L3 | K | ext | Finance / Accounting | 账务与报销 |
| 采购执行 | `procurement` | L3 | K | ext | Procurement | 采购与供应商 |
| 行政支持 | `admin` | L3 | K | ext | Admin / Office | 后勤行政 |
| 内部审计 | `corp-audit` | L3 | K | ext | Internal Audit | 企业内审（≠ 流程审计） |
| 信息管理 | `it-ops` | L3 | K | ext | IT / Helpdesk | 内部 IT（≠ 研发发布） |

---

## 4. 默认启用一览（on）

配置方可随时增删；下列为 **出厂默认 on**，与代码 defaults 对齐。

| 层 | 岗位 ID |
|----|---------|
| L0 人类 | `sponsor`（**非** LLM） |
| 元调度 | `sess-mgr` |
| L2 | `run-lead` · `docs-lead` · `people-lead` |
| L3 | `pm` · `tpm` · `proc-audit` · `ind-res` · `scout` · `sys-arch` · `tech-writer` · `docs-qa` · `recruiter` · `people-qa` |
| L4 | `squad-lead` · `engineer` · `sdet`（按 task 招聘） |
| L5 | `release-eng` · `code-review` · `sec-eng` |

**默认 cell（三三制）：**

| cell | 领导 | 执行 | 监督 | 主房 |
|------|------|------|------|------|
| 调度 | `sess-mgr` | — | — | leadership（+ 跨房只读） |
| 治理 | `run-lead` | `tpm` | `proc-audit` | `leadership` + `program` |
| 产品 | `pm` | — | run-lead 可检 | `product` |
| 文档 | `docs-lead` | `tech-writer` | `docs-qa` | `docs` |
| 人才 | `people-lead` | `recruiter` | `people-qa` | `people` |
| 实现 | `squad-lead` | `engineer` | `sdet` | `squad-*` |

---

## 5. 协作空间（房间）

房间 ≠ 岗位：房间是封闭协作空间；岗位是席位身份。

| 中文 | ID | 企业对应 |
|------|-----|----------|
| 工程领导 | `leadership` | Engineering Leadership |
| 产品共创 | `product` | Product Collaboration（**默认 on**） |
| 全员公告 | `announce` | All-hands / Comms |
| 项目统筹 | `program` | PMO |
| 人力资源 | `people` | People / HR |
| 行业研究 | `research` | Industry Research |
| 架构设计 | `architecture` | Architecture |
| 知识管理 | `knowledge` | Knowledge Management |
| 技术文档 | `docs` | Technical Writing |
| 跨组协同 | `collab` | Cross-team Collaboration |
| 发布工程 | `release` | Release Engineering |
| 质量保障 | `quality` | Quality Assurance |
| 安全合规 | `security` | Security & Compliance |
| 交付小队 | `squad-*` | Feature Squad |
| 专题会议 | `meeting-*` | Working Session |

---

## 6. 易分对（现行 ID）

| 对 | 区分 |
|----|------|
| `sponsor` / `org-ceo` | 本 run 人类赞助 / 公司经营主责（ext） |
| `sess-mgr` / `run-lead` | 会话唤醒调度 / 工程业务终裁 |
| `run-lead` / `squad-lead` / `org-cto` | 本 run 终裁 / 本 task 小队 / 公司技术官（ext） |
| `pm` / `run-lead` / 房 `product` | 产品口径 / 工程终裁 / 产品协作房 |
| `tpm` / 房 `program` | 技术统筹人 / 项目调度台 |
| `ind-res` / `sys-arch` | 外部调研 / 本仓方案 |
| `ux`·`ui` / `sys-arch` | 体验视觉（ext） / 软件架构 |
| `sdet` / `qa-owner` / 房 `quality` | 小队测试 / 质量主责(ext) / 质量房 |
| `release-eng` / `sre` / 房 `release` | 发布执行 / 平台运维(ext) / 发布房 |
| `sec-eng` / `legal` / 房 `security` | 安全工程 / 法务(ext) / 安全房 |
| `proc-audit` / `corp-audit` / `code-review` | 流程审计 / 企业内审(ext) / 代码审查 |
| 房 `docs` / 房 `knowledge` | 本 run 记忆 / 跨 run 沉淀 |
| `engineer` / `frontend`·`backend` | 通用开发 / 专精（ext） |

**房间 × 岗位（同域 ID 不撞车）：**

| 房间 | 相关岗位 |
|------|----------|
| `leadership` | `sponsor` · `run-lead` · `tpm` · `proc-audit` · `sess-mgr` |
| `product` | `pm` · `sponsor` · `run-lead` |
| `program` | `tpm` |
| `research` | `ind-res` |
| `architecture` | `sys-arch` · `scout` |
| `docs` | `docs-lead` · `tech-writer` · `docs-qa` |
| `knowledge` | `knowledge-ops`（ext）；日常由文档小组运营 |
| `people` | `people-lead` · `recruiter` · `people-qa` |
| `release` | `release-eng` · `sre`（ext） |
| `quality` | `qa-owner`（ext）；小队测试 `sdet` 在 `squad-*` |
| `security` | `sec-eng` · `legal`（ext） · `privacy`（ext） |
| `squad-*` | `squad-lead` · `engineer` · `sdet` |

---

## 7. 配置提示

```yaml
# 启用扩展岗（示例）
roles:
  - id: sre
    display_name: "平台运维"
    enabled: true
    tool_profile: gate.sre
```
- 仅改 `enabled` **不够**：扩展岗（`ext`）还要 tool_profile、可选 cell、房间成员。  
- **默认 on 列表** 以 `packages/core` 的 DEFAULTS 为准；本文目录可超前于实现。  
- 岗位是否进某次 run：由 **工程主责(run-lead) / 配置方** 决定，不由本文件强制。
