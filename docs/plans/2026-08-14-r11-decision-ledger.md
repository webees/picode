# run-lead 自治规划 — 并行 run 决策编号机制修复（水位 ledger + 预留 + 冲突 lint + 既有损坏修复）（run-2026-08-14T07-27-45-654Z · self_evolve · scale L）

> 目标（宽松，run-lead 自主决策）：
> 1. **决策编号不再冲突**：引入全局分配机制（水位 + 预留 ledger + flock 原子 claim），并行 run 规划时
>    各自 claim 不相交编号区间，根治「两个 run 都取 D082」式碰撞
> 2. **冲突可检测**：`decision-lint` 机械校验编号完整性（表行/详条唯一、表↔详条对齐、水位一致、全库
>    引用可解析），接入 `npm run check`，碰撞在规划/merge 时即被抓住而非事后人工平移
> 3. **修复既有编号损坏**：当前 DECISIONS.md 因上轮合并冲突残留 D084/085/086 缺失、D087/088/089
>    重复（表行+详条）、D055 误引用 D082，恢复 canonical D084-088
> 4. 既有 414 单测全绿（npm run build && npm test）+ `npm run check` 三 lint（persona+skill+decision）通过
>
> 背景（监督者实测教训）：run-2026-08-13T23-48-54-042Z（checkpoint）与 run-2026-08-13T23-50-59-484Z
> （skill）并行，各自独立编号决策（都用了 D082）→ DECISIONS.md 合并冲突 + 全库编号引用需平移
> （skill 系被重编号到 D084-089），耗时解决。且 12684b9 合并解决**不彻底**：DECISIONS.md 内 skill 系
> 实际落成 D087/D088/D089（表行与详条各重复 2 次），与 catalog §15（D084）、E11 纪要（D084-D088）、
> skill-spec.md（D084）不一致；D084/085/086 整段缺失；D055 行「skills_root 已于 D082 激活」误引用
> （应为 D084）。
>
> 依据：`docs/DECISIONS.md`（现损坏态：表行 283-288 / 详条 289-320）；`docs/knowledge/evolve/run-2026-08-13T23-50-59-484Z.md`
> （E11：skill 决策 canonical D084-D088 对照）；`docs/reference/decision-catalog.md` §15（D084/D085/D088）；
> `docs/standards/skill-spec.md`（D084）；git 历史 12684b9（合并冲突解决）、8258922/51dabca（两并行 C3）；
> 代码事实：`packages/core/src/atomic.ts` 已有 `withFileLock`/`writeAtomic`（可复用做原子 claim）、
> `packages/core/src/validate/persona-lint.ts` + `skill-lint.ts`（decision-lint 镜像模式）、`package.json`
> `check` 脚本（persona-lint + skill-lint 双通过，本轮扩为三 lint）、`scripts/supervise/*.mjs`（脚本惯例）。
> 基线：main = 8388a23（supervise 装配脚本后），实测 414 tests（core 92 / bus 19 / orchestrator 249 /
> pi-extension 17 / mcp-server 17 / dashboard-server 16 之一致口径，实施者确认具体数）。
>
> 编号约定：本 run 决策按水位预留 **D089-D093**（C1 建立 ledger 时 claim；C3 落地 DECISIONS；
> decision-lint 校验无冲突；若与既有冲突，lint 先抓再改）。

---

## (a) 处置决策清单

