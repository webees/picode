# 审查记录 — task-chunk-toolchain（E5 审查门）

- task_id: task-chunk-toolchain（chunk-toolchain, W1, 无依赖）
- run: run-2026-08-16T09-30-00-EFFICIENCY
- 工作房: `.picode/worktrees/squad-task-chunk-toolchain`
- 分支: `picode/run-2026-08-16T09-30-00-EFFICIENCY/task-chunk-toolchain`
- HEAD: `83d4b09`（提交：56243e2 / fab7705 / 307613c / 84dca73 / 83d4b09，共 5 提交）
- 基线: `b0be509`
- diff: `git -C <工作房> diff b0be509..HEAD`（6 文件，+805/-1）
- 审查方式: 逐文件读 + 关键逻辑实机推演（sh -n 复跑、tour-check/env.sh 实跑、merge-gate [2] 端到端模拟、git-common-dir/worktree 状态核验、主仓/工作房 node_modules 布局核验）
- Reviewed-by: code-review（门禁层，E5 审查门）
- 审查日期: 2026-08-16

## 审查范围（write_paths 6 项，与 brief.yaml:4-10 逐字一致）

```
scripts/worktree-setup.sh   scripts/test-iso.sh   scripts/env.sh
scripts/merge-gate.sh       scripts/tour-check.sh package.json
```

## 0. 结论

**pass（批准）** — 无 P0/P1 阻塞项。P2（6 项）为非阻塞建议，P3（若干）为次要项；均不阻断合并，建议低成本项在后续轮次顺手修复。

## 1. CHECKLIST 逐项

- [x] 行为符合目标：acceptance 7 条逐条对照全部落地（详见 §2）
- [x] 边界与错误路径：worktree-setup 3 类失败路径（ev-13~15）、test-iso 失败传播（ev-21）、merge-gate FAIL 形态（ev-42）、tour-check 三形态（ev-50~52）均有实测
- [x] 输入校验在信任边界：基本达标（见 P2-1/P2-5 残留面）；无数据丢失路径
- [x] 改动有测试守护：evidence.yaml 26 项 command+exit_code+log_ref 真实可复跑；根 npm test 绿（ev-03，含 dashboard vitest 59 passed）；无 .only/.skip（不适用）
- [x] 文档同步：本 chunk 未涉 docs/（chunk-docs owner）；known_issues #5 与代码有出入（P3-8）
- [x] 无密钥/secret 入库；diff ⊆ write_paths（实测 `diff --name-only b0be509..HEAD` = 恰 6 文件）
- [x] 死代码：merge-gate 有 2 个死变量（P3-1）；无死分支/无用参数
- [x] 重复：locate_repo_root 在 merge-gate/tour-check 重复实现（可接受，跨脚本共享成本高于收益，P3 记录）
- [x] 过度设计：无（脚本均为单一职责、有真实调用方）
- [x] 度量：diff 规模 6 文件 +805/-1（新增 5 脚本 + package.json 1 行）

## 2. 验收对照（brief.yaml acceptance → 实现核验）

| acceptance | 实现 | 核验 |
|---|---|---|
| worktree-setup：add/复用 + 自链（pnpm 特例）+ tsbuildinfo 清理 + 冒烟 + 失败提示 + 幂等 | worktree-setup.sh:100-129（--new/复用）、159-243（自链）、245-254（清理）、256-276（冒烟） | 幂等实测两遍（ev-11/ev-d4fix-2）；D4 路径规范化已修复并 sdet 复验 4 项（ev-d4fix-1~4） |
| test-iso：mktemp HOME 隔离 + 先 tsc -b + 全量透传 + 退出码 0=通过 | test-iso.sh:47-58（隔离）、60-67（tsc -b）、74-102（6 包并行 + dashboard vitest）、96-109（退出码传播） | ev-20 全量绿；ev-21 坏参数 exit 1 不吞 |
| env.sh：node/npm 探测导出 + PATH 检查 + source 安全 | env.sh:37-53（探测/导出）、55-66（PATH 检查）、80-82（source return） | ev-30 source + 二次 source 幂等；实测 PICODE_ENV_OK=1 |
| merge-gate：evidence 齐 + diff ⊆ write_paths（--task）+ lint + 测试绿 + PASS/FAIL 清单 | merge-gate.sh:93-102、104-142、144-150、152-158 | ev-40 真实环境全 PASS exit 0；本审查端到端模拟 [2] 全 PASS |
| tour-check：三查 + 产出/无产出/异常 + 退出码非 0=有待关注；不解析 commit subject | tour-check.sh:73-110（三查）、123-161（判定/输出） | 实测 4 task 判定正确（toolchain=产出 commits(5) 等）；判定仅用 status/rev-list 计数，无 subject 扫描 |
| package.json：并入 dashboard vitest + 包级并行 + HOME 隔离 | package.json test → `bash scripts/test-iso.sh` | diff 仅 1 行；dashboard 经 `.bin/vitest run` 直调（已知取舍，known_issues #4，59 passed） |
| 脚本均有 usage；sh -n 过；npm test 绿 | 5 脚本头注释含 usage（env.sh -h 失效见 P2-3）；sh -n 5 脚本复跑全过；npm test 绿（ev-03） | — |

