# 审查记录 — task-chunk-env-gate（E5 审查门）

- task_id: task-chunk-env-gate（chunk-env-gate, W1, 高风险：orchestrator 运行时 + core 错误码）
- run: run-2026-08-16T09-30-00-EFFICIENCY
- 工作房: `.picode/worktrees/squad-task-chunk-env-gate`
- 分支: `picode/run-2026-08-16T09-30-00-EFFICIENCY/task-chunk-env-gate`
- HEAD: `f504c69`（单提交：feat(env-gate) M2 工具探测 + M4 worktree 门闩）
- 基线: `b0be509`
- diff: `git -C <工作房> diff b0be509..HEAD`（6 文件，+460/-18）
- 审查方式: 逐文件读 + 独立实跑受影响测试（HOME 隔离，3 文件全绿）+ 真实仓库布局核验（git worktree list / worktree-setup.sh / 生产 config / 历史 run 结构）
- Reviewed-by: code-review（门禁层，E5 审查门）
- 审查日期: 2026-08-16

## 0. 结论

**needs-work（需修改）** — 1 项 P1 阻塞（M4 门闩的工作房路径约定与真实/官方布局不一致 + 唤醒时序缺口，生产 opencode 启用下门闩会对按既有约定预建的工作房**误判缺失**并阻塞正常唤醒）。P2（3 项）为非阻塞建议，P3（5 项）为次要项。打回意见见 §6。

## 1. 审查范围（write_paths 7 项）

```
packages/orchestrator/src/pi-adapter.ts      packages/orchestrator/src/pi-adapter.test.ts
packages/orchestrator/src/task.ts            packages/orchestrator/src/staffing.ts（零改动，决策留痕 diff_scope.md）
packages/orchestrator/src/staffing.test.ts   packages/core/src/errors.ts   packages/core/src/errors.test.ts
```

- **diff 门禁（R8/R9）**：实测 `git diff --name-only b0be509...HEAD` = 恰 6 文件，全部 ⊆ write_paths；`staffing.ts` 有意零改动（approveStaffing 不加硬校验，M4 落点收敛于 prepareTask + wakeAgent，diff_scope.md 已记录）——**通过**。
- **sdet evidence E1-E7**：command+exit_code+log_ref 齐备，全部真实执行；run-lead 独立复核 6 包测试绿 + 三 lint 0——采信。
- **本审查独立验证**：HOME 隔离下实跑 `errors.test.ts`（8/8）、`pi-adapter.test.ts`（22/22，含 M2×5 + M4×1 新用例）、`staffing.test.ts`（29/29，含 M4×4 新用例）——全绿、非 mock 空转（M4 用例真实 `git worktree add`/`git worktree list`，M2 用例真实 PATH 替换 + 真实 wakeAgent）。

## 2. CHECKLIST 逐项

- [x] 行为符合目标：acceptance 5 条逐条对照（§3）；边界/错误路径覆盖基本达标（M2 空 PATH/部分缺失/候选注入；M4 缺失创建/伪目录拒绝/存在放行/spawn 前拒绝）
- [ ] 输入校验在信任边界：**见 P1**（门闩路径约定与真实布局脱节）、P3-6（taskId 防御校验与 session-store SAFE_AGENT_ID_RE 不一致；经评估逃逸实际被 git refname 校验 + SessionStore 先行校验兜底，降级 P3）
- [x] 改动有测试守护：新增 10 用例真实可跑（本审查复跑全绿）；无 .only/.skip；防御分支（gitdir 内容无效/指向不存在/域外）无覆盖（P3-4）
- [x] 文档同步：known_issues.md §3 行为变更记录与最终代码一致；**handoff summary.md「删除自动创建」与最终代码矛盾**（P3-2）
- [x] 无密钥/secret 入库；diff ⊆ write_paths（§1）
- [x] 死代码：probeCoreTools.found 字段当前无消费者（契约性导出，C1 watchdog 预留，可接受）；I3 测试 task-y fixture 惰性（P3-1）
- [x] 重复：无（assertWorktreeExists 单点实现，wakeAgent/prepareTask 复用）
- [x] 过度设计：无（CORE_TOOLS 常量 + 纯函数 + 结构化 details 均有真实消费方/契约方）
- [x] 度量：diff 6 文件 +460/-18

