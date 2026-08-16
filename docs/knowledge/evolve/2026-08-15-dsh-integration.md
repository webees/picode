<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T02-30-00-DSH · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->
<!-- 状态：定稿（C5 docs 收尾完成）。决策编号已领取并落地：D104-D108（reserve + DECISIONS + --land 完成）；decision-lint 0 error。push 由 run-lead 在合并门后执行（本 chunk 按约束不 push）。 -->
<!-- 2026-08-15 精简（批 2）：与 DECISIONS 详条/decision-catalog 重复的分块表、实施纪要、验证数字已压缩为引用（见 DECISIONS D###）；保留剩余风险/教训/后续候选。 -->

# Evolve run-2026-08-15T02-30-00-DSH（E17 纪要 · 定稿 · 去重版）

- goal: A goal 跨轮跟踪（revision CAS + 回合预算 + activation/resume/disarm + blocked 政策码）+ B 按需 skill 加载（loadSkill + skill_load 工具 + 双轨明界）+ E 沙箱三态 + 一次性升级审批 + read-before-edit + C continuable 子代理蓝图（本轮只存档）
- kind: self_evolve · scale: M（分块并行 + D036 串行 merge）
- baseline: main = 6b9610b（502/502）→ 终态 **83df029（562/562 全绿）**
- status: **完成**（C1-C4 全部 merged；C5 docs 收尾完成；全量 562/562；`git push origin main` 由 run-lead 在合并门后执行 + sponsor 及时推送——D098 未实现前双保险，本 chunk 按约束不 push）
- 决策编号: **D104-D108**（本 run 领取落地，--reserve → 表行+详条 → --land 闭环；上轮 run-2026-08-15T01-12-43-3NZ 的 D099-D103 已落地；D095-D098 属更早 run/暂停 run，不占用）

## 分块与合并序列（D036 串行 merge · 每 chunk 提交/merge/测试详见 DECISIONS D104-D108 详条）

C1 goal-crossrun（周晷，D104）→ C3 sandbox-approval（锁钥，D106）→ C4 continuable-blueprint（经纬，D107）
→ C2 skill-load（运斤，D105）→ C5 docs-closeout（本文档）。波序：C1/C3 并行 → C4 → C2（depends_on C3）
→ C5。**关键教训：C2 实现会话（庖丁）中途 failed，run-lead 接管提交（d3bb0c2）——见剩余风险。**

## 实施纪要（各决策详情见 DECISIONS 详条与 catalog §23）

### A goal 跨轮跟踪（C1 · 周晷 · D104）

- goal.yaml 增量字段：`revision`（CAS 围栏）/ `activation`（armed|disarmed，唯一 arm 入口 = `goal resume`）/
  `rounds_started`/`max_goal_rounds`（回合预算）/ `blocked_reason` 政策码；guardian 投喂 vs goal resume 明界
  写入 spec 17 §5.4；旧格式向后兼容。详见 DECISIONS D104。
- 同步锁取舍：`withSyncFileLock` 镜像 withFileLock（mcp-server/self-drive 同步调用面不可改 async）；
  CLI 无 `--expected` 乐观锁参数为观察项（K1，D104 记录）。

### B skill_load 双轨（C2 · 运斤 · D105）

- core `loadSkill` + pi-extension `skill_load <name>` 工具；persona `skills[]` 声明（系统提示常驻 metadata）
  vs 按需加载完整 body **双轨并存不重复注入**（明界写入 skill-harness.md §5）。详见 DECISIONS D105。
- 越写集处置：工具计数断言过期 → run-lead 经 **co-002** 变更单授权最小写集扩展（衔接 D108 教训）。

### E 沙箱三态 + 升级审批 + read-before-edit（C3 · 锁钥 · D106）

