# msitarzewski/agency-agents 研究（源码级 · 2026-08-13）

> clone github.com/msitarzewski/agency-agents（深度 1）。定位：AI 专家人格集合（"The Agency"）。

## 1. 核心资产：agent 人格文件

- 每 agent 一个 .md：frontmatter（name/description/color/emoji/vibe）+ 正文
- 正文结构：**Identity & Memory**（人格叙事：角色/性格/记忆/经验）/ **Core Mission**（核心使命与工作流）/ **Critical Rules**（红线规则）/ 技术交付物（代码示例）/ 成功指标
- 示例（AI Data Remediation Engineer）：语义异常压缩（5 万坏行 = 8-15 个模式族）、零数据丢失数学约束（Source==Success+Quarantine）、PII 不出域

## 2. division 体系 + 单源校验

- 18 个部门目录（engineering/product/security/testing/...），每部门独立目录
- **divisions.json 单源事实**（division → label/icon/color）；CI（check-divisions.sh）强制：目录 ↔ json ↔ convert.sh 数组 ↔ lint 路径过滤 四方一致
- lint-agents.sh：agent 文件 frontmatter 校验；CONTRIBUTING（含中文版）

## 3. 分发体系

- app（macOS/Linux/Win 原生安装器，浏览目录一键装进 Claude Code/Cursor/Codex/Gemini/OpenCode 等 20+ 工具）
- scripts：convert.sh（生成各工具格式）+ install.sh（--tool X --division Y --agent Z 交互选择）
- 手动复制（cp engineering/*.md ~/.claude/agents/）

---

## picode 融合映射（供 run-lead 决策）

| # | agency-agents 资产 | picode 现状 | 融合建议 |
|---|---|---|---|
| A1 | 人格深度（Identity&Memory/Core Mission/Critical Rules/成功指标） | .picode/agents/*.md 角色模板较薄（17 §6 多维人设已有基础） | 人设模板增强：加 Mission/Critical Rules/Success Metrics 节；文档小组按新模板重写种子人设 |
| A2 | divisions.json 单源 + CI 四方一致校验 | roles/rooms 在 config.yaml（validateConfig 有命名律） | agent 目录 ↔ 注册表一致性校验（新增校验或 lint 脚本） |
| A3 | frontmatter lint（lint-agents.sh） | people-qa 的 REQUIRED_PERSONA_DIMENSIONS | 人设 lint 进 CI/检查脚本（persona 维度机械校验已有基础，补 frontmatter 完整性） |
| A4 | 每 agent 自带成功指标 | hr-score 文件事实评分（16 §9） | 人设文件声明 success_metrics，评分时对照（轻量） |
| A5 | 多工具分发（convert.sh 20+ 工具） | pi-extension + mcp-server 两形态 | picode 角色导出脚本（.picode/agents → 可复制格式）低优先 |
| A6 | vibe/emoji 人格层 | 无 | 人设 frontmatter 增可选 vibe（低优先） |
