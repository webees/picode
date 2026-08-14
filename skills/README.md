# Skills（picode 技能体系）

> 结构：mattpocock bucket 分级（M1）；维护纪律见 docs/standards/doc-style.md §6（M5）；安装双轨见下（M6）；SKILL.md 规范见 [docs/standards/skill-spec.md](../docs/standards/skill-spec.md)；人读指南见 [docs/guides/skills/skill-harness.md](../docs/guides/skills/skill-harness.md)。

## 校验入口

`npm run check` 内含 **skill-lint**（镜像 persona-lint，数据优先不抛错）：扫描 `skills/` 下全部 `**/SKILL.md`，校验 frontmatter——`name` 必填且匹配 `SAFE_ID_RE`（小写字母/数字/连字符）且等于目录名、`description` 必填（>1024 字仅 warning）、`license`/`allowed-tools`/`compatibility`/`argument-hint`/`metadata` 白名单、未知键 warning。增/改/删技能后须过校验（零 error）再 merge。

## 安装双轨（M6）

二选一防双份：

- **托管只读**：随平台/仓库订阅更新，不可本地编辑——仅读，避免 fork 漂移。
- **可编辑副本**：复制到本机 skills 根（如 `~/.agents/skills/`）自用/hack，可改可删；改动不与上游同步，升级需手动合并。

picode 技能源码库由监督者代装；两者只取其一，禁止同时安装同技能。

## engineering（日常代码工作）

| Skill | 描述 | 调用 |
|-------|------|------|
| [ponytail](./engineering/ponytail/SKILL.md) | lazy senior dev 纪律（ladder/根因/最小 diff） | model-invoked |
| [ponytail-review](./engineering/ponytail-review/SKILL.md) | 代码审查：死代码/重复/过度设计维度 | model-invoked（审查时） |

## productivity（日常非代码流程）

（待种子）