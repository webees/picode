# sponsor 蓝图确认 + 信息入口诉求（2026-08-13）

## 一、sponsor 蓝图（原文整理）

多智能体开发流程：需求确认 → 规划组队（双批准）→ 多小组并行（独立房/独立区/各自巡检交接）→ 交接签收 → 解散评分 → 再规划。
- 文档小组：组装/校对/下发简报、汇总统一口径、归档记忆、持续优化角色提示词
- 调研小组：联网检索、协助整理校对、资料经工程主责审核后下发
- 知识库：沉淀评分/交接/调研，跨组复用

## 二、与 picode 文档对照结论（监督者补读 PROCESSES/03-workflows/15/16 后）

| sponsor 蓝图 | picode 对应 | 状态 |
|---|---|---|
| 需求确认（三角色：主责主持/产品策划/行业研究实时联网） | P01 三并行轨道（product pm / leadership run-lead / research ind-res） | ✅ 已设计 |
| 规划+用人标准+招聘三人小组+双批准 | P02 分块 / P04 招聘 / P05 双门闩 | ✅ 已设计 |
| 多小组并行·独立房·独立区·巡检·独立交接 | P06/P07（房间 ACL + worktree + handoff） | ✅ 已设计 |
| 交接签收 → 解散 → 评分 | P07 + 16 §9 hr-score | ✅ 已设计 |
| 再规划（重新招聘） | 新 goal / P02 | ✅ 已设计 |
| 文档小组四职责 | P11（docs cell：简报/口径/记忆/提示词优化） | ✅ 已设计 |
| 调研小组（审核后下发） | P08/P15（request_info 申请制 + ind-res） | ✅ 已设计 |
| 知识库 | knowledge/ + E6 | ✅ 已设计 |

**结论：蓝图与 picode 文档完全对齐，无设计缺口。**

## 三、新增诉求：随时投喂信息入口（sponsor 核心诉求）

「随时都能发送新的信息给 picode，picode 内部不同的人员来处理信息」

现状缺口：
- 新需求 → 必须走 init（新 goal）——重
- run 内变更 → change_order（P12）——需要 task 上下文
- 三角缺资料 → request_info 申请制（P08）——方向反了（三角发起）
- **缺**：sponsor 主动随手投喂（一条信息/一个想法/一个外部链接/一个文档）→ picode 内部分诊 → 对应角色处理 → 结果回到 sponsor

诉求机制（供 run-lead 决策设计）：
- 入口：`picode intake` CLI / MCP 工具（sponsor 身份，任意时刻）
- 落盘：runs/<id>/intake/feed-*.yaml（from=sponsor, ts, type, body）
- 分诊：run-lead 会话决策 or 规则按 type（需求→product/run-lead；研究→ind-res；文档→docs cell；问题→run-lead 拆卡）
- 分发：bus 通知对应房间 + 唤醒对应角色会话
- 回执：处理结果经 bus/回执文件回到 sponsor

## 四、待 run-lead 决策

1. 信息入口机制设计（上述或更优方案）→ chunk 提案
2. mattpocock/skills 研究（docs/research/mattpocock-skills.md M1-M6）→ 技能体系整合 C4 设计
3. 文档小组优化任务清单（用户指定：由文档小组更新优化内容）
4. C1 serve-robust 收尾批准（write_paths 外 2 文件：session-store.clearError / index.ts 导出）
5. C2 refine / C3 compaction 重新投喂确认