### D089 决策编号全局分配（水位 + 预留 ledger + flock 原子 claim · 本轮核心 1）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D089-1 | **并行 run 编号碰撞**：两个 run 规划时都读 DECISIONS.md「下一个号」→ 都取 D082，各自写各自的分支，merge 时冲突 + 全库引用平移 | **全局水位 + 预留 ledger + flock 原子 claim**：新增机器文件 `docs/decisions/watermark.yaml`（schema v1：`next_number` + `reservations[]`）；新增 `scripts/decision-reserve.mjs`：`--reserve --run <id> --count N` 复用 core `withFileLock`（flock）读-claim-写回，串行化并发 claim，返回本 run 独占区间；`--land --run <id>`（docs merge 落地时消费）；`--status`（只读）。**run-lead 规划前必须先 `reserve`，把返回的号写进 plan 决策清单** | 根因修复。flock 在同一文件系统上跨进程原子，两个并行 run-lead 同时 claim 时串行分配不相交区间；「state 以文件为准」（D002）+「编排器无 LLM」（D003）延续——claim 是纯机械操作 |
| D089-2 | **水位放哪 / 合并冲突**：若水位行直接放 DECISIONS.md 表头，两个并行 docs chunk 都改同一行 → merge 冲突（本次事故同源） | 水位放**独立机器文件** `docs/decisions/watermark.yaml`（非 markdown 表，`next_number` + `reservations` 两字段）；DECISIONS.md 仅在顶部加一行人类可读「编号水位见 docs/decisions/watermark.yaml」说明（不承载机器状态）；reservation 记录按 run 幂等（同 run 重复 claim 返回已分配号） | 机器状态与人类文档分离（D002 文件真相 + 单点权威 doc-style §1）；避免水位行成为并行编辑热点 |
| D089-3 | **docs merge 时消费 / 悬空预留** | `--land`：docs chunk 在 C3 落 DECISIONS 时调用，把该 run 的 reservations 标记 `status: landed` 并从可用区间消费；`--status` 暴露 `reserved/landed`；plan 提交后未 land（run 废弃/取消）→ reservation 悬空，由 `--status` 人工识别，**不自动回收**（避免回收撞在飞 run，留待后续候选） | merge 列车已串行（D036 merge queue + merge.lock），land 时天然无并发；悬空仅影响未来号分配起点，不破坏既有条目 |
| D089-4 | **回归面** | 纯新增文件 + 脚本 + 测试；不改 orchestrator / bus / 既有 CLI；DECISIONS.md 结构只增一行说明（机器状态不动） | 最小回归面；与 checkpoint/skill 同为「新增模块 + 既有路径零改动」模式 |

### D090 decision-lint 冲突检测（编号完整性 + 引用可解析 · 本轮核心 2）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D090-1 | **编号损坏无守卫**：本次 D087/088/089 重复、D084-086 缺失进入 main 无人拦截 | **新增 `decision-lint`**（`packages/core/src/validate/decision-lint.ts`，镜像 persona-lint 数据优先不抛错，返回 `{ok, problems, files}` + CLI）：校验 ① DECISIONS 表行编号唯一 ② 详条编号唯一 ③ 表↔详条一一对应 ④ 编号与 `watermark.yaml` 水位一致（表内最大 ≤ next_number-1）⑤ 全库 docs 引用可解析（`docs/**` 内 `D0xx` 引用必须存在于 DECISIONS 或本 run reservations）⑥ reservations 幂等 | 把「碰撞/损坏」从事后人工平移变成机器门禁；镜像 persona-lint/skill-lint 惯例（code-first + 结构化返回） |
| D090-2 | **何时强制** | `npm run check` 追加 decision-lint（persona-lint + skill-lint + decision-lint 三通过）；规划期可选 `--plan <file>` 预检（run-lead 写 plan 前对预留区间做冲突预检） | 与 skill-lint 同轨（check 即门禁）；规划期预检把碰撞挡在写 plan 前 |
| D090-3 | **误报面** | 引用校验对「缓/拒留档的历史编号」放行（D0xx 存在即可）；对跨文件引用缺失仅 warning 不阻断（防历史欠账刷屏）；**表行/详条重复为 error（硬拦截）** | 数据优先：当前 DECISIONS 的损坏态将被完整报出，修复后（C3）零 error；历史引用缺口降级 warning 不误杀 |

