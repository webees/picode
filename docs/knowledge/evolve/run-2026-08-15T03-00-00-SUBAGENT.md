<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T03-00-00-SUBAGENT · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->
<!-- 状态：定稿（W3 docs 收尾完成）。决策编号已领取并落地：D109-D112（reserve + DECISIONS + --land 完成）；decision-lint 0 error。push 由 run-lead 在合并门批准后执行（本 chunk 按约束不 push）。 -->

# Evolve run-2026-08-15T03-00-00-SUBAGENT（E18 纪要 · 定稿）

- goal: 可续子代理实现（蓝图 D107 下轮输入落地）——I2+I3 durable 会话 + resume + 深度围栏 / I4 写集只收窄 + I5 所有权围栏 / I6 settled 机械通知 + I1 投喂分级
- kind: self_evolve · scale: M（3 波次：W1 单组 → W2 双组并行（≤3）→ W3 docs 收尾；D036 串行 merge）
- baseline: main = 911ea0c（562/562 绿）→ 终态 **284d858（604 pass + 2 skipped，0 fail）**
- status: **完成**（W1 dd311f6 / W2a d28130a / W2b 284d858 全部 merged 且门禁通过；W3 docs 收尾完成；`git push origin main` 由 run-lead 在合并门批准后执行，本 chunk 按约束不 push）
- 决策编号: **D109-D112**（本 run 领取落地，--reserve → 表行+详条 → --land 闭环；D104-D108 属上轮 run-2026-08-15T02-30-00-DSH 已落地，不占用）

## 分块与合并序列（D036 串行 merge · sysarch §2 定稿 4 chunk）

| chunk | 主题 | 提交 | merge | 测试 |
|---|---|---|---|---|
| W1 chunk-durable-session（更漏队：传灯/秉烛/验漏） | I2 durable 会话 + resume + I3 深度围栏 | 59a515d + 276f379（co-003 修复） | dd311f6 | 591 测 0 fail |
| W2a chunk-fence-owner（城垣队：司阍/谯楼/界碑） | I4 写集只收窄 + I5 所有权围栏 | 9399a48 | d28130a | 600 pass + 2 skip |
| W2b chunk-settle-feed（驿道队：传驿/衔辔/烽燧） | I6 settled 机械通知 + I1 投喂分级 | 1852340 | 284d858 | 604 pass + 2 skip |
| W3 chunk-docs（本文档） | D109-D112 落档 + D044 修订标注 + catalog §24 + E18 纪要 + --land | 本提交 | — | decision-lint 0 error |

> 波序：W1（1 组）→ W2（fence-owner ∥ settle-feed 并行，峰值并行 2 ≤ 3 ✓）→ W3（docs 收尾，
> 依赖全部代码 chunk）。依赖图无环：`chunk-durable-session` → `chunk-fence-owner` +
> `chunk-settle-feed` → `chunk-docs`（sysarch §2@73）。写集两两互斥；共享文件仅 spec-17 /
> errors.ts，均 owner 声明（durable-session；fence-owner/settle-feed 只读引用，errors.ts
> 仅 D109 新增 SUBAGENT_DEPTH_EXCEEDED 一个错误码，I5 复用 ROOM_POST_DENIED）。

## 实施纪要（I2/I3/I4/I5/I6/I1）

### I2 durable 会话 + resume（W1 · 更漏 · 决策 D109）

- **sleep 保留/归档替代 DELETE**：`pi-adapter.sleepAgent` opencode 分支不再 DELETE 会话；
  `session-store.sleep` 保留 `pi_session_id`（`oc-<id>` 作平台持久会话引用、文件真相指针，
  蓝图 §2.1 分层）；仅清空失效 `pid-` 进程句柄；**terminateAgent 零改动**（DELETE 终态销毁不变）
- **wake resume 优先**：`wakeWithOpencode` 增 resume 分支——`isAlive` 探测（现成）→ 同会话
  `sendReady` 续写（零新 POST /session）；404/失联/竞态 → 回退重 spawn + 转录摘要；零新增平台原语
- mock serve 计数断言三行为（sleep 零 DELETE / wake 同会话 POST 计数 / 404 回退重 spawn）全过；
  越写集修复走 **co-003** 变更单（D057 旧 sleep-DELETE 断言冲突，授权最小写集扩展，276f379）

