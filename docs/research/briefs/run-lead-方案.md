研究完成（已读 intake、DECISIONS、19 规格、交接文档、5 个 error task、opencode-adapter/pi-adapter/task/merge/evolve/staffing/room-store/pi-extension 源码与测试）。以下为 run-lead 决策文本。

---

# run-lead 决策方案（run-2026-08-12T18-50-35-123Z）

## (a) 问题台账处置决策清单

### A. 运行错误

**ERR-01（P0 serve stream 挂起）→ 缓**
根因在 opencode-go serve 内部（stream 已处理但不 flush），picode 侧无法热修上游。现有缓解已生效：D061 noReply（spawn 不再等模型 turn）+ requestWithRetry 客户端超时重试（30s×3）。本轮追加：orchestrator 侧 serve 健康探测 watchdog（周期性 `isAlive` 探测 + 失败会话自动重 spawn/置 error），并把「人工重启+文件系统为真相」规程固化为文档。serve 内稳定依赖上游，列为风险不放行 E3 自动改。

**ERR-02（curl 超时后 loop 停、任务卡中间态）→ 修**
根因：会话调度 loop 单点无断连重试。已有部分缓解（D059 wokeErrors 可见化、self-drive 守护）。本轮：规则引擎/self-drive 对断连增加有界重试，卡中间态任务经 `task dissolve --force` + 重推可恢复，补单测覆盖「断连→重试→续跑」路径。

**ERR-03（repo_write 写到 serve cwd 而非 worktree）→ 修**
根因确认：opencode 会话 cwd = serve 启动目录（克隆根），`pi-adapter.buildPiEnv`（PICODE_CWD=`path.resolve(dir,"../..")`=克隆根）与 opencode 适配器均未把 task worktree 注入会话（opencode-adapter 只消费 PICODE_PERSONA）。本轮：opencode ready message 注入「工作目录 = worktree 路径 + repo_* 相对路径以此为准」，且 `PICODE_CWD` 改为对应 task worktree；prompt 显式引导 cd worktree（对齐 D062-3 建议）。中风险，代码层 + 测试。

**ERR-04（serve 重启丢上下文、未 commit 重做）→ 缓**
对话/工具链 checkpoint 持久化依赖 serve 侧（上游 API 无 transcript 拉取，D058 契约固定）。picode 侧可落地的是降级缓解：task 层 WIP 自动 checkpoint（定期 git stash/临时 branch）+ 交接续跑规程文档化。真持久化列为上游依赖，本轮不做 serve 内热修。

**ERR-05（npm test 不命中 allowlist）→ 修**
根因已定位（非匹配逻辑本身——index.ts:563 的 token 边界匹配正确）：`pi-adapter.buildPiEnv` **未注入 `PICODE_RUN_ALLOWLIST`**，扩展回退到 `[]` → 一切 `run_allowlisted` 全拒。本轮：buildPiEnv 补注入 `config.run_allowlist`，补「npm test / npm test --x 命中、npm test-ci 不命中」用例。低风险。

### B. 开放项

**O001（多 goal/program 级）→ 拒（本轮）**
v1 明确单 goal 边界（18）；多 goal 需 run 结构重构，不属于本 run 目标，decision-catalog 留档。

**O004（可选 pi-subagents 临时 fork）→ 拒（本轮）**
非主路径，无增量价值，catalog 备注。

**O005（write_paths 生成器 + verify_commands 接入）→ 修（补全）**
核实：主体已落地——`evolve.ts` 生成器（evolveWritePaths/effectiveLayers/assertEvolveWritePathAllowed）、staffing people-qa 校验 `write_paths ⊆ evolveWritePaths`、`commands/evolve write-paths` CLI、merge.ts:184 E4 `runVerifyCommands` gate。剩余两处补全：① verify_commands 默认加 build（D062-2：`npm run build && npm test`，防测旧 dist）；② E6 knowledge 文件目前**未入库**（docs/knowledge/evolve/ 是 untracked 状态，须 commit 归档）。

**O006（cell check_signoff 文件/流程格式）→ 缓**
spec 10 已登记 `check_signoff` type，文件/流程格式本就「留待 spec 细化」（D060 结论）。本轮文档层落地一份最小 `check_signoff` 提交格式草案 + proc-audit 红灯记录文件约定（bus 通道 drift/alert 已就绪），不写机械实现。

