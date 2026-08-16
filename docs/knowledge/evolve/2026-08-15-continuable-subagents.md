<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T03-00-00-SUBAGENT · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->
<!-- 状态：定稿（W3 docs 收尾完成）。决策编号已领取并落地：D109-D112（reserve + DECISIONS + --land 完成）；decision-lint 0 error。push 由 run-lead 在合并门批准后执行（本 chunk 按约束不 push）。 -->
<!-- 2026-08-15 精简（批 2）：与 DECISIONS 详条/decision-catalog 重复的分块表、实施纪要、验证数字已压缩为引用（见 DECISIONS D###）；保留剩余风险/教训/后续候选/审计验证引用。 -->

# Evolve run-2026-08-15T03-00-00-SUBAGENT（E18 纪要 · 定稿 · 去重版）

- goal: 可续子代理实现（蓝图 D107 下轮输入落地）——I2+I3 durable 会话 + resume + 深度围栏 / I4 写集只收窄 + I5 所有权围栏 / I6 settled 机械通知 + I1 投喂分级
- kind: self_evolve · scale: M（3 波次：W1 单组 → W2 双组并行（≤3）→ W3 docs 收尾；D036 串行 merge）
- baseline: main = 911ea0c（562/562 绿）→ 终态 **284d858（604 pass + 2 skipped，0 fail）**
- status: **完成**（W1 dd311f6 / W2a d28130a / W2b 284d858 全部 merged 且门禁通过；W3 docs 收尾完成；`git push origin main` 由 run-lead 在合并门批准后执行，本 chunk 按约束不 push）
- 决策编号: **D109-D112**（本 run 领取落地，--reserve → 表行+详条 → --land 闭环；D104-D108 属上轮 run-2026-08-15T02-30-00-DSH 已落地，不占用）

## 分块与合并序列（D036 串行 merge · 每 chunk 提交/merge/测试详见 DECISIONS D109-D112 详条）

W1 chunk-durable-session（更漏队：传灯/秉烛/验漏，I2+I3）→ W2a chunk-fence-owner（城垣队：司阍/谯楼/界碑，
I4+I5）∥ W2b chunk-settle-feed（驿道队：传驿/衔辔/烽燧，I6+I1）并行 → W3 chunk-docs（本文档）。波序：
W1 → W2（峰值并行 2 ≤ 3 ✓）→ W3。依赖图无环；写集两两互斥（共享文件仅 spec-17 / errors.ts，均 owner 声明）。

## 实施纪要（各决策详情见 DECISIONS 详条与 catalog §24）

### I2 durable 会话 + resume + I3 深度围栏（W1 · 更漏 · D109）

- I2 **sleep 保留/归档替代 DELETE**（`pi_session_id` 保留作平台持久会话引用、文件真相指针；terminate 仍
  DELETE）；wake **resume 优先**（isAlive 探测 → 同会话 sendReady 续写，404/失联回退重 spawn + 摘要）。
- I3 `SessionRecord` 增 `delegation_depth`/`parent_session`（旧格式缺省 0/平台席）；`wakeAgent` 统一校验
  深度 > 3 → `SUBAGENT_DEPTH_EXCEEDED`（errors.ts 本轮唯一新增错误码）。
- 越写集修复走 **co-003** 变更单（D057 旧 sleep-DELETE 断言冲突，授权最小写集扩展，276f379）。
- 详见 DECISIONS D109。

### I4 写集只收窄 + I5 所有权围栏（W2a · 城垣 · D110）

- I4 子代理有效写集 = 父 task write_paths ∩ 子声明（只收窄不放宽，父缺失 fail-loud，子宽于父结构化拒绝）。
- I5 post 校验序 = type → members ACL → **owner 围栏**（目标为子代理会话房且发送者非其 `parent_session`
  → `ROOM_POST_DENIED`）；发送侧问人禁令（子代理仅可向其父可发言的房间发言）；复用错误码不新增。
- 详见 DECISIONS D110。

### I6 settled 机械通知 + I1 投喂分级（W2b · 驿道 · D111）

- I6 guardian 纯派生检测子代理终态 → 复用 `cell_done` bus 词汇机械投递父房（幂等，不新增 SESSION_EVENTS）。
- I1 投喂三档 followup（现状）/ steer（增量引导）/ inject（状态通知不唤醒不计数）；**KI-6 防双逻辑**：
  投喂计数/预算/门闩收敛 continuation.ts 内，不新建模块。