### I3 子代理注册 + 深度围栏（W1 · 更漏 · 决策 D109）

- `SessionRecord` 增可选 `delegation_depth`/`parent_session`（旧格式缺省 0/平台席，
  schema_version 保持 "1"）；`session-store.register` 支持 depth/parentSession 参数
- `wakeAgent`（D057 统一 spawn 入口）统一校验 `delegation_depth > MAX_SUBAGENT_DEPTH(=3)` →
  `SUBAGENT_DEPTH_EXCEEDED`（消息含当前深度与上限，不触碰后端）；errors.ts 新增**唯一**错误码
- spec-17（§4/§5.2/§6/§9）+ reference/schemas/session.yaml 按蓝图 §3 建议条文落地（owner 声明，
  fence-owner/settle-feed 实现期比对通过）

### I4 写集只收窄（W2a · 城垣 · 决策 D110）

- `readTaskYaml` 增可选 `parent_task`；`draftPersonas` 子代理有效写集 = 父 ∩ 声明（只收窄不放宽，
  父缺失 fail-loud）；`checkPersonas` 子 ⊆ 父（子宽于父 → 结构化拒绝，沿用 persona⊆task 精确子集先例）；
  无父链退化现状（顶层任务写集语义零变更）

### I5 所有权围栏（W2a · 城垣 · 决策 D110）

- post 校验序 = type → members ACL → **owner 围栏**（房间元数据 `owner_session` + roster 记录
  depth>0 ∧ parent_session 非空判定子代理会话房）；目标侧仅直接父可路由（非父 → ROOM_POST_DENIED，
  消息含 owner fence 标记）；发送侧问人禁令（子代理仅可向其父可发言的房间发言，sponsor/领导层房
  不可直达）；**复用 ROOM_POST_DENIED 不新增错误码**（errors.ts 零改动）；非子代理房间语义零变更

### I6 settled 机械通知（W2b · 驿道 · 决策 D111）

- 纯函数 `deriveSettledSubagentNotices`（depth>0 ∧ terminated ∧ parent_session，文件真相）→
  复用 `cell_done` bus 词汇投递父房（refs 指转录/会话/证据；meta.source=orchestrator 非 LLM 自报）；
  父房 bus 幂等；**不新增 SESSION_EVENTS**（core session.ts / deriveEvents 零改动，spec-10 无需注册）

### I1 投喂分级（W2b · 驿道 · 决策 D111）

- `ContinuationKind` + `FeedOptions` 三档：followup（现状续跑，默认零行为变化）/ steer（增量
  next-step 引导，摘要+引导段，extraText 通道，不重灌固定模板）/ inject（状态通知不唤醒不计数，
  仅过 in-flight 门闩）；wake 门闩沿用既有 idle/in-flight 判定
- **KI-6 防双逻辑**：投喂计数/预算/门闩全部收敛 continuation.ts 内，不新建模块
  （diff 无新文件；continuation-gate.ts / rules-engine.ts 零改动）

## 验证（W3 终态）

- 全量绿对照（以 W2b evidence 为准，HOME 隔离）：**604 pass + 2 skipped，0 fail**
  （core 160 / bus 19 / orchestrator 357 / pi-extension 36 / mcp-server 18 / dashboard-server
  14 pass + 2 skip 基线既有）；每 merge 点全量回归绿（591 → 600 → 604）
- `npm run check`：三 lint 全绿（persona-lint OK / skill-lint OK / decision-lint **0 error**）
- decision-lint 0 error：docs/** 全量扫描（DECISIONS + watermark + catalog + E18 纪要 +
  全部既有 docs 引用可解析）
- diff 门禁（W3）：4 文件 ⊆ write_paths（docs/DECISIONS.md、docs/decisions/watermark.yaml、
  docs/reference/decision-catalog.md、本纪要）——纯 docs 层，零代码零配置（chunks.yaml:103 硬验收）
- 决策编号闭环：`--reserve`（109-112，count 4）→ 表行+详条（编号对齐）→ `--land` 完成；
  watermark next_number 109 → 113
- 各 chunk evidence：W1 591 测（sdet 验漏独立复测）、W2a 600 pass + 2 skip、W2b 604 pass + 2 skip
  （sdet 烽燧独立取证，log_ref 见各 task handoff/evidence.yaml）

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
