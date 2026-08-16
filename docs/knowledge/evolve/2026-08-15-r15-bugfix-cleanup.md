<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T01-12-43-3NZ · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->
<!-- 状态：定稿（C6 收尾完成）。决策编号已领取并落地：D099-D103（reserve + DECISIONS + --land 完成）；decision-lint 0 error。 -->
<!-- 已合并至 plans/2026-08-15-r15-bugfix-cleanup.md（2026-08-15 精简 · 批 2）：决策 D099-D103 / 分块表 / 验证数字以 plans 为主干，本纪要的剩余风险/后续候选已并入 plans 合并节；细节见 git 历史。 -->
<!-- 2026-08-15 精简（批 2）：与 DECISIONS 详条/decision-catalog 重复的决策内容表、分块表、验证数字已压缩为引用（见 DECISIONS D###）；保留剩余风险/教训/后续候选。 -->

# Evolve run-2026-08-15T01-12-43-3NZ（E16 纪要 · 定稿 · 去重版）

- goal: 修复 deepMerge DEFAULTS 污染（Bug A）+ E7/E2 排除语义误拒（Bug B）+ ponytail-audit 清理
- kind: self_evolve · scale: L（run-lead 自主决策，sponsor 确认「全部按 plan (e) 排期执行」）
- baseline: main = cda6e13（clean）
- status: **完成**（C1-C5 全部 merged；全量 502/502 全绿；C6 docs 收尾完成；`git push origin main` 完成）
- 决策编号: **D099-D103**（本 run 领取落地；D095/D096 为暂停 run 已落地、D097/D098 预留未落地，本轮不占用）

## Intent

承接 run-16 规划 (e) 段下一轮排期（ponytail-audit 转达：死导出×3 / 薄壳×3 / yagni / 夹具单源）
+ 本轮审计新发现（run-lead 实证 2026-08-15）：**Bug A**（deepMerge DEFAULTS 共享引用污染，生产级）
与 **Bug B**（E2/E7 多层并集 carve-out 误拒，双处同病）。本轮六 chunk 分块：C1 config-singleton、
C2 evolve-glob-fix、C3 dead-export-cleanup（G1 三并行）→ C4 shell-file-merge（G2）→ C5
test-fixtures-unify（G3 串行）→ C6 docs（G4 收尾）。

## 决策要点（定稿 · 编号 D099-D103 · 详情见 DECISIONS 详条）

- **D099 Bug A deepMerge 深拷贝**（C1 task-config-singleton · d229eea + co-001 夹具 188b057 → merge 2df7486）：
  `deepMerge(DEFAULTS,{})` 浅拷贝致 `config.opencode` 与 DEFAULTS 共享引用，改加载后 config 污染全局单例
  → 同进程后续 loadConfig 读到被篡改值 → guardianTick 用例顺序依赖失败（303/304 失败 1；不隔离 HOME 15+ 失败）。
  修复：`cloneValue` 递归深拷贝全分支，合并结果与 DEFAULTS/overlay 完全独立。详见 DECISIONS D099。
- **D100 Bug B E2/E7 按层分组判定**（C2 task-evolve-glob-fix · 492e2ac → merge 362718a）：
  `layers=[knowledge,docs]` 时 docs 层 carve-out `!docs/knowledge/**` 被扁平并集误拒 knowledge 层 include，
  evolve.ts 与 staffing.ts **双处同病**。修复：core 共享判定 `isEvolveWritePathAllowed` 按层分组，
  carve-out 只否决所属层；docs 单层仍拒（回归保护）。详见 DECISIONS D100。
- **D101 yagni 死配置清理**（C1 · D055 局部解除）：5 删（sess_mgr.enabled / allow_orch_force_wake /
  self_evolve.enabled / require_sponsor_merge / knowledge_log_glob）1 留（idle_sleep_sec 有真实读取点）。
  详见 DECISIONS D101。
- **D102 ponytail 清理**（C1/C3/C4/C5）：死导出 ×3 / 薄壳 ×3 / 24 处夹具单源，行为零变化。
  详见 DECISIONS D102 与 catalog §21/§22。
