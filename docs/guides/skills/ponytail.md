# Skill: ponytail（lazy senior dev）

来源：github.com/dietrichgebert/ponytail（MIT，实测 LOC -54%/cost -20%/time -27%/安全 100%）。

## What it does

把「见过一切的老工程师」的简洁纪律装进编码任务：先质疑是否需要存在（YAGNI）、先找代码库/stdlib/平台原生/已装依赖、一行优先、才写最小代码；bug 修根因不修症状；`ponytail:` 注释标记简化边界。

## When to reach for it

任何编码/重构/修复/审查/选型任务；用户说「lazy/简化/最小/yagni/do less」。

## Common questions

- 与现有审查门关系？ponytail-review 是审查维度补充（死代码/重复/过度设计），非替代 E4/T06 门闩
- 会破坏纪律吗？ladder 在理解问题之后执行（"shortens the solution, never the reading"）

## It's working if

产出 diff 明显小于裸 prompt 基线；安全守卫（输入校验/错误处理/安全措施）原样保留。