- 详见 DECISIONS D111。

## 验证（W3 终态）

- 官方 `npm test`（HOME 隔离）：**604 pass + 2 skipped，0 fail**（core 160 / bus 19 / orchestrator 357 /
  pi-extension 36 / mcp-server 18 / dashboard-server 14 pass + 2 skip 基线既有）；每 merge 点全量回归绿
  （591 → 600 → 604）；`npm run check` 三 lint 全绿（decision-lint **0 error**）。
- 决策编号闭环：`--reserve`（109-112，count 4）→ 表行+详条 → `--land`；watermark next_number 109 → 113。
- 各 chunk evidence（sdet 独立取证，log_ref 见各 task handoff/evidence.yaml）：W1 591 测、W2a 600 pass
  + 2 skip、W2b 604 pass + 2 skip。

## 审计验证引用（真实性评级高 + 修正项）

- 跨轮知识：`docs/knowledge/feedback/sponsor-feedback-and-process-audit-2026-08-15.md`
  （commit e99f1fa，下一轮流程优化 run 强制输入）+ 独立验证报告
  `.picode/plans/audit-verification-report.md`（commit 5278a73 按验证报告修正落地）
- **真实性评级：高**——9 项验证清单 **7 成立 / 2 部分成立 / 0 不成立**；数据事实（团队规模
  12 队 36 人设 / 评分 95×4+90 / 打回 4 例 / 变更单 co-001/002/003 applied / 交接包六件套）
  与 run 历史档案逐条吻合，无数据造假或捏造；A 级简化试点事实底座全部实证
- **修正项（已落地）**：①代提交次数 ≥5 → **≥3**（commit message 实证口径：run2 C1 2f8ceba /
  C3 2e50375 / C2 d3bb0c2；W1 为 engineer 正常提交 59a515d 无代提交——本 run 三 chunk 均正常
  提交，实证口径印证）；②squad-lead 价值补充 C1 B1 根因分析（co-001 决策依据）；③交接包重复
  细化为「summary 重复高、artifact_index 重复低」；④重复汇报来源标注为会话实录（仓库不可复核）
- 本 run 关联实证：W1 **co-003** 变更单（D057 sleep 断言越写集，变更单模式第三次复证有效）；
  sdet 诚实打回（验漏 BLK-1 首轮 1 fail 检出）——证据门禁价值延续实证

## 剩余风险（W3 终态）

- **serve 侧会话累积 GC**（D109 遗留观察）：sleep 不再 DELETE → serve 侧会话累积（本机
  opencode.db 已 10,836 会话）；归档/清理（`PATCH archived` 或定期 GC）列后续轮候选，非本轮验收
- **D2 偏差记录**（D044 修订标注）：D044「session sleep 调 DELETE」部分失效（sleep 保留/
  terminate 仍 DELETE），已在 DECISIONS D044 行加 I2 修订标注（两义齐全）；spec-17 §5.2
  durable 语义为权威正文
- **流程简化试点排下轮**（D112 决策候选）：A 级简化（三人组 → 双人组 / 人设程序化生成 /
  交接包精简 2 件 / 重复汇报治理）排下一轮流程优化 run 试点，本轮不实施；试点验收口径
  「省 30-40% 轮次消耗」建议改为可测基线（如轮次内进展日志条数/交接包字段数/人设字节数对比），
  否则试点结论无法数据化复判（验证报告 §3.4 建议）
- **push 未执行（本 chunk）**：按约束 W3 不 push；`git push origin main` 由 run-lead 在合并门
  批准（approvals/merge.yaml，R9）后执行

## 后续候选

1. **流程简化 A 级试点**（D112 / 审计 §6）：双人组（engineer + sdet）+ 程序化人设 + 交接包 2 件 +
   重复汇报治理；验收口径改可测基线；数据驱动决策是否全量推广
2. **serve 会话累积归档/GC**（D109 遗留）：`PATCH archived` 或定期 GC 策略，独立立项
3. **N=3 深度上限可配置化**（D109 遗留）：`MAX_SUBAGENT_DEPTH` 常量 → 可配键（衔接 D106
   配置旋钮最小化，需评估后立 config 键）
4. **I7 cancel 保留队列**（蓝图 §6 未实现项）：防强制解散丢请求（M 成本，survey #5 风险 🟡）
5. **inject 转录副作用缓解**（D111 遗留观察）：inject 转录用独立 type 或下轮增强（本轮不动转录
   schema，D002 转录是机械记录）
