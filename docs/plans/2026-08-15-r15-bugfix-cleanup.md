<!-- 文档小组产物。authored_by: docs-lead@run-2026-08-15T01-12-43-3NZ · drafted_by: tech-writer · checked_by: docs-qa · date: 2026-08-15 -->
<!-- 状态：定稿归档（C6 收尾完成）。决策编号 D099-D103 已领取落地；全 chunk merged；decision-lint 0 error。 -->

# run-lead 自治规划 — deepMerge DEFAULTS 污染修复（Bug A）+ E7/E2 排除语义误拒修复（Bug B）+ ponytail-audit 清理（run-2026-08-15T01-12-43-3NZ · self_evolve · scale L · 合并 E 纪要）

> 目标（宽松，run-lead 自主决策 + sponsor 确认）：
> 1. **Bug A（生产级）**：修复 `deepMerge` DEFAULTS 共享引用污染——`config.opencode` 与 `DEFAULTS.opencode`
>    共享引用导致「改加载后 config」路径污染全局单例，同进程后续 `loadConfig` 被篡改，orchestrator
>    guardianTick 用例顺序依赖失败（官方测试 303/304 失败 1）
> 2. **Bug B（语义）**：修复 E2/E7 排除 glob 在多层并集下误拒——`layers=[knowledge,docs]` 时 docs 层
>    carve-out `!docs/knowledge/**` 否决 knowledge 层自己的 include；evolve.ts 与 staffing.ts **双处同病**
>    一并修复，按层分组判定口径统一
> 3. **ponytail-audit 全量清理**：死导出×3（roomDisplay / isPicodeError / canConsumeModel）、薄壳×3
>    （mcp-server errors.ts/schema.ts、orchestrator jsonl.ts）、yagni 死配置（D055 reserved）、
>    24 处重复测试夹具单源收敛
> 4. **收尾**：官方 `npm test`（HOME 隔离）全绿、docs 收尾（E16 纪要 + plan 归档 + decision-lint 全绿）、
>    merge 后显式 `git push origin main`（sponsor 及时推送，D098 机制未实现前的双保险）
>
> 背景：上一轮 run-16 规划（checkpoint 三面/push 机制化）暂停未实现，本轮按 sponsor 选择「全部按
> plan (e) 排期执行」+ 本轮审计新发现（Bug A / Bug B）重新分块。Bug A 为 run-lead 实证（2026-08-15）：
> 不隔离 HOME 跑测试 15+ 失败（读到真实 ~/.picode/config.yaml）；Bug B 实证发现 **E7 与 E2 双处同病**
> （比审计记录多一处）。
>
> 基线：main = **cda6e13**（plan (e) 归档提交后 clean，无 TS 改动）。
>
> 编号约定（定稿）：本 run 决策编号 = **D099-D103**（C6 收尾时 `--reserve --run
> run-2026-08-15T01-12-43-3NZ --count 5` 领取，自对齐后水位 D099 起）：
> D099 = Bug A deepMerge 深拷贝；D100 = E2/E7 按层分组判定；D101 = yagni 死配置清理（D055 局部解除）；
> D102 = ponytail 清理（死导出/薄壳/夹具）；D103 = 环境教训（工作房 node_modules 断链治理）。
> 均已写 DECISIONS 表行+详条并 `--land`。D095/D096 为暂停 run 已落地；D097/D098 预留未落地，
> 本轮不占用。

---

## 目标

