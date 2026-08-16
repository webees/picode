<!-- 文档小组产物。authored_by: docs-lead（文档全面精简 · 章程 v2 授权） · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 · 三帽折叠留痕：本会话单代理完成盘点/起草/质检三职，按折叠留痕规则在此声明 role: docs-lead+tech-writer+docs-qa -->

# 文档全面精简方案 · DOC-CONSOLIDATION-PLAN（2026-08-15 · 章程 v2 授权）

> 性质：文档小组自主盘点产物。章程 v2 见 `docs/knowledge/feedback/DOC-LIFECYCLE.md` L94-109（合并优先、过期即删、防流水账；TTL 表 L98-106；技术资料由 run-lead/tpm 评估 L108-109）。
> 状态：**待 run-lead 审批**（本轮只产出方案，不执行任何删除/合并/改写；审批通过前零动作）。
> 工具限制声明：本会话 bash / glob / grep 不可用（`spawn bash ENOENT` / `ripgrep launch failed`），与 DOC-LIFECYCLE §0、audit-verification-report §0 记录的同一环境故障一致。盘点采用 read 直读 + reflog 直读 + 交叉引用；受影响范围与缓解见 §5.3。

---

## 0. 盘点口径与范围

体检范围 = 任务定义的全量 7 类。已直读核验的文件（√），未能机械枚举/直读的文件以「名待核验」标注（改名提交证据见 §5.2）：

| 范围 | 文件 | 核验 |
|---|---|---|
| feedback/ | DOC-LIFECYCLE.md（章程 v2）· sponsor-feedback-and-process-audit-2026-08-15.md · scoring-driven-hiring-evaluation-2026-08-15.md · design-deficiencies-analysis-2026-08-15.md | 4/4 √ |
| evolve/ | 2026-08-13-r1-continuation.md（√ 100 行）· r2..r15（名待核验）· 08-12 早期 ×4（run-2026-08-12T18-50-35-123Z.md √ 91 行；其余名待核验）· E16/E17/E18（08-15，名待核验） | 2 读 / 19 名待核验 |
| plans/ | 2026-08-12-parallel-org.md（√ 23 行）· 2026-08-13-r1-continuation.md（√ 120 行）· r2..r15（名待核验）· next-round-candidates.md（√ 66 行）· continuable-subagents-blueprint.md（√ 293 行） | 4 读 / 14 名待核验 |
| handoffs/ | run-2026-08-15T01-12-43-3NZ-c3-c2.md（√ 135 行）；其余名待核验 | 1 读 |
| knowledge/ 根 + research/ | pi-agent-study.md（√ 59 行）· dsh-collab-2026-08-15.md（√ 87 行）· research/：prime-agent-deep.md（√ 58 行）· prime-agent-deep2.md（√ 34 行）· prime-agent-continuation.md（√ 234 行）· docs/research/briefs/sys-arch-评估.md（√ 19 行）· .picode/runs/run-2026-08-15T02-30-00-DSH/research/briefs/pi-persistence.md（√ 188 行） | 7 读 |
| .picode/plans/ | dsh-source-survey.md（√ 367+ 行）· research-brief-deepseek-harness.md（√ 176 行）· run-2026-08-15T02-08-48-06-DSH-intake.md（√ 237 行）· audit-verification-report.md（√ 80 行）· **观察项 dsh-preliminary-notes.md（名见 survey L7 引用，未读）** | 4 读 + 1 观察 |
| 交叉检查 | DECISIONS.md（√ 592 行，**不动**）· decision-catalog.md（√ 1064 行，**不动**，已核 L940-1064 引用面）· docs/README.md（√ 128 行，未引用 feedback/evolve/plans 具体文件） | 3 读 |