### D091 既有 DECISIONS 编号损坏修复（处置记录 · 本轮核心 3）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D091-1 | **skill 系编号损坏**：表行 283-288 与详条 289-320 中 D087/D088/D089 各重复 2 次；D084/085/086 缺失 | **恢复 canonical D084-D088**（对齐 catalog §15 / E11 / skill-spec）：D084=Skill harness 落地、D085=缓项 skills-ref、D086=缓项 skill 打包/导入、D087=拒 skill-creator、D088=拒 allowed-tools；表行 283 的 checkpoint 缓项行并入 D081（D081 已含「maxTokens 真计量仍缓」）删除重复行；详条按 D084-D088 重排 | 全库引用锚点（catalog/E11/skill-spec/commit body）统一到一套编号，不再存在两套错位编号 |
| D091-2 | **D055 误引用**：表行 61「paths.skills_root 已于 D082 激活」 | 改为「已于 D084 激活」（skills_root 激活属 Skill harness = D084） | 修复跨行引用漂移 |
| D091-3 | **损坏根因纪律** | E12 纪要记录：根因 = 并行 run 无编号分配机制 + 12684b9 合并解决不彻底；机制 = D089/D090 落地；修复对照表（破坏前 D087/088/089 ↔ 修复后 D084-088） | 教训沉淀进 knowledge（E6），供后续 run 引用 |

### 处置：缓 / 拒（本轮不做，留档）

| # | 候选 | 处置 | 理由 |
|---|---|---|---|
| D092 | **编号重命名自动化脚本**（跨文件机械重编号：DECISIONS + catalog + plans + knowledge 一次平移） | **缓** | D089/D090 已根治主因（不再产生碰撞）；既有损坏一次修完（C3）后，未来无重编号场景；若再遇历史欠账再建脚本。留档 |
| D093 | **run 级编号前缀**（D<run短id>-xx，候选 1 之 B） | **拒** | 全局 D0xx 已被 commit body / catalog §15 / E11 / skill-spec / 全库 `D0xx` 引用深嵌，改前缀 = 全库引用大迁移（正是本次要消除的平移成本）；水位+预留从根上解决，前缀无必要。留档 |
| D094 | **悬空 reservation 自动回收**（TTL/超时释放） | **缓** | `--status` 人工可识别；自动回收需定义超时策略与跨 run 竞态处理，本轮控面。留档 |
| D095 | **decision-lint 接入 E4 merge gate / `picode status` 面板** | **缓** | 先经 `npm run check` 验证稳定性；E4 verify 现为 build+test，扩列另评估。留档 |

---

## (b) chunk 分块建议（3 个；C1/C2 代码，C3 文档；C1/C2 并行实现、串行 merge 列车 D036）

### C1 `chunk-decision-reserve`（水位 ledger + 预留脚本 · 代码+测试）

- **write_paths**：
  - `docs/decisions/watermark.yaml`（新建：schema v1，`next_number: 89` + `reservations: []`；权限点——决策编号分配唯一机器真相）
  - `scripts/decision-reserve.mjs`（新建：`--reserve --run <id> --count N` / `--land --run <id>` / `--status`；复用 `@picode/core` `withFileLock` + `writeAtomic` 读-claim-写回；幂等：同 run 重复 claim 返回已分配号）
  - `scripts/decision-reserve.test.mjs`（新建：并发 claim 区间不相交 / 幂等 / 溢出报错 / land 后消费）
- **read_paths**：`packages/core/src/atomic.ts`（withFileLock/writeAtomic 契约）、`packages/core/src/yaml-io.ts`、`scripts/supervise/*.mjs`（脚本惯例）
- **public_contract**：`docs/decisions/watermark.yaml` 成为编号分配唯一事实源；`decision-reserve` 三个子命令；**既有代码/CLI/行为零改动**
- **depends_on**：无
- **验收口径**：
  - C1-a `command`：`npm run build && npm test` 全绿（既有 414 无回归）
  - C1-b 单测：两个并行 `reserve`（Promise.all 并发）claim 出**不相交**区间；同 run 重复 claim 幂等返回同区间；count 溢出（next_number+count > 999）报错
  - C1-c 单测：`--land` 后 `--status` 显示 landed 且后续 reserve 从下一号起；`--status` 只读零副作用
  - C1-d 核查：`git diff --name-only base...HEAD ⊆ write_paths`（P07 门禁）；未触碰 DECISIONS.md / catalog / 任何既有包源码
