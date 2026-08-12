# 提交信息规范（picode 标准 · C5）

> 权威正文（提交信息唯一规范）。所有 `git_commit` 与此文档为准；sponsor/审查者按此评审。

## 格式

```
<type>(<scope>): <中文摘要>

<body：为什么改（根因/动机/影响），≤10 行>

<footer：Reviewed-by: <审查者>（审查门通过时必填）>
```

## type 表

|type|含义|
|----|----|
|feat|新功能/机制|
|fix|缺陷修复（附根因）|
|refactor|行为不变的重构|
|docs|文档/知识|
|test|测试新增/修正|
|chore|构建/工具/杂项|
|perf|性能|
|build|构建/依赖|

## 规则

1. 摘要 ≤72 字符，中文动词开头（如「删除」「修复」「收敛」）
2. **一个提交一件事**；混合改动拆分提交
3. scope 用受影响域：core / bus / orchestrator / pi-extension / mcp-server / scripts / docs / knowledge
4. body 说明「为什么」而非「做了什么」；引用决策号（D0xx/ERR-xx/T0x）便于追溯
5. Reviewed-by footer 仅在审查门通过后添加（提交信息不可后续补盖）
6. 构建产物（dist/）不入提交（.gitignore 已护）
