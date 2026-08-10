# 19 — 自我进化（Self-Evolution）

**本文是「picode 用自身能力升级自身代码与能力」的唯一权威。**  
流程步骤骨架仍在 [PROCESSES.md](../PROCESSES.md)；会话规则在 [17](./17-agent-runtime.md)；实现缺口总序在 [18](./18-v1-completion-plan.md)。

---

## 1. 定义与目标

| 术语 | 含义 |
|------|------|
| **自我进化** | 在 **sponsor（人类）** 确认的 goal 下，picode 对 **自身代码库 / agent 模板 / skills / 配置** 提出变更，经标准双门闩、证据、串行 merge 合入 |
| **进化 run** | `goal.kind = self_evolve` 的 run；目标仓为 picode 仓库（或声明的 platform monorepo） |
| **交付 run** | `goal.kind = delivery`（默认）；目标仓为用户业务仓 |

**目标（产品）：**  
你后续可以 **只用 sponsor 意图 + 本运行时**，迭代升级 picode 自身（功能、可靠性、文档、agent 提示），而不是手工改完所有模块。

**非目标：**

- 无人值守、无 sponsor 的完全自治改内核  
- 自动放宽不变量 / 关闭安全门闩  
- 在未隔离 worktree 上直接改运行中的 orchestrator 进程映像  

---

## 2. 进化对象分层

由易到难；**下层未稳不得开上层自动写**。

| 层 | ID | 内容 | 写路径示例 | 风险 |
|----|-----|------|------------|------|
| L0 知识 | `evolve.knowledge` | 成功模式、失败案例、检索笔记 | `docs/knowledge/**` · `skills/**` | 低 |
| L1 提示 | `evolve.prompts` | `.picode/agents/*.md` · prompts | `.picode/agents/**` · `.picode/prompts/**` | 中 |
| L2 文档 | `evolve.docs` | 规范与策划（不含改不变量精神） | `docs/**`（可配 exclude） | 中 |
| L3 测试 | `evolve.tests` | 单测 / 契约测 / 金丝雀脚本 | `packages/**/test*` · `scripts/e2e/**` | 中 |
| L4 功能码 | `evolve.code` | core / bus / orchestrator / pi-extension | `packages/**` | 高 |
| L5 元策略 | `evolve.policy` | sess_mgr 规则、scale 矩阵、features 默认 | `packages/core` 配置 defaults · `docs/reference/decision-catalog.md` | 极高 |

配置：`self_evolve.allowed_layers: [knowledge, prompts, docs, tests, code]`（★ 默认前四项；`code` 显式打开；`policy` 默认关且 MUST sponsor 双确认）。

---

## 3. 与现行架构的关系（不另起炉灶）

进化 run **复用** 公司仿真全链路，仅增加约束与产物：

```text
sponsor 提出「升级 picode：…」
  → goal.kind=self_evolve · target_repo=picode
  → product / leadership / research 同 P01
  → scout/sys-arch 在 **picode 仓** 上 P02 分块
  → brief + 真招聘（人设须声明 evolve 层与禁区）
  → squad 在 worktree 改 picode 子集路径
  → 自测：packages 测试 + 文档校验脚本
  → code-review / sec-eng 按高风险策略
  → 串行 merge → 可选 tag evolve/<run_id>
  → docs 将「本次进化摘要」写入 knowledge（L0）
```

| 机制 | 进化时用法 |
|------|------------|
| worktree | **强制**；禁止在正在跑 orchestrator 的工作树上原地热改自己 |
| write_paths | 由 `allowed_layers` + goal 范围 **收紧生成**；超层拒绝 |
| 双门闩 | 不变；self_evolve 的 brief MUST 含风险等级与回滚说明 |
| sess-mgr | 同 17；进化 run 宜提高 `code-review`/`sec-eng` 唤醒权重 |
| sponsor | **永远人类**；合入 main / 升 tag / 开 policy 层 MUST 人类确认 |

---

## 4. Goal 扩展字段（设计）

```yaml
# goal.yaml 增量
kind: self_evolve          # delivery | self_evolve
target_repo: picode        # 或绝对路径；MUST 为 picode monorepo
evolve:
  layers: [docs, tests, code]
  risk: high               # low | medium | high
  baseline_ref: main       # 或 tag
  success_metrics:
    - "npm test 全绿"
    - "docs 链接与 terminology 自检通过"
  rollback: "git revert 合并提交 / 回退 tag"
  forbidden_paths:
    - "**/secrets/**"
    - "**/.env*"
```

