# 15 — 文档小组（记忆 · 知识管理 · 对工程主责汇报）

文档小组是 picode 的 **一级编制**，不是附属秘书。  
它决定 **run 记忆如何组织、知识库如何更新、工作组看到什么过滤后的信息**，并向 **工程主责** 汇报。

## 1. 编制（MUST 三人）

|席位|ID|中文|一句话|
|------|-----|------|--------|
|领导|`docs-lead`|文档主责|记忆/知识策略；向工程主责汇报；下发与 brief 组装的质量责任人|
|执行|`tech-writer`|技术写作|写 L1/L2、整理 brief/packet、执行知识入库草稿|
|监督|`docs-qa`|文档质检|一致性、来源/TTL、挡不合格记忆与知识|

配置模板键：`cells.templates.docs`（默认 lead/doer/check 如上）。  
展示名可配（13）；逻辑 id 稳定。

## 2. 职责边界

### 2.1 文档小组 **负责**

|域|内容|
|----|------|
|**Run 记忆**|L0 收口、L1 规范叙事、L2 工程主责简报、handoff 归档索引|
|**知识管理**|`skills/`、`docs/knowledge/` 编目、版本、过期标记、ingest 建议|
|**信息下发**|将工程主责批准的内容打成 packet / 写入 work brief 附件结构|
|**工作 brief 组装**|工程主责意图 + 调研要点 → 结构化 WORK_BRIEF；**工程主责仍为签发人**|
|**向工程主责汇报**|周期 Memory Brief；阶段风险；「记忆面可关闭」签字|
|**申请队列**|处理 `request_info` 队列的文档侧|

### 2.2 文档小组 **不负责**

- 替代工程主责做 goal/合并终裁  
- 替代调研做外网检索（可触发 research）  
- 替代 sdet 做命令证据  
- 实现三角内部日常指挥（那是 `squad-lead`）  

### 2.3 与工程主责

```text
文档主责 ──Memory Brief / 风险──► 工程主责
工程主责 ──brief 意图 / 批准 / redact──► 文档小组
文档小组 ──下发包 / 更新 brief 结构──► 实现三角（只读消费）
```

工程主责是 **战略与签发**；文档小组是 **记忆运营与知识治理**。

## 3. 房间

|房间|用途|
|------|------|
|`docs`|技术文档：申请队列、L1/L2、汇报稿、packet|
|`knowledge`|跨 run 知识写入与 ingest|
|`leadership`|工程领导：投递 Memory Brief；接收工程主责指令|
|`program`|项目统筹：brief_ready / packet 送达通知（可选）|

## 4. 关键流程

**步骤权威正文：** [PROCESSES.md](../PROCESSES.md) 中 **P03**（brief）、**P08**（资料申请）、**P11**（记忆/知识/汇报）、**P07**（交接归档）。

本节只保留编制与职责；改流程只改 PROCESSES.md。

## 5. 与 scale

|规模|文档小组|
|------|----------|
|S|MUST 三人编制（可 1～2 实例多帽 + seat 留痕）|
|M|MUST 分席建议|
|L|MUST 分席；可加 knowledge 执行实例仍归 docs-lead|

**禁止** 为省事取消文档小组，仅留「实现三角自写 README」——违反记忆与过滤设计。

## 6. 配置片段

```yaml
cells:
  templates:
    docs:
      lead_role: docs-lead
      doer_role: tech-writer
      check_role: docs-qa
      room: docs

docs_cell:
  report_every_n_closed_tasks: 3
  require_run_lead_skill_enable: false
  dual_room: true   # docs + knowledge 均由文档小组运营
```

## 7. 实现检查

- [ ] `cells.templates.docs` 存在且三角完整  
- [ ] 无 brief 组装角色时仍可由 tech-writer 路径完成  
- [ ] memory_brief 消息与 L2 路径  
- [ ] knowledge 写入权限属文档小组 tool profile  
- [ ] 测试：无 docs-qa 签字不得 cell.docs=done（S 折叠则 seat 痕迹）  