- **D103 环境教训：工作房 node_modules 断链治理**：worktree 内 node_modules 指向不存在目录 → 落主仓陈旧
  dist；治理流程（自链 + tsbuildinfo 清理 + HOME 隔离）沉淀为 run 标准操作。详见 DECISIONS D103 与 catalog §22。
- **co-001 变更单**（run-lead 授权，非决策编号）：授权 C1 最小写集扩展——checkpoint-auto 用例（
  self-drive.test.ts:815-846）行级夹具修复（该用例基线「绿」依赖 Bug A 污染的静默 wake 失败，C1 修复后
  暴露）。落地 188b057（仅 1 文件 +13 行）。

## 基线失败记录（C6 终态处置 · 详见 DECISIONS D099/D100 详条与 plan 归档）

| # | 失败 | 性质 | 终态处置 |
|---|---|---|---|
| 1 | orchestrator `guardianTick`（self-drive.test.ts:279-300） | 顺序污染 flake，**根因 = Bug A DEFAULTS 污染** | C1 修复 + co-001 后 **304/304 转绿**；C1 合并后全量复核 502/502 ✅ |
| 2 | mcp-server `session_wake_direct`（management.test.ts:110） | **flaky**（根因未定，C5 终验未再复现） | 留后续候选 #1 独立立项分诊 |
| 3 | **watermark 基线红**（decision-lint 4 errors + 3 warnings） | 坏 merge 4b3d71c 回退水位 | C6 修复（land 439Z + 台账恢复 + next_number=99），终态 0 error 0 warning ✅ |

## 验证（各 chunk evidence 详见各 task handoff/evidence.yaml · C6 终态）

- 官方 `npm test`（HOME 隔离）全量 **502/502 全绿**（core 125 / bus 19 / orch 307 / pi 17 / mcp 18 / dash 16）；
  `npm run check` 三 lint 全绿（decision-lint 0 error 0 warning）；C1/C2/C3/C4/C5 各合并点证据见
  `docs/knowledge/evolve/../handoffs/` 与 DECISIONS 详条验证行。
- 关键对照：C2 官方 506/507（唯一失败=guardianTick 基线 flake，stash 对照 303/304 同失败）；C5 终验 502/502
  含 mcp 18/18（session_wake_direct 未复现）。

## 剩余风险（C6 终态）

- **session_wake_direct 分诊待**：flaky、根因未定（疑 mcp 管理工具契约/环境面）；C5 终验 502/502
  未复现，仍列后续候选 #1，独立立项分诊。
- **docs 历史引用债**：spec 17/19 yaml 示例仍含已删键字样（sess_mgr.enabled / allow_orch_force_wake /
  require_sponsor_merge / knowledge_log_glob，非运行时引用）；`scripts/mcp/self-evolve.mjs:244` 及
  docs 历史文本对已删符号的字符串提及不改（失真风险，run-lead 裁决是否全仓字符串级清零）。
- **D097/D098 悬空预留**：暂停 run（run-2026-08-14T11-14-26-837Z）D097 缓项 / D098 本轮 non_goal
  预留未落地；台账以 `reserved` 保留归属（不占用、不释放），后续若立项须走 D089 领号流程重新确认。
- **工作房环境**：node_modules 断链问题治理流程已沉淀（D103 + catalog §22）；后续 run 统一布局
  模板仍未机械化（建议 run-lead 按 D103 落地标准操作）。

## 后续候选

1. **session_wake_direct 分诊**：mcp-server `management.test.ts:110` flaky 根因定位（契约/环境面），
   与 C1-C5 无交集，独立立项。
2. **D097 立项评估**：feed 映射文档化 / 摘要语义化 / docs 引用债清理（暂停 run 缓项），按 D089 流程领号。
3. **D098 立项评估**：merge 后自动 push 机制化（sponsor 及时推送，本轮仍双保险人工 push），按 D089 流程领号。
4. **工作房布局模板机械落地**：D103 标准操作固化（自链脚本 / tsbuildinfo 清理 / HOME 隔离），
   减少复建环境的重复手工步骤。
5. **checkpoint-auto 夹具语义备忘**：该用例依赖「task 有新鲜 progress.json」避免 progress_due 旁路
   唤醒——后续改 self-drive.test 夹具时保持该前置，防止再踩「踩 bug 上绿」类假绿。