**MUST：** `kind=self_evolve` 时 `target_repo` 解析结果 MUST 含 picode 的 `packages/core` 或配置声明的 platform 根标记文件（如 `package.json` name=picode）。

---

## 5. 安全不变量（进化专用 · 叠加 08）

记为 **E 系列**（与 I1–I15 同时生效）：

| ID | 规则 |
|----|------|
| **E1** | 自我进化 MUST 使用独立 worktree；MUST NOT 修改正在执行本 run 的 orchestrator 二进制/源码热替换 |
| **E2** | write_paths MUST ⊆ `self_evolve.allowed_layers` 映射路径；越层 `repo_write` MUST 拒绝 |
| **E3** | 变更 **不变量精神**（关闭双门闩、允许无 token bus、sponsor 非人类、关闭串行 merge 等）MUST 走 `features.*` 显式开关 + **sponsor 书面批准文件**；默认 deny |
| **E4** | merge 前 MUST 跑 **自测包**（配置 `self_evolve.verify_commands[]`，默认 `npm test` + 可选 docs check） |
| **E5** | 高风险（含 `code`/`policy` 层）MUST 唤醒 `code-review`；`policy` 层 MUST 再经 sponsor 确认 |
| **E6** | 每次进化 merge 后 SHOULD 写 `knowledge/evolve/<run_id>.md`：意图、diff 摘要、测试结果、遗留风险 |
| **E7** | 进化 run 的实现三角人设 MUST 含「禁改列表」与「本层允许路径」；people-qa MUST 校验 |

---

## 6. 准备清单（你现在就要做的）

### 6.1 仓库与工程卫生（L3 前提）

| # | 准备项 | 说明 |
|---|--------|------|
| P1 | picode **可单命令验证** | 至少 `npm test`（及文档后加的 check）稳定绿 |
| P2 | **主分支保护** | main 仅允许 PR/串行 merge；禁止 force-push 日常化 |
| P3 | **清晰包边界** | packages 职责与 18 一致，避免「一改全炸」 |
| P4 | **契约测试** | Bus ACL、写集、session 状态机等有自动化（对齐 T01–T28） |
| P5 | **可回滚** | tag 或 release 笔记；evolve 合并可 revert |

### 6.2 文档与口径（L2）

| # | 准备项 | 说明 |
|---|--------|------|
| P6 | 单源文档稳定 | AUTHORITY 分类；改流程/术语/agent 有明确入口 |
| P7 | decision-catalog 可执行 | ★默认即实现默认，避免文档与代码漂移 |
| P8 | 「进化验收」清单模板 | 见 §8；放入 `docs/reference/schemas/` 可后续加 yaml |

### 6.3 运行时能力（L4 前提 · 依赖 18）

| # | 准备项 | 依赖阶段 |
|---|--------|----------|
| P9 | Session 注册/唤醒 | 18-A/B/C |
| P10 | 真招聘 + 双门闩 | 18-D |
| P11 | 串行 merge + 门禁唤醒 | 18-F |
| P12 | knowledge 入库流水线 | 18-G |
| P13 | `goal.kind` + write_paths 生成器 | 本规格 §4–§5 · 实现项 |

### 6.4 人类治理

| # | 准备项 | 说明 |
|---|--------|------|
| P14 | sponsor 操作规程 | 哪些进化必须人批：合 main、开 code 层、开 policy 层 |
| P15 | 进化目标队列 | 用 issue/列表维护「下一刀砍哪」；每次 goal 只切一块 write_paths |
| P16 | 密钥隔离 | 进化 run 的 secret_globs 与业务仓一致；禁止 agent 读生产密钥 |

### 6.5 可选增强（非 v1 阻塞）

| # | 项 | 说明 |
|---|-----|------|
| P17 | 金丝雀 worktree | merge 后另起进程跑 e2e，再 fast-forward |
| P18 | 提示 A/B | 仅 L1：两套 agent 模板影子评估 |
| P19 | 指标板 | 进化前后：测试时长、违规次数、max_awake、失败 task 率 |

---

## 7. 成熟度（分阶段打开）