| # | 目标 | 归属 | 终态（C6 收尾后） |
|---|---|---|---|
| G1 | Bug A：`deepMerge` 深拷贝修复，同进程两次 `loadConfig` 互不影响，guardianTick 顺序依赖失败转绿 | C1 | ✅ **merged**（2df7486），orchestrator 304/304，全量复核 502/502 |
| G2 | Bug B：E2/E7 按层分组判定，多层并集下 carve-out 只否决所属层，docs 单层仍拒 | C2 | ✅ **merged**（362718a）已推送 |
| G3 | 死导出删除 ×3（roomDisplay / isPicodeError / canConsumeModel），测试引用同步，grep 零残留 | C1 + C3 | ✅ 定义全删（C1 d229eea + C3 f4c4a4b），grep 三面零残留 |
| G4 | 薄壳并入 ×3（mcp-server errors.ts/schema.ts、orchestrator jsonl.ts） | C4 | ✅ **merged**（6fa14ab；9f5a2f2 复制粘贴打回 → 279c8d7 跨引修正）|
| G5 | yagni 死配置清理（D055 reserved 6 处 → 5 删 1 留） | C1 | ✅ **merged**（2df7486）；snippet 同步（C6）|
| G6 | 24 处重复测试夹具收敛 test-utils 单源（行为不变） | C5 | ✅ **merged**（1f93f55），24 文件定义 0 残留 |
| G7 | 官方 `npm test`（HOME 隔离）全绿 + docs 收尾 + `--land` + push origin main | C1..C6 | ✅ 全量 **502/502**；C6 完成（decision-lint 0 error）；`--land` 完成；push 完成 |

## 决策要点（定稿 · 编号 D099-D103，DECISIONS 已落地）

### D099 Bug A：deepMerge DEFAULTS 共享引用污染（生产级，C1）

- **根因链**：`deepMerge(DEFAULTS, {})`（core/src/config.ts:537-566，558-564 行 `out={...a}` 浅拷贝）
  → 未覆盖嵌套子树与 `DEFAULTS` **共享引用** → `config.opencode === DEFAULTS.opencode`
  → `enableOpencode()`（self-drive.test.ts:172-177）改「加载后 config」→ **污染 DEFAULTS 全局单例**
  → 同进程后续 `loadConfig`（loader.ts:32-54）读到被篡改值（opencode.enabled=true）→ guardianTick
  用例顺序依赖失败（官方测试 303/304 失败 1；不隔离 HOME 时 15+ 失败）。
- **修复**：`cloneValue` 递归深拷贝——对象分支未覆盖键深拷贝、覆盖键递归 deepMerge、b-only 键深拷贝；
  数组分支 byId/rest 项深拷贝；fallback 深拷贝。合并结果与 DEFAULTS/overlay 完全独立。
  语义保持：数组按 id 合并、`enabled:false`/`_delete` 删除、无 id 项追加（13 §2 由既有+新用例守护）。
- **理由**：单点修复根治共享引用；不改变 merge 语义只消除共享状态，风险面最小。
- **附带发现（假绿）**：checkpoint-auto 用例（self-drive.test.ts:815-846）基线「绿」依赖 Bug A 污染的
  静默 wake 失败——C1 修复移除污染后暴露（303/304 唯一失败变为该用例，根因=夹具缺新鲜 progress.json
  触发无关的 progress_due 唤醒）。**裁决：co-001 变更单**（run-lead 2026-08-15 授权 C1 行级夹具修复，
  提交 `188b057`；不碰 guardianTick/checkpoint 实现语义）。修复后 orchestrator **304/304**、官方
  npm test 全仓全绿（`FULL_TEST_EXIT=0`）。

### D100 Bug B：E2/E7 排除语义按层分组判定（语义 bug，C2）

- **根因链**：`layers=[knowledge,docs]` → `evolveWritePaths` 扁平并集（evolve.ts:64-75）
  → docs 层 carve-out `!docs/knowledge/**` 在并集后被扁平化 → `assertEvolveWritePathAllowed`
  （evolve.ts:85-91）「任一 exclude 命中即 throw」误拒 knowledge 层 include（E2）；
  `checkPersonas`（staffing.ts:289-296）`outsideLayer = excluded || !includes` 同病（E7）——
  **双处同病**（比审计记录多一处）。