- **P07 门禁**：diff 仅 `docs/decisions/watermark.yaml` + `scripts/decision-reserve.mjs` + 其测试

### C2 `chunk-decision-lint`（冲突检测 lint + check 接线 · 代码+测试）

- **write_paths**：
  - `packages/core/src/validate/decision-lint.ts`（新建：`checkDecisions(dir, opts)` → `{ok, problems, files}` + CLI 入口；错误码全集 `DecisionLintCode`：`DUP_TABLE` / `DUP_SECTION` / `TABLE_SECTION_MISMATCH` / `WATERMARK_DRIFT` / `REF_UNRESOLVED` / `RESERVATION_COLLISION`；`--plan <file>` 预检模式）
  - `packages/core/src/validate/decision-lint.test.ts`（新建：全错误码覆盖 + 合法 fixture 零报错 + `--plan` 冲突预检）
  - `packages/core/src/index.ts`（导出 decision-lint）
  - `package.json`（`npm run check` 追加 `node packages/core/dist/validate/decision-lint.js .`）
- **read_paths**：`persona-lint.ts` / `skill-lint.ts`（镜像模式）、`docs/DECISIONS.md`（修复后结构，C3）、`docs/decisions/watermark.yaml`（C1 产出）
- **public_contract**：`@picode/core` 新增导出 `checkDecisions` / `DecisionLintCode`；新 CLI `decision-lint`；`npm run check` 三 lint 通过
- **depends_on**：C1（watermark 文件为校验源）、C3（`npm run check` 三 lint 全绿需要 DECISIONS 已修复——C2 单测用 fixture 自包含，不依赖真实 DECISIONS 状态）
- **验收口径**：
  - C2-a `command`：`npm run build && npm test` 全绿 + `npm run check`（persona-lint + skill-lint + decision-lint 三通过——C3 合并后断言）
  - C2-b 单测：错误码全覆盖——表行重复 / 详条重复 / 表↔详条不对应 / watermark 漂移（表内最大 ≥ next_number）/ 引用悬空 / 预留区间与 DECISIONS 冲突；合法 fixture 零报错
  - C2-c 单测：`--plan` 预检对「未预留的 D0xx」报 `REF_UNRESOLVED`；对 C1 返回的预留区间零报错
  - C2-d 核查：对**修复前**构造样本（复制当前损坏 DECISIONS 片段）报 DUP 错误（防回归护栏）；diff ⊆ write_paths
- **P07 门禁**：diff 仅 `packages/core/src/validate/decision-lint.*` + `index.ts` + `package.json`

### C3 `chunk-decision-repair-docs`（DECISIONS 编号修复 + 纪律文档 + 知识归档 · docs 层）

- **write_paths**：
  - `docs/DECISIONS.md`（顶部加「编号水位见 docs/decisions/watermark.yaml」一行；skill 系恢复 canonical D084-D088——表行 + 详条，删除 checkpoint 缓项重复行并并入 D081；D055 行「D082」→「D084」；新增本 run D089 决策留痕 + D092-095 缓/拒行）
  - `docs/reference/decision-catalog.md`（新增 §16 决策编号机制：水位 ledger / reserve 流程 / decision-lint / 纪律；§15 编号核对无改动）
  - `docs/standards/doc-style.md` 或 `docs/standards/terminology.md`（补一句：新 D 编号必须先 `decision-reserve` 再落 plan——M5 维护纪律延展）
  - `docs/knowledge/evolve/run-2026-08-14T07-27-45-654Z.md`（E12 纪要：根因/决策/diff/验证/剩余风险/后续候选 + 编号修复对照表）
  - `docs/plans/2026-08-14-r11-decision-ledger.md`（本规划，已含）
