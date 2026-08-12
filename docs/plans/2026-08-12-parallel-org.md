# 并行组织决策 — 2026-08-12（run-lead v4 决策）

> 决策者：run-lead。甲方指令 v4（加大力度/多三角/文档治理/审查门）。

## 四组并行（写集互斥）

| 组 | 域 | 任务 | 写集 |
|----|----|------|------|
| 三角A | 身份域 | TC-03 身份 + TC-11 人才库 + TC-12 招聘闭环 | src/identity\|talent\|recruit |
| 三角B | 交付域 | TC-05 需求链路 + TC-04 传递链 + TC-07 蓝图SOP | src/pipeline\|delivery + docs/sop |
| 三角C | 工具知识域 | TC-06 工具引导 + TC-09 调研 + TC-10 知识库 | src/tools\|research\|kb |
| 文档小组 | 文档域 | TC-08 文档治理 | docs/ |

## 审查门（提交前强制）

三角产出 → 自测（lint+test）→ 审查者 Checklist（正确性/测试/文档同步/无密钥/写集边界）
→ commit footer `Reviewed-by:<审查者>` + 意见落盘 `docs/reviews/<date>-<task>.md`
→ 总工终审 → push。未过审不 push。

## 文档治理

TC-08 首任务：docs/INVENTORY.md 盘点 → plans/kanban/sop/reviews/research 分类
→ 一主题一源、重复合并 → docs/README.md 总索引 → docs/kanban.md 看板快照 → 周度去重评审
