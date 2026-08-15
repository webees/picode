# picode 技术文档

**产品：** 通用多智能体编码运行时（Pi 生态）  
**读者：** 实现 AI / 工程师  
**状态：** 规范 + MVP 代码骨架  

权威与分类定义：[AUTHORITY.md](./AUTHORITY.md)

---

## 从这里开始

|#|文档|一句话|
|---|------|--------|
|1|[GETTING_STARTED.md](./GETTING_STARTED.md)|安装与 CLI|
|2|[ARCHITECTURE.md](./ARCHITECTURE.md)|一页架构|
|3|[PROCESSES.md](./PROCESSES.md)|流程 P01–P15 **唯一正文**|
|4|[standards/terminology.md](./standards/terminology.md)|运行时术语 **唯一正文**|
|5|[spec/08-invariants.md](./spec/08-invariants.md)|不变量 I1–I15|
|6|[guides/pi-quickstart.md](./guides/pi-quickstart.md)|Pi 最短路径|
|6b|[guides/mcp-quickstart.md](./guides/mcp-quickstart.md)|MCP 接入（D064）|
|7|[spec/11-implement-playbook.md](./spec/11-implement-playbook.md)|分阶段实现 T01–T19|
|8|[spec/18-v1-completion-plan.md](./spec/18-v1-completion-plan.md)|**未完成项落地策划**|
|9|[spec/19-self-evolution.md](./spec/19-self-evolution.md)|**自我进化（用 picode 升级 picode）**|

---

## 文档地图（按类）

### A · 权威（单源）

|文档|唯一负责|
|------|----------|
|[AUTHORITY.md](./AUTHORITY.md)|优先级、分类、用语|
|[PROCESSES.md](./PROCESSES.md)|全部业务流程步骤|
|[spec/17-agent-runtime.md](./spec/17-agent-runtime.md)|**agent 会话 / 调度 / 人设**|
|[spec/18-v1-completion-plan.md](./spec/18-v1-completion-plan.md)|**v1 未完成项策划（调研+阶段）**|
|[spec/19-self-evolution.md](./spec/19-self-evolution.md)|**自我进化：对象分层、门闩、准备清单、成熟度**|
|[standards/terminology.md](./standards/terminology.md)|默认 on 的术语 / 房 / 岗|
|[spec/08-invariants.md](./spec/08-invariants.md)|全局不变量|
|[standards/doc-style.md](./standards/doc-style.md)|文档维护规范|

### B · 规范 spec/

|文档|职责|
|------|------|
|[00-product](./spec/00-product.md)|产品边界|
|[01-runtime](./spec/01-runtime.md)|状态机、目录、主循环|
|[02-organization](./spec/02-organization.md)|三三制 + cell **登记**（细节→15/16）|
|[03-workflows](./spec/03-workflows.md)|**索引** → PROCESSES|
|[04-enforcement](./spec/04-enforcement.md)|强制校验（API 级）|
|[05-scaling-mvp](./spec/05-scaling-mvp.md)|S/M/L 与 MVP 切面|
|[06-platform-tech](./spec/06-platform-tech.md)|**索引** → domains|
|[07-hardening](./spec/07-hardening.md)|**索引** → domains / 04 / 08|
|[09-tool-profiles](./spec/09-tool-profiles.md)|工具矩阵|
|[10-bus-messages](./spec/10-bus-messages.md)|消息 type|
|[11-implement-playbook](./spec/11-implement-playbook.md)|实现阶段与测试|
|[12-threat-model](./spec/12-threat-model.md)|威胁模型|
|[13-configuration](./spec/13-configuration.md)|可配置体系|
|[14-pi-development](./spec/14-pi-development.md)|Pi 包开发手册|
|[15-docs-cell](./spec/15-docs-cell.md)|文档小组编制 **正文**|
|[16-hr-cell](./spec/16-hr-cell.md)|人事编制 **正文**|

### C · 领域 domains/

|文档|职责|
|------|------|
|[git-worktree](./domains/git-worktree.md)|Git 隔离与合并|
|[bus-system](./domains/bus-system.md)|Bus 通信|
|[tool-system](./domains/tool-system.md)|工具与写集|
|[information-control](./domains/information-control.md)|信息过滤|

### D · 参考 reference/（非流程权威）

|文档|职责|
|------|------|
|[glossary.md](./reference/glossary.md)|命名律 · 岗位全目录 · 分层|
|[decision-catalog.md](./reference/decision-catalog.md)|**选项 + ★默认**（历史拍板总表）|
|[schemas/](./reference/schemas/)|YAML 形状样例（[索引](./reference/schemas/README.md)）|
|[default-config.example.yaml](./reference/default-config.example.yaml)|默认配置摘录|

### E · 入口与指南

|文档|职责|
|------|------|
|[GETTING_STARTED.md](./GETTING_STARTED.md)|安装 + CLI 命令流（init → 双门闩 → spawn → 运维；全命令见 `picode --help`）|
|[ARCHITECTURE.md](./ARCHITECTURE.md)|一页图 + 包职责|
|[guides/](./guides/)|最短路径 + E2E 冒烟（不重复安装长文）|

### F · 追溯

|文档|职责|
|------|------|
|[DECISIONS.md](./DECISIONS.md)|决策一行意图（不写步骤）|

---

## 按任务查阅

|任务|读|
|------|-----|
|跑通 CLI|GETTING_STARTED（全命令 `picode --help`）|
|懂全局|ARCHITECTURE + PROCESSES §1|
|写编排器|01 · 08 · 11 · domains/git-worktree|
|写 Bus|domains/bus-system · 04 · 10|
|写工具|domains/tool-system · 09 · 12|
|状态机 / 流程|PROCESSES 全文|
|会话 / 唤醒|**17** + `session`/`staffing` 命令（GETTING_STARTED §5.1）|
|合并列车|**11 阶段 7 / 18 阶段 F** + `merge` 命令|
|窗口压缩|13 §8.1 / D043 + `window` 命令|
|自我进化|**19** + `evolve` 命令|
|文档小组|**15** + P03/P08/P11|
|人事招聘|**16** + P04/P05|
|可配置|13 + terminology + default-config.example.yaml|
|岗位目录 / 命名律|**glossary**|
|选项与默认|**decision-catalog**|
|agent 唤醒/人设|**17-agent-runtime**|
|怎么把缺口做完|**18-v1-completion-plan**|
|自我进化 / dogfood|**19-self-evolution**|
|术语争议|terminology（on）/ glossary（全量）|

---

## 权威优先级（摘要）

不变量 → PROCESSES → 17-agent → 术语 → 命名律 → 专题 → decision-catalog → DECISIONS

详见 [AUTHORITY.md](./AUTHORITY.md)。