## 3. 关键逻辑推演结论

1. **方案 D 主仓安全（核实通过）**：根 node_modules 为工作房独立真实目录，依赖条目逐条软链；`rm "$WT_NM"`（190 行）仅删软链本身不触碰主仓；`find -delete`（249 行）默认不跟随软链；所有 rm/mkdir/ln 均在「已注册 worktree」校验（153 行）之后。实测工作房 node_modules/@picode 7 条链接全部指向工作房 packages；主仓各包无 package-local @picode 链接（无遮蔽）→ 跨包解析落工作房 dist，R16「读主仓旧 dist」根治成立。
2. **merge-gate diff ⊆ write_paths 可靠性（可靠）**：write_paths 读 brief.yaml 权威来源；精确字符串匹配；three-dot diff 基于 merge-base。实测 main 已前进 2 提交（b0be509→f4797fb），`git diff main...HEAD` 仍恰为 6 文件 → 不依赖 main 停留。仅残留 awk 过度捕获噪音（P2-4，方向安全：不造成假 FAIL/假 PASS）。
3. **tour-check 避免 R16 误报（达标）**：产出信号 = `git status --porcelain` 非空 ∨ `rev-list --count <merge-base main HEAD>..HEAD` > 0，全程不解析 commit message；merge-base 法对 main 前进稳健。BLOCKED 子串匹配有 UNBLOCKED 误报面（P2-6，方向安全：多报不瞒报）。
4. **package.json 改动最小（达标）**：diff 仅 `scripts.test` 一行；build/check/typecheck/picode/mcp/test:e2e/docs:lean 与 workspaces 均未动。
5. **bash 3.2 兼容（达标）**：宿主机 bash 3.2.57 实测运行 tour-check/env.sh；无 `${arr[-1]}`（test-iso 已修 pids[-1] 残留）、无进程替换（merge-gate 改临时文件）；`${arr[@]+"${arr[@]}"}` 空数组守卫、BASH_REMATCH、herestring 均 3.2 兼容；sh -n 5 脚本全过。

## 4. 问题清单（P0/P1/P2/P3）

### P0（阻塞）— 无

### P1（阻塞）— 无

### P2（非阻塞，建议修复）

1. **参数解析 shift 越界静默/裸错（worktree-setup.sh:65-67、test-iso.sh:35-36、merge-gate.sh:51-53、tour-check.sh:52-53）**：`--new`/`--task`/`--run` 等带值选项置于末尾时 `${2:-}` 得空串，`shift 2` 越界——set -e 脚本（worktree-setup/test-iso）以晦涩报错退出，无 set -e 脚本（merge-gate/tour-check）静默丢参数。建议取参后校验空值并输出可行动错误（exit 2），或 `shift 2 || exit 2`。
2. **usage() sed 行号越界打印裸代码（worktree-setup.sh:49、test-iso.sh:24、merge-gate.sh:25、tour-check.sh:25）**：实测 `--help` 尾部混入 `set -euo pipefail` 与 `usage() { ... }` 原始代码行（如 worktree-setup '2,50p'、test-iso '2,26p' 截断在 `}`）；行号硬编码，头注释增删即漂移。建议锚定 usage 段边界（如 `sed -n '/^# usage:/,/^# 退出码/p'`）或直接 `sed -n '2,/^[^#]/p'`。
3. **env.sh source 副作用与 -h 失效（env.sh:20、8-11）**：(a) `set -u` 在 source 模式下永久开启调用方 shell 的 nounset（source 安全声明未覆盖 shell 选项）；建议 `set +u` 前置或用 `${VAR:-}` 防御替代；(b) usage 注释声明 `-h|--help`，但脚本无参数解析，实测 `bash env.sh -h` 直接跑检查。
4. **merge-gate write_paths 提取无终止条件（merge-gate.sh:114）**：awk `f=1` 后持续捕获后续所有 `- ` 列表项，实测 WP=13 条（6 write_paths + 7 acceptance 噪音）。当前无害（噪音项永不等于真实文件名，不假 FAIL/假 PASS），但脆弱：建议遇下一顶层键（`^[A-Za-z_]+:`）即 `f=0`。另 write_paths 仅精确匹配、无 glob/前缀支持（当前 brief 全为精确文件，OK）。
5. **--new 入参无校验（worktree-setup.sh:65-67、106-108）**：`--new`/`--run` 含 `/`、`..`、空格等未拦截——`--new ../../x` 可令 TARGET 逃逸 worktrees 目录。实际风险被下游封死（git check-ref-format 拒绝含 `..` 分支名 → worktree add 失败退出；153 行注册校验在所有 rm 之前），但错误信息会误导。建议对 NEW_NAME/RUN_ID 做 `[^/[:space:]]` 校验并给出清晰错误。
6. **tour-check BLOCKED 子串误报（tour-check.sh:80）**：`grep -q "BLOCKED"` 对 `UNBLOCKED`、`BLOCKED 已解除` 均命中（实测确认），误判 异常(BLOCKED)。建议 `grep -qw BLOCKED` 或 `grep -Eq '\bBLOCKED\b'`。方向安全（多报不瞒报，exit 非 0 供人工研判）。

