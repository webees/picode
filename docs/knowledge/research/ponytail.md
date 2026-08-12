# dietrichgebert/ponytail 研究（源码级 · 2026-08-13）

> clone github.com/dietrichgebert/ponytail（深度 1）。本机 ~/.zcode/skills/ponytail* 即此仓库安装。

## 1. 定位与实测

- lazy senior dev 纪律 skill："He says nothing. He writes one line. It works."
- 实测基准（真实 agent 编辑真实仓库，git diff 评分，n=4）：**LOC -54%（最高 -94%）、tokens -22%、cost -20%、time -27%、安全 100%**（唯一全维度下降且全安全的 arm）
- 三档强度：lite / full（默认）/ ultra

## 2. 核心纪律（ladder）

1. 需要存在吗？（YAGNI）
2. 代码库里已有？（复用）
3. stdlib 有？（用它）
4. 平台原生？（`<input type="date">` > 组件库）
5. 已装依赖能解？（不加新依赖）
6. 能一行吗？
7. 才写最小代码
- bug fix = 根因不是症状（共享函数一处守卫 < 每个调用方补丁）
- `ponytail:` 注释标记简化边界与升级路径（如 `# ponytail: global lock, per-account locks if throughput matters`）

## 3. 仓库结构

- skills/：6 个 SKILL.md（ponytail / -audit / -debt / -gain / -help / -review）
- **pi-extension/**：Pi 扩展（index.js）——与 picode 同生态
- **ponytail-mcp/**：MCP 服务器（index.js + instructions.js）
- commands/*.toml：各 skill 安装清单
- hooks/：claude-codex / copilot hooks + ponytail-activate.js（激活逻辑）
- benchmarks/：可复现基准（git diff 评分方法）

## 4. picode 应用映射（供 run-lead 决策）

| # | ponytail 资产 | picode 应用点 | 建议 |
|---|---|---|---|
| PT1 | ponytail SKILL.md | **C4 刚激活的 skills 体系** | 作为第一个真实种子技能装进 skills/engineering/，索引登记（docs cell 已建骨架） |
| PT2 | ladder/根因/最小 diff 纪律 | 三角/平台角色提示词（.picode/agents/*.md） | 文档小组在提示词注入纪律要点（用户蓝图：文档小组持续优化提示词） |
| PT3 | ponytail-review/audit | picode 审查门（code-review + docs/reviews/） | 审查 Checklist 增「死代码/重复/过度设计」维度（可加 skill 或并入现有审查） |
| PT4 | ponytail-mcp + pi-extension | picode mcp-server + pi-extension | 对照实现（commands toml = 安装清单；activate 逻辑） |
| PT5 | benchmarks 方法 | E6 知识层 | 技能效果度量（git diff 评分法） |