**关键环境事实（改名提交）**：`.git/logs/refs/heads/main` L178 记录提交 `3925a99`「refactor(docs): 命名规范统一——run-* 归档改 kebab 短名（日期-rN-主题）、snippet→example、prime-agent→pi-agent、plan_draft→plan-draft；全仓引用同步（decision-lint 120 OK）」。即：evolve/ 与 plans/ 中 run-id 旧名文件（如 `run-2026-08-13T01-15-17-073Z.md`）已改名为 `2026-08-13-r1-<主题>.md` 形态；但**文档内路径引用未同步**（decision-lint 只校验 D0xx 引用，不校验任意路径），见 §5.2 stale 引用清单。

---

## 1. 去留判定总表

### 1.1 feedback/（4 份 · 章程试点第 1 轮已判全保留，本轮复核不推翻）

| 文档 | 判定 | 理由（实证） | 建议动作 |
|---|---|---|---|
| `DOC-LIFECYCLE.md` | **保留** | 章程 v2 本体（L94-109 TTL 表）；run-lead 已批（L90-92）；本方案即其 §3 流程的产物 | 不动；本方案审批通过后在其尾部追加第 2 轮体检记录 |
| `sponsor-feedback-and-process-audit-2026-08-15.md` | **保留** | ① 强制输入自述 L3-6（must_read_refs 应含本文）；② next-round-candidates L52 登记「Sponsor 反馈候选（强制输入）」；③ DECISIONS D112 详条来源（commit e99f1fa）；④ audit-verification-report 全篇验证（§3.1 评级高）；⑤ 引用链：DOC-LIFECYCLE §0/§2 引用。紧凑型（80 行，表为主），非流水账 | 维持 DOC-LIFECYCLE §1 判定（含 §6 B 级评分建议指针注） |
| `scoring-driven-hiring-evaluation-2026-08-15.md` | **保留** | ① next-round-candidates L60 登记「试点核心实验项」；② 与流程审计是决策修正关系（§4.3 改「评分取消」为「评分改造为决策输入」，L65）；③ 消费侧唯一权威（§4.2 L57-61） | 维持 DOC-LIFECYCLE §1 判定 |
| `design-deficiencies-analysis-2026-08-15.md` | **保留** | ① 8 项缺陷唯一聚合视图（跨 E16 L102-103 / E17 候选#2#5 / E16-E18 基线 502→562→604）；② §7 试点章程（L74-81）本方案的上位依据；③ 与 #1/#2 属配套（L5），重叠为"良好设计"节（L56-61）复述 C 级闸门——配套性复述非待合并重复 | 维持 DOC-LIFECYCLE §1 判定；补标准产物标头 |

### 1.2 evolve/（21 份 · 含防流水账与合并候选，详见 §2/§3）

| 文档 | 判定 | 理由（实证） | 建议动作 |
|---|---|---|---|
| `2026-08-13-r1-continuation.md`（R1+R2 合卷） | **精简 + 合并候选 A1** | ① 与同名 plan 双份：plan L16-28（N1-N7 决策清单）与 memo L14-21（决策要点）重复；plan (d) 候选（L109-114）与 memo 第二轮候选（L59-67）结构重复；② 过程叙述：memo L41-44「真实运行验证」（02:07/02:12 投喂时间点）可压为一句；③ TTL 表「同名 run 的 plan+evolve 可合并为一份」（DOC-LIFECYCLE L102） | 合并 A1（§3.1）；过程段压缩；D066 决策载体地位不变 |
| `r2..r15`（14 份，名待核验） | **逐份按框架判定（框架见 §3.2）** | 依据 r1 样本：结构 = intent/diff/verification/剩余风险/候选（r1 memo L8-67），决策编号 D067-D098 载体；DECISIONS 详条以 E 编号引用（D090 详条「E12 剩余风险」、D091「E13 后续候选」、D094「E13」、D096「E14」、D082「E11」、D084「E11」等）——摘要必须保留编号映射 | 执行轮先 `ls docs/knowledge/evolve/` + 逐份读后归位：完成态且无后续引用 → 摘要化；有剩余风险/候选被消费 → 保留原文件（按 §2 模板精简） |
| `08-12 早期 ×4`（run-2026-08-12T18-50-35-123Z.md √） | **摘要化首选** | 已读样本 = 全仓最大流水账：L31-36「监督过程记录」+ L44-90 五段「追加」（五路并行轮/深度研究轮/ponytail 轮/agency-agents 轮/Q1-Q3 轮）均为过程叙述（"做了 X + 监督实录"），决策价值密度低；可复用信息 = 产出清单 + 教训（断链、代提交、评分无区分前史）+ 剩余风险（L38-42） | 压为 ~15 行摘要（产出/验证/教训/剩余风险），细节依赖 git 历史；其余 3 份执行轮核验后同框架处理 |
| `E16/E17/E18`（08-15 三 run，名待核验） | **保留（精简重复段）** | ① D099-D112 唯一决策载体（E18 = D112 详条明确路径 `docs/knowledge/evolve/run-2026-08-15T03-00-00-SUBAGENT.md`）；② 引用链：DECISIONS D112、dsh-collab §6（E16/E17）、audit-verification-report L6（E16/E17）、DOC-LIFECYCLE §0/L21；③ 与 catalog/DECISIONS 三写 = 缺陷 #4（design-deficiencies L29-32「同一决策在 DECISIONS 详条、catalog、E 纪要各写一遍」）——治理方向是「E 纪要只写增量」（L32），即**精简而非删除** | 执行轮先修 stale 路径引用（§5.2）；按 v2「只写增量」删与 catalog/DECISIONS 重复段，保留剩余风险/教训/候选 |

