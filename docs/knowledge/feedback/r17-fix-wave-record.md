# R17 修复波留痕（run-2026-08-16T09-30-00-EFFICIENCY）

> 目的：让 picode 知识库完整知道本轮（R17）全部调整——环境修复、机制修复、流程纪律、新机制。
> 后续 run 规划/招聘/巡检必须引用本文（与 DOC-LIFECYCLE、process-quickwin-r17 衔接）。
> 来源：sponsor 指令「全面检查 picode 所有隐患和 bug，全面修复一波，把调整记录下来让 picode 知道」。

## 1. 环境层修复（仓外，DSH runtime-commands）

| 项 | 调整 | 状态 |
|---|---|---|
| node/npm/npx 入 PATH | 软链至 `~/Library/Application Support/DSH Desktop/runtime-commands/bin/`（子代理 PATH 含此目录） | ✅ 已生效（探针实证 v26/npm 11） |
| rg/ripgrep 入 PATH | 同上软链（修子代理 glob/grep 的 `ripgrep launch failed`） | ✅ 已生效 |
| 会话默认 cwd 失效 | **未修（DSH harness 层）**：子代理不带 workdir 时 bash 仍 `spawn ENOENT`。**唯一解药 = 所有子代理 bash 显式带 workdir**（R17 全部 prompt/人设强制，实证有效） | ⚠️ 治本待 DSH 侧 |

## 2. 机制层修复（已合并入 main）

| 项 | 落点 | 说明 |
|---|---|---|
| M2 工具探测 | orchestrator/src/pi-adapter.ts（probeCoreTools 纯函数）+ core errors.ts TOOL_ENV_BROKEN + PicodeError.details | wakeAgent spawn 前探测 bash/node/npm/git；缺失→结构化拒绝。P2-1 补 isFile() 排除目录 |
| M4 工作房门闩 | task.ts（assertWorktreeExists/prepareTask）+ pi-adapter.ts wakeAgent spawn 前拒绝 | WORKTREE_MISSING 中文提示；**canonical 布局 = `<root>/.picode/worktrees/squad-<taskId>`（顶层）**——worktreePath 已对齐（E5 P1 裁决，22ed0a7） |
| 签收门 | scripts/merge-gate.sh [1] 加 acceptance accepted_by 非空检查 | R4 签收先于合并硬门禁 |
| review 版本化 | merge-gate.sh [5] 检查 docs/reviews/<task>-e5*.md 已 tracked | 杜绝 review 未提交误导后续分析（R16 教训） |
| 测试假绿 | scripts/test-iso.sh dashboard vitest 缺失→fail=1 | 不再静默跳过后 exit 0 |
| 巡检词边界 | scripts/tour-check.sh `grep -qw BLOCKED` | 修 UNBLOCKED 误报 |

## 3. 流程纪律（本轮执行 + 规范落点）

| 纪律 | 执行情况 | 规范载体 |
|---|---|---|
| spawn 前工作房真实存在核验（git worktree list + 冒烟） | ✅ R17 全程 | process-quickwin-r17（W3 落档） |
| 巡检三查（progress 增量 / git status+log / evidence），废除 commit subject 扫描 | ✅ R17 全程（toolchain 首提交 56243e2 即带 task id） | tour-check.sh 已固化 |
| 2 轮零产出→红灯、3 轮→接管（先三查核验） | ✅ R17 金汤队 3 轮内接管验证 | W2 watchdog 机制化（M1） |
| 接管留痕（变更单式 + merge.yaml + review） | ✅ toolchain/env-gate 均走 merge.yaml + review 提交 | process-quickwin-r17（W3 落档） |
| 评分回路闭合（scores + talent 聚合） | ⏳ R17 收尾执行（people 评分） | 收尾 checklist（W3 落档） |

## 4. 新机制：知识自主整理（D119 预留）

- **scripts/kb-triage.mjs**：零依赖 node，四维评分（复用性/新颖性/信号强度/行动关联 0-2 分）+ 一票规则（引用保护/字节重复检测/永久保留类/流水账 >50KB 上限）→ 判定 STORE（≥6）/ STAGING（4-5）/ IGNORE（≤3）；`--dry-run` 默认、`--apply` 生成报告 `docs/knowledge/feedback/kb-triage-<run>.md`；**永不删除文件**（忽略项由 docs 移 .trash/ 二次确认）。
- 首跑（R17）：57 候选 → 34 STORE / 18 STAGING / 4 IGNORE（自动发现 2 份重复 evolve 纪要、codename-ledger 低信号）。
- 流程：docs 小组每 run 收尾运行；STAGING/删除候选批量上报 run-lead 一次审批多条；存储类自主执行。
- 让 picode 自主决策：存什么（可复用/新知识/高信号/行动关联）、忽略什么（噪音/流水账/过时/重复），run-lead 不再逐项拍板。

## 5. 已确认待修（W2 watchdog 并入 / 后续）

- P1-2 命令队列消费（rules-engine.ts drain 至多一次）→ W2
- P1-3 guardian 顶层错误边界（self-drive.ts）→ W2
- P1-5 supervise 陈旧路径（/Users/x/Desktop/iOS/picode、/tmp/picode-dogfood）→ W2
- P1-7 maxTurns 无重置（session-store.ts）→ W2
- P1-1 陈旧偷锁破坏 merge 串行化（atomic.ts staleMs + merge.ts）→ 后续轮
- P1-4 chunks.yaml 并发丢失更新（addChunkAndTask 加锁）→ 后续轮
- P2-12 dashboard 轮询门控（visibilityState）→ 后续轮
- serve 会话 GC（D109 遗留，10,836 会话）→ 独立立项

## 6. 教训沉淀（供招聘/巡检引用）

1. **会话级工具故障随机性**：同 run 内不同子代理会话 bash 可用性不同（R17 六席四席中招、斫轮全程正常）——团队韧性 = 队内分工自愈（bash 好的接管实测）+ 诚实打回（不伪造）+ run-lead 接管预案。人设必须含开工自检与 workdir 纪律。
2. **路径物理/逻辑差异**：macOS /tmp→/private/tmp、/var→/private/var 符号链接导致路径比较误判（D4、E5 P1 同型）——比较前统一 realpath/pwd -P。
3. **git 布局约定必须单一事实源**：worktreePath 曾假设带 runId 段而实际全部顶层 squad-<taskId>——canonical 由 paths.ts + worktree-setup.sh + 契约测试三方锁定。
4. **review/合并记录必须版本化**：未提交的 review 会误导下一轮根因分析（R17 plan 曾据此误判）。
5. **HOME 隔离必须无条件**：~/.picode/config.yaml（opencode.enabled=true）会污染测试（24 假红先例）；test-iso.sh 已固化 mktemp HOME。
