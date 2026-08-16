<!-- 文档小组产物。authored_by: docs-lead（文档精简批 2） · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 · 三帽折叠留痕：role: docs-lead+tech-writer+docs-qa -->

# E1-E15 早期 E 纪要摘要（防流水账 · 2026-08-15 精简批 2）

> 目的：早期 evolve 纪要的快速检索索引（run id → D 编号 → 一句话主题 → 教训/风险去向），
> 防流水账——**每 run 最多 3 行**；过程细节一律交 git 历史（原文件不删除，头部已标注）。
> 已合并对（r4/r6/r10/r12/r15）：原纪要标注「已合并至 plans/<同名>.md」，本表仍登记摘要行。
> 维护：本表更新须同步被摘录文件头部标注；新 run 纪要入库前先过 DOC-LIFECYCLE TTL 表（L98-106）。

## 摘要表

| run 标识 | 日期 | 主题 | D 编号 | 教训（一行） | 风险去向 |
|---|---|---|---|---|---|
| run-2026-08-12T18-50-35-123Z | 08-12 | prime-agent 机制学习 → picode 优化（13 chunk 全合并：五路并行/深度研究/ponytail/agency-agents/Q1-Q3） | D059-D063（前史） | 过程叙述超载（serve 重启/权限/配置化监督实录）；产出=决策清单+pi-agent-study+修复链 | serve 挂起依赖上游（ERR-01 watchdog 可观测）；C3 夹具抽取转 C5 单源化；checkpoint 列为后续轮（D082 落地） |
| run-2026-08-12T23-36-04-362Z | 08-12 | 长时运行验证（4 chunk：evolve-refine/write-paths/ponytail 注入/纪要） | D066 前史 | **会话完成回合后停住**（tokens 12 分钟零增长）→ 无 continuation 是长时自治瓶颈 | continuation 机制立项（D066，r1 落地）；E7/T06 门闩全程生效 |
| run-2026-08-13T01-15-17-073Z（r1） | 08-13 | 会话续跑机制 continuation（R1 C1-C3 + R2 三硬化，合卷） | D066 + R2 硬化 | **merge 后 task 未终态 → 续跑不停止**（被连投 8 次至 02:42）；预算默认 0=不限实测连投 | R2 根治：merge 置 merged 终态（D067 侧）→ 平台席 skip + gate（D068）→ 遥测三面（D069）；语义续跑/checkpoint/maxTokens 缓 |
| run-2026-08-13T12-16-26-548Z（r4） | 08-13 | 监控面板 Dashboard（server 只读 HTTP + 前端 pnpm 双包） | D070 | 前端依赖重型（7.5k 行 pnpm-lock）；tokens 展示依赖 serve 在线（尽力而为非文件真相） | 鉴权/多 run 聚合/写面扩展列后续候选；serve 契约漂移需同步（D058 契约） |
| run-2026-08-13T17-25-34-974Z（r6） | 08-13 | 会话生命周期：run 收尾自动休眠平台席 + 跨 run 残留审计（--clean） | D072/D073（+D074/D075 处置） | 残留回收依赖手动 `--clean`（自动仅 best-effort）；端到端实测延后（D075） | audit 兜底 + 新 run 前清理规程；收尾自动清理增强/残留告警列后续候选 |
| run-2026-08-13T23-50-59-484Z（r10） | 08-13 | Skill Harness：skill-lint + skills_root 激活 + persona skills[] 接线 + 渐进披露 | D084（D085-D088 缓/拒） | allowed-tools 仅解析不强制；激活依赖模型自主 repo_read（弱模型可能不拉正文） | skills-ref 官方对齐（D085 缓）、打包/导入机械实现（D086）、skill-creator（D087 拒）、allowed-tools×ACL 设计（D088 留档） |
| run-2026-08-14T08-55-08-366Z（r12） | 08-14 | checkpoint 自动捕获接线（guardian 周期 + pre_merge）+ reserve 字段对齐 | D091（+D092 处置） | **reserve.mjs 写 `from`/`count` vs decision-lint 解析 `start`/`count` 字段不一致**（E12 风险显形） | 对齐 `start`/`count` + --plan 预检（D092）；自动捕获默认开启评估 → D096 翻转（r14）；status 三面/保留策略缓 |
| run-2026-08-15T01-12-43-3NZ（r15 = E16） | 08-15 | Bug A deepMerge 深拷贝 + Bug B E2/E7 按层分组 + ponytail 清理（C1-C6） | D099-D103 | **deepMerge DEFAULTS 共享引用污染全局单例**；checkpoint-auto 用例「踩 bug 上绿」假绿（co-001） | session_wake_direct flaky 分诊（候选 #1）；D097/D098 悬空预留；docs 引用债；工作房模板机械落地（D103） |
| run-2026-08-13T09-36-28-520Z（r3） | 08-13 | R3 硬化：idle 时钟/平台席策略/gate/遥测 | D067-D069 | 见 DECISIONS 详条（文件未在工具故障环境下定位） | 见 DECISIONS 详条 |
| run-2026-08-13T15-08-28-705Z（r5） | 08-13 | Dashboard 视觉检修（语义色 token/域组件/三视图） | D071 | 见 DECISIONS 详条（文件未定位） | 见 DECISIONS 详条 |
| run-2026-08-13T18-29-39-276Z（r7） | 08-13 | 语义续跑：续跑 prompt 注入 transcript 摘要 | D076-D078 | 见 DECISIONS 详条（文件未定位） | 见 DECISIONS 详条 |
| run-2026-08-13T21-32-57-118Z（r8） | 08-13 | 续跑摘要窗口/预算按角色分流/checkpoint 评估 | D077/D078/D081/D082 | 见 DECISIONS 详条（文件未定位） | 见 DECISIONS 详条 |
| run-2026-08-13T23-48-54-042Z（r9） | 08-13 | 会话 checkpoint MVP（快照只读/文件为准）+ re-spawn 去噪 | D082/D083 | 见 DECISIONS 详条（文件未定位） | 见 DECISIONS 详条 |
| run-2026-08-14T07-27-45-654Z（r11） | 08-14 | 决策编号管理：watermark ledger + reserve 脚本 + decision-lint | D089/D090 | 见 DECISIONS 详条（文件未定位） | 见 DECISIONS 详条 |
| run-2026-08-14T10-07-06-439Z（r13） | 08-14 | 摘要剔噪统一（summary-noise.ts）+ supervise 命令正式化 | D092/D093（+D094 缓） | 见 DECISIONS 详条（文件未定位） | 见 DECISIONS 详条 |
| run-2026-08-14T11-14-26-837Z（r14） | 08-14 | checkpoint 观测三面同源 + 自动捕获默认开启（暂停 run） | D095/D096（D097/D098 预留未落地） | 见 DECISIONS 详条（文件未定位） | D097 feed 映射文档化 / D098 merge 后自动 push（预留，E16/E17/E18 候选沿用） |

