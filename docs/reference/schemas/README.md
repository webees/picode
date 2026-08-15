# Schemas 索引

形状样例（非运行时唯一实现源；字段语义以对应 spec 为准）。

|文件|用途|相关规范|
|------|------|----------|
|[goal.yaml](./goal.yaml)|目标|01 · PROCESSES P01 · **字段 `user_confirmed_at` = sponsor 确认时间**|
|[run-root.yaml](./run-root.yaml)|run 根元数据|01|
|[chunks.yaml](./chunks.yaml)|分块|01 · P02|
|[task.yaml](./task.yaml)|任务|01 · P05–P07|
|[triad.yaml](./triad.yaml)|实现三角绑定|16 · 17|
|[staffing-request.yaml](./staffing-request.yaml)|用工单|16 · P04|
|[staffing.yaml](./staffing.yaml)|编制锁定|16 · 双门闩|
|[work-brief.yaml](./work-brief.yaml)|工作简报元数据|P03|
|[session.yaml](./session.yaml)|会话花名册条目|**17**|
|[progress.yaml](./progress.yaml)|进度汇报|P06|
|[evidence-pass.yaml](./evidence-pass.yaml)|证据通过|P07 · 04|
|[handoff-acceptance.yaml](./handoff-acceptance.yaml)|交接验收|P07|
|[request-info.yaml](./request-info.yaml)|资料申请|P08|
|[change-order.yaml](./change-order.yaml)|需求变更|P12|
|[members.yaml](./members.yaml)|房间成员|bus-system · 02|
|[bus-envelope.yaml](./bus-envelope.yaml)|消息信封|10 · bus-system|
|[cell.yaml](./cell.yaml)|cell 模板片段|02 · 13|
|[config.yaml](./config.yaml)|项目配置摘录|13 · [default-config.example.yaml](../default-config.example.yaml)|

**约定：**

- 样例用抽象占位（`module-a`、`task-chunk-a`），领域中立（I1）。  
- 实现以代码 + 上表「相关规范」为准；样例落后时改样例，不改规范精神。  
