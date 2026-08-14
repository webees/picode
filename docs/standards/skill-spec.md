# Skill 规范（SKILL.md · Skill Harness 唯一正文）

**本文是 picode 技能承载体系（Skill Harness，D084）的 SKILL.md 规范唯一正文**：`skills/` 下每个技能目录内的 `SKILL.md` 必须按本文书写。  
**权威边界：** 配置键形状见 [13-configuration](../spec/13-configuration.md) §3（`paths.skills_root`）；技能注入/渐进披露机制见 [17-agent-runtime §7](../spec/17-agent-runtime.md)；人设 `skills[]` 维度见 [17-agent-runtime §6](../spec/17-agent-runtime.md)；人读指南见 [guides/skills/skill-harness.md](../guides/skills/skill-harness.md)。  
**来源：** agentskills spec（SKILL.md frontmatter 校验语义：name/description 必填、命名规则、description ≤1024 建议上限、license/allowed-tools 实验性；目录结构 SKILL.md+scripts+references+assets；渐进披露 metadata→instructions→resources 三层），picode 侧以 `skill-lint` 机械校验落地。

---

## 1. 目录结构

每个技能一个目录，命名 = skill 名（`SAFE_ID_RE`：小写字母/数字/连字符，首字符字母），内至少含 `SKILL.md`：

```text
skills/
└── <bucket>/<skill-name>/     # bucket = engineering | productivity（M1 分级）
    ├── SKILL.md               # 必填：frontmatter + 正文（本规范 §2/§3）
    ├── scripts/               # 可选：可执行脚本（按需由 agent 调用）
    ├── references/            # 可选：补充资料（按需读取）
    └── assets/                # 可选：静态资源
```

- **递归发现**：`discoverSkills` 按任意深度扫描 `**/SKILL.md`，`node_modules` 与点开头目录跳过。
- **bucket 索引**：顶层 `skills/README.md` 与所属 bucket 的 `README.md` 逐行登记技能（名称/描述/调用），防「会撒谎的 router」（M4，[doc-style §6](./doc-style.md)）。

---

## 2. frontmatter

`SKILL.md` 开头必须是 YAML frontmatter 块，格式与校验语义如下。

```yaml
---
name: <skill-name>
description: <一句英文摘要；建议 ≤1024 字，指导 ≤120 字>
license: MIT                    # 可选
allowed-tools: [tool_a, tool_b] # 可选（实验性）：工具白名单
compatibility: [cli, api]       # 可选
argument-hint: "[lite|full|ultra]"  # 可选
metadata:                       # 可选（YAML 映射，自由形状）
  key: value
---
```

|字段|必/选|类型|校验（skill-lint 码）|
|----|------|------|---------------------|
|`name`|必填|string|匹配 `SAFE_ID_RE`（`^[a-z][a-z0-9-]*$`）且 **等于所在目录名**（`NAME_MISSING`/`NAME_INVALID`/`NAME_MISMATCH`）|
|`description`|必填|非空 string|>1024 字仅 **warning**（`DESCRIPTION_MISSING`/`DESCRIPTION_EMPTY`/`DESCRIPTION_TOO_LONG`）|
|`license`|可选|非空 string|白名单键；形状不符 error（`FIELD_INVALID`）|
|`allowed-tools`|可选（实验性）|非空 string[]|同上（仅解析不强制，D088 留档）|
|`compatibility`|可选|非空 string[]|同上|
|`argument-hint`|可选|非空 string|同上|
|`metadata`|可选|YAML 映射|形状不符 error（`FIELD_INVALID`）|
|其它未知键|—|—|**warning**（`UNKNOWN_KEY`，防误杀存量）|

**校验工具：** `npm run check` 内 `skill-lint` 机械扫描 `skills_root` 下全部 `**/SKILL.md`（镜像 persona-lint 数据优先设计：坏 frontmatter 不抛，返回结构化 `{ok, problems, files}`）。错误码全集见 `packages/core/src/validate/skill-lint.ts` 的 `SkillLintCode`。

---

## 3. 正文与渐进披露三层

`SKILL.md` 正文 = instructions 层全文，**永不被自动灌入系统 prompt**（D084-4）。加载沿三层递进，agent 自判激活：

|层|内容|何时注入|
|----|------|---------|
|**① metadata**|`name` + `description` + 相对路径（`buildSkillIndex` 一行一项，有界截断）|spawn 启动，随系统 prompt（`PICODE_SKILLS_INDEX` / 声明项 `PICODE_PERSONA_SKILLS`）|
|**② instructions**|`SKILL.md` 正文全文（本文件）|agent 按目录路径 `repo_read` 激活时（≤1024 字 desc，正文长度由 lint 守；`repo_read` 恒放行 `**/*.md`）|
|**③ resources**|`scripts/` `references/` `assets/` 及正文引用文件|按需读取（agent 自主决定）|

**MUST：** `SKILL.md` 正文绝不进系统 prompt；正文只描述「何时用、怎么用、边界」，不承载运行时状态。
**MUST：** 正文可引用 `scripts/`/`references/`/`assets/` 相对路径，由 agent 按需 `repo_read`。
**建议：** description 控制为一句（≤120 字最佳）；instructions 控制在数千字内，避免激活后上下文负担。

---

## 4. 校验与维护纪律

1. **机械校验**：`npm run check`（persona-lint + skill-lint 双通过）；技能增/改/删 MUST 零 error。
2. **三处同步**（[doc-style §6](./doc-style.md)）：docs 页 + 顶层/bucket router 索引 + 校验，缺失不得 merge。
3. **调用边界**（M3）：frontmatter 声明调用方式（model-invoked / 参数），人设 `skills[]` 声明技能承载（见 [skill-harness.md](../guides/skills/skill-harness.md) §4）。
