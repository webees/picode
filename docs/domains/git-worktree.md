# 领域：Git Worktree 与合并

权威步骤见 [PROCESSES.md](../PROCESSES.md) **P05 / P07 / P10 / P14**。  
平台选型背景见 [spec/06-platform-tech.md](../spec/06-platform-tech.md)。

## 1. 为何用 Git

| 能力 | 用途 |
|------|------|
| worktree | 每 task 独立工作目录，并行不撞文件 |
| branch | `picode/{run_id}/{task_id}` 可丢可合 |
| commit | 进度可恢复、可审计 |
| diff | 写集铁门：`git diff --name-only` |
| merge | 仅 release-eng；串行 `merge.lock` |

对标：Claude Code `isolation: worktree`；Codex 并行 task 隔离副本。

## 2. 布局

```text
<repo>/
  .git/
  .picode/worktrees/<run_id>/<task_id>/   # cwd
  .picode/runs/<run_id>/                  # 状态（非 worktree 内）
```

- 实现三角 **MUST** cwd = task worktree。  
- 主工作区对实现三角默认只读。  
- 仓库 **MUST** 已是 git 仓（MVP）；否则 orchestrator 拒绝 init。  

## 3. 生命周期

| 事件 | 动作 |
|------|------|
| prepare | `git worktree add -b <branch> <path> <base>` |
| 正常解散 | 干净提交后 `worktree remove`；分支保留至 merge 或 TTL |
| 强制解散 | WIP auto-commit 或 stash → backup ref → `remove --force` → prune |
| failed | 同上 + 分支移 `picode/failed/...` 或 backup ref |
| merge | 持 `merge.lock`，拓扑序逐个 merge/rebase，失败 abort |

## 4. 并发边界

| 数据 | worktree 能否避免冲突 |
|------|------------------------|
| 业务源码 | 能（每 task 一树） |
| runs/ 状态与 bus | **不能** → atomic write + flock |
| 主线 merge | **不能** → 串行锁 |
| 同树内 lead/engineer | 工具分工：主写仅 engineer |

## 5. 其它 Git 洞

| 问题 | 策略 |
|------|------|
| 大日志 | evidence 日志 gitignore；yaml 存哈希 |
| 子模块 | 默认禁止改指针，除非 chunk 显式允许 |
| base 漂移 | merge 前 rebase（`rebase_on_merge`） |
| index.lock 残留 | 无进程且 age>60s 可清 |
| monorepo | write_paths 指包路径；独立 install |

## 6. 配置键

见 `git.*`（spec/13、schemas/config.yaml、run-root.yaml）。
