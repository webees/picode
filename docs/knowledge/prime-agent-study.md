# prime-agent 机制研究（L0 知识 · run-2026-08-12T18-50-35-123Z）

> 来源：run-lead/sys-arch 会话决策（监督者落盘）。原始研究输入：
> docs/problems/2026-08-13-intake.md 第二节；ind-res 联网取证待申请（webfetch deny）。

## 总纲

prime-agent = 单 agent 长时自主（持久 REPL + Continual Harness + daemon 进程隔离）；
picode = 公司仿真 + 机械编排 + 文件真相。取其解决已知痛点者，弃其与不变量冲突者。

## 值得借鉴（优先级排序）

1. **心跳 + 断线重连 + 会话 rehydrate**（daemon 持久化的轻量替代）→ 修 ERR-01/02/04
2. **task 级 checkpoint**（/refine 快照回滚的 picode 版；复用 window 压缩机制；
   快照只读、文件为准）
3. **技能包**（skills_root 激活 + skill creator，接 O005/E3 后）
4. **turn/token 预算**（并入 progress sweep 细化）

## 不适合

- daemon/worker/kernel 常驻进程 + 持久 goal（违背「无 daemon、状态文件化」）
- rlm() 递归子 agent（picode 已有独立 task/spawn）
- 自主模式替代双门闩/人类终裁（sponsor 永远人类）

## 详细评估

**sys-arch 评估（prime-agent 机制 × picode）**

总纲：prime-agent 是「单 agent 长时自主」哲学，picode 是「公司仿真+机械编排+文件真相」。取其可解决已知痛点者，弃其与现有不变量冲突者。

**值得借鉴**

1. **daemon 持久会话/重附** → 直接命中 ERR-01/02/04（serve 挂起、断连 loop 停、重启丢上下文）。但 D037/D039 明确「无 daemon」，全量引入与「编排器无 LLM、CLI 驱动」冲突。折中：给 opencode 适配层加心跳+断线重连+会话 rehydrate（D057 统一 wakeAgent 基础上），落盘继续复用以防重做。
2. **/refine 快照回滚** → picode 有 git 回滚与 merge.abort，但无「会话思维/记忆中间态快照」。可复用 window 压缩机制做 task 级 checkpoint。**风险**：快照与「文件才是真相」双源分歧，须定义快照只读、文件为准。
3. **质量门** → picode 已有更强机械门禁（双门闩、E4 verify_commands、code-review/sec-eng、progress 超时），prime-agent 的 turn/token 预算仅作细化项并入 progress sweep，低风险。
4. **技能系统** → picode skills_root 为 D055 死键、仅 L0 knowledge 与人设 skills[] 字段。技能包+skill creator 正合 19 的 L0 沉淀，落地为「可导入包」，接 O005/E3 之后做。
5. **agent 互通信** → Bus 已覆盖且更严（token/ACL/type 注册表/跨房批准）；仅借「互发现」= 目录服务（members 已注册，低成本）。

**不适合**

- **daemon/worker/kernel 进程隔离+持久 goal**：引入常驻进程=新单点与崩溃面，违背「无 daemon、状态文件化」。以心跳重附替代。
- **子 agent 递归 rlm()=函数调用**：与真招聘独立会话+机械调度冲突；picode 的子 agent=独立 task/spawn，已有覆盖。
- **自主模式替代双门闩/人类终裁**：sponsor 永远人类+run-lead 终裁是产品不变量，不可让位。

**优先级**：① 心跳重附（修 ERR-01 后）→ ② 会话 checkpoint → ③ 技能包 → ④ 预算细化。风险最高为 ①② 触及「文件真相」与 serve 单点，需先定义快照只读边界。