## 3. 验收对照（chunks.yaml:41-47 → 实现核验）

| acceptance | 实现 | 核验 |
|---|---|---|
| 工具探测纯函数：PATH/候选 → bash/node/npm/git 可用性；wakeAgent spawn 前调用；缺失→spawn 中止 + session.error=TOOL_ENV_BROKEN（结构化 missing 清单） | `probeCoreTools`/`CORE_TOOLS`/`ToolProbeResult`（pi-adapter.ts:346-390）+ wakeAgent 接线（:423-430） | 纯函数成立（只读 fs.accessSync X_OK，不 spawn 无副作用）；PATH 空/多段/候选追加/优先级均有测试；**X_OK 目录假阳性见 P2-1** |
| core errors.ts 新增 TOOL_ENV_BROKEN（错误码+中文可读文案），pi-adapter 使用之；errors.test.ts 断言 | errors.ts:71-76（+WORKTREE_MISSING）、89-96（PicodeError.details 可选）、errors.test.ts 新增 2 用例 | ✓ 常量非内联；E3 渲染 `[picode] ERROR: <code>: <中文消息>` 断言过 |
| 工作房存在性门闩：staffing 批准或 task prepare 时校验 worktree 真实存在（git worktree list 语义）；缺失→拒绝 spawn + 中文可操作原因（worktree-setup.sh） | prepareTask（task.ts:256-289）+ wakeAgent 门闩（pi-adapter.ts:437-449）+ assertWorktreeExists/isUnderMainWorktrees（task.ts:186-245） | 伪目录拒绝/缺失拒绝 spawn/中文提示均实现并有测试；**P1：真实布局下误判缺失；P2-2：prepare 自动创建与验收字面不符（有意设计）** |
| 测试：探测纯函数+失败路径；门闩缺失拒绝/存在放行 | 新增 10 用例 | ✓ 真实非空转；本审查独立复跑全绿 |
| 全量 npm test 绿 + npm run check 三 lint 0 | run-lead 复核 + evidence E2/E3/E7 | ✓（core 162 / bus 25 / orch 389 / pi-ext 36 / mcp 18 / dash 31+2skip；lint persona 20/skill 2/decision 123） |

## 4. 审查重点逐项结论（对照任务书 6 项）

1. **probeCoreTools 正确性**：X_OK 判定成立但不校验 isFile——目录（含 X_OK=可遍历位）会被当作工具命中（P2-1）；PATH 解析正确（`split(path.delimiter).filter(Boolean)` 处理空 PATH/多段；extraCandidates 追加在 PATH 之后、PATH 优先，测试覆盖）；不 spawn、无副作用 ✓。
2. **wakeAgent 接线顺序**：SESSION_NOT_FOUND → I3 深度围栏 → M2 探测 → M4 门闩 → opencode/pi spawn（PI_SPAWN_FAILED 回滚逐字保留，pi-adapter.ts:287-296）。M2/M4 拒绝发生在任何会话状态变更/spawn 之前（仅 setError，状态保持 sleeping），与 PI_SPAWN_FAILED 路径分层清晰 ✓；基线 13 用例仅 I3 被适配（补 task-y fixture），其余未动 ✓；rules-engine 纯状态机路径（pi/opencode 双关）不触发 M4，语义不变 ✓（known_issues §1 契约一致）。
3. **prepareTask 方案 D 语义 vs 验收**（任务书要求判断）：验收原文「staffing 批准**或** task prepare 时校验……缺失→拒绝 spawn 并提示 run-lead」；实现 = prepare 层「存在→校验伪目录拒绝；缺失→自动创建；创建失败→WORKTREE_MISSING 中文」+ wakeAgent 层「spawn 前缺失→拒绝，不产生进程」。**判断：满足验收精神**——「缺失→拒绝 spawn 且不产生任何进程」这一安全性质由 wakeAgent（真实后端路径）完整承担并有测试证明（pi-adapter.test.ts M4 用例 + staffing.test.ts wokeErrors 用例）；prepare 自动创建是**有意设计**（progress.md 方案 D：TDD-3 曾做「缺失即拒绝」，但破坏写集外 closure/merge/t-regression fixture 的 setupPreparedTask，写集互斥约束下撤回；known_issues §3 已留痕）。**建议**：run-lead 将该决策以正式决策记录（D 编号）固化，避免后续被当作 bug 回改（P2-2）。
4. **安全性**：git worktree add 走 execFileSync 数组参数，无 shell 注入 ✓；taskId 路径逃逸：wakeAgent 路径经 SessionStore SAFE_AGENT_ID_RE 先行校验（session-store.ts:38-51），捕获组仅含安全字符 ✓；prepareTask 直收 task_id（MCP task_prepare），".." 逃逸被 git refname 校验（".." 非法 ref）兜底拒绝 → WORKTREE_MISSING ✓；realpath 归一化正确处理 macOS /var↔/private/var（task.ts:236-241，squad 曾实测修复）✓；伪目录（无 .git 元数据/指向不存在的 gitdir/域外 gitdir）拒绝 ✓；防御性 taskId 校验缺失（P3-6）。
5. **向后兼容**：PicodeError.details 可选（条件赋值，errors.test 断言 2 参构造 details===undefined）✓；ErrorCode 追加不破坏既有码 ✓；prepareTask 签名/返回不变 ✓；closure/merge/t-regression fixture 语义经方案 D 保留 ✓。
6. **测试质量**：真实非空转——M4 测试真实调用 `git worktree add`/`git worktree list`/真实 wakeAgent（pi.enabled=true 下门闩先行拒绝，pi_session_id 断言 null）；M2 测试真实替换 process.env.PATH 并恢复；本审查独立复跑 3 文件全绿。覆盖缺口：assertWorktreeExists 防御分支（gitdir 内容无效/指向不存在/域外）无测试（P3-4）；probeCoreTools 目录 X_OK 假阳性无测试（P2-1 同源）。