## 已确认单边文件（无法合并/摘要化，登记备查）

| 文件 | 状态 | 说明 |
|---|---|---|
| `docs/knowledge/evolve/2026-08-13-r1-continuation.md`（r1） | evolve 存在，**plans 侧同名缺失**（方案盘点记录 120 行，当前工作树 not found——疑改名提交后遗漏或被批 1 归档，需工具可用环境 `ls docs/plans/` 复核） | r1 对无法按 2a 合并（缺 plan 主干），本摘要表已登记其 run 行；plan 决策清单 N1-N7 详情见 evolve 纪要 L14-21 与 DECISIONS D066 |
| `docs/plans/2026-08-13-r2-continuation-hardening.md`（r2） | plans 存在，**evolve 侧无独立文件**（R2 内容合卷于 r1 纪要 R2 区） | 非同名对，无需合并；r2 plan 为 R2 决策归档（(a) 处置 1-5 / (b) chunk / (d) R3 候选），已由 r1 纪要 R2 区承载结果 |
| `docs/knowledge/evolve/run-2026-08-12T18-50-35-123Z.md` | 08-12 早期（保留 run-id 旧名） | 已摘要（本表首行）；保留 run-id 名与 08-13 起 kebab 短名不一致（命名漂移观察项，见 DOC-CONSOLIDATION-PLAN §1.4） |
| `docs/knowledge/evolve/run-2026-08-12T23-36-04-362Z.md` | 08-12 早期（保留 run-id 旧名） | 已摘要（本表第二行） |

## 未定位文件声明（工具故障 · 待工具可用环境补充）

- **本会话 bash / glob / grep 三工具不可用**（`spawn bash ENOENT` / `ripgrep launch failed`，与
  DOC-LIFECYCLE §0、DOC-CONSOLIDATION-PLAN §0/§5.3、audit-verification-report §0 记录的同一环境
  故障一致）。evolve/ 与 plans/ 目录**未能机械枚举**，r 系列文件名主题词无法从文档引用推断
  （改名提交 3925a99 后文档内引用未同步，方案 §5.2）。
- **确认存在**（read 直读）：evolve/ = r1-continuation、r4-dashboard、r6-run-close、
  r10-skill-harness、r12-checkpoint-auto、r15-bugfix-cleanup（E16）、dsh-integration（E17）、
  continuable-subagents（E18）、run-2026-08-12T18-50-35-123Z、run-2026-08-12T23-36-04-362Z；
  plans/ = r2-continuation-hardening、r4-dashboard、r6-run-close、r10-skill-harness、
  r12-checkpoint-auto、r15-bugfix-cleanup、parallel-org、next-round-candidates、
  continuable-subagents-blueprint。
- **待定位**（按 DECISIONS 来源 run-id 推断存在，主题词未命中）：evolve/ 与 plans/ 的
  r3（run-09-36-28-520Z）、r5（run-15-08-28-705Z）、r7（run-18-29-39-276Z）、r8（run-21-32-57-118Z）、
  r9（run-23-48-54-042Z）、r11（run-08-14T07-27-45-654Z）、r13（run-08-14T10-07-06-439Z）、
  r14（run-08-14T11-14-26-837Z），以及 08-12 早期其余 2 份（run-id 时间戳未知）与 plans/2026-08-13-r1-continuation.md。
  **工具可用环境执行**：`ls docs/knowledge/evolve/ docs/plans/` 后按本表 run-id 列补齐摘要行，并
  对全部同名对完成 2a 合并（本批已处理 r4/r6/r10/r12/r15 5 对）。