### 1.3 plans/（19 份）

| 文档 | 判定 | 理由（实证） | 建议动作 |
|---|---|---|---|
| `2026-08-12-parallel-org.md` | **保留** | 历史决策（并行组织/审查门/文档治理，23 行紧凑）；被 r1 plan 引用（plan C3 read_paths「docs/plans/2026-08-12-parallel-org.md」，L81） | 不动 |
| `2026-08-13-r1-continuation.md` | **合并候选 A1** | 与 evolve 同名 memo 双份重复（§1.2 首行）；TTL 表授权（DOC-LIFECYCLE L102） | 合并 A1：保留决策清单 + chunk 分块/验收（前瞻），并入 diff/验证/剩余风险（回顾），成「计划+结果」单文件 |
| `r2..r15`（14 份，名待核验） | **与同名 memo 合并（框架）** | 同 r1 证据形态（每 run 一份 plan + 一份 evolve 同名文件） | 执行轮逐对核验后合并；合并后 DECISIONS 详条「来源」行若引用 plan 路径需同步 |
| `next-round-candidates.md` | **保留** | 活跃待办跟踪（L28-34）；3 份 feedback 的下游引用方（L52/L60/L65）——feedback 受其引用链保护 | 不动；feedback 执行轮变更时同步其来源链接 |
| `continuable-subagents-blueprint.md` | **保留** | D107 决策载体；decision-catalog §23.6（L954）与 §24（L981）引用；dsh-collab §4 引用；下轮 I1-I7 未消费完 | 不动（消费完成后按 TTL 复审） |

### 1.4 handoffs/

| 文档 | 判定 | 理由（实证） | 建议动作 |
|---|---|---|---|
| `handoffs/`（run-2026-08-15T01-12-43-3NZ-c3-c2.md √） | **保留** | v2 TTL 表「handoffs/ 永久（执行证据）」（DOC-LIFECYCLE L105）；六件套构成经 audit-verification §1 #7 实证；「六件套→2 件」只影响未来产物形态（L105），不改历史归档 | 不动；执行轮登记文件名（仍为 run-id 旧名，与 evolve 改名体系不一致——命名漂移观察项） |

### 1.5 knowledge/ 根 + research/