## 5. 问题清单

### P1（阻塞，需 run-lead 裁决 + 修改）

**P1-1 工作房路径约定与真实布局脱节 → 生产（opencode 启用）下 M4 门闩对按既有约定预建的工作房误判缺失**
- 位置：pi-adapter.ts:437-449（wakeAgent 门闩）+ task.ts:263（prepareTask wt）+ 根因在 core worktreePath（paths.ts:12-19，本 chunk 只读引用点）
- 事实链：
  1. `worktreePath(repo, config, runId, taskId)` = `<repo>/<worktree_root>/<runId>/<taskId>` = `.picode/worktrees/<runId>/<taskId>`（paths.ts:18）。
  2. **真实仓库全部 16 个 worktree 均为顶层命名**：`.picode/worktrees/squad-<taskId>`（`git worktree list` 实测，本 run 即 `.picode/worktrees/squad-task-chunk-env-gate`），**无任何 `<runId>/<taskId>` 布局**。
  3. 官方工具链 C-1 `worktree-setup.sh --new <name>` 同样创建顶层 `<name>`（脚本 `WT_ROOT/$NEW_NAME`，无 runId 段），分支才含 runId（`picode/<run>/<name>`）。
  4. 生产 config `.picode/config.yaml` `opencode.enabled: true` → M4 门闩条件 `(opencode.enabled || pi.enabled)` 为真，对真实 `@task-<id>` 会话生效。
  5. 结论：run-lead 按既有/官方约定预建的工作房，门闩计算路径下**不存在** → 每次 task 会话唤醒被 WORKTREE_MISSING 拒绝（误判缺失），即便"有房"。
- 伴随时序缺口：canonical 流程中 approveStaffing 在双门闩齐时即 fire task_ready 唤醒三角（staffing.ts:464-482），而 prepareTask 须双门闩齐才能跑（task.ts:164-177，含 staffing approved）——**approve 时刻工作房必然尚未由 prepare 创建**；prepare 之后（自动创建成功）也无任何事件自动重唤醒三角（PROGRESS_DUE/CHANGE_APPLIED 仅 wake squad-lead，config.ts:351/354）。即门闩生效时：approve→唤醒全被拒→run-lead 跑 prepare/建房→三角仍 sleeping，除非手工 MCP session_wake。
- 影响面：orchestrator 管理 + 真实后端启用的 task 会话在**当前生产配置下全部无法经唤醒开工**——正是本门闩要守护的路径本身被门闩阻塞（新形态零产出，非 R16 的静默型）。
- 建议（须 run-lead 裁决其一）：(a) 对齐命名——门闩/prepare 按真实约定（顶层 `squad-<taskId>` 或工具链 `<name>`）定位，或 worktreePath 增加顶层映射；(b) 或显式确立 `<runId>/<taskId>` 为 canonical 布局，同步 worktree-setup.sh 与 run-lead 操作规范，并在门闩测试中补**真实命名**用例（现测试全部用 worktreePath 计算路径建 fixture，未覆盖真实布局）；(c) 时序上补「prepare 后自动重唤醒三角」或 approve 前预建房检查。修复涉及 core paths.ts（越本 chunk 写集）→ 建议 run-lead 以变更单/决策记录牵头，本 chunk 至少补真实布局测试与 known_issues 显式记录。

