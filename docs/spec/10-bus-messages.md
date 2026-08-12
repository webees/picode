# 10 — Bus 消息类型目录

所有房间消息 MUST 使用下列 `type`（扩展 MUST 登记本表）。  
body 宜短；大内容用 `refs[]`。

## 1. 公共信封

```json
{
  "ts": "ISO-8601",
  "id": "msg-...",
  "from": "agent_id",
  "room": "room_id",
  "type": "progress",
  "body": "string",
  "refs": ["path-or-uri"],
  "reply_to": null,
  "meta": {}
}
```

## 2. 类型一览

|type|谁发|典型房间|meta 要点|说明|
|------|------|----------|-----------|------|
|`chat`|成员|任意||受控短讨论|
|`progress`|cell lead|task, work|phase, head_sha, blocked|定时进度|
|`status`|任意|work, task|task_status|状态变更通知|
|`blocked`|lead/doer|task, work|blocker|阻塞|
|`ready`|squad-lead|task, collab||可交接/可合并候选|
|`objection`|check/squad-lead|squad, collab, task||异议|
|`handoff_notice`|squad-lead|collab, task|task_id, packet|交接包就绪|
|`handoff_ack`|接收方|collab, task|acceptance_ref|确认交接|
|`request_info`|任意|docs|request_id|资料申请（亦可用 tool）|
|`info_delivered`|docs|squad, task|packet_path|下发包已送达|
|`request_cross_room`|任意|leadership|request_id|跨房申请|
|`cross_room_granted`|run-lead/orchestrator|leadership, meeting|room, ttl|批准|
|`cross_room_revoked`|orchestrator|leadership, meeting||TTL/结束|
|`research_brief`|ind-res|research, leadership|brief_path|调研简报|
|`drift` / `alert`|proc-audit|leadership|severity|红灯|
|`ingest`|knowledge|knowledge|skill_path|知识入库候选|
|`intake_triaged`|run-lead|leadership|feed_id, assigned_to|内部分诊已指派（sponsor 投喂 feed）|
|`doc_issue`|docs-qa|docs|severity|文档矛盾|
|`change_order`|run-lead|leadership, program|co_id|需求变更已下发|
|`work_brief_ready`|docs/run-lead|task, squad|brief_path, version|工作提示词已批准可 spawn|
|`work_brief_revised`|docs/run-lead|squad, task|brief_path, version|运行中 brief 修订|
|`memory_brief`|docs-lead|leadership|l2_path, risks|文档小组向工程主责汇报记忆面|
|`staffing_request`|run-lead|people|request_id|工程主责用工单|
|`staffing_propose`|people|leadership, people|staffing_path|人设呈报工程主责|
|`staffing_approved`|run-lead|people, task|staffing_path|可建组|
|`cell_done`|cell lead|本房, task|cell_id|环节完成待 check|
|`check_signoff`|check seat|本房|cell_id, result|监督签字|
|`merge_ready`|squad-lead/tpm|task, release|branch, sha|进入 merge 队列|
|`window_rollup`|orchestrator|任意|window, folded, kept, archive|上/下午窗口压缩摘要（替换被折叠的旧消息）|
|`system`|orchestrator|任意||系统通知|

## 3. progress（实现三角 MUST）

见 `reference/schemas/progress.yaml`。  
默认间隔 300s；连续 2 次无实质进展 → `at_risk: true`。

## 3.1 check_signoff 格式草案（O006 · C7）

- 提交方：docs cell 的 tech-writer；接收方：run-lead
- 文件：`runs/<run_id>/gates/check_signoff/<task_id>.yaml`
- 字段：`schema_version / task_id / checkpoints[]（{id, passed, at, by}）/ summary`
- 红灯记录：proc-audit 在 `runs/<run_id>/gates/violations.yaml` 追加 `{ts, rule, agent_id, detail}`；bus 通道 `drift`/`alert` 已就绪（成员表 `post_types_allow`），文件格式自本条目生效

## 4. 禁止

- 用 `chat` 冒充 `handoff_ack` / `check_signoff` / 合并批准。  
- 无 token 的 post。  
- 向非成员 room post（跨房须 granted meeting）。
