# Skills（picode 技能体系）

> 结构：mattpocock bucket 分级（M1）；维护纪律见 docs/standards/doc-style.md §6（M5）；安装双轨见下（M6）。

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
