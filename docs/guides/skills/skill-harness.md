# Skill Harness 人读指南（写 / 校验 / 注入 / 激活）

面向在 picode 中编写、维护与使用技能的工程师与文档小组。规范正文见 [standards/skill-spec.md](../../standards/skill-spec.md)。

---

## 1. 一句话

技能 = 一个目录 + `SKILL.md`（frontmatter 元数据 + 正文指令）。spawn 会话时系统 prompt 只带**目录**（metadata），agent 用到才 `repo_read` 正文（instructions）与资源（resources）——渐进披露，不爆上下文。

## 2. 怎么新增一个技能

```text
skills/engineering/my-skill/SKILL.md     # frontmatter + 正文
skills/engineering/my-skill/scripts/     # 可选
```

1. 目录名 = skill 名：小写字母/数字/连字符（`my-skill` ✓，`MySkill` ✗）。
2. `SKILL.md` frontmatter 至少 `name` + `description`（格式见 skill-spec §2）。
3. 正文写「何时用 / 怎么用 / 边界」，正文里可引用 `scripts/`、`references/` 相对路径。
4. **三处同步后 merge**（doc-style §6）：docs 页 + `skills/README.md`（+ bucket README）+ 校验通过。

## 3. 怎么校验

```bash
npm run check   # persona-lint + skill-lint 双通过
```

- `skill-lint` 扫描 `skills_root`（默认 `skills/`）下全部 `**/SKILL.md`。
- error 码：frontmatter 缺失/非法、`name` 缺失/非法/≠目录名、`description` 缺失/空。
- warning 码：`description` >1024 字、未知 frontmatter 键（放行，不阻断）。
- 坏 frontmatter **不抛**——返回结构化结果，CLI 打印 `[skill-lint] ERROR/WARN: <CODE>: <file>: <msg>`。

## 4. 怎么让会话携带技能（persona 接线）

人设文件 frontmatter 增可选 `skills[]`（平台席 `.picode/agents/<role>.md`；实例人设 `staffing/personas/<seat>.md`）：

```yaml
---
name: engineer
description: Software engineer
tool_profile: implement.engineer
role_id: engineer
skills: [ponytail]          # 本席位携带的技能名
---
```

- spawn 时注入 env：`PICODE_SKILLS_INDEX`（全量技能目录）+ `PICODE_PERSONA_SKILLS`（本会话声明项路径）。
- 系统 prompt 追加「可用技能（metadata）」与「本会话声明技能」两段，**只放元数据**。
- 未知名 → index 标记 unavailable，不阻断 spawn。

## 5. agent 怎么激活（自判）

1. 读系统 prompt 的可用技能目录 → 找到匹配自己任务的 skill。
2. `repo_read` 对应 `SKILL.md` 全文（instructions 层）。
3. 按正文需要 `repo_read` `scripts/`/`references/`/`assets/`（resources 层）。

## 6. 常见问题

- **正文会污染系统 prompt / 续跑摘要吗？** 不会——SKILL.md 正文永不进 prompt（D084-4）；不进转录，D076 stripNoise 无新负担。
- **能装第三方 skill 吗？** 双轨：托管只读（随平台更新）或可编辑副本（`~/.agents/skills/`），二选一防双份（skills/README M6）。机械安装器为后续候选（D086）。
- **allowed-tools 会限制工具吗？** 不会——本轮仅解析不强制（D088 留档），ACL 仍由 tool_profile 六层决定。