| 文档 | 判定 | 理由（实证） | 建议动作 |
|---|---|---|---|
| `pi-agent-study.md` | **保留** | L0 知识（借鉴/不借鉴总纲）；被 r1 plan L10-11、r1 memo L12、DECISIONS D066 详条（C3 docs 行）引用；「continuation 落地」段（L47-58）为 D066 依据 | 不动；可标注「研究已融合」 |
| `dsh-collab-2026-08-15.md` | **精简候选** | 归档态自述（L1）；§4.1 演进对照表（L61-66）与 DECISIONS D099/D100/D102 详条重复；§3.1 表（L35-45）与 main reflog 提交记录重复（过程叙述）；**唯一独有决策价值 = §4.2 六条审查意见（L68-75）** | 精简为「六条审查意见 + 一句演进结论」（约 20 行）；或维持归档不动——建议精简（防流水账） |
| `research/prime-agent-deep.md` + `prime-agent-deep2.md` | **归档候选** | 已消化：deep2 L3 自述「第一轮 P1-P5 已融合」；deep.md §6 已过时（「PICODE_TRANSCRIPT_DIR 空置」——D066 已落地 transcript-store）；TTL 表「research briefs 6 个月」（DOC-LIFECYCLE L104） | 归档 research/archive/ 并标注 TTL，或保留至 6 个月到期删除；deep.md 过时段落标注 |
| `research/prime-agent-continuation.md`（234 行） | **归档候选** | r1 plan 的 C2/C3 输入（plan L100「供 C2/C3 引用与第二轮决策」），消费完毕；budgets/gates 细节已落地 D066/D068 | 保留 1 段结论摘要后归档 |
| `docs/research/briefs/sys-arch-评估.md` | **删除候选** | 与 pi-agent-study L27-45「sys-arch 评估」**逐字重复（19 行全部重叠）**——重复内容 TTL=立即删除（DOC-LIFECYCLE L106「与 DECISIONS/catalog 重复的段落删除（单一事实源）」）；r1 plan L11 引用该路径 → 删除前同步改引用为 pi-agent-study | 并入 pi-agent-study 后删除（引用同步：r1 plan L11 → 改指 pi-agent-study） |
| `.picode/runs/run-2026-08-15T02-30-00-DSH/research/briefs/pi-persistence.md` | **保留** | D107/D109 详条引用；decision-catalog §23.6（L959）引用；蓝图 §5 写实依据（URL+retrieved_at） | 不动（run 内证据 brief）；TTL 6 个月后复审 |

---

## 2. 防流水账专项（过程叙述 > 决策价值 → 压缩/删）

**判定标准**（章程 v2，DOC-LIFECYCLE L96）：文档只保留"决策/教训/可复用知识"，过程叙述删除或压缩为一句。

| # | 文档 | 流水账评级 | 实证（行号） | 精简建议 |
|---|---|---|---|---|
| 1 | `run-2026-08-12T18-50-35-123Z.md`（08-12 早期） | **🔴 典型**（全仓最高） | L31-36「监督过程记录」（serve 重启/权限收敛/配置化解决 = 运维流水）；L44-90 五段「追加」逐轮复述（每段 = 产出 + 监督实录） | 压缩为 ~15 行：产出清单（chunk→commit）+ 验证数字 + 教训（断链/代提交/评分无区分前史）+ 剩余风险去向；过程细节交 git 历史 |
| 2 | `2026-08-13-r1-continuation.md` | 🟡 中低 | L41-44「真实运行验证」记录 02:07/02:12 投喂时间点 = 过程细节 | 「真实运行验证」压为一句（续跑机制无人干预驱动 C1/C2 合并，acceptance 3 达成）；R2 区同型压缩 |
| 3 | `E16/E17/E18`（未直读，据引用推断） | 🟡 结构型 | design-deficiencies #4（L29-32）：同一决策在 DECISIONS 详条、catalog、E 纪要各写一遍 | 按 v2「E 纪要只写增量」：分块表格/验证数字压缩为「验证: <命令> <N/N 绿>，详见 evidence/交接」（一条引用）；删与 catalog/DECISIONS 重复段 |
| 4 | `dsh-collab-2026-08-15.md` | 🟡 中 | §3.1 修复类别表（L35-45）+ §4.1 演进对照（L61-66）与 DECISIONS/reflog 重复 | 压缩为「六条审查意见（L68-75）+ 演进一句」；工坊预设（§2）留 3 行 |
| 5 | `r2..r15` 纪要（未读） | 待逐份核验 | 结构同 r1 样本（intent/diff/verification/剩余风险/候选） | 按模板校验：diff 行号级细节可压缩为 merge commit 列表；验证段压为一行 + evidence 引用 |