- 沙箱 mode（read-only / workspace-write / danger-full-access）叠加于 write_paths 静态白名单之上；
  越界写 → 结构化拒绝 → `sandbox_permissions`+`justification` 成对申请一次性升级 → run-lead 代批 →
  allowed-once 单次放行（E5 全链路实测 exit 0，详见 D106 详条验证行）；read-before-edit 守卫默认开。
  三处开关全走会话 env，零 config 键。详见 DECISIONS D106 与 catalog §23.3/23.4/23.5。

### C continuable 子代理蓝图（C4 · 经纬 · D107）

- 本轮只存档 `docs/plans/continuable-subagents-blueprint.md`（下轮实现输入）。取舍：采用方案 A
  （转录+摘要+续跑投喂增强）拒绝方案 B（事件溯源恢复，守 D002/D082）；Pi 持久化可行性 = 支持（部分
  接口限制，阻塞在 picode 侧 sleep/terminate 走 DELETE）。下轮输入 I1-I7；**I1 须与 D104 guardian 续跑
  合并防双逻辑**（KI-6，continuation.ts 内收敛）。详见 DECISIONS D107 与蓝图。

## 验证（C5 终态）

- 官方全量 `npm test`（HOME 隔离）：**562/562 exit 0**（core 155 / bus 19 / orchestrator 318 /
  pi-extension 36 / mcp-server 18 / dashboard-server 16）；`npm run check` 三 lint 全绿
  （decision-lint **0 error 0 warning**）。各 chunk evidence 详见 task handoff/evidence.yaml。
- 决策编号闭环：`--reserve`（104-108）→ 表行+详条 → `--land` 完成；watermark next_number 104 → 109。
- 上轮遗留消解：D103 治理流程本轮 C3 复证（node_modules 断链再复现、重建自链有效）。

## 剩余风险（C5 终态）

- **session_wake_direct 分诊遗留**（E16 候选 #1 延续）：mcp-server management.test.ts:110 flaky、根因未定；本轮全量 562/562 含 mcp-server 18/18 全绿未复现，仍列后续候选独立立项
- **node_modules 环境治理建议**：D103 流程本轮 C3 再次复证有效（known_issues §3 同源问题）；建议 run-lead 将工作房布局模板机械化（自链脚本 / tsbuildinfo 清理 / HOME 隔离），减少复建环境重复手工步骤
- **庖丁会话 failed 的流程教训**：C2 实现会话（庖丁）中途 failed，run-lead 接管提交（d3bb0c2 注明「run-lead 接管提交，庖丁会话 failed」）；C1/C3 亦由 run-lead 代提交（队内会话延迟）——多 chunk 并行时实现会话可用性风险集中，建议下轮评估会话保活/重试策略或分块时预留接管路径
- **registry.test.ts 标题措辞**（C2 遗留观察）：mcp-server/src/registry.test.ts 标题仍为「carries the 20 spec-09 tools」（co-002 scope_limit 保持 20 成员语义、仅成员断言无计数）——措辞性不影响正确性，后续可顺手更名（不在本 chunk 写集）
- **push 未执行（本 chunk）**：按约束 C5 不 push；`git push origin main` 由 run-lead 在全部代码 chunk 合并 + 门禁通过后执行，sponsor 及时推送（D098 未实现前双保险）
- **D097/D098 悬空预留**（E16 延续）：暂停 run 预留未落地；台账以 `reserved` 保留归属（不占用、不释放），后续立项走 D089 领号流程

## 后续候选

1. **session_wake_direct 分诊**（E16 候选 #1 延续）：mcp-server management.test.ts:110 flaky 根因定位，独立立项
2. **工作房布局模板机械落地**：D103 标准操作固化（自链脚本 / tsbuildinfo 清理 / HOME 隔离），减少复建环境重复手工
3. **C 蓝图实现立项**（D107 下轮输入）：I1-I7 逐一过决策编号 + 双门闩；I1 与 D104 guardian 续跑在 continuation.ts 内收敛合并
4. **D098 merge 后自动 push 机制化**（本轮仍双保险人工 push）
5. **会话接管路径机制化**（庖丁 failed 教训）：run-lead 接管提交模式（C1/C2/C3 均出现）沉淀为流程预案
