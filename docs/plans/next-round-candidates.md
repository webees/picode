<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T01-12-43-3NZ · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->

# 下一轮候选（2026-08-14 监督者转达，picode 暂停前落盘）

> **更新（2026-08-15 · run-2026-08-15T01-12-43-3NZ 文档小组整理）**：原转达项已按本 run 排期
> （plan (e) + Bug A/B）推进，见下方各条「状态」标注与「待办跟踪」段；已完成项见文末「追加」段。

## 转达给 run-lead 的待办（run-16 会话处理中，暂停前未落盘）

1. **push 机制化**（sponsor）：merge 后自动 push 远端，不依赖监督者
   - 状态：机制本轮 **non_goal 不实现**（C6 只做 push 动作 + 纪要留档）；merge 后显式 `git push origin main` 双保险已执行（C2/C3 已推送远端）
2. **吞吐提升**（sponsor）：并行三角 2→3 / turns 1→2 / 分块放宽
   - 状态：本轮按写集互斥落地 G1 三并行（C1/C2/C3 ≤ max_parallel_triads=3），config.ts 单写者并入 C1 一次改完；turns 旋钮无对应配置（E15 已记录不采纳）
3. **ponytail-audit 发现**：
   - delete 死导出符号 ×4（roomDisplay/canConsumeModel/isPicodeError/NON_SESSION_ROLES）
     - 状态：**roomDisplay 删除 done（C1，随 d229eea 待合并）**；isPicodeError/canConsumeModel **done 已合并推送（C3 = f4c4a4b，grep 三面零残留）**；NON_SESSION_ROLES 已不在仓内
   - shrink 24 处重复测试夹具 → 共享 test-utils
     - 状态：**待（C5，串行 depends_on C2/C3/C4）**
   - delete 单导出薄壳 ×3（mcp-server/errors.ts、schema.ts、orchestrator/jsonl.ts）
     - 状态：**进行中（C4 流岚，G2 批，基线 362718a）**
   - yagni D055 reserved 死配置 ×6（core/src/config.ts）
     - 状态：**done 5删1留（C1，随 d229eea 待合并；`idle_sleep_sec` 有真实读取点 self-drive.ts:373,380，保留）**
4. **E7 校验语义 bug**：`!docs/knowledge/**` 误拒 knowledge 层写入（staffing.ts checkPersonas excludes 判定）
   - 状态：**done 已合并推送（C2 = 362718a：E2/E7 双处同病一并修复，isEvolveWritePathAllowed 按层分组判定）**
5. **checkpoint 自动捕获价值验证**（E14 缓项）
   - 状态：待评估（E15 已默认开启 `checkpoints.enabled`，D095 观测三面已落地——价值验证可续，未立项）

## 待办跟踪（run-2026-08-15 更新）

- 🔄 **薄壳并入进行中**（C4 流岚：阶段 0 勘察 + 引用图 + 环境修复 done，实施待）
- ⏳ **夹具收敛待**（C5，C2/C3/C4 合并后串行；staffing.test.ts `selfEvolveRun` 等新夹具须纳入迁移范围）
- ⏳ **session_wake_direct 分诊待**（mcp-server `management.test.ts:110` flaky，根因未定，C6 记档）
- ⏳ **watermark 对齐待**（decision-lint 基线红：WATERMARK_DRIFT D096>95 + 3×RESERVATION_COLLISION D092-94 悬空 reserved + REF_UNRESOLVED D097/98/99；C6 须先对齐水位再 D099 起 `--reserve`）
- ⏳ **C1 合并待**（deepMerge+yagni+roomDisplay = d229eea + co-001 夹具修复 188b057，实现+验收完成、官方 npm test 全绿；待 run-lead 审查合并后复核 guardianTick 转绿）

## 已完成（本次会话累计）

- 16 轮 run 全部合并推送（远端 b915220，492 tests 全绿）
- run-16 C3 代写（D095/096 + E15）
- rebase 冲突修复（isBriefApproved/状态机测试适配/T13/NO_RUN）

### 追加（run-2026-08-15T01-12-43-3NZ 已落地项，2026-08-15 文档小组整理）

- **死导出 ×3 删除**：roomDisplay（C1，随 d229eea 待合并）+ isPicodeError / canConsumeModel（C3 = f4c4a4b 已合并推送，packages src+test / dist / 全仓 .d.ts 三面 grep 零残留）
- **E7/E2 双处修复**（C2 = 362718a 已合并推送）：`isEvolveWritePathAllowed` 按层分组判定（carve-out 只否决所属层，forbidden 全局否决），+5 双层回归用例；docs 单层仍拒语义保留
- **yagni 5删1留**（C1，随 d229eea 待合并）：sess_mgr.enabled / allow_orch_force_wake / self_evolve.enabled / require_sponsor_merge / knowledge_log_glob 删除；idle_sleep_sec 保留（真实读取点）
- **deepMerge 污染修复（Bug A）**（C1，随 d229eea 待合并）：cloneValue 深拷贝，同进程两次 loadConfig 互不影响；co-001 变更单修复 checkpoint-auto 假绿（188b057）；官方 npm test 全仓全绿（`FULL_TEST_EXIT=0`）
- **命名台账补录**：云岫 / 星汉 / 松风 / 流岚 4 队 + 12 codename（docs/knowledge/hr/name-ledger.yaml）

## Sponsor 反馈候选（2026-08-15 新增 · 强制输入）

**流程简化试点（A 级）**：来源 docs/knowledge/feedback/sponsor-feedback-and-process-audit-2026-08-15.md。
- 双人组（engineer+sdet）试点；squad-lead 职责并入 run-lead + 自动化
- 人设程序化生成（模板 + chunks.yaml 注入）；双门闩合并单一简报批准
- 交接包 2 件（evidence + handoff.md）；重复汇报治理（增量报告制）
- 验收：同标准下轮次省 30-40%，事故拦截率不降；产出对比纪要

## Sponsor 方案改造候选（2026-08-15 新增 · 试点核心实验项）

**评分驱动招聘回路闭合**：来源 docs/knowledge/feedback/scoring-driven-hiring-evaluation-2026-08-15.md。
- 公式加质量维度（handoff 完整性/打回）拉开区分度 + 每条评分产出一句话画像
- 招聘强制消费：people 先读 knowledge/hr/ → 人设写画像对标段 + 低分教训入 forbidden → docs-qa 核验
- 与原 A 级简化同轮试点；验收：同 run 分数标准差 > 0、画像引用 100% 核验通过

**设计缺陷 8 项改进清单（P0-P2）**：来源 docs/knowledge/feedback/design-deficiencies-analysis-2026-08-15.md（worktree-setup/test-iso 脚本、E 纪要增量、基线三元组、接管预案、变更单自动识别、sponsor 反馈环节、流程元审计）。
**文档生命周期授权（已试点验证）**：DOC-LIFECYCLE.md 全保留判定已批；feedback 目录常驻 README 索引 + 引用链检查前置化为工程补丁。
