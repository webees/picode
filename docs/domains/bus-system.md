# 领域：Bus 通信系统

步骤：跨房见 PROCESSES **P09**；进度见 **P06**。  
消息类型目录：[spec/10-bus-messages.md](../spec/10-bus-messages.md)。  
强制校验：[spec/04-enforcement.md](../spec/04-enforcement.md)。

## 1. 分层

```text
Agent ──► Bus API（唯一）──► AuthZ(token+members) ──► RoomStore
                                                      ├─ file: runs/.../bus/<room>.jsonl
                                                      └─ optional: pi-messenger adapter
```

- Agent **MUST NOT** 直写 messenger/feed。  
- **Bus** = 产品边界；**messenger** = 可选存储。  

## 2. 身份

编排器 spawn 签发 `agent_id` + `agent_token`（HMAC）。  
`bus_post` MUST 校验 token；伪造 `from` 无效。

## 3. 成员

`rooms/<room>/members.json`：

```json
{ "room_id": "leadership", "members": [ { "id": "run-lead", "access": "post" } ] }
```

`access`: `post` | `read`。  
可选 `post_types_allow` 收紧 type。

## 4. 存储与并发

- 每房 append-only jsonl。  
- 写前对 `.lock` 做 flock。  
- 读可不锁。  

## 5. 包

`@picode/bus`：`RoomStore`、`issueToken`、`verifyToken`、窗口判定（`windowIdOf` / `groupByWindow`）。  
Pi 工具：`bus_post` / `bus_history`（`@picode/pi-extension`）。

## 5.1 上/下午窗口压缩

一天按 `windows.split_hour`（默认 12）分成上/下午两窗（`<date>-am` / `<date>-pm`）。  
`RoomStore.compressWindow` 把每个房间 jsonl 中**旧窗口**的最老 `1 - ratio`（默认 20%）消息折叠为一条 `window_rollup`（`meta.window / folded / kept / archive`），折叠原文追加归档到 `bus/archive/<room>.<window>.jsonl`（可审计，不丢数据）；保留最近 `ratio`（默认 80%）原文，**当前窗口不折叠**。压缩在 `.lock` 内整体重写 jsonl。

run 级入口：`picode window compress [--rooms a,b]` 汇总各房结果并写 `windows/<window>.yaml`（会话/记忆压缩产物）；`picode window status` 只读快照。  
消息类型 `window_rollup` 见 [10-bus-messages](../spec/10-bus-messages.md)。

## 6. 与房间逻辑 ID

代码与 bus 参数使用 **逻辑 id**（`leadership`、`program`…）。  
展示名来自配置 `display_name`（terminology + 13-configuration）。