### P2（非阻塞建议）

**P2-1 probeCoreTools X_OK 判定不校验 isFile → 目录可被当作可执行工具命中**（pi-adapter.ts:379-390）
- `fs.accessSync(p, X_OK)` 对目录也成功（POSIX：目录 X 位=可遍历）。PATH 中出现名为 `node` 的目录 → `found.node` = 该目录、探测 ok=true。后果：门闩假阳性放行 → spawn 阶段 bash 报 "Is a directory" → 走 PI_SPAWN_FAILED 回滚（不静默，风险可控，故 P2 非 P1）。修复：`fs.statSync(p).isFile() && accessSync(X_OK)`（或 stat mode 位判）。建议补对应测试（现测试仅覆盖"无执行位文件不命中"，未覆盖"目录命中"反例）。

**P2-2 prepare 自动创建 vs 验收字面「缺失→拒绝」——有意设计，建议决策记录固化**（task.ts:256-289；known_issues §3；progress.md 方案 D）
- 详见 §4.3 判断。验收精神（spawn 前拒绝、不产生进程）由 wakeAgent 满足；prepare 自动创建是基线语义延续 + 写集互斥约束下的选择，留痕充分。不构成缺陷，但建议 run-lead 以正式决策记录（D 编号）定稿，防后续误改。

**P2-3 prepareTask 自动创建的 worktree 无 node_modules 自链/冒烟**（task.ts:268-289）
- prepare 自动创建仅 `git worktree add`，不做 C-1 的 node_modules 自链与冒烟——run-lead 走 worktree-setup.sh 的房才有自链。自动创建的房可被门闩放行（真实 worktree），但会话在无依赖的房里开工 → 另一形态"活不了"。属跨 chunk 衔接问题（C-1 流程未并入 prepare），建议在 known_issues 记录或 prepare 创建成功后提示 run-lead 补跑 worktree-setup.sh。

### P3（次要）

- **P3-1** pi-adapter.test.ts:313-323：I3 测试新增 task-y fixture 为惰性代码——该测试 `piEnabled:false` + `opencode.enabled=false`，M4 门闩条件不成立、门闩不触发，fixture 无实际作用；注释声称"按 M4 判定语义建元数据再验证深度放行"与真实行为不符（误导）。建议删除 fixture 或启用后端使门闩真实触发。
- **P3-2** handoff summary.md 交付表「prepareTask 门闩改造（**删除自动创建**）」与最终代码矛盾（自动创建保留，task.ts:265-289）——交接文档未同步方案 D 终态；known_issues §3 与 progress 一致，仅 summary 陈旧。
- **P3-3** staffing.test.ts:204/384 等适配注释声称"否则 task_ready 唤醒被门闩拒绝"——当前测试 config pi/opencode 均关，门闩不触发，注释高估（有备无患性质，未来开后端时成立）。
- **P3-4** task.ts:201-209 防御分支（gitdir 内容无效/指向不存在/域外主仓 .git/worktrees）无测试覆盖——建议补契约测试。
- **P3-5** task.ts:194-195：wt 已存在但为**文件**时消息写「目录不存在」——用词不准（isDirectory false 分支），可写「目录不存在或非目录」。
- **P3-6** task.ts:186-192/263：assertWorktreeExists/prepareTask 无显式 SAFE_TASK_ID_RE（对照 session-store.ts:38-51 SAFE_AGENT_ID_RE）——经评估逃逸实际被兜底（wakeAgent 路径 agentId 先经 SessionStore 校验；prepare 路径 ".." 被 git refname 校验拒绝），风险低；建议入口统一校验保持防御一致。
- **P3-7** task.ts:223-245：isUnderMainWorktrees 单向校验（gitdir 目标在主仓 .git/worktrees 下），未做 round-trip（gitdir 内 `gitdir` 文件指回 wt、gitdir 目录名 == taskId）——伪目录防护已达标（门闩目的），round-trip 为增强项。

