# picode 文件命名规范（Naming Convention · 2026-08-15）

> 性质：全仓命名规范（行业通用标准 × 极客风格 × 无歧义）。待 run-lead 审批 + sponsor 确认关键决策后执行重命名。
> 原则：**文件/目录 = kebab-case（行业标准）；短而准（极客）；同类同构（无歧义）**。

## 1. 通用规范（对齐 Node/GitHub/RFC 生态）

| 类别 | 规范 | 示例 |
|---|---|---|
| 源码/文档文件 | `kebab-case.md` / `.ts` | `decision-catalog.md`、`opencode-adapter.ts` ✓（已符合） |
| 目录 | `kebab-case` | `docs/knowledge/feedback/` ✓ |
| 测试文件 | `<name>.test.ts` | `staffing.test.ts` ✓（已符合） |
| 包名 | `@scope/kebab` | `@picode/orchestrator` ✓ |
| 环境变量/常量 | `UPPER_SNAKE_CASE` | `PICODE_SANDBOX_MODE` ✓（已符合） |
| 规范文档 | `NN-name.md`（RFC 编号前缀） | `00-product.md` ✓（spec 已符合） |
| 决策编号 | `D###` + 主题 | `D109` ✓ |

## 2. 需要修正的不一致（现网实测）

### 2.1 docs 一级目录：UPPER_SNAKE → kebab-case
```
ARCHITECTURE.md      → architecture.md
AUTHORITY.md         → authority.md
DECISIONS.md         → decisions.md
GETTING_STARTED.md   → getting-started.md
PROCESSES.md         → processes.md
README-index.md      → readme-index.md（或并入 README.md）
```
> 理由：目录内其他文件全 kebab；大写风格与 66 个 kebab 文件混用产生检索歧义；GitHub 上这类文档惯例为 kebab（如 vite/rollup 仓库）。

### 2.2 run 规划归档：超长时间戳 → 短 run 名 + 日期
```
2026-08-13-r1-continuation.md      → plans/2026-08-13-r2-goal-crossrun.md（历史归档：保留原名，仅新轮立规）
2026-08-14-r14-checkpoint-telemetry.md      → plans/2026-08-14-r16-checkpoint.md（同上）
```
> 历史归档**不重命名**（git 历史 + 引用链），只对**新轮**立规：`plans/<YYYY-MM-DD>-r<N>-<short-topic>.md`。

### 2.3 歧义文件名修正（现网）
| 现名 | 问题 | 建议 |
|---|---|---|
| `default-config.example.yaml` | "snippet" 语义含糊（是默认配置示例） | `default-config.example.yaml`（行业惯例 .example） |
| `pi-agent-study.md` | "prime" 歧义（Pi 平台？最优？） | `pi-agent-study.md`（若确指 Pi） |
| `dsh-collab-2026-08-15.md` | 日期后缀风格与 evolve/ 内 run-* 不一致 | `dsh-collaboration.md`（或保留，属历史） |
| `2026-08-12-parallel-org.md`（plans/） | 日期前缀无主题 | 历史归档保留 |

### 2.4 run 状态目录（.picode/ 已达标，保持）
```
goal.yaml / chunks.yaml / plan_draft.md / README.md / change_orders/ / approvals/ / reviews/ / handoff/ / brief/ / staffing/ / progress/
```
> 全部短名 kebab/underscore 单文件——极客且无歧义，**不改**。唯一可选：`plan_draft.md` → `plan-draft.md`（统一 kebab）。

## 3. 极客风格保留项（不改）
- `goal.yaml` / `chunks.yaml` / `SKILL.md` / `WORK_BRIEF.md` / `evidence.yaml` / `acceptance.yaml` —— 短名术语
- `guardian` / `triad` / `latch` / `gate` / `worktree` / `checkpoint` / `watermark` / `reserve/land` —— 行话
- `.picode/`（点目录）+ `runs/` + `worktrees/` —— 极客惯例

## 4. 执行方式（审批后）
1. `git mv` 逐文件重命名（docs 一级 6 文件）
2. `grep -rl "旧名"` 全仓更新引用（README、docs 索引、脚本、测试）
3. `npm run check` + 全量测试验证无断链
4. 提交：`refactor(docs): 命名规范统一（kebab-case）`

## 5. 待 sponsor 确认
- Q1：docs 一级 6 个大写文件是否重命名（影响 README/索引引用，需要全仓引用更新）？
- Q2：历史 run-*.md 归档是否保持原名（建议保持，仅新轮立规）？
- Q3：`plan_draft.md` → `plan-draft.md` 是否统一 kebab？
