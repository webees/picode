# 05 — 规模缩放与 MVP

## 1. scale（goal.yaml 必填）

|值|场景|判据|
|----|------|------|
|**S**|小改、单模块|单 chunk；低风险|
|**M**|常规多模块|多分块/并行|
|**L**|大重构、强安全、长跑|高并行、强门禁、知识沉淀|

工程主责可上调；下调须无进行中高风险 task。

## 2. 子系统开关

|子系统|S|M|L|
|--------|---|---|---|
|intake（用户↔工程主责）|MUST|MUST|MUST|
|调研并行（intake 起）|MUST 至少 ind-res|MUST + 校对建议|三角全开 + 周期|
|治理三角|可 1～2 实例多帽|建议分席|分席|
|实现三角|每 chunk MUST 3 席|MUST|MUST|
|**文档小组**（记忆+知识）|MUST 三人（可折叠留痕）|MUST 建议分席|MUST 分席；可加 knowledge 执行实例|
|独立 knowledge 三角|并入文档小组|并入文档小组|可选扩展实例，仍归 docs-lead|
|code-review|关|里程碑/高风险|开|
|security|关|风险触发|默认开|
|max_parallel_triads 默认|1|3|6|

折叠时 MUST 换帽留痕（`seat=lead|doer|check`）。

## 3. MVP 切片

与 **[11-implement-playbook.md](./11-implement-playbook.md)** 阶段对齐：

|MVP|约等于 playbook|能力|
|-----|-----------------|------|
|**MVP-1**|阶段 0–6|intake+调研、单 worktree 三角、bus/写集/evidence/handoff|
|**MVP-2**|+7 并行与文档|多 chunk、merge 列车、docs|
|**MVP-3**|+8 硬化|gates、knowledge、审计/调研周期、change_order|

回归：**T01–T12**（见 11）。

## 4. 平台与硬化

- 选型：[06-platform-tech.md](./06-platform-tech.md)  
- 硬化：[07-hardening.md](./07-hardening.md)  
- 工具：[09-tool-profiles.md](./09-tool-profiles.md)  
