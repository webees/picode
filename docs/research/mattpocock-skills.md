# mattpocock/skills 研究（源码级 · 2026-08-13）

> clone github.com/mattpocock/skills（深度 1）研读。定位：真实工程 agent skills 集合
> （"real engineering - not vibe coding"），小、可组合、模型无关。

## 1. 组织：bucket 分级

- skills/engineering/（日常代码工作）· skills/productivity/（日常非代码流程）
- skills/misc/（保留少用）· skills/in-progress/（beta 公开征求意见）· skills/deprecated/
- **promoted（engineering+productivity）必须**：顶层 README 索引 + 每 bucket README 一行描述 + docs 页面
- 非 promoted 不进索引/插件

## 2. 文档体系（人读页面）

- docs/<bucket>/<skill>.md，四节固定：**What it does / When to reach for it / Common questions / It's working if**
- 变更纪律（AGENTS.md）：新增/改名/行为变更 → 重同步 docs + 更新 router + `claude plugin validate --strict`
- SKILL.md = frontmatter（name/description）+ 正文

## 3. 调用模型：user-invoked vs model-invoked

- 显式声明：`disable-model-invocation: true`（仅人类可调）vs 模型可调
- 每种 skill 明确调用边界，防模型擅自触发高影响技能

## 4. Router skill（ask-matt）

- 映射所有 user-reachable skill 及其关系；skill 增删改 → router 必须同步（"router that lies"）

## 5. 安装双轨

- Claude Code plugin（只读托管包，订阅更新）vs skills.sh（可编辑副本，hack 自用）
- 二选一防双份

---

## picode 映射（供 run-lead 讨论）

| mattpocock | picode 现状 | 映射建议 |
|---|---|---|
| M1 bucket 分级 + 双索引 | skills_root D055 死键（C4 激活中） | skills/ 目录采用 engineering/productivity 分级 + 索引 README |
| M2 docs 四节人读页 | 无 skill 文档体系 | skills 配 docs 页（docs cell 维护） |
| M3 user/model-invoked 声明 | 无 | SKILL.md frontmatter 增 invocation 声明 |
| M4 router skill | 无 | 类似 ask-matt 的路由（如 skills/README.md 索引即 router 雏形） |
| M5 变更维护纪律 | 文档小组 TC-08 治理 | AGENTS.md 式维护规则 → picode docs/standards/ |
| M6 安装双轨 | 无 | 提示词注入 + skills.sh 式可编辑副本（监督者代装） |
