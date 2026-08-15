<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T01-12-43-3NZ · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->
<!-- 状态：定稿（C6 收尾完成）。决策编号已领取并落地：D099-D103（reserve + DECISIONS + --land 完成）；decision-lint 0 error。 -->

# Evolve run-2026-08-15T01-12-43-3NZ（E16 纪要 · 定稿）

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

## 决策要点（定稿 · 编号 D099-D103，DECISIONS 已落地）

### D099 Bug A：deepMerge 深拷贝修复（C1 task-config-singleton · 提交 d229eea）

**根因链**（run-lead 实证 + 羲和复现，红→绿留痕）：

```
deepMerge(DEFAULTS, {})                # core/src/config.ts:537-566；558-564 out={...a} 浅拷贝
  → config.opencode 与 DEFAULTS.opencode 共享引用   # 未覆盖嵌套子树不深拷贝
  → enableOpencode(config)             # self-drive.test.ts:172-177 改 config.opencode.enabled=true
  → 污染 DEFAULTS.opencode.enabled     # 全局单例被篡改
  → 同进程后续 loadConfig              # loader.ts:32-54，每次 setupRun 走 resolveRunDir → loadConfig
  → 读到被污染 opencode.enabled=true   # 测试顺序依赖失败
```

- 实测基线：orchestrator 官方测试（HOME 隔离）**303/304 失败 1**（guardianTick 顺序污染，单独跑通过）；
  不隔离 HOME **15+ 失败**（读到真实 ~/.picode/config.yaml）；两次 loadConfig 第二次被污染为 true。
- 修复：`cloneValue` 递归深拷贝——对象分支（未覆盖键深拷贝 / 覆盖键递归 / b-only 键深拷贝）、
  数组分支（byId 副本项与无 id rest 项均深拷贝）、fallback `b===undefined` 深拷贝；合并结果对
  DEFAULTS/overlay 两侧完全独立。语义保持：数组按 id 合并、`enabled:false`/`_delete` 删除、无 id 项追加
  （config.test.ts「13 §2」用例守护）。
- 附带发现（假绿→暴露）：checkpoint-auto 用例（self-drive.test.ts:815-846）基线「绿」依赖 Bug A
  污染的静默 wake 失败——修复后暴露（该用例 task 无 progress.json → `sweepProgress` 判 staleSec=∞
  → `progress_due` 正常唤醒 squad-lead，与 checkpoint 捕获无关）。**裁决 = co-001 变更单**（见下）。

### D100 Bug B：E2/E7 按层分组判定（C2 task-evolve-glob-fix · 提交 492e2ac → merge 362718a）

**根因链**（双处同病，比审计记录多一处）：

```
layers=[knowledge,docs]
  → evolveWritePaths 扁平并集             # core/src/evolve.ts:64-75
       knowledge 层 include: docs/knowledge/**
       docs 层 carve-out:  !docs/knowledge/**
  → assertEvolveWritePathAllowed 排除优先  # evolve.ts:85-91 任一 exclude 命中即 throw → E2 误拒
  → checkPersonas 同病                     # orchestrator/src/staffing.ts:289-296
       outsideLayer = excluded || !includes → E7 误报
```

- 修复语义：**按层分组判定**——路径 ∈ 某层 includes ∧ ∉ 该层 excludes → 放行；goal `forbidden_paths`
  全局否决；carve-out 只否决其所属层，不否决其他层 include。单层语义完全不变。
- 实现：core 新增共享判定 `isEvolveWritePathAllowed`（单一事实源）；E2 `assertEvolveWritePathAllowed`
  委托该判定（保留两种错误消息 token：`excluded by evolve layer` / `not inside any evolve layer`）；
  E7 `checkPersonas` 删除本地同病逻辑改调该判定（import 同步清理，noUnusedLocals 门禁过）。
  `evolveWritePaths`/`splitEvolveGlobs`/`evolveLayerGlobs`/`effectiveLayers` 形态未改（mcp-server/
  commands 显示侧消费方不受影响）。
- 回归：+5 用例（core evolve.test.ts ×4：双层放行/单层 docs 仍拒/forbidden 全局否决+非层内仍拒/
  并集形态契约；orchestrator evolve.test.ts ×1：多层放行 + docs 单层对照，**:66-81 原样保留；
  staffing.test.ts ×2：E7 双层放行零问题/单层仍 3 席全报）。先红后绿留痕（`E2: ... excluded by
  evolve layer (!docs/knowledge/**)` / `E7: write_paths outside evolve layers` 复现 → 修复后全绿）。

### D101 yagni 死配置清理（C1 · D055 局部解除）

- **5 删**（逐键全仓 grep 零读取，接口+DEFAULTS 同步）：`sess_mgr.enabled`、`sess_mgr.allow_orch_force_wake`、
  `self_evolve.enabled`、`self_evolve.require_sponsor_merge`、`self_evolve.knowledge_log_glob`。
- **1 留**：`sess_mgr.idle_sleep_sec`——真实读取点 `orchestrator/src/self-drive.ts:373,380`
  （`sleepIdleSessions` opt-in），仅刷新注释标记 reserved，**不得删除**。
- 兼容：既有用户配置含已删键仍可加载（分层 merge 不拒未知键、validateConfig 不查已删键，
  loader.test.ts 新用例守护）。docs 侧键同步归 C6。

### co-001 变更单（run-lead 授权，非决策编号）

- `id: co-001` / `from: run-lead` / `status: applied` / `affects: [chunk-config-singleton]` /
  `decision_at: 2026-08-15T02:02:28Z`。
- 决定：授权 C1 最小写集扩展——self-drive.test.ts checkpoint-auto 用例（:815-846）行级夹具修复
  （guardianTick 前为 task 写新鲜 progress.json 或等效阻止 progress_due），保住「捕获只写不读」断言
  本意。scope_limit：仅该用例行级夹具；不得改动 guardianTick/checkpoint 实现语义；不碰状态机/
  checkpoint 只读边界。