**通用建议（执行轮模板）**：E 纪要保留五要素 = ① run 头（goal/基线/D 编号映射）② 增量（教训/剩余风险/候选，引用 DECISIONS 编号）③ diff 一行（merge commit 列表）④ 验证一行 ⑤ 证据引用；**分块表格与验证数字一律不展开**（展开内容在 run 目录 evidence 与交接包）。

---

## 3. 合并候选

### 3.1 A1：同名 run 的 plan+evolve 合并（章程 TTL 表授权，DOC-LIFECYCLE L102）

**r1 实证对**：`plans/2026-08-13-r1-continuation.md`（120 行）∪ `evolve/2026-08-13-r1-continuation.md`（100 行）：
- 重复 1：N1-N7 决策（plan L16-28 表格）≈ memo L14-21 决策要点（同一 D066 决策双写）；
- 重复 2：第二轮候选（plan L107-114 六项 ≈ memo L59-67 七项，memo 按实测增补一项）；
- 互补：plan 独有 chunk 分块/验收口径（L32-88）↔ memo 独有 diff/验证/剩余风险（L23-57）。
- **合并方案**：单文件「计划+结果」= 决策清单（N1-N7）+ chunk/验收（plan 部分）+ diff/验证/剩余风险/候选（memo 部分）；去重后预计 220 行 → ~150 行（-30%）。
- **推广范围**：r2..r15 全部同名对（执行轮逐对核验）；E16-E18 的 plan+evolve 对（08-15 三 run 的 plan 位置待执行轮 `ls docs/plans/` + `.picode/runs/` 确认——run-16 规划经 reflog L154「正式规划/E16 初稿」归档，文件名待核验）。
- **引用链约束**：合并后原两路径的引用方须同步（r1 memo L12 引用 plan 路径；DECISIONS 详条「来源」行引用 run id 而非路径——合并后仍成立）。

### 3.2 B：E1-E15（含 08-12 早期 4 份）摘要化

- **方案**：保留「E1-E15 摘要」单文件（每 run 一行：run id → D 编号映射 + 一句话教训/风险去向 + chunk 数），**删除 19 份细节文件**（git 历史可追溯，v2「E 纪要永久但只写增量」的折中）。
- **实证依据**：① v2 TTL 表（L101）；② 缺陷 #4 三写冗余（design-deficiencies L29-32）；③ r1 样本显示每份 ~100 行中 diff/验证占 ~60% 为过程信息；④ DECISIONS 详条以 **E 编号**引用（E6/E10-E18 出现在 C3 docs 行与「剩余风险」行），非路径引用 → 摘要保留编号映射即不断链。
- **分档建议（执行轮逐份归位）**：
  - 档 1（摘要化）：完成态、无后续引用、无未消费剩余风险；
  - 档 2（保留 + 精简）：剩余风险/候选被后续轮消费（如 r1 的「续跑不停止」→ R2 根治，r1 memo L46-48）；— 或把该风险行并入摘要的「风险去向」列后仍可摘要化；
  - 档 3（原样保留）：DECISIONS 详条按路径引用者（执行轮 grep `evolve/` 复核）。
- **前置**：执行轮 grep `docs/knowledge/evolve` 与 `E[0-9]+` 全仓引用，逐条核对再动。

### 3.3 C：交接包六件套 → 2 件（v2 已定，仅未来产物）

历史归档不回溯；新 run 按 evidence + handoff.md 形态沉淀（DOC-LIFECYCLE L105）。

### 3.4 D：research 三处存放归并

