# 产品与运行时决策目录（选项 + 默认）

**用法：** 每项 = 可选项 + **★ 当前默认（已拍板或历史约定）**。  
改默认须：更新本表 + DECISIONS 一行 + 相关权威正文（勿只改对话记忆）。

**Agent 细节唯一正文：** [spec/17-agent-runtime.md](../spec/17-agent-runtime.md)  
**未完成实现策划：** [spec/18-v1-completion-plan.md](../spec/18-v1-completion-plan.md)  
**流程唯一正文：** [PROCESSES.md](../PROCESSES.md)  
**术语 on 表：** [standards/terminology.md](../standards/terminology.md)

---

## 0. 图例

| 标记 | 含义 |
|------|------|
| ★ | **当前默认（已定）** |
| ◐ | 已定方向，实现未完成 |
| ○ | 可选，未启用 |

---

## 1. 产品目标与范围

### 1.1 v1 主目标

| 选项 | 说明 |
|------|------|
| A. 最小可合并链路（S 单 PR） | 先通工程，仿真后补 |
| **B. 公司岗位仿真完整** ★ | 岗位/房间/调度/招聘齐全后再谈极简裁剪 |
| C. 多 goal 组合管理 | program 级 |

**已定：B。** 见 17-agent-runtime §2。

### 1.2 产品房

| 选项 | 说明 |
|------|------|
| 不要产品房 | 产品意图挤在 leadership |
| **要产品房 `product`** ★ | 产品口径与工程终裁分离 |

**已定：要。** 默认 post：`pm`；sponsor/run-lead 按成员表。

### 1.3 领域中立

| 选项 | 说明 |
|------|------|
| **规范与 prompt 领域中立** ★ | 无绑定具体业务案例关键字（I1） |
| 绑定样例业务域 | 便于演示，污染通用性 |

**已定：中立。**

---

## 2. 人类与会话

### 2.1 sponsor

| 选项 | 说明 |
|------|------|
| **永远是人类** ★ | CLI/UI；不跑模型 |
| 允许 LLM 扮演 sponsor | 仿真赞助方（验收失真） |

**已定：永远人类。** `sponsor.human_only: true`。

### 2.2 默认 on 岗是否全是 LLM 会话

| 选项 | 说明 |
|------|------|
| 否：仅核心岗 LLM，其余规则化 | 省会话 |
| **是：on 岗全部注册为 LLM 会话** ★ | 仿真完整；用调度控成本 |
| 混合：部分岗无 LLM 纯脚本 | 如 people-qa 规则引擎 |

**已定：是（LLM 会话）。** 控制手段 = **sess-mgr 唤醒**，不是减岗。

### 2.3 会话数量控制

| 选项 | 说明 |
|------|------|
| 靠减少 on 岗 | 与「仿真完整」冲突 |
| **总管理 AI 决定唤醒/休眠** ★ | `sess-mgr` |
| 固定时间片轮转 | 简单但蠢 |
| 纯人工点名唤醒 | 不适合自动 run |

**已定：sess-mgr。** 细节 17 §4–§5。

### 2.4 sess-mgr 权限

| 选项 | 说明 |
|------|------|
| **只能 wake/sleep/terminate + 只读状态** ★ | 无 goal/merge 终裁 |
| 可代批 brief | 权过大 |
| 可改 goal | 禁止 |

**已定：调度权 only。**

### 2.5 同时 awake 上限

| 选项 | 说明 |
|------|------|
| 无上限 | 易打满配额 |
| **`max_awake` 调度目标（默认 8）** ★ | 非成本熔断；超限则排队 sleep |
| 硬熔断停 run | 与「成本不熔断」冲突 |

**已定：软上限 8（可配）。**

---

## 3. 编制与生命周期

### 3.1 平台 cell 寿命

