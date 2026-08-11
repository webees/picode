# 运行错误记录模板

> 主责：docs 三角（文档工作组）。规则见 run-lead 下发的《运行错误收集机制》。
> 落盘：`docs/errors/<YYYY-MM-DD>.md`，每条错误一个区块，编号 `ERR-<YYYYMMDD>-NN`。
> 状态机：`collected → triaged → fixed → verified → closed`。

## 区块模板（复制下面每行）

```md
## [ERR-YYYYMMDD-NN] 一句话简述

- **type**: E-SERVE | E-CURL | E-PATH | E-CTX | E-APPROVAL | E-OTHER
- **time**: 本地时间（含时区）
- **trigger**: 触发 agent / 会话 id
- **severity**: P0(阻塞全局) / P1(任务卡死) / P2(瑕疵)
- **scene**: 现场快照 —— 当时 cwd / worktree / 会话状态 / 未 commit 工作
- **impact**: 影响范围（哪些任务 / 会话 / 数据受损）
- **trace**: 证据链（日志 / bus refs / 复现命令）
- **status**: collected
- **fix**: 关联修复任务卡（id + 链接）；默认 `—`
```

## 类型编码

| 编码 | 含义 | 典型归属 |
|---|---|---|
| E-SERVE | serve stream 挂起卡死 | sess-mgr / orchestrator |
| E-CURL | curl 超时 / 断连，会话 loop 停止 | sess-mgr / run-lead |
| E-PATH | repo_write 路径解析错（写到 serve cwd 而非 worktree） | engineer / 插件 |
| E-CTX | serve 重启导致会话上下文丢失 | sess-mgr / orchestrator |
| E-APPROVAL | 审批代理规则不匹配（命令组匹配瑕疵） | proc-audit / run-lead |
| E-OTHER | 其他 | 按需归集 |

## 流程速查

1. 发现 → docs 三角记 `collected` 区块（实时）。
2. 归类去重 → `triaged`。
3. bus `error.report`（refs=[错误ID]）→ 总工程师（run-lead）。
4. run-lead 建修复任务卡 → 分派 → 修复回报 `fixed`。
5. 验证（复跑原场景）→ `verified` → `closed`。
6. 日终 `error.digest` 汇总。

## 检查清单（入库前 MUST）

- [ ] 编号唯一、按日递增
- [ ] 五要素齐全：type / time / scene / impact / trace
- [ ] scene 快照可复现（含 cwd 与 worktree 路径）
- [ ] 未 commit 工作已标注（是否可恢复）
- [ ] P0 级已即时 bus 上报（不等日终）
