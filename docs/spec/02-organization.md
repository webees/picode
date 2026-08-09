# 02 — 组织：三三制与编制登记

> **术语 / 房 / 岗全表：** [terminology](../standards/terminology.md)  
> **岗位全目录：** [glossary](../reference/glossary.md)  
> **流程步骤：** [PROCESSES.md](../PROCESSES.md)（本文不写步骤）  
> **配置：** [13-configuration](./13-configuration.md)

代码与状态机 MUST 引用逻辑 `id`；展示用配置后的 `display_name`。

---

## 1. 三三制（MUST）

每个 **被 scale 激活的工作环节** MUST 具备三席（可折叠见 [05](./05-scaling-mvp.md)）：

| 席位 | 职能 |
|------|------|
| **领导 Lead** | 对齐、拆步、对外呈报、宣布本环节完成 |
| **执行 Doer** | 主交付物 |
| **监督 Check** | 按标准验收 / 打回 |

规则：

- 缺一席 MUST NOT 宣称环节完成。  
- 同一交付物上，监督 MUST NOT 兼任执行（除非 scale 折叠且 **换帽留痕** `seat=`）。  
- 仅 **`run-lead`** 对 goal active 与合并拥有终裁签名权。  
- 非实现环节激活时 MUST 注册 `cell` 并有 check 签字。  
- 工作组资料与跨房：申请制 + `run-lead` 过滤（见 domains/information-control、P08/P09）。  

---

## 2. Cell 登记（默认）

细节只在专册；此处 **只登记**。

| cell | 领导 | 执行 | 监督 | 主房 | 专册 |
|------|------|------|------|------|------|
| 治理 | `run-lead` | `tpm` | `proc-audit` | `leadership` · `program` | 本文 §1 + PROCESSES |
| 调度 | `sess-mgr` | — | — | （跨房只读 + leadership post） | **[17-agent-runtime](./17-agent-runtime.md)** |
| 产品 | `pm` | — | run-lead 可检 | `product` | 17 + PROCESSES P01 |
| 调研 | （可兼） | `ind-res` | （可兼 docs-qa） | `research` | intake 起 MUST 可跑执行席 |
| 文档 | `docs-lead` | `tech-writer` | `docs-qa` | `docs`（+`knowledge`） | **[15-docs-cell](./15-docs-cell.md)** |
| 人才 | `people-lead` | `recruiter` | `people-qa` | `people` | **[16-hr-cell](./16-hr-cell.md)** |
| 实现 | `squad-lead` | `engineer` | `sdet` | `squad-<task_id>` | 按任务招聘；先交接再解散 |
| 规划 | — | `scout` · `sys-arch` | （run-lead / docs-qa 可检） | `architecture` | active 后本仓方案；不套实现三角 |
| 门禁 | — | `code-review` · `release-eng` · `sec-eng` | — | `quality` · `release` · `security` | 不占实现三角席 |

配置键：`cells.templates.*`（implement / docs / people 为默认模板）。

**硬规则（人才）：** 无 `run-lead` 批准的 staffing → MUST NOT spawn 实现三角。

---

## 3. 房间规则（封闭）

房间列表与边界：**仅** [terminology §3](../standards/terminology.md)。

运行时规则：

1. 每房 `rooms/<id>/members`：`post` | `read`。  
2. **MUST** 仅 `post` 成员可发言（经 Bus，见 [04](./04-enforcement.md)）。  
3. `tpm` 维护实现相关名单；`leadership` 敏感变更 SHOULD 经 `run-lead`。  
4. 动态房：`squad-<task_id>`、`meeting-<topic>`（TTL；MUST resolve/cancel）。  
5. v1 MUST NOT 常驻「会议厅」；多方拍板用 `meeting-*` 或 `leadership`。  

---

## 4. 身份

- 角色 = **模板**；运行 = **实例**（如 `engineer@task-a-1`）。  
- 并行 MUST 分实例，MUST NOT 共会话混上下文。  

---

## 5. 记忆层级（指针）

L0 / L1 / L2 / 知识库运营正文 → **[15-docs-cell](./15-docs-cell.md)**。  
实现三角 MUST NOT 直接维护知识库主索引；只消费 brief / packet。  
