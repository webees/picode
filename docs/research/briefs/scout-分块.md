## P02 分块建议 — run-2026-08-12T18-50-35-123Z（prime-agent 学习 → picode 优化）

**依据**：goal.yaml（self_evolve，risk=medium，layers=docs/knowledge/tests/code）＋ intake（台账 A 运行错误×5 / B 开放项×4 / C 审计债务×8 / D 交接问题×3），产品验收 = ind-res 取证 → run-lead 方案 → 文档/测试层落地 → E6 入库 → `npm run build && npm test` 全绿。

**原则**：ind-res 取证先行（chunk-01），方案/处置紧随（chunk-02），之后 docs/tests 两条线并行（chunk-03/04）。code 层改动仅限"为测试转绿所必需的最小编辑"，其余 code 层项（ERR-01~04、C3~C7）在 chunk-02 统一给"缓"结论，本 run 不落地。

---

### chunk-01 `research-prime-agent`（ind-res 席）
- **write_paths**: `["docs/research/**", "docs/knowledge/prime-agent/**"]`
- **read_paths**: `["docs/problems/2026-08-13-intake.md", ".picode/runs/**/goal.yaml"]`
- **depends_on**: `[]`
- **目标**: 联网取证 prime-agent 五大机制（Continual Harness /refine 快照回滚、daemon-worker-kernel 进程隔离与会话持久、子 agent 递归=rlm()、自主模式 turn/token/time 预算+质量门、技能=可导入包 + skill creator）；每机制记录 URL+retrieved_at；对照 intake §二 核实/纠偏 sponsor 预研摘要。
- **验收要点**:
  - 证据文件存在（file_exists：`docs/research/2026-08-13-prime-agent.md`）
  - 每机制 ≥1 主源 URL + retrieved_at（manual 抽查）
  - 与 intake §二 差异逐条标注（确认/纠正/补充）

### chunk-02 `plan-disposition`（run-lead + docs 三角）
- **write_paths**: `["docs/plans/**", "docs/DECISIONS.md", "docs/problems/**", "docs/errors/**"]`
- **read_paths**: `["docs/research/**", "docs/problems/2026-08-13-intake.md", "docs/errors/2026-08-12.md", "docs/DECISIONS.md"]`
- **depends_on**: `["chunk-01"]`
- **目标**: 产出 机制映射表（prime-agent↔picode 逐项）+ 优化方案（优先级+风险+责任人）；对台账 A/B/C/D 全部 20 项给结论（修/缓/拒 + 理由）；明确本 run 落地边界 = docs/tests 层。
- **验收要点**:
  - file_exists：`docs/plans/2026-08-13-prime-agent-optimization.md`
  - 台账每项有处置结论（manual：A×5/B×4/C×8/D×3 逐项核对）
  - DECISIONS.md 新增决策条目（如 D065 方案/处置总纲）
  - ERR-01 给出 serve 侧方案文档化决策（缓，理由含涉及 serve 进程/ops）

### chunk-03 `tests-optimization`（squad 三角，tests 层）
- **write_paths**: `["packages/**/*.test.ts", "packages/**/src/test-utils/**", "tests/**", "scripts/e2e/**"]`
- **read_paths**: `["docs/plans/**", "packages/**/src/**"]`
- **depends_on**: `["chunk-02"]`
- **目标**: 测试层可落地项：① 28 个测试文件的 `tmpGitRepo()/mkdtempSync` 重复夹具收敛为共享 helper（C1）；② ERR-05 审批 allowlist 回归测试（`npm test` 命中）+ 最小代码修复；③ C2 中 10 个仅测试引用符号补充守护测试；④ 为 E4 merge gate `build && test`（D062）加回归测试/注释。
- **验收要点**:
  - command：`npm run build && npm test`（212+ 断言全绿，不降）
  - command：`npm run typecheck`
  - 夹具收敛后无测试行为改变（manual：diff 抽查）
  - ERR-05 场景有显式测试用例（manual）

### chunk-04 `docs-knowledge`（docs 三角，docs/knowledge 层）
- **write_paths**: `["docs/guides/**", "docs/spec/**", "docs/standards/**", "docs/knowledge/**"]`
- **read_paths**: `["docs/plans/**", "docs/DECISIONS.md", "docs/errors/**"]`
- **depends_on**: `["chunk-02"]`
- **目标**: 文档层落地：D 交接问题修正（唤醒静默失败、HTTP 000 文件系统真相、serve 重启预案指引）；O005/O006 细节落档（write_paths 生成器、verify_commands、check_signoff 文件/流程格式留待 spec 细化）；E6 知识入库 `docs/knowledge/evolve/<run_id>.md`（含机制映射引用、落地 diff、verification）。
- **验收要点**:
  - file_exists：`docs/knowledge/evolve/run-<run_id>.md`（含 goal/intent/diff/verification，E6 门禁）
  - command：`npm run build && npm test`（文档层不引入测试破坏）
  - D 三项交接问题有落档修正（manual）

---

**依赖图**：`01 → 02 → {03, 04}`（chunk-03/04 可并行）

**风险提示**：chunk-03 允许的最小 code 修复须与 chunk-02 处置结论一致（避免"修了却记 缓"）；write_paths 已限定 test 文件域，防越层污染（对应 ERR-03）；E6 文件建议在 chunk-03 全绿后再定型（verification 字段要填真实结果）。