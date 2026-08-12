# prime-agent 源码深挖（第二轮 · 2026-08-13）

> 对照 docs/research/prime-agent-deep.md（第一轮，P1-P5 已融合：serve 自动恢复/refine/转录/语义压缩/技能包）。本轮深挖实现层，找**剩余未融合特性**。

## 深挖发现

### Q1 autonomous budgets（autonomous.ts）
- `AgentAutonomousConfig`: maxContinuations / maxTurns / maxTokens / timeoutMs + **gates**（commands + maxRetries + timeoutMs）
- 状态跟踪：continuationsUsed/turnsUsed/tokensUsed/gateAttempts/lastGateFailure
- 哲学：预算内自主续跑；**quality gates 命令不过 → 停**；"达到限额 ≠ 任务成功"
- picode 现状：无预算概念（max_awake 软限流 ≠ 防失控）；LLM 会话可能失控循环（真实发生：permission ask 循环）

### Q2 auto-refine review gate（refinement.ts）
- AUTO_REFINE_REVIEW_SYSTEM_PROMPT：模型评审门决定是否 refine——"trajectory contains evidence useful"才 approve；拒绝一次性噪音/未支持假设/瞬时工具输出；JSON 输出 {shouldRefine, rationale, instructions}
- picode 现状：refine（C2'）是命令级 + 人工 --approve；无自动噪音过滤

### Q3 refinement proposal + baselineState 冲突拒绝 + rollback（refinement.ts）
- 提案生成**不突变** harness 状态；apply 前**重读** harness 文件
- baselineState：apply 时对比基线状态，**拒绝冲突编辑**（防多会话竞写）
- rollbackOf / rollbackScope / HarnessScope（session-local 默认，cross-session 才 global）
- picode 现状：E6 写入无冲突检测/回滚；knowledge/ 无版本回退

### Q4 compaction 摘要预算
- reserveTokens 16384；摘要生成预算 0.8*reserveTokens
- picode C3' 已融合 summary 字段；自动语义摘要生成未做（docs-lead 手动填）

## 融合候选（供 run-lead 决策）

| # | 特性 | picode 融合点 | 价值/成本 |
|---|---|---|---|
| Q1 | budgets | self-drive/会话运行加 turn/token/time 边界 + gate 命令（防失控循环） | 中/中 |
| Q2 | auto-refine gate | refine 自动评审（噪音过滤，LLM 调用） | 中/高（依赖 LLM） |
| Q3 | 冲突检测+回滚 | E6/knowledge 写入 baselineState 对比 + 回滚 | 高/低（纯代码） |
| Q4 | 摘要预算 | window 摘要生成预算字段 | 低/低（缓） |
