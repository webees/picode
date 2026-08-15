# DSH 勘察初步笔记（run-lead 浅层，2026-08-15）

> 正式勘察以 sys-arch 的 dsh-source-survey.md 为准；本笔记为 run-lead 快速观察，供规划交叉验证。

## DSH 关键机制（浅读 dsh-agent-loop README 等）
1. **会话持久化 + resume**：`ctx.agents.resume({resumeSessionId})` 加载持久会话、重建历史、turn 编号续接——与 picode 的 transcript/session-store 可比，但 DSH 是"agent 运行时级"持久，picode 是"流程状态级"。
2. **turn/step 双层生命周期**：turn 边界开 durable turn，step 内只 claim next-step 输入；inbox 三原语 followup（next-turn FIFO）/steer（next-step）/inject（next-step 不唤醒）——精确的续跑控制。
3. **事件分类学**：agent/* 事件（created/session-start/inbox/spliced/pre-step…），所有 inbox 变更先发事件再改投影——事件溯源风格。
4. **事务化创建/发布仲裁**：同 id 并发 prepare，enter() 仲裁发布，败者回滚私有资源——无锁发布。
5. **maxParallelToolCalls 配置**（默认 10，1=串行）：工具并行度旋钮。
6. **插件系统**：cordis 插件/扩展点，新行为进插件不进核心循环——"Everything else is an abstract service or a plugin against extension points"。
7. **配置分层**：profile/插件行/快照感知配置解析（dsh-app-boot）——与 picode loadConfig 分层可比。
8. **原子写**：dsh-atomic-write（exclusive-create + rename + 权限）——picode 已有 writeAtomic（C2 写守卫），可比。
9. **bash 沙箱**：dsh-bash-sandbox + dsh-bash-local——权限模式/审批语义待 sys-arch 详读。
10. **goal/jobs/skill/subagent UI 包**：客户端有 goal/jobs/skills/subagents 管理面，说明这些是 DSH 一等公民机制。

## DSH 机制包清单（包名即机制清单，2026-08-15 补充）
- **goal 系统**：dsh-goal + dsh-goal-round-driver（跨轮自动续跑驱动！）+ dsh-command-goal + dsh-tool-goal + dsh-client-ui-goal
- **jobs 系统**：dsh-jobs + dsh-jobs-local + dsh-tool-jobs + dsh-client-ui-jobs（后台任务管理）
- **skill 系统**：dsh-skill + dsh-skill-filesystem + dsh-skill-badge + dsh-tool-skill + dsh-client-ui-skill（按需加载/徽章/文件系统存储）
- **subagent 系统**：dsh-subagent + dsh-subagent-in-process-driver + dsh-subagent-fork-in-process + dsh-subagent-spawn-in-process + dsh-client-ui-subagent（fork/spawn 两种派生子代理）
- **workflow**：dsh-client-ui-workflow-run（脚本化工作流运行）
- 对应 picode 现状：picode 有 goal.yaml（无跨轮 round driver）、sess-mgr（无 jobs）、skills/ 目录（无加载器）、无 workflow 脚本编排——差距明确

## 对 picode 的价值初步判断
- 高价值候选：持久 goal 跨轮跟踪（picode 有 goal.yaml 但无"跨轮自动续跑/超时/blocked 判定"语义）、skill 按需加载（picode skills/ 已有目录但加载机制待查）、后台 job 管理（picode 无 job 概念）、sandbox 权限审批（picode 写集靠纪律）
- 中价值：inbox/steer 续跑控制（picode 有 continuation 机制）、事件溯源（picode 有 event 引擎）
- 冲突点：DSH 是"agent 运行时中心"，picode 是"流程文件状态机中心"——集成应以"机制借鉴"为主，不照搬架构