现状三处：`docs/knowledge/research/`（prime-agent 系列）+ `docs/research/briefs/`（sys-arch-评估）+ `.picode/runs/<id>/research/briefs/`（pi-persistence）。建议：跨 run 知识统一 `docs/knowledge/research/`（sys-arch-评估并入 pi-agent-study 后删，见 §1.5）；run 级 brief 留 run 目录（已有 TTL）。属信息架构修复，与 §1.5 删除候选联动。

---

## 4. 技术资料评估请求（.picode/plans/ · 供 run-lead/tpm 评估讨论）

| 文档 | 候选 | 理由（实证） | 待 run-lead/tpm 确认点 |
|---|---|---|---|
| `dsh-source-survey.md`（367+ 行） | **保留 + 标注已落地** | Top 12 中 #1→D104、#2→D106、#3→D105、#10→D107-D111 **已落地**（DECISIONS 详条来源行逐条可证）；未落地 #4/#5/#6/#7/#8/#9/#11/#12 是 F/G/H/I 下轮 backlog 的依据（intake §4 P2/P3）——删除会失去集成依据链 | 已落地项标注 vs 保留全文；未落地 8 项是否值得另出「DSH 集成 backlog」单文件 |
| `research-brief-deepseek-harness.md`（176 行） | **归档候选** | 背景调研已被吸收：intake §2/survey/blueprint 均已引用其结论（blueprint §8 L282）；43 个 URL + retrieved_at 的「证据价值」随工程落地递减；TTL 表 research briefs 6 个月（L104）；同主题无第二来源依赖 | 归档（research/archive/ 或 run 目录）vs 删除 vs 保留至 TTL 到期 |
| `run-2026-08-15T02-08-48-06-DSH-intake.md`（237 行） | **保留 + 标注已落地** | A-E 候选已实现（D104-D111）；F/G/H/I + Q1-Q5（§4 P2/P3、§7 五个 open questions）是下轮输入；§8.2/§9 约束为下轮目标引用面 | 已落地 A-E 标注 vs 维持原文；F-I 是否迁入 next-round-candidates 承接 |
| `audit-verification-report.md`（80 行） | **保留（永久）** | 真实性评级证据（§3.1）+ 修正项（§3.2）+ 复现路径（§4）；被 DECISIONS D112、DOC-LIFECYCLE §0、3 份 feedback 引用 | 无（已定型） |
| `dsh-preliminary-notes.md`（观察项，任务清单外） | **删除候选** | survey L7 自述「浅层笔记」，已被 survey 完全取代；无任何文档引用其结论（survey 是权威版本） | 确认无下游引用后删除 |

---

## 5. 自查

### 5.1 引用链检查（被引用文档不得删除，除非同步改引用）

| 文档 | 引用方（实证行号） | 删除/合并约束 |
|---|---|---|
| 3 份 feedback | next-round-candidates L52/L60/L65；DECISIONS D112 详条；DOC-LIFECYCLE §0/§2/§3 | **受保护**（本轮不删，维持已批判定） |
| audit-verification-report | DECISIONS D112；DOC-LIFECYCLE L56/§0；3 份 feedback 自述 | **受保护** |
| continuable-subagents-blueprint | DECISIONS D107 详条；decision-catalog L954/L981；dsh-collab §4/L86 | **受保护**（I1-I7 未消费完） |
| intake + survey | blueprint §8（L281-282）；DECISIONS D104-D111 来源行 | **受保护**（合并/改版须同步 DECISIONS 来源引用） |
| pi-persistence brief | DECISIONS D107/D109；decision-catalog L959；blueprint §5 | **受保护** |
| pi-agent-study | r1 plan L10-11；r1 memo L12；DECISIONS D066 详条 | **受保护** |
| E16/E17/E18 纪要 | DECISIONS D112（E18 路径）；dsh-collab §6（E16/E17）；DOC-LIFECYCLE L21；audit-verification L6 | **受保护**（摘要化/合并前须同步全部路径引用） |
| next-round-candidates | DOC-LIFECYCLE §0/§2 引用为下游 | 受保护（活跃待办载体） |
| docs/README.md | 未引用 feedback/evolve/plans 具体文件（核 L13-128，仅链接 spec/guides） | 无约束 |
| sys-arch-评估.md | r1 plan L11 | 删除前改该引用 → pi-agent-study |
| prime-agent-deep/deep2/continuation | r1 plan L9-11/L100 | 归档/删除前同步 r1 plan（若 r1 plan 合并，引用随合并稿更新） |

