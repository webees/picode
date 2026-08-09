# 领域：信息控制（专一 · 过滤 · 防幻觉）

**步骤权威：** [PROCESSES.md](../PROCESSES.md) **P03、P08、P09、P11**。

## 1. 目标

实现组 **专一干活**；信息不自由流通；降低串台与幻觉。

## 2. 信息进入工作组的仅有合法路径

1. **工程主责批准的 work brief**（文档小组组装）  
2. **工程主责批准的 packet / inbox**（资料申请流水线）  
3. **本 task write/read 集与 public_contract**  
4. **人事批准的人设 persona**（任务约束，非外部情报全文）  

其它路径（私自 web、扫全仓、串 work 房）**MUST NOT**。

## 3. 工作简报链路（摘要）

工程主责签发 → 调研可供料 → 文档组装/校对 → 工程主责 approve → spawn。  
详见 PROCESSES **P03**。

## 4. 资料申请链路（摘要）

`request_info` → 文档队列 →（可选调研）→ 工程主责 approve/redact/deny → 文档打包 inbox。  
详见 PROCESSES **P08**。

## 5. 跨房

默认禁止；`request_cross_room` → 工程主责批准并在场监督 → 临时 `meeting-*` → 到期撤权。  
详见 PROCESSES **P09**。

## 6. 文档小组角色

记忆、知识库、下发包、向工程主责 Memory Brief：见 [spec/15-docs-cell.md](../spec/15-docs-cell.md)。

## 7. 配置

```yaml
info_pipeline:
  require_run_lead_review: true
cross_room:
  require_run_lead_present: true
work_brief:
  require_run_lead_approval: true
  require_docs_assemble: true
```