- **read_paths**：C1/C2 产出、DECISIONS 现状、catalog §15、E11、skill-spec、commit.md（提交规范）
- **depends_on**：C1、C2（机制落地才写得准；`npm run check` 三 lint 在 C2+C3 齐后全绿）
- **验收口径**：
  - C3-a `command`：`npm run build && npm test` 全绿 + `npm run check` 三 lint 通过（决策修复后 DECISIONS 过 decision-lint 零 error）
  - C3-b 核查：DECISIONS 含 D084-088 canonical（与 catalog §15 / E11 / skill-spec 一致）、无重复编号、表↔详条对齐、D055 引用为 D084；顶部水位说明行存在
  - C3-c `command`：`node packages/core/dist/validate/decision-lint.js .` 零 error（机器验证修复）
  - C3-d 核查：E12 纪要含损坏根因 + 修复对照表 + 机制落地；catalog §16 决策编号机制节落地
  - C3-e 核查：本 run 决策 D089（编号机制）留痕，D092-095 缓/拒行留档

**编排**：C1（reserve）与 C2（lint）文件无重叠，可并行实现、串行 merge（D036，merge 列车依赖 C1→C2 无强依赖，可任意先后）；C3（docs 修复）在 C1/C2 合并后收尾。E4 gate：代码层显式 `npm run build && npm test`；merge_ready 强制唤醒 code-review（E5，code 层 MUST）。**先修后接**：C2 的 `npm run check` 三 lint 全绿在 C3 合并后才成立（C3 修复损坏 DECISIONS）——C2 验收单测用 fixture 自证，E4 build+test 不依赖 check。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 D089–D095） | run-lead（本会话） | 已产出 |
| C1 decision-reserve | **三角 A**（squad-lead/engineer/sdet，真招聘） | watermark.yaml + reserve 脚本（flock 原子 claim）+ 并发/幂等/溢出测试；engineer 主实现，sdet 验证并发不相交 |
| C2 decision-lint | **三角 B**（squad-lead/engineer/sdet，真招聘） | checkDecisions + 全错误码 + check 接线 + `--plan` 预检；sdet 验证错误码全覆盖 + 损坏样本拦截（防回归） |
| C3 decision-repair-docs | **文档小组**（docs-lead/tech-writer/docs-qa） | DECISIONS 编号修复（canonical D084-088 + D055 修正 + 本 run 决策留痕）+ catalog §16 + 纪律句 + E12 纪要 |
| 评审 | code-review（E5 code 层 MUST） | C1/C2 merge_ready 机械唤醒 |

人员调度：C1/C2 各一三角经标准 staffing 真招聘（D025/D030），可并行开工；C3 文档小组在 C1/C2 合并后收尾。改动集中在 `docs/decisions/` + `scripts/` + `packages/core/src/validate/` + docs 层，**不触碰** orchestrator / bus / pi-extension / mcp / dashboard / 规则表 / merge / continuation。

---

## (d) 后续候选（本轮不做，留档）

1. **编号重命名自动化脚本（D092）**：跨文件机械重编号（DECISIONS + catalog + plans + knowledge 一次平移）；本轮机制已根治主因，无场景再建
2. **悬空 reservation 自动回收（D094）**：TTL/超时释放 + 跨 run 竞态处理；现 `--status` 人工可识别
3. **decision-lint 进 E4 merge gate / status 面板（D095）**：verify_commands 扩列或面板暴露编号水位；先经 check 验证稳定性
4. **run 级编号前缀（D093，拒档）**：全局 D0xx 引用深嵌，前缀会引入全库迁移成本；已由水位+预留根治

---

## 本轮验证载体

无人干预下由 self-drive guardian 推进（三角会话 ready → 自主实现 → 续跑 → 自测 → evidence/handoff → 串行 merge）。
验收判定：C1/C2 代码任务合并入 main（acceptance 1/2 达成——编号分配机制 + 冲突 lint），C3 文档修复合并
（acceptance 3/4 达成——DECISIONS canonical D084-088 恢复 + 既有单测全绿 + `npm run check` 三 lint 通过），
E12 纪要归档。

> 精简批2（2026-08-15）：本 run E 纪要（r11）已摘要化，教训/风险去向见 evolve/E1-E15-SUMMARY.md；E 纪要细节见 git 历史。