| 选项 | 说明 |
|------|------|
| **per-run** ★ | 每 run 新建；知识沉 `knowledge` |
| 跨 run 常驻会话 | 状态难清理 |
| 全局单例平台 | 多 run 串味 |

**已定：per-run。**

### 3.2 实现三角来源

| 选项 | 说明 |
|------|------|
| 预置固定三人 | 无人设 |
| 模板三人 + 补丁 | 半真 |
| **真招聘：多维人设（hire_fresh）** ★ | people cell 完整 |
| pool_reuse（复用旧 persona 模板） | **不推荐**；仍须批准与 people-qa |

**已定：真招聘 + hire_fresh。** 维度见 17 §6；pool 见 16 §7。

### 3.3 双门闩

| 选项 | 说明 |
|------|------|
| **brief 批准 ∧ staffing 批准 才 spawn 实现三角** ★ | 安全默认 |
| 仅 brief | 无人设 |
| 仅 staffing | 无工作边界 |

**已定：双门闩。**

### 3.4 三三制

| 选项 | 说明 |
|------|------|
| **凡激活环节必须 Lead/Doer/Check** ★ | 可 scale 折叠但换帽留痕 |
| 双人即可 | 弱检查 |
| 仅实现三角三三制 | 平台岗放羊 |

**已定：三三制推广。**

### 3.5 S/M/L

| 选项 | 说明 |
|------|------|
| **保留 S/M/L；影响门禁与并行，不取消仿真岗注册** ★ | 岗仍在；唤醒更勤/更懒 |
| S 删除平台岗 | 与仿真完整冲突 |

**已定：scale 调策略，不删花名册。**

---

## 4. 工程与隔离

### 4.1 状态存储

| 选项 | 说明 |
|------|------|
| **文件 + atomic write（jsonl/yaml）** ★ | 可审计、可 diff |
| 嵌入式库（如 SQLite） | 不采用 |

**已定：文件。**

### 4.2 并行写码

| 选项 | 说明 |
|------|------|
| **每 implement task 一 git worktree** ★ | |
| 单工作区加锁 | 并行差 |
| 容器级隔离 only | 仍要 git 策略 |

**已定：worktree。**

### 4.3 合并

| 选项 | 说明 |
|------|------|
| **串行 merge 列车** ★ | merge.lock |
| 并行合 main | 危险 |

**已定：串行。**

### 4.4 成本熔断

| 选项 | 说明 |
|------|------|
| **不因成本自动杀任务** ★ | 可用 max_awake 软限流 |
| 预算耗尽 halt | 可选未来 profile |

**已定：不熔断。**

### 4.5 工具与 Bus

| 选项 | 说明 |
|------|------|
| **Tool Bus + token + 房间 ACL** ★ | |
| Agent 直写 messenger | 禁止默认 |

**已定：Bus + token。**

### 4.6 信息控制

| 选项 | 说明 |
|------|------|
| **request_info → 过滤 → packet；实现岗禁裸 web** ★ | ind-res 可 web |
| 全员可 web | 污染上下文 |

**已定：申请制。**

### 4.7 跨房

| 选项 | 说明 |
|------|------|
| **run-lead 批准 + 监督；meeting-* TTL** ★ | |
| 自由串房 | 禁止 |

**已定：批准制。**

---

## 5. 文档与知识

### 5.1 记忆所有权

| 选项 | 说明 |
|------|------|
| **文档小组三人；对 run-lead 汇报** ★ | |
| 实现三角自维护 README | 禁止作为唯一记忆 |

**已定：docs cell。**

### 5.2 知识沉淀

| 选项 | 说明 |
|------|------|
| **跨 run → knowledge 房 + 仓库 knowledge/skills 路径** ★ | |
| 只存在 run 目录 | 难复用 |

**已定：knowledge 沉淀。**

### 5.3 work brief

| 选项 | 说明 |
|------|------|
| **run-lead 签发；docs 组装；可选 ind-res 供料** ★ | |
| 小队自写 brief | 禁止默认 |