## 6. 结论与打回意见

**结论：needs-work（打回）** — Reviewed-by: code-review（门禁层）。

放行前置条件（须满足其一，建议 run-lead 裁决）：
1. **P1-1 裁决**：明确工作房 canonical 布局（对齐真实/工具链约定 or 确立 worktreePath 布局并同步工具链），并使 M4 门闩对真实预建布局**不误判**（至少：补真实命名契约测试 + known_issues/决策记录显式声明；理想：修复 worktreePath 或门闩定位逻辑）。
2. **时序缺口**（P1-1 伴生）：确认 approve→prepare→唤醒的完整链路在真实后端下可闭环（预建房 by run-lead / prepare 后自动重唤醒），否则补机制或文档化人工步骤。

P2/P3 不阻断合并，建议随上述修改或后续轮次顺手处理（P2-1 一行修复 + 测试；P3-2 summary 同步）。

---

## 7. 第二轮复审（r2）— 修复增量 22ed0a7（E5 P1 打回后）

- 审查对象：`git -C <工作房> diff f504c69..22ed0a7`（3 文件，+19/-2）
- 修复提交：`22ed0a7` fix(env-gate): worktreePath canonical 对齐顶层 squad-<taskId>（E5 P1）+ findExecutableOn isFile 排除目录（P2-1）+ 命名契约测试（run-lead 代修，队内会话失联）
- 基线：f504c69（E5 首轮）/ b0be509（run 基线）
- 审查方式：逐文件读 + worktreePath 调用点全量核对 + `.picode/worktrees` 残留引用全仓检索 + 真实布局核验（本工作房即顶层 `squad-task-chunk-env-gate` 实证 + worktree-setup.sh 源码核对）
- 环境备注：本轮 bash/grep/glob 工具全部故障（spawn ENOENT / ripgrep launch failed），**未能独立复跑测试**（run-lead 已跑 orchestrator 390/390 + core 162/162；计数一致性已核：首轮 orch 389 + 本增量新增 1 用例 = 390，core 162 未动）。不替代 sdet 验证，采信 run-lead 全绿 + 首轮独立复跑结论。
- Reviewed-by: code-review（门禁层，r2 复审）
- 审查日期：2026-08-16

### r2-1 逐项结论

| # | 审查项 | 结论 | 说明 |
|---|---|---|---|
| 1a | P1 改动最小且注释清晰 | PASS | paths.ts:12-23 仅改 return + 参数改名 `_runId`（语义化忽略）+ 5 行注释（R17 P1 / E5 裁决 / canonical 依据 / 旧实现故障链），零附带改动；调用点零改动（位置传参，自动跟随） |
| 1b | 调用点语义一致 | PASS | closure.ts:163/293/460、pi-adapter.ts:134（taskWorktreeCwd）+ :445（wakeAgent 门闩经 task.ts:192）、task.ts:192/263 全部 `worktreePath(repoRoot, config, basename(dir), taskId)` → 顶层 `squad-<taskId>`，与真实布局一致（首轮 16 实证 + 本工作房顶层实证）；M4 门闩/cwd/交接/解散/清理全部落到真实路径，不再误判 |
| 1c | 旧路径假设残留 | PASS（有上报项） | 见 r2-2 残留清单——全部属写集外文件，不阻断，需 run-lead 另行授权清理 |
| 2 | 命名契约测试 | PASS | staffing.test.ts:108-115：精确断言 `<repo>/.picode/worktrees/squad-<taskId>` + endsWith + 不含 runId 段；import 于 :8；走真实 setup()（createRun + addChunkAndTask） |
| 3 | P2-1 findExecutableOn | PASS（实现）/ 附 P3 项 | pi-adapter.ts:385-386：try 内 `statSync().isFile()` 前置排除目录（X_OK 对目录误判），statSync 跟随软链（PATH 软链工具仍命中），缺失→catch→continue；**未补"目录命中"反例测试**（首轮打回意见"一行修复 + 测试"，仅一行修复落地，见 r2-3） |
| 4 | 写集 / 验证 | PASS | `diff b0be509..HEAD --stat` = 恰 7 文件（errors.test.ts、errors.ts、paths.ts、pi-adapter.test.ts、pi-adapter.ts、staffing.test.ts、task.ts）= 6 原写集 + paths.ts（run-lead 授权扩展）；修复增量 f504c69..HEAD 仅 3 文件 ⊆ 7，无越写 |

