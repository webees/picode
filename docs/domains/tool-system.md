# 领域：工具系统与写集

矩阵权威：[spec/09-tool-profiles.md](../spec/09-tool-profiles.md)。  
代码默认（`@picode/core` tool-profiles）MUST 与 09 语义一致；冲突时以 **09** 为准并改代码。  
强制：[spec/04-enforcement.md](../spec/04-enforcement.md)。  
威胁：[spec/12-threat-model.md](../spec/12-threat-model.md)。

## 1. 默认拒绝

未列入 `tool_profile.allow` 的工具 **MUST** 拒绝，返回结构化错误码。

## 2. 三层写安全

| 层 | 机制 |
|----|------|
| L1 工具 | 仅 `repo_write`；路径 ∈ write_paths |
| L2 隔离 | cwd = task worktree |
| L3 门禁 | handoff/merge 前 `git diff` ⊆ write_paths |

## 3. 关键限制

| 能力 | 谁 |
|------|-----|
| web_* | 仅调研 doer |
| 业务 write | 默认仅 engineer |
| run 命令 | `run_allowlisted` + acceptance 登记 |
| bare bash | 默认禁止 |

## 4. 监督席

sdet / docs-qa / people-qa / proc-audit：**默认无业务 repo_write**。  
SHOULD 配置独立 `check_model`。

## 5. 错误码

`TOOL_DENIED` · `TOKEN_INVALID` · `WRITE_PATH_DENIED` · `ROOM_POST_DENIED` · `COMMAND_NOT_ALLOWLISTED` · …

## 6. 实现

- 画像：`@picode/core` `tool-profiles.ts`  
- 扩展：`@picode/pi-extension`  
- 配置覆盖：spec/13 `tool_profiles`  