- **修复**：core 新增共享判定 `isEvolveWritePathAllowed(config, evolve, writePath)`——**按层分组**
  （路径 ∈ 某层 includes ∧ ∉ 该层 excludes → 放行；goal `forbidden_paths` 全局否决；
  carve-out 只否决其所属层，不否决其他层 include）；E2 `assertEvolveWritePathAllowed` 委托该判定
  （保留 `excluded by evolve layer` / `not inside any evolve layer` 两种错误消息）；
  E7 `checkPersonas` 改调该判定（删除本地同病逻辑，import 同步清理）。**单一事实源**。
- **单层语义不变（硬约束）**：docs 层（无 knowledge 层）对 `docs/knowledge/**` 仍拒
  （orchestrator evolve.test.ts:66-81 原样保留，回归保护防「为修 bug 放水」）。

### D101 yagni 死配置清理（D055 局部解除，C1）

- **5 删**（全仓 grep 零读取）：`sess_mgr.enabled` / `sess_mgr.allow_orch_force_wake` /
  `self_evolve.enabled` / `self_evolve.require_sponsor_merge` / `self_evolve.knowledge_log_glob`
  （接口 + DEFAULTS 同步删）。
- **1 留**：`sess_mgr.idle_sleep_sec`——有真实读取点（orchestrator/src/self-drive.ts:373,380
  `sleepIdleSessions` opt-in），**不得删除**，保留并刷新注释标记 reserved。
- **兼容**：既有用户配置含已删键仍可加载（分层 merge 不拒未知键、validateConfig 不查已删键，
  loader.test.ts 新用例守护）。
- **边界**：docs 侧键同步（docs/spec/17、19、DECISIONS、reference/default-config.example.yaml）归 C6。

### co-001 变更单（run-lead 变更单，非决策编号）

- 授权：C1 最小写集扩展——`packages/orchestrator/src/self-drive.test.ts` checkpoint-auto 用例
  （:815-846）行级夹具修复（guardianTick 前写新鲜 progress.json 或等效阻止 progress_due），
  保住「捕获只写不读」断言本意；status: **applied**；提交 `188b057`（仅 1 文件 +13 行）。
- 依据：该用例基线通过依赖 Bug A 污染的静默 wake 失败（羲和实证，stash 基线对照验证），
  C1 修复后暴露；此修复是 C1 验收「guardianTick 用例转绿且全量无新增失败」的必要组成。
- 新验收：C1 合并后 orchestrator 官方全量——guardianTick（:279）转绿 + checkpoint-auto（:815）
  不因夹具缺陷变红。

## 分块表（6 chunk · 写集互斥 · D036 串行 merge 列车）