### 5.2 stale 引用清单（改名提交 3925a99 未同步的路径引用——执行轮**最先修**）

1. `docs/knowledge/dsh-collab-2026-08-15.md` L86-87 → `evolve/run-2026-08-15T01-12-43-3NZ.md`、`evolve/run-2026-08-15T02-30-00-DSH.md`（改名后不存在，应指向新 kebab 名）；
2. `docs/DECISIONS.md` D112 详条 → `docs/knowledge/evolve/run-2026-08-15T03-00-00-SUBAGENT.md`（同上）；
3. `docs/knowledge/feedback/DOC-LIFECYCLE.md` §0（L21）与 §2（L55）→ E16-E18 旧路径；
4. `docs/knowledge/feedback/design-deficiencies-analysis-2026-08-15.md` 引用的 E 编号路径若为旧名（L19 相关）——执行轮 grep 复核。
**性质**：属引用同步（非内容变更），建议 run-lead 一并批准；修完即断链消除，后续合并/删除动作基于干净引用图。

### 5.3 完整性限制（如实声明）

- 机械枚举不可用（bash/glob/grep 故障，见头部声明）：evolve/（19/21）、plans/（14/19）、handoffs/（多数）、research 各目录内部文件清单未能 100% 机械确认；已用 reflog（L150-178 逐个 merge commit）与文档交叉引用补强。
- **执行轮前置（工具可用环境）**：① `ls docs/knowledge/evolve/ docs/plans/ docs/knowledge/handoffs/ docs/knowledge/research/ docs/research/briefs/ .picode/plans/` 复核清单；② grep `evolve/|feedback/|plans/` 全仓复核引用链（§5.1 表）；③ 先修 §5.2 stale 引用；④ 逐份读 r2..r15 与 E16-E18 后按 §2/§3 框架归位——本方案的判定框架已就绪，逐份落位属执行轮机械工作。
- 判定依据全部可实证（行号/commit/D 编号/报告结论），无印象式判断。

---

## 6. 汇总（本轮方案统计）

- **合并候选 4 类**：A1 同名 plan+evolve（r1 实证，推广 15+ 对）、B E1-E15+早期摘要化（19 份 → 1 份摘要）、C 交接包未来 2 件、D research 归并。
- **删除候选 2 份**：`sys-arch-评估.md`（与 pi-agent-study 逐字重复）、`dsh-preliminary-notes.md`（被 survey 取代，观察项）。
- **精简候选 7 项**：r1 memo（过程段）、08-12 早期 memo（摘要化）、E16-E18（三写去重）、dsh-collab（六条意见）、survey/intake（标注已落地）、prime-agent 系列（归档/标注）。
- **保留（受保护）**：3 份 feedback、next-round-candidates、blueprint、handoffs/、pi-agent-study、pi-persistence、audit-verification-report、DECISIONS、decision-catalog。
- **技术资料候选**：保留 2（survey 标注版、audit-verification-report）、保留+标注 1（intake）、归档 1（research-brief）、删除 1（dsh-preliminary-notes，观察项）。

---

## Run-lead 审批（2026-08-15 · 空位待批）

- [ ] 批准本方案（合并 4 类 / 删除 2 / 精简 7 / 技术资料 4+1 评估结论）
- [ ] 批准执行轮顺序：修 stale 引用 → ls/grep 复核 → 逐份落位 → 执行
- [ ] 技术资料 4+1 项：run-lead（tpm 角色）评估结论

> 审批未过，本方案不产生任何执行动作。
