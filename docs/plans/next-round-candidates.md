# 下一轮候选（2026-08-14 监督者转达，picode 暂停前落盘）

## 转达给 run-lead 的待办（run-16 会话处理中，暂停前未落盘）

1. **push 机制化**（sponsor）：merge 后自动 push 远端，不依赖监督者
2. **吞吐提升**（sponsor）：并行三角 2→3 / turns 1→2 / 分块放宽
3. **ponytail-audit 发现**：
   - delete 死导出符号 ×4（roomDisplay/canConsumeModel/isPicodeError/NON_SESSION_ROLES）
   - shrink 24 处重复测试夹具 → 共享 test-utils
   - delete 单导出薄壳 ×3（mcp-server/errors.ts、schema.ts、orchestrator/jsonl.ts）
   - yagni D055 reserved 死配置 ×6（core/src/config.ts）
4. **E7 校验语义 bug**：`!docs/knowledge/**` 误拒 knowledge 层写入（staffing.ts checkPersonas excludes 判定）
5. **checkpoint 自动捕获价值验证**（E14 缓项）

## 已完成（本次会话累计）
- 16 轮 run 全部合并推送（远端 b915220，492 tests 全绿）
- run-16 C3 代写（D095/096 + E15）
- rebase 冲突修复（isBriefApproved/状态机测试适配/T13/NO_RUN）
