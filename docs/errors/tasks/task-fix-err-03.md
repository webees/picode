id: task-fix-err-03
title: 修复 repo_write 路径解析（E-PATH）— 写到 serve cwd 而非 worktree
source_error: ERR-20260812-03
severity: P2
status: triaged
priority: 3
assignee: engineer 插件 / 工具层
root_cause_hypothesis:
  - repo_write 以 serve cwd（主仓根）为基准解析相对路径，未映射到 task worktree
  - 已实时复现：本次会话 repo_write 落 `/tmp/picode-dogfood/docs/errors/` 而非 `.../worktrees/run-.../task-chunk-a/`
fix_scope: 供分派参考（先经 triage 确认）
acceptance:
  - repo_write 相对路径落到当前 task worktree（write_paths 内）
  - 写后 git status 在 worktree 可见，serve cwd 无污染
  - 越界路径拒绝并报错
linked_errors: [ERR-20260812-03]
created_at: 2026-08-12