- 依据：该用例基线通过依赖 Bug A 污染的静默 wake 失败（羲和实证，stash 基线对照）；
  C1 修复后暴露；此修复是 C1 验收「guardianTick 转绿且全量无新增失败」的必要组成。
- 落地：提交 `188b057`（仅 self-drive.test.ts 1 文件 +13 行）→ orchestrator 304/304、官方 npm test
  全仓全绿（`FULL_TEST_EXIT=0`）。

## ponytail 清理完成度（终态 2026-08-15 · C6 收尾后）

| 项 | 状态 | 说明 |
|---|---|---|
| 死导出 ×3（roomDisplay / isPicodeError / canConsumeModel） | **done** | isPicodeError/canConsumeModel 已合并（C3 = f4c4a4b，grep 三面零残留）；roomDisplay 定义+测试引用清理随 C1（d229eea → merge 2df7486）|
| 薄壳 ×3（mcp-server errors.ts/schema.ts、orchestrator jsonl.ts） | **done** | C4 流岚：toMcpError/toZodShape → mcp-server index.ts；readJsonl → rules-engine 单宿主导出 + merge.ts 跨引（9f5a2f2 复制粘贴被复核打回 → 279c8d7 修正）；测试 helper 进 test-utils；merge 6fa14ab |
| yagni 死配置（D055 reserved 6 处） | **done** | 5 删 1 留（idle_sleep_sec 保留，D101），随 C1 合并；docs 摘录 default-config.example.yaml 已同步（C6）|
| 夹具单源 ×24（mcp-server ×2 + orchestrator ×22） | **done** | C5 归一：两包 test-utils 共享 `gitInit`（branch 选项）+ `tmpGitRepo` 包装，24 文件本地定义归零（A 类 5 直换 / B 类 15 / C 类 2 特殊步骤 / D 类 2 branch:null 逐字保留）；merge 1f93f55；官方 npm test 502/502（core 125/bus 19/orch 307/pi 17/mcp 18/dash 16）|

## 基线失败记录（C6 终态处置）

| # | 失败 | 性质 | 终态处置 |
|---|---|---|---|
| 1 | orchestrator `guardianTick`（self-drive.test.ts:279-300） | 顺序污染 flake，**根因 = Bug A DEFAULTS 污染** | C1 修复 + co-001 后 **304/304 转绿**；C1 合并（2df7486）后全量复核 502/502 通过 ✅ |
| 2 | mcp-server `session_wake_direct`（management.test.ts:110，`session_register` 未返回 ok:true） | **flaky**（C3 base/chunk 17/18 失败；C2 审查 18/18；C1 终验 18/18） | **未再复现**（C5 终验 502/502 含 mcp 18/18 全绿）；根因仍未分诊，留后续候选 #1 |
| 3 | **watermark 基线红**（decision-lint 4 errors + 3 warnings） | 坏 merge 4b3d71c 回退水位（next_number 99→95、439Z 悬空 reserved、暂停 run 预留被删） | C6 修复：`--land 439Z` + 台账真实恢复（95-96 landed / 97-98 reserved）+ next_number=99；**终态 decision-lint 0 error 0 warning** ✅ |

## 验证（各 chunk 证据，HOME 隔离 · C6 终态）

- **C3**（ef25cd2 → merge f4c4a4b）：官方 npm test 短路链逐包补齐——core 117/117、bus 19/19、
  orchestrator 303/304（唯一失败=guardianTick 基线）、pi-extension 17/17、dashboard-server 16/16、
  mcp-server 17/18（唯一失败=session_wake_direct 基线）；base cda6e13 同环境同用例同失败对照；
  反向 grep 三面（packages src+test / dist / 全仓 .d.ts）0 残留；clean rebuild 0 error；
  活跃符号守护（evolveRisk/opencodeSessionIdOf/errorCodeOf 等可 import，被删符号不在导出面）。
- **C2**（492e2ac → merge 362718a）：build 0 error；针对性回归 37/37；官方 npm test 506/507
  （唯一失败=guardianTick 基线 flake，stash 对照 303/304 同失败，单独跑 1/1 通过）；orchestrator
  306/307 vs 基线 303/304（+3 新用例全过）；diff 门禁 5/5 ⊆ write_paths。
- **C1**（d229eea + 188b057 → merge 2df7486）：core 122/122、bus 19/19、orchestrator 304/304、
  pi-extension 17/17、mcp-server 18/18、dashboard-server 16/16，官方 `npm test` `FULL_TEST_EXIT=0`；
  两次 loadConfig 互不影响（用例 + node 脚本级）；yagni 残留键配置可加载。
- **C4**（9f5a2f2 + 279c8d7 → merge 6fa14ab）：readJsonl 跨引（rules-engine 单宿主导出 + merge.ts
  跨引）复核通过；toMcpError/toZodShape 并入 index.ts；测试侧走 test-utils 共享 helper
  （禁止 import ./index.js——顶层 `await server.connect(StdioServerTransport)`）；build+test 全绿。
- **C5**（adf7cda → merge 1f93f55）：24 文件本地 `tmpGitRepo` 定义 0 残留；共享 test-utils 单源；
  官方 npm test **502/502 全绿**（core 125/bus 19/orch 307/pi 17/mcp 18/dash 16）；diff 门禁
  26/26 ⊆ write_paths；行为等价抽查逐字一致。
- **C6 终态复核**：官方 `npm test` 全量 exit_code=0（C6 无 packages 改动，复核确认）；decision-lint
  **0 error 0 warning**（111 文件）；`npm run check` 三 lint 全绿。

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