**已定：签发制。**

---

## 6. 命名与文档

### 6.1 命名

| 选项 | 说明 |
|------|------|
| **企业四字 + 命名律 R1–R7** ★ | glossary §0 |
| 任意昵称 | 易混 |

**已定：命名律。**

### 6.2 文档单源

| 选项 | 说明 |
|------|------|
| **PROCESSES / terminology / 17-agent-runtime 分权** ★ | AUTHORITY |
| 多处复制步骤 | 禁止 |

**已定：单源。**

---

## 7. 编排形态

### 7.1 双进程

| 选项 | 说明 |
|------|------|
| **orchestrator 无 LLM + Pi 会话有 LLM** ★ | |
| 单一巨型 agent | 难隔离 |

**已定：双进程。**

### 7.2 进度

| 选项 | 说明 |
|------|------|
| **squad-lead 定时 progress** ★ | 默认间隔可配 |
| 无进度 | 难调度 |

**已定：progress。**

### 7.3 Draft 空闲

| 选项 | 说明 |
|------|------|
| **park（默认）** ★ | |
| stop | |
| run_lead_advance | 仍须 sponsor 确认（除非危险开关） |

**已定：park。**

---

## 8. 门禁（scale 矩阵 · 可调）

| 检查 | S ★默认 | M | L |
|------|---------|---|-----|
| evidence + chunk done | MUST | MUST | MUST |
| code-review 会话 | SHOULD 唤醒 | MUST | MUST |
| sec-eng | 风险触发 | 风险触发 | MUST |
| 串行 merge | MUST | MUST | MUST |

**说明：** 岗仍 registered；是否 awake 由 sess-mgr + 上表。

---

## 9. v1 核心已定项（摘要）

| # | 决定 |
|---|------|
| 1 | 产品房 `product` |
| 2 | v1 = 公司岗位仿真完整 |
| 3 | on 岗全 LLM 会话 + `sess-mgr` 唤醒/休眠 |
| 4 | sponsor 永远人类 |
| 5 | staffing 真招聘 + 多维人设 |
| 6 | 平台 cell per-run；知识进 knowledge |

---

## 10. 自我进化（self_evolve）

权威正文：[spec/19-self-evolution.md](../spec/19-self-evolution.md)

### 10.1 是否启用

| 选项 | 说明 |
|------|------|
| **启用能力设计，默认 run 仍为 delivery** ★ | `self_evolve.enabled=true`，`default_kind=delivery` |
| 默认每个 run 都是 self_evolve | 危险，不采用 |
| 完全不做自我进化 | 不做 dogfood |

### 10.2 默认可写层

| 选项 | 说明 |
|------|------|
| **knowledge + prompts + docs + tests** ★ | 先 E1–E2 |
| 含 code | E3，显式打开 |
| 含 policy | E4，sponsor 双确认 |

### 10.3 合入

| 选项 | 说明 |
|------|------|
| **sponsor 确认 merge** ★ | |
| 仅 run-lead | 不满足「人类赞助」精神 |

### 10.4 成熟度起点

| 选项 | 说明 |
|------|------|
| **E0 人工 dogfood → E1 知识 → E2 文档/提示 → E3 代码** ★ | 依赖 18 完成至 G |
| 直接 E3 | 不推荐 |

---

## 11. 可调软默认

| 项 | ★ 默认 | 其它选项 |
|----|--------|----------|
| max_awake | 8 | 4 / 12 / 无上限 |
| idle_sleep_sec | 600 | 300 / 1800 |
| intake 并行 ind-res | true | false |
| orchestrator force wake | true | false |
| S 是否少注册平台岗 | **否**（全注册，靠 sleep） | 是，少注册 |
| 多 goal | 不做 v1 | 后续版本 |
| 成本预算 profile | 无 | 可选扩展 |
| self_evolve.allowed_layers | knowledge,prompts,docs,tests | +code / +policy |
