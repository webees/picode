# prime-agent 深度研究（源码级 · 2026-08-13）

> 监督者 clone 源码（github.com/PrimeIntellect-ai/prime-agent @ depth-1）研读。
> 来源文件：packages/coding-agent/docs/{architecture,daemon,compaction}.md + README + 源码。

## 1. 进程拓扑（daemon/worker/kernel）

- **supervisor**（常驻守护）：公共 socket、客户端 attach、路由、跨 agent 消息投递、worker 健康监控、命令日志、协调更新。不执行 provider/工具/kernel
- **resident worker**：每个 root session tree 一个独立进程（root AgentSession + scheduler + kernel + RLM 子会话）——**崩溃隔离：一个 worker 崩只影响一个 root**
- **恢复阶梯**：worker 崩溃 → 250ms/1s/5s 重试，三次失败标记 failed；supervisor 消失 → 某 worker 抢原子启动租约拉起替代 supervisor → **收养 live workers**
- 关闭 TUI 只 detach 客户端，不杀 worker；`shutdown --force` 终止无响应进程组

## 2. Compaction（上下文压缩）

- 触发：contextTokens > contextWindow - reserveTokens（默认 reserve 16384）
- 结构化摘要格式 + **文件操作累计跟踪**；/tree 分支切换时 branch summarization 保留上下文
- 对比：picode 的 window 压缩是机械折叠（am/pm 窗口 window_rollup），无语义摘要

## 3. Refine（自改进 · 对应 picode E6）

- /refine + auto-refine：agent_end 时同步运行（print/headless 自主运行模式）
- **model-backed review gate**：自动 refine 的审查决策默认由模型执行
- 小步、证据支持的更新到 harness 状态（补充提示/记忆/技能描述/子 agent 规格）
- 从不重写不可变基础系统提示；**快照记录支持回滚**
- 对比：picode E6 是人工写 knowledge/evolve/<run>.md；prime-agent 是轨迹→自动提炼 lesson

## 4. RLM 编程模型

- 持久 IPython kernel = 模型面对的控制环境；typed host requests 返回权威操作给 TS session
- 子 agent = rlm() 函数调用（可并行/后台，程序化取结果）
- 对比：picode 子 agent = 独立 task/spawn（已覆盖，机制不同）

## 5. Skills

- 可导入 Python 包；skill creator 把重复工作流沉淀为项目/个人技能

## 6. Storage（会话持久化）

- **Session JSONL + artifacts**：全会话转录落盘（provider 调用/工具/compaction/goals）
- 对比：picode PICODE_TRANSCRIPT_DIR 已定义但 serve 会话不写（空置）

## 7. Autonomous（自主模式）

- turn/token/time 预算；用户定义 quality gates
- 语义：**gate 只验证它验证的东西；达到限额 ≠ 任务成功**（与 picode evidence gate 哲学一致）

---

## picode 可学习映射（供 ind-res/run-lead 验证与深化）

| # | prime-agent 机制 | picode 现状 | 映射建议 |
|---|---|---|---|
| P1 | worker 进程隔离 + 恢复阶梯（250ms/1s/5s + supervisor 收养） | ERR-01/02/04：serve 挂起/断连/重启丢上下文 | opencode 适配层：serve 失联自动重建会话 + 重试阶梯 + 重投喂 ready 消息（C2 watchdog 升级为自动恢复） |
| P2 | Compaction 语义摘要（阈值触发 + 文件累计） | bus window_rollup 机械折叠 | window 压缩引入语义摘要层（docs cell 模型总结） |
| P3 | auto-refine + model review gate + 快照回滚 | E6 人工写纪要 | E6 升级：轨迹→自动提炼 lesson（L0/L1 层），run-lead 审批门 |
| P4 | Session JSONL 全持久化 | PICODE_TRANSCRIPT_DIR 空置 | serve 会话转录归档（ERR-04 缓解：重启后可 rehydrate 上下文） |
| P5 | skills 可导入包 + creator | skills_root D055 死键 | 激活 skills_root + skill 沉淀（接 O005/E3 后） |
| P6 | quality gate 语义 | evidence gate 同哲学 | 已一致，无需改 |
