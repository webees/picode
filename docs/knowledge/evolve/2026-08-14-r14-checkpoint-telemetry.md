<!-- 精简批2（2026-08-15）：E 纪要已摘要化——教训/风险去向见 evolve/E1-E15-SUMMARY.md 对应行，细节见 git 历史。 -->
# Evolve run-2026-08-14T11-14-26-837Z

- goal: checkpoint 观测三面同源 + 自动捕获默认开启
- kind: self_evolve · status: 已完成（C1/C2 合并入 main = 3235578）

## Intent
承接 E14 后续候选：checkpoint 观测进 status 三面（status/CLI/MCP 同源）；自动捕获默认开启评估。

## 决策要点（D095–D096）
- D095 checkpoint 观测三面同源：StatusSnapshot 增 checkpoint 段（task_id/latest_at/boundary/sha256）；CLI/MCP 同源
- D096 自动捕获默认开启：checkpoints.enabled 默认 true（guardian_tick + pre_merge）

## 验证
- C1（4903f63）：status 快照 checkpoint 段 + CLI/MCP 同源断言
- C2（2c0d718）：enabled 默认 true + 显式关闭语义
- 全量测试全绿（C1/C2 E4 gate 通过）

## 剩余风险/后续
- E7 校验语义 bug（!docs/knowledge/** 误拒 knowledge 层写入）待修
- merge 后自动 push 机制化（sponsor 要求）待落地
- 吞吐提升（并行三角 3 / turns 2 / 分块放宽）待落地
