# 12 — 威胁模型与控制（最小）

## 1. 资产

|资产|说明|
|------|------|
|源码与密钥文件|仓库内秘密|
|主分支完整性|错误/恶意合并|
|用户意图|goal/acceptance|
|Agent 身份|冒充 lead/run-lead|
|外部情报|过时/投毒 brief|

## 2. 威胁 → 控制

|威胁|控制（规范引用）|
|------|------------------|
|实现三角擅自联网引入噪声/投毒|web 仅 `ind-res`；request_info 过滤（information-control, 09）|
|Prompt 注入（用户粘贴、网页、README）|下发包 redact；工作组只读 packet；工具白名单|
|越权改文件|write_paths + worktree + diff 门禁|
|冒充 agent post|agent_token（07§2）|
|跨房串通放大幻觉|跨房申请+工程主责监督（07§4）|
|监督自嗨放行|check 无业务写；evidence 机检；可选 check_model|
|恶意 postinstall / 测试脚本|run_allowlisted；禁裸 bash|
|密钥进日志|evidence 只存哈希；gitignore 大日志；read 默认排除 secret 模式路径|
|并行 merge 破坏主线|merge.lock 串行（07§8）|
|脏树强杀丢工作|auto-commit/stash backup（07§9）|
|draft 被静默 active|禁；park 默认（07§7）|

## 3. 秘密路径默认排除（SHOULD 可配）

```text
**/.env
**/.env.*
**/secrets/**
**/*credential*
**/*.pem
**/id_rsa*
```

`repo_read` 命中时拒绝或返回 redacted（配置 `secret_policy: deny|redact`）。

## 4. 调研安全

- brief MUST 含 URL + retrieved_at  
- 调研产出：`docs-qa` / `run-lead` MUST 可抽检来源  
- run-lead approve 前 MAY 要求 strip 可执行代码块再下发工作组  