| 级 | 名称 | 允许层 | 打开条件 |
|----|------|--------|----------|
| **E0** | 人工 dogfood | 无自动 self_evolve | 用 picode **交付模式**改业务仓；人改 picode |
| **E1** | 知识闭环 | L0 | 18-G 可用；成功 run 摘要入库 |
| **E2** | 提示/文档自改 | L0–L2 | E1 + 文档单测/链接检查；sponsor 批 merge |
| **E3** | 测试与功能码 | L0–L4 | E2 + 全量 `npm test` 绿 + code-review MUST + write_paths 生成器 |
| **E4** | 策略自调 | L0–L5 | E3 + policy 双人（sponsor+显式 feature）+ 金丝雀 |

**★ 建议路径：** 先完成 18 的 A–G → 开 **E1** → **E2** → 再 **E3**。不要在 session/招聘未稳时开 E3。

---

## 8. 单次进化 run 验收模板

```text
evolve_acceptance:
  - [ ] goal.kind=self_evolve 且 target_repo 正确
  - [ ] evolve.layers 与 write_paths 一致且无越层
  - [ ] brief 含风险、回滚、verify_commands
  - [ ] staffing 人设含禁区与允许路径
  - [ ] verify_commands 全绿（日志入库 evidence）
  - [ ] code-review 签字（code 层）
  - [ ] sponsor 确认 merge（policy 层额外确认）
  - [ ] knowledge/evolve/<run_id>.md 已写
  - [ ] 未修改 forbidden_paths / 未关闭 I*/E* 门闩
```

---

## 9. 流程挂钩（PROCESSES 索引）

| 阶段 | 进化特化 |
|------|----------|
| P01 | sponsor 标明 self_evolve；pm 写「升级用户故事」；ind-res 可查同类 agent 框架做法（外网） |
| P02 | scout/sys-arch **只扫 picode 仓**；chunk 按 packages/docs 切 |
| P03 | brief MUST 引用 §8 清单 |
| P04 | 招聘说明「平台自改」风险；sdet 人设侧重自测命令 |
| P05–P07 | 同交付；cwd=worktree(picode) |
| P10 | 默认按 high 风险唤醒门禁 |
| P11 | **强制** L0 进化纪要入库 |

步骤正文仍只写在 PROCESSES；若增 P16，仅增加一节指针到本文。

---

## 10. 配置草案

```yaml
self_evolve:
  enabled: true
  default_kind: delivery          # 普通 run 默认不进化
  allowed_layers: [knowledge, prompts, docs, tests]  # code/policy 显式加
  verify_commands:
    - "npm test"
  require_sponsor_merge: true
  require_code_review_on_code_layer: true
  knowledge_log_glob: "docs/knowledge/evolve/"
  platform_root_markers:
    - "package.json"              # 且 name 匹配 picode（实现时校验）
  forbidden_path_globs:
    - "**/.env"
    - "**/secrets/**"
    - "**/*.pem"
```

---

## 11. 风险摘要

| 风险 | 缓解 |
|------|------|
| 自改跑飞破坏运行时 | worktree + 测门禁 + 串行 merge + 回滚 |
| 提示进化导致越权 | people-qa + 工具画像单测 + 禁改 features 默认 |
| 目标过大一次改全仓 | sponsor 强制小 write_paths；chunk 隔离 |
| 与业务 run 混淆 | goal.kind 分流；目录/tag 前缀 evolve/ |
| 无限自我目标漂移 | 人类维护进化队列；每次 goal 可验收 |

---

## 12. 与 18 的衔接

| 18 阶段 | 对自我进化的意义 |
|---------|------------------|
| A–C 会话 | 无稳定会话谈不上自动进化 |
| D 真招聘 | 自改人设与禁区 |
| F 门禁 | E3 的硬前提 |
| G knowledge | E1 的硬前提 |
| H 观测 | 进化前后指标 |

**实现顺序建议：** 18 完成至 G → 实现 `goal.kind` + write_paths 策略（本文）→ E1 → E2 → E3。

---

## 13. 检查清单（文档/产品）

- [ ] sponsor 同意进化队列与合入规程（§6.4）  
- [x] `npm test` 稳定（§6.1）  
- [x] 18 A–G 达到可 dogfood  
- [x] 配置 `self_evolve` 落地  
- [x] 至少一次 **E1** 人工发起：delivery 成功摘要写入 knowledge（已自动化演练验证，见汇报）  
- [x] 至少一次 **E2**：self_evolve 只改 docs/agents 并 merge（已自动化演练验证，见汇报）  
- [ ] 再评估 **E3**  