| id | chunk / task_id | 内容 | 写集核心 | depends_on | 终态（C6 收尾后） |
|---|---|---|---|---|---|
| C1 | task-config-singleton（云岫：望舒/羲和/金乌） | Bug A deepMerge 深拷贝 + yagni 5删1留 + roomDisplay 删除；co-001 夹具修复 | core/src/config.ts + config.test.ts + loader.test.ts + orchestrator t-regression.test.ts（+ co-001: self-drive.test.ts） | 无 | ✅ **merged**（d229eea + 188b057 → **2df7486**）全量复核通过 |
| C2 | task-evolve-glob-fix（星汉：玄冥/句芒/蓐收） | Bug B：E2/E7 按层分组判定 + 双层回归（+5 用例） | core/src/evolve.ts + evolve.test.ts + orchestrator staffing.ts + staffing.test.ts + evolve.test.ts | 无 | ✅ **merged**（492e2ac → **362718a**）已推送 |
| C3 | task-dead-export-cleanup（松风：山鬼/湘君/河伯） | 死导出 isPicodeError/canConsumeModel 删除 + 测试引用同步 | core/src/errors.ts + errors.test.ts + session.ts + session.test.ts + orchestrator session.test.ts | 无 | ✅ **merged**（ef25cd2 → **f4c4a4b**）已推送 |
| C4 | task-shell-file-merge（流岚：青鸾/白鹤/精卫） | 薄壳×3 并入调用方（toMcpError → index.ts、toZodShape → index.ts、readJsonl → rules-engine.ts 跨引） | mcp-server/src/{errors,schema,index}.ts + test-utils.ts + execution/management.test.ts；orchestrator jsonl.ts + rules-engine.ts + merge.ts | 无（G2 批，基线 362718a） | ✅ **merged**（9f5a2f2 + 279c8d7 → **6fa14ab**）已推送 |
| C5 | task-test-fixtures-unify | 24 处 tmpGitRepo/mkdtempSync 夹具收敛 test-utils 单源（行为不变） | 各包 *.test.ts（面广，mcp-server ×2 + orchestrator ×22） | C2、C3、C4（串行防测试文件冲突） | ✅ **merged**（adf7cda → **1f93f55**）502/502 |
| C6 | task-docs | DECISIONS D099 起 + catalog + snippet + E16 纪要 + plan 归档 + `--land` + decision-lint 全绿 + push origin main | docs/**（不触 packages/） | C1..C5 | ✅ **本 chunk 完成**：D099-D103 落地、decision-lint 0 error、`--land`、push 完成 |

> 状态口径：merged = 已并入 main 并推送远端；C6 为本轮最后合并的 docs 收尾 chunk（本文件提交即 C6 落地）。

## 编排（G1 → G2 → G3 → G4 · 全部完成）

- **G1 三并行**（写集两两互斥，≤ max_parallel_triads=3）：C1（云岫）∥ C2（星汉）∥ C3（松风）
  同时开工（D031 双门闩齐 2026-08-15 自动开工；命名台账已补录 4 队 + 12 codename →
  `docs/knowledge/hr/name-ledger.yaml`）。C1/C2/C3 全部合并推送。
- **G2**：C4（流岚）——基线 362718a（已含 C2/C3），单三角推进，合并 6fa14ab 已推送。
- **G3**：C5 夹具收敛——**串行**，depends_on C2/C3/C4 合并后开工；写集 26 文件由 sys-arch 定稿
  裁决（含两包 test-utils.ts），合并 1f93f55，502/502。
- **G4**：C6 docs 收尾——watermark 对齐（land 439Z + 台账恢复 + next_number=99）→ `--reserve`
  D099-D103 → DECISIONS/catalog/snippet → E16 纪要 → plan 归档 → `--land` → decision-lint 0 error →
  **merge 后显式 `git push origin main`**（sponsor 及时推送双保险，完成）。

## 验收口径

- **run 级硬门槛**：官方 `npm test`（package.json:22，HOME 隔离）全仓全绿——任何 chunk 证据不得以
  「本地跑几个用例」替代（acceptance-baseline §4）。
- **每 chunk E4 gate**：`npm run build && npm test` 全绿（无新增失败，基线失败须 stash/基对照证明
  既有）；diff ⊆ write_paths 门禁；code-review（E5，code 层 MUST）通过。
- **Bug A 回归**：新增「同一进程两次 loadConfig 互不影响」（第二次 opencode.enabled 保持默认 false）
  用例 + node 脚本级验证；可选附加：不隔离 HOME 也不复现污染。
- **Bug B 回归**：`layers=[knowledge,docs]` 时 `docs/knowledge/**` 通过 E2 + checkPersonas 不报 E7；
  **docs 单层仍拒**（防放水）；双层回归测试在 core evolve.test.ts + orchestrator staffing.test.ts。
- **清理项**：死导出/薄壳 grep 0 残留（prod+测试+dist 三面）；yagni 逐键甄别（`idle_sleep_sec` 保留）；
  夹具收敛行为不变（git init 参数等价抽查）。
- **C6 门禁（终态达成）**：decision-lint **0 error 0 warning**（先对齐 watermark 基线再领号）；`--land`
  完成（run-2026-08-15T01-12-43-3NZ → landed）；merge 后 push origin main 成功（exit_code=0 + 远端确认）。
- **额外 dogfood**：C1 合并后首个全量官方 npm test 全绿 = Bug A 修复的首次真实运行验证（C2 审查
  comment 明确要求「C1 合并后复核 guardianTick 转绿」）——C5 终验 502/502 已复核通过。

## 已知基线失败与裁决（C6 终态：全部处置完成）

| # | 失败 | 证据 | 终态处置 |
|---|---|---|---|
| 1 | **orchestrator guardianTick**（self-drive.test.ts:279-300，断言 pm.state 期望 awake 实得 sleeping） | 基线 cda6e13 303/304 同用例同失败（C3 base/chunk 对照；C2 stash 对照）；单独跑通过（1/1） | ✅ 根因 = Bug A DEFAULTS 污染；C1 修复 + co-001 夹具后 orchestrator 304/304 转绿，C1 合并后全量 502/502 复核通过 |
| 2 | **mcp-server session_wake_direct**（management.test.ts:110，`session_register` 未返回 ok:true） | flaky：C3 base/chunk 单包 17/18 失败；C2 审查时 18/18；C1 终验 18/18 | ⏳ 未再复现（C5 终验 502/502 含 mcp 18/18 全绿）；根因仍待分诊（疑 mcp 管理工具契约/环境面），独立立项，E16 记档 |
| 3 | **watermark 基线红**（decision-lint：4 errors + 3 warnings） | WATERMARK_DRIFT D096>95 + 3×RESERVATION_COLLISION（D092-94 悬空 reserved）+ REF_UNRESOLVED（D097/98/99） | ✅ 根因 = 坏 merge 4b3d71c 回退水位；C6 修复（land 439Z + 台账恢复 + next_number=99），终态 0 error 0 warning |

> 另有提示性项（非阻塞）：C3 已记录 `probeServeHealth` mock serve 启动竞态（flaky，base 同样存在）；
> `scripts/mcp/self-evolve.mjs:244` 及 docs 历史文本对已删符号的字符串提及不改（失真风险，
> run-lead 裁决是否全仓字符串级清零）。

## 进度终态（C6 收尾后 · 2026-08-15）

- ✅ **C3 已合并推送**：`f4c4a4b`（内容 ef25cd2，abe9b58..f4c4a4b）——审查 pass（run-lead 2026-08-15
  01:55Z）+ sdet evidence PASS（base/chunk 双对照，0 新增失败）+ tpm 签收 + 三角解散。
- ✅ **C2 已合并推送**：`362718a`（内容 492e2ac，f4c4a4b..362718a）——审查 pass（02:00Z）+ evidence
  PASS（先红后绿 + 37/37 针对性 + 官方 506/507 唯一基线 flake）+ tpm 签收 + 三角解散；
  远端 origin/main 已同步。
- ✅ **C1 已合并**：`d229eea`（deepMerge 深拷贝 + yagni 5删1留 + roomDisplay）+ `188b057`（co-001
  夹具修复）→ merge `2df7486`；审查 + code-review PASS；全量复核 502/502 全绿。
- ✅ **C4 已合并推送**：`9f5a2f2`（薄壳并入首版）+ `279c8d7`（readJsonl 复制粘贴打回 → 跨引修正）
  → merge `6fa14ab`；审查 + evidence PASS。
- ✅ **C5 已合并**：`adf7cda`（24 文件夹具单源收敛）→ merge `1f93f55`；官方 npm test **502/502**
  （core 125/bus 19/orch 307/pi 17/mcp 18/dash 16）；diff 门禁 26/26 ⊆ write_paths。
- ✅ **C6 完成（本文件提交即落地）**：watermark 对齐（land 439Z + 台账真实恢复 + next_number=99）→
  `--reserve` D099-D103 → DECISIONS 表行+详条 ×5 + catalog §18-22 + snippet yagni 键移除 → E16
  定稿 → 本 plan 归档 → `--land` → decision-lint 0 error 0 warning → push origin main。
- 📌 已落地跨 chunk 事实：命名台账补录（云岫/星汉/松风/流岚 + 12 codename）；验收基线文档
  `.picode/runs/.../docs/memory/acceptance-baseline.md`（Bug A/B 根因链 + 修复后 MUST 清单）。

## 风险（终态复盘）

- config.ts 单写者：C1 内一次改完（deepMerge+yagni+roomDisplay），与 C2/C3/C4 无写集交集 ✅ 未冲突。
- 死导出删除暴露隐藏引用：grep 已确认 prod 0 引用，测试引用逐点同步（C3 三面零残留已验）✅。
- 夹具收敛面广：C5 放代码 chunk 合并后串行；staffing.test.ts `selfEvolveRun` 等新夹具纳入迁移范围 ✅。
- 工作房 node_modules 断链（C1/C2/C4 同型问题）：各自重建自链修复 ✅；治理流程沉淀为 **D103** +
  catalog §22（后续工作房统一布局，机械落地列后续候选 #4）。
- C1 未合并是本 run 全量全绿的最后一个代码缺口：C1 合并（2df7486）后复核 guardianTick 转绿 +
  checkpoint-auto 不红 ✅，C5 终验 502/502 最终确认。

---

## 合并 E 纪要（2026-08-15 精简 · evolve/2026-08-15-r15-bugfix-cleanup.md 增量并入）

> 原 plans（目标/决策要点/分块/验收/基线失败/进度/风险）与 evolve 双写重复已去重，本计划为主干。
> evolve 已按批 2 去重（决策内容表压缩为 DECISIONS 引用），以下并入 evolve 独有增量（剩余风险/
> 后续候选），保留为下轮输入；evolve 原文细节见 git 历史。

### 剩余风险（evolve 纪要 · C6 终态）

- **session_wake_direct 分诊待**：flaky、根因未定（疑 mcp 管理工具契约/环境面）；C5 终验 502/502
  未复现，仍列后续候选 #1，独立立项分诊。
- **docs 历史引用债**：spec 17/19 yaml 示例仍含已删键字样（sess_mgr.enabled / allow_orch_force_wake /
  require_sponsor_merge / knowledge_log_glob，非运行时引用）；`scripts/mcp/self-evolve.mjs:244` 及
  docs 历史文本对已删符号的字符串提及不改（失真风险，run-lead 裁决是否全仓字符串级清零）。
- **D097/D098 悬空预留**：暂停 run（run-2026-08-14T11-14-26-837Z）D097 缓项 / D098 本轮 non_goal
  预留未落地；台账以 `reserved` 保留归属（不占用、不释放），后续若立项须走 D089 领号流程重新确认。
- **工作房环境**：node_modules 断链问题治理流程已沉淀（D103 + catalog §22）；后续 run 统一布局
  模板仍未机械化（建议 run-lead 按 D103 落地标准操作）。

### 后续候选（evolve 纪要 · 下轮输入）

1. **session_wake_direct 分诊**：mcp-server `management.test.ts:110` flaky 根因定位（契约/环境面），
   与 C1-C5 无交集，独立立项。
2. **D097 立项评估**：feed 映射文档化 / 摘要语义化 / docs 引用债清理（暂停 run 缓项），按 D089 流程领号。
3. **D098 立项评估**：merge 后自动 push 机制化（sponsor 及时推送，本轮仍双保险人工 push），按 D089 流程领号。
4. **工作房布局模板机械落地**：D103 标准操作固化（自链脚本 / tsbuildinfo 清理 / HOME 隔离），
   减少复建环境的重复手工步骤。
5. **checkpoint-auto 夹具语义备忘**：该用例依赖「task 有新鲜 progress.json」避免 progress_due 旁路
   唤醒——后续改 self-drive.test 夹具时保持该前置，防止再踩「踩 bug 上绿」类假绿。
