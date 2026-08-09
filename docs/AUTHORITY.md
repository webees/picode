# AUTHORITY — 文档权威与用语

## 1. 文档分类（读前先认类）

| 类 | 目录/文件 | 写什么 | 不写什么 |
|----|-----------|--------|----------|
| **A 权威** | `08` · `PROCESSES` · `terminology` · **`17-agent-runtime`** | 不变量、流程、术语、**agent 生命周期** | 目录感言、实现教程 |
| **B 规范** | `spec/01–02,04–05,09–19` | 可测试的编制/状态/强制/配置/实现策划/自我进化 | 流程逐步（→ PROCESSES）；agent 细节（→ 17） |
| **C 领域** | `domains/*` | 横切厚主题（Git/Bus/工具/信息） | 再抄一份流程 |
| **D 参考** | `reference/*` | 样例、岗位全目录、**decision-catalog 选项表** | 新强制句（除命名律） |
| **E 入口** | `GETTING_STARTED` · `ARCHITECTURE` · `guides/*` | 上手、一页图、最短路径 | 第二套术语表 |
| **F 追溯** | `DECISIONS.md` | 一行决策意图 | 步骤细节 |

## 2. 冲突优先级（高 → 低）

1. [spec/08-invariants.md](./spec/08-invariants.md) — 全局不变量  
2. [PROCESSES.md](./PROCESSES.md) — **业务流程步骤唯一正文**  
3. [spec/17-agent-runtime.md](./spec/17-agent-runtime.md) — **agent / 会话 / 人设 / 唤醒唯一正文**  
4. [spec/19-self-evolution.md](./spec/19-self-evolution.md) — **自我进化唯一正文**  
5. [standards/terminology.md](./standards/terminology.md) — **运行时术语（默认 on）唯一正文**  
6. [reference/glossary.md §0](./reference/glossary.md) — **命名律**  
7. `spec/01–02, 04–05, 09–16, 18` 与 `domains/*`  
8. `reference/schemas/**` — 字段形状  
9. [reference/decision-catalog.md](./reference/decision-catalog.md) — 选项与默认（改默认须同步权威正文）  
10. [DECISIONS.md](./DECISIONS.md) — 现行意图一行  
11. 仓库根 `README.md`  

**规则：**

- 流程步骤 **不得** 在第二处展开（只许「见 PROCESSES P0x」）。  
- Agent 状态机 / sess-mgr / persona 维度 **不得** 在 15/16/02 另写第二套。  
- 默认 on 的房间/岗位表 **只维护** `terminology.md`（+ 代码 defaults）。  
- 企业岗位全量目录 **只维护** `glossary.md`。  
- 产品选项与 ★默认 **只维护** `decision-catalog.md`。  
- 文档小组 / 人事编制细节 **只维护** `15` / `16`；`02` 只保留登记表。  

## 3. 规范用语

| 词 | 含义 |
|----|------|
| **MUST** | 必须；违反 = 实现缺陷 |
| **MUST NOT** | 禁止 |
| **SHOULD** | 默认应做；偏离须配置或注释说明 |
| **MAY** | 可选 |

## 4. 实现硬约束

1. MUST 遵守 08 不变量。  
2. MUST 按 PROCESSES 实现状态迁移。  
3. MUST 使用 terminology 逻辑 id；展示名走配置。  
4. MUST 遵守命名律（glossary §0 / terminology §命名）。  
5. MUST 领域中立（无业务案例关键字）。  
6. MUST 按 [11-implement-playbook](./spec/11-implement-playbook.md) 分阶段覆盖 T01–T19。  

## 5. 修订入口

| 改什么 | 只改 |
|--------|------|
| 流程步骤 | **PROCESSES.md** |
| agent / 会话 / 人设维度 / 唤醒 | **spec/17-agent-runtime.md** |
| v1 未完成实现策划 | **spec/18-v1-completion-plan.md** |
| 自我进化 | **spec/19-self-evolution.md** |
| 默认 on 术语 / 房间 / 岗位 | **standards/terminology.md** + 代码 defaults |
| 选项与 ★默认 | **reference/decision-catalog.md** |
| 岗位全量目录 | **reference/glossary.md** |
| 三三制与 cell 登记 | **spec/02-organization.md** |
| 文档小组细节 | **spec/15-docs-cell.md** |
| 人事细节 | **spec/16-hr-cell.md** |
| 强制与平台横切 | **04 / domains / 08** |
| 决策追溯 | **DECISIONS.md** 追加一行 |

并遵守 [standards/doc-style.md](./standards/doc-style.md)。

## 6. 一致性自检（文档维护时）

1. 正文 ID 是否均能在 `terminology`（on）或 `glossary`（全目录）中找到。  
2. 默认 on 是否与 `terminology` + `default-config.snippet.yaml` + 代码 defaults **三方一致**。  
3. 是否在第二处复制了流程步骤或全量房岗表。  
4. Agent 细节是否只指向 **17**，实现缺口是否只指向 **18**。  
5. Schema 样例是否与 16/17 字段一致。  
6. 是否只描述**现行**设计（无演进叙事、无第二套方案史）。