### r2-2 旧布局残留清单（写集外，非阻断，上报 run-lead）

1. **packages/orchestrator/src/supervise.ts:51** — `worktreesRootOf` 内联拼 `<worktree_root>/<runId>`（未走 worktreePath）→ 观测指标 `worktrees` 恒 0（dashboard 指标降级；无门闩/spawn/路径功能影响）。建议后续改为枚举 `squad-*` 或复用 worktreePath。
2. **packages/orchestrator/src/summary-noise.ts:12** — agent 就绪提示仍写 `.picode/worktrees/<run>/<task>`（指引漂移，agent 若照抄推导路径会落错）。
3. **scripts/supervise/supervise.mjs:82** — `${REPO}/.picode/worktrees/${RUN_ID}`（legacy 监督脚本；existsSync 兜底 → 计数 0，不崩溃）。
4. **docs/domains/git-worktree.md:23** — 布局图仍写 `.picode/worktrees/<run_id>/<task_id>/`（文档陈旧；首轮即与现实脱节，本轮代码对齐后更显性）。
5. scripts/supervise/{ui,r3,dash}-feed.sh — 2026-08-13 一次性投喂脚本硬编码旧布局（历史工件，仅提示）。
- 非陈旧（正确保留，不属残留）：config.ts:367 / docs/spec/13-configuration.md:252 `worktree_root: ".picode/worktrees"`（根不变）；management.test.ts:96 子串校验（泛化，仍成立）；task.ts `.git/worktrees/*` 为 git 内部管理域（非 `.picode` 布局）。

### r2-3 非阻断项

- **P3-r2-1** pi-adapter.test.ts 无"PATH 中目录名恰为 node"反例测试——现有"无执行位文件"用例在有/无 isFile 守卫下均通过（accessSync 都失败），守卫回归无测试守护。建议补：`mkdtemp + mkdir node` → `probeCoreTools(dir)` 的 missing 须含 node。
- **P3-r2-2** E5 打回伴随时序缺口（approve→prepare→唤醒闭环 / prepare 后自动重唤醒）本修复增量未涉及（run-lead 裁决选"对齐命名"路线；实践闭环 = run-lead 预建房，16 实证即此流程产物）。建议 run-lead 在 known_issues/handoff 确认"预建房 or 手工重唤醒"人工步骤文档化（写集外，另行授权）。
- paths.ts 注释引用 `scripts/worktree-setup.sh` 事实核验通过：脚本存在于主仓 `scripts/`（未跟踪入 git），`--new <name>` 建顶层 `WT_ROOT/<name>`，runId 仅入分支名 `picode/<run>/<name>`——与注释一致。dist/paths.d.ts 已重建为 `_runId`，与 src 一致（dist 未入 diff，非跟踪物）。

### r2-4 结论

**pass（批准）** — Reviewed-by: code-review（门禁层，r2 复审）。

- E5 P1-1（worktreePath 布局脱节 → 生产 M4 误判缺失）已正确、最小修复：canonical 对齐顶层 `squad-<taskId>`，全部调用点语义一致，命名契约测试守护；M4 门闩对真实预建布局不再误判。
- P2-1（isFile 排除目录）实现正确（补测见 P3-r2-1，后续项）。
- 写集门禁通过：修复增量 ⊆ 6 原写集 + paths.ts 授权扩展，无越写文件。
- 无新增 P0/P1。残留旧布局引用（supervise.ts:51、summary-noise.ts:12、supervise.mjs:82、git-worktree.md:23）与 P3-r2-1/2 均属写集外或非阻断，**不阻断本次合并**，建议 run-lead 以单独变更单授权清理。