### C. 审计债务

1. **28 测试文件重复夹具 → 修**：抽共享 `packages/*/test-utils`（tmpGitRepo/mkdtempSync 单源）。低风险高收益，测试层改动，不碰生产逻辑。
2. **10 个仅测试引用生产符号 → 缓**：核验后 `canTransition` 是 session 状态机原语（内部使用，导出合理），`getDefaultConfig` 是公开测试入口（46 处引用，保留）。其余（roomDisplay/NON_SESSION_ROLES/evolveRisk/assertEvolveWritePathAllowed/canConsumeModel/opencodeSessionIdOf/isPicodeError）可批量删导出，但收益低、风险扰动导出面，排后。
3. **pi-extension/index.ts 782 行 → 缓**：工具域拆分（按 profile/domain 拆文件）是净收益但会大改 20 工具注册面，本轮不碰，列为下轮。
4. **commands/ → store 直连无 service 层 → 缓**：架构口味非缺陷，v1 可接受，不属缺陷处置。
5. **task.ts extensionPath() 硬编码跨包相对路径 → 缓**：运行时依赖源码布局，dist 部署下脆弱；需构建布局确认后改主包导出，低优先级。
6. **merge.ts 正则扫 session YAML 绕过 SessionStore → 修**：改调 `SessionStore.get` 判定 awake（合并 `isEvolveRun` 同款模式），低风险，测试可覆盖。
7. **members.json/members.yaml 双格式 → 缓**：读侧已 json→yaml 兜底（room-store.ts:80-92），写侧统一 json 单源即可，小改不阻塞。
8. **config.ts D055 reserved 注释漂移 → 缓**：注释已缓解漂移，清理会动配置面兼容，不在本轮。

### D. 交接问题

- serve 挂起人工重启 → 并入 ERR-01 决策（watchdog + 文档化规程）。
- 唤醒静默失败 → 已由 D059/D061 修复（wokeErrors 输出 + noReply spawn），本轮补 serve 健康探测兜底。
- HTTP 000 假象 → 缓：运行模式「文件系统才是真相」固化为文档运行规程。

---

## (b) chunk 分块建议（4 个，depends_on 串行/并行编排）

**C1 `chunk-problem-docs`（无代码依赖 · 最先）**
- write_paths：`docs/problems/**`、`docs/knowledge/pi-agent-study.md`、`docs/knowledge/evolve/`、`docs/plans/**`（均在 docs/knowledge/docs 层内）
- 目标：本决策清单落盘（处置结论可审计）+ prime-agent 机制映射文档（ind-res 取证后）→ 满足 product_acceptance 1/2/3 的文档部分
- depends_on：无

**C2 `chunk-err-fix`（核心代码修复）**
- write_paths：`packages/orchestrator/src/{opencode-adapter.ts,pi-adapter.ts,merge.ts,task.ts}` + 对应 `*.test.ts` + `packages/core/src/config.ts`（verify_commands 默认值）
- 目标：ERR-02/03/05 修复 + O005 补全（build&&test gate）+ merge.ts 改 SessionStore + serve watchdog 探测
- depends_on：C1（决策先行）

**C3 `chunk-test-utils`（审计债务·测试域）**
- write_paths：`packages/{core,bus,orchestrator,pi-extension,mcp-server}/**/*.test.*` + 新增 `packages/*/test-utils`（生产代码不动）
- 目标：夹具单源化（C1 债务）+ 死符号导出清理
- depends_on：C2（避免与 C2 行为变更缠斗；文件面不重叠可并行，但后合并保证测试基线新）

**C4 `chunk-evolve-e6`（知识归档 · 收尾）**
- write_paths：`docs/knowledge/evolve/**`
- 目标：E6 knowledge/evolve/<run_id>.md 入库 + commit（当前 untracked 状态清零）
- depends_on：C2/C3 合并后（验收全绿再归档）

编排顺序：C1 先行 → C2、C3 并行（文件面互斥，C3 依赖 C2 合并顺序）→ C4 收尾。全程串行 merge（D036），E4 gate 为 `npm run build && npm test`。

如需 ind-res 联网取证 prime-agent（URL+retrieved_at），请监督者按信息控制流程转 research 房发起。