### P3（次要，记录不阻断）

1. **merge-gate 死变量（merge-gate.sh:94、100、109、119、135）**：`EVIDENCE_OK`/`DIFF_OK` 赋值后从未读取（CHECKLIST ponytail 死代码维度），实际机制是 FAILS 计数；建议删除。
2. **merge-gate 日志硬编码 /tmp（merge-gate.sh:146、154）**：`/tmp/merge-gate-check.log`、`/tmp/merge-gate-test.log` 并发运行互相覆盖；建议 mktemp。
3. **merge-gate base ref 失效误报「无 diff」（merge-gate.sh:123）**：`git diff ... 2>/dev/null || true` 吞掉 base 不存在错误 → 误报「无 diff（分支无提交？）」；建议先 `git rev-parse --verify` base。
4. **worktree-setup grep 正则元字符（worktree-setup.sh:114、153）**：`grep -q "worktree $TARGET"` 以 TARGET 作正则（路径含 `.`）；建议 `grep -Fq`。
5. **worktree-setup 复用模式提示矛盾（worktree-setup.sh:109-111 → 144-147）**：目录存在但非 git 仓库时先报「进入复用模式」再报「不是 git 仓库」；提示顺序可优化。
6. **test-iso REPO_ROOT 未 pwd -P（test-iso.sh:43）**：与 worktree-setup 的 D4 物理解析不一致；本脚本无物理路径比较故无害，建议统一。
7. **tour-check 空 tasks 目录伪条目（tour-check.sh:117-119）**：glob 无匹配时字面 `*` 进入循环产生伪 task 行；建议 nullglob 或匹配守卫。
8. **known_issues #5 与代码出入（known_issues.md:30）**：声称「tsbuildinfo 不再每次 find -delete」，但 test-iso.sh:65 每次运行均 `find packages -name "*.tsbuildinfo" -delete`；文档漂移，建议更正。
9. **PKGS 硬编码（test-iso.sh:71）**：6 包列表与 package.json workspaces 当前一致（✓ 无遗漏），未来加包需同步维护；可考虑从 workspaces 推导。
10. **根 tsconfig references 缺 mcp-server（存量，非本 diff）**：根 `tsc -b` 不重建 mcp-server，依赖其 test 脚本自带 `tsc -p` 预编译（当前成立）；「先 tsc -b 防 stale」对 mcp-server 依赖该前提，若该脚本将来去掉 tsc 步骤会回归。
11. **locate_repo_root 两脚本重复（merge-gate.sh:36-44、tour-check.sh:36-44）**：同一函数两份拷贝；跨脚本 source 共享成本高，当前可接受。

## 5. 审查证据（本审查独立复核项）

- `git diff --name-only b0be509..HEAD` = 恰 6 文件（write_paths 无越界）
- `sh -n` 5 脚本全过（复跑）
- `bash tour-check.sh <EFFICIENCY-run> --base main` 实跑：toolchain=产出(commits(5))/env-gate=产出/docs=无产出/watchdog=无产出 → exit 1（契约正确）
- `bash env.sh` 实跑：PICODE_ENV_OK=1、NODE_BIN/NPM_BIN 导出、PATH 含 node 目录
- merge-gate [2] 端到端模拟：awk 提取 + 6 文件匹配全 PASS（另确认 WP 含 7 条 acceptance 噪音）
- 主仓/工作房 node_modules 布局核验：工作房 @picode 7 链接全指向工作房；主仓无 package-local @picode 遮蔽；dashboard 无 @picode 依赖（pnpm 特例风险面为空）
- git-common-dir 核验：主仓内=`.git`、工作房内=绝对路径 → REPO_ROOT 推导两种场景均正确
- `git diff main...HEAD` 在 main 前进 2 提交后仍 = 6 文件（three-dot merge-base 稳健）
- usage() 输出实测：4 脚本 --help 尾部混入裸代码（P2-2）；env.sh -h 无帮助输出（P2-3）

## 6. 结论

**Reviewed-by: code-review（E5 审查门）**
**结论: pass（批准）** — 无阻塞级问题；acceptance 全项落地并有实测证据；主仓安全、diff 门禁、bash 3.2 兼容、语义正确性均独立复核通过。P2 建议（尤其 awk 终止条件、BLOCKED 词边界、usage 范围、env.sh source 选项副作用）可作为低成本 follow-up 在后续轮次或合并前顺手处理，不阻断本 task 合并。
