# 文档风格与维护规范

面向维护 picode 文档的 AI 与人类作者。分类定义见 [AUTHORITY.md](../AUTHORITY.md)。

## 1. 单点权威（禁止双源）

|内容|唯一正文|其它文件只许|
|------|----------|--------------|
|流程步骤 P01–P15|`PROCESSES.md`|「见 P0x」|
|agent 会话/唤醒/人设维度|`spec/17-agent-runtime.md`|不写第二套状态机|
|选项与 ★默认|`reference/decision-catalog.md`|改默认须回写权威正文|
|运行时术语（默认 on 房/岗）|`standards/terminology.md`|引用 ID，不复制全表|
|命名律 + 岗位全目录|`reference/glossary.md`|链到 §0 / 对应节|
|全局不变量|`spec/08-invariants.md`|引用 I 编号|
|文档小组编制|`spec/15-docs-cell.md`|`02` 一行登记|
|人事编制|`spec/16-hr-cell.md`|`02` 一行登记|
|配置键形状|`spec/13` + `reference/schemas`|不写第二套默认表|

**改完检查清单：** 是否在第二处粘贴了房间全表 / 角色全表 / 流程步骤？有则删。

## 2. 文件放置

|内容|放哪|
|------|------|
|不变量、状态机、强制、配置、缩放、威胁、工具矩阵|`spec/`|
|流程步骤|根目录 `PROCESSES.md` only|
|Git / Bus / 工具 / 信息控制（厚）|`domains/`|
|术语权威|`standards/terminology.md`|
|全量岗位目录、选项表、样例 YAML|`reference/`|
|上手、一页架构|`GETTING_STARTED` / `ARCHITECTURE`|
|Pi 最短路径|`guides/`（不重复安装长文）|
|决策一行|`DECISIONS.md`|

## 3. 写法

1. **表优先、短句**；步骤用编号或 `text` 流程图。  
2. **MUST 可测试**：强制句应对应 playbook Txx 或单测。  
3. **领域中立**：无具体业务案例关键字（I1）。  
4. **现行 only**：正文只用 terminology/glossary 已列逻辑 id 与现行设计；不写演进史、对照旧方案。  
5. **链接相对路径**；不写死绝对本机路径。  

## 4. 索引文件

|文件|角色|
|------|------|
|`spec/03-workflows.md`|流程编号 → PROCESSES 的纯索引|
|`spec/06-platform-tech.md`|选型摘要 → domains|
|`spec/07-hardening.md`|硬化摘要 → domains / 04 / 08|

索引 **MUST NOT** 重新展开步骤正文。

## 5. 版本

- 状态与配置：`schema_version: "1"`。  
- 破坏性变更：升版本 + DECISIONS 一行。  
