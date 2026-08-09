# 07 — 硬化规范（索引）

硬化相关流程步骤以 **[PROCESSES.md](../PROCESSES.md)** 为准。  
本文件索引强制工程约束与分册。

## 1. 强制摘要（MUST）

| 主题 | 要求 | 详册 |
|------|------|------|
| 工具 | 默认拒绝；席位 tool_profile | [domains/tool-system.md](../domains/tool-system.md)、[09](./09-tool-profiles.md) |
| Bus | token + members；禁止直写 feed | [domains/bus-system.md](../domains/bus-system.md)、[04](./04-enforcement.md) |
| 信息 | 申请制；工程主责过滤；文档下发 | [domains/information-control.md](../domains/information-control.md)、PROCESSES P03/P08 |
| 跨房 | 工程主责批准并监督 | PROCESSES P09 |
| Git | worktree；串行 merge；脏树备份 | [domains/git-worktree.md](../domains/git-worktree.md)、P10/P14 |
| runs/ 并发 | atomic write + flock（worktree 不解决） | domains/git-worktree §4 |
| 身份 | agent_token | domains/bus-system §2 |
| 监督 | check 席默认无业务写 | 09、12 |

## 2. 配置默认

见 PROCESSES 引用的 timeouts，以及 [13-configuration.md](./13-configuration.md)、`run-root.yaml`。

## 3. 威胁模型

[12-threat-model.md](./12-threat-model.md)

## 4. 实现清单

[11-implement-playbook.md](./11-implement-playbook.md) 阶段 2–4、8。
