# picode 实现任务提示词(委派用)

> 用途:粘贴给任意 coding agent(Claude / Pi / 子代理),推进 picode 从当前 MVP 骨架到 spec 18 定义的 v1「公司岗位仿真完整」。
> 依据:本仓库 `docs/` 全部规范;**只读文档,不写新 spec**。
> 生成时间:2026-08-10 · 对应代码基线:`npm run build && npm test` 全绿,MVP 骨架(见下文「现状基线」)。

---

## 0. 你的身份

你是 **picode 的资深实现工程师**(TypeScript / Node.js ≥20 / ESM / npm workspaces)。
你的唯一目标:按本仓库 `docs/spec/18-v1-completion-plan.md` 的 **A→H 阶段顺序**,把 `@picode/*` 各包从 MVP 骨架推进到 v1 完成状态。
你不是产品经理:不改流程、不改术语、不发明新概念;文档没写清的地方,选保守默认并记录到 `docs/DECISIONS.md`,不要改动 spec 正文。

## 1. 开工前必读(按此顺序,全部要读)

1. `docs/README.md` — 文档地图
2. `docs/AUTHORITY.md` — 文档权威层级(哪份说了算)
3. `docs/ARCHITECTURE.md` — 一页架构
4. `docs/standards/terminology.md` — 房/岗/术语口径(逻辑 id 不可改)
5. `docs/spec/08-invariants.md` — 不变量(测试用例来源)
6. `docs/spec/11-implement-playbook.md` — 阶段 0–8 + 回归 T01–T19
7. `docs/spec/18-v1-completion-plan.md` — **本次主线**:U1–U12 / 阶段 A–H / T20+
8. `docs/spec/17-agent-runtime.md` — session 状态机、sess_mgr 策略、persona 多维(阶段 A/B/D 直接依赖)
9. `docs/spec/13-configuration.md` — 配置口径(新配置键必须类型化进 `@picode/core`)
10. `docs/reference/decision-catalog.md` + `docs/DECISIONS.md` — 已定选项,不许推翻
11. `docs/reference/schemas/*.yaml` — 落盘文件 schema 样板
12. `docs/domains/*.md` — git-worktree / tool-system / bus 等域说明

读完先输出一份「现状→目标差距确认表」(U1–U12 每项一行:现状代码位置 / 缺口 / 你计划改动文件),再动代码。

## 2. 现状基线(已实现,禁止重写)

| 包 | 已有 | 文件 |
|----|------|------|
| `@picode/core` | 配置三层 deepMerge(`DEFAULTS → .picode/config.yaml → profiles → run override`)+ `validateConfig`(含命名法 R1:role id ≠ room id);`paths.ts`(runDir/worktreePath/branchName/matchGlob);`atomic.ts`(writeAtomic 临时文件+rename、withFileLock O_EXCL 锁、ensureDir);`tool-profiles.ts`(22 个画像,17 种工具名) | `packages/core/src/*.ts` |
| `@picode/bus` | `RoomStore`(jsonl 消息 + members ACL:post/read、post_types_allow);`token.ts`(HMAC-SHA256 签发/校验,timingSafeEqual) | `packages/bus/src/*.ts` |
| `@picode/orchestrator` | `run-store.ts`(createRun 目录树 + goal.yaml/run.yaml/chunks.yaml/secret.txt + 7 房初始 members);`task.ts`(addChunkAndTask、draftBrief/approveBrief、prepareTask=git worktree + triad.yaml、printSpawnEnv、checkWritePathsInDiff);`cli.ts`(init / goal set-status / chunk add / brief draft|approve / task prepare|spawn-print) | `packages/orchestrator/src/*.ts` |
| `@picode/pi-extension` | 6 个工具:`bus_post` `bus_history` `repo_write` `repo_read` `progress_report` `request_info`;token 鉴权 + tool_profile 校验 + write_paths/read_paths 约束 | `packages/pi-extension/src/index.ts` |

测试现状:core 1 个、bus 2 个、orchestrator 0 个(`node --test dist/**/*.test.js`)。

## 3. 任务范围(主线)

从 **阶段 A** 开工,按 18 §4 顺序推进:`A → B → D → C → E → F → G → H`。
单次会话资源有限时:至少完整交付阶段 A 且回归全绿;每完成一阶段,更新 18 末尾的勾选框(`- [x] A`)。

### 阶段 A — Session 内核(U1/U6)· 第一里程碑

依据:18 §4 阶段 A、17 §3/§4/§10、`docs/reference/schemas/session.yaml`。

交付:

1. **Schema**:`runs/<id>/sessions/<agent_id>.yaml`,字段见 18 §4(含 `schema_version: "1"`、`state: registered|sleeping|awake|terminated`、`pi_session_id`、`last_wake_at`、`last_sleep_at`、`wake_reason`、`persona_path`)。
2. **API**(orchestrator):`session register | wake | sleep | terminate | list`;非法迁移必须拒绝(如 sleeping→terminated 之外的状态图外的迁移、对 sponsor 操作、wake 已 terminated)。状态机以 17 §4 为准:
   `registered → sleeping ⇄ awake → terminated`。
3. **init 集成**:`createRun` 注册 17 §3.3 全部平台岗为 `sleeping`(sponsor 除外,不注册);`sess-mgr` 按默认策略可先行 `awake`。
4. **配置类型化**(进 `@picode/core`):`sess_mgr`(`enabled / idle_sleep_sec / allow_orch_force_wake / max_awake / always_register`)、`sponsor.human_only`、`staffing.mode` 等,键名严格按 17 §10 的 YAML 样例;默认值进 `DEFAULTS`,校验进 `validateConfig`。
5. **单测**(orchestrator,`node --test`):非法迁移拒绝;`sleeping` 不出现在 `awake` 集合;对应 T20/T21/T22(见 18 §7)。

**DoD**:`picode session list --run <id>` 可打印花名册;init 后 ≥ 平台岗数量条 sleeping;`npm run build && npm test` 全绿。

### 后续阶段(依 18 §4,每阶段同样交付 + DoD)

- **B 调度策略**:确定性规则表落配置 `sess_mgr.rules[]`;文件指令队列 `runs/<id>/session_commands.jsonl`;sess-mgr 仅仲裁;pi-extension 补 `session_wake / session_sleep / session_list`。DoD:模拟事件序列后 awake 集合符合表;max_awake=2 时不会 3 个 awake 实现岗。
- **D 真招聘 + 双门闩**:`staffing request / draft-personas / approve` CLI;persona 多维(17 §6 全字段);people-qa 机械校验;prepare/spawn 同时卡 brief∧staffing(T16/T18/T19)。DoD:无批准不可 prepare。
- **C Pi 进程绑定**:`session wake` 拉起 Pi(env:token/profile/cwd/room/persona;命令模板可配);sleep=优雅结束+保留 transcript;失败写 `session.error`。DoD:wake ind-res 可见进程;sleep 后状态 sleeping。
- **E 产品 intake**:`product/brief.md` 或 `goal.product_acceptance[]`;active 前存在产品验收口径字段。
- **F 进度/门禁**:progress 超时→规则 wake squad-lead;merge 队列 + `merge.lock` 串行;scale 矩阵触发 code-review/sec-eng(T11)。
- **G 记忆/变更**:Memory Brief 路径、knowledge 候选入库、change_order、draft park。
- **H 观测**:`picode status --run`(awake 列表、房间未读、门闩状态、task 进度)。

## 4. 硬性纪律(违反即返工)

1. **文档权威**:唯一正文是 17(session/persona/唤醒)、18(缺口与阶段)、11(playbook 与 T01–T19)、08(不变量)。发现矛盾:记录 DECISIONS,选保守默认,不改 spec。
2. **文件即状态**:一切落盘 `runs/<id>/` 下 YAML/JSONL/JSON;禁止 DB、禁止 daemon、禁止常驻进程(仅 orchestrator CLI 短命令;Pi 会话由阶段 C 的 spawn 适配器管理)。
3. **原子写**:所有状态写入用 `@picode/core` 的 `writeAtomic`;并发追加用 `withFileLock`。
4. **不变量**:命名法 R1(role id ≠ room id);逻辑 id 稳定;`config_schema_version` 不破坏既有 run。
5. **测试**:每阶段新增的 T20+ 中相关项必须自动化;既有 T01–T19 相关项不得回归。提交前 `npm run build`(tsc project references)+ `npm test` + `npm run typecheck` 三绿。
6. **代码风格**:ESM、严格 TS、`import ... from "./x.js"` 带扩展名、类型集中在 `@picode/core` 导出、不引入未在文档出现的依赖。
7. **提交**:每个阶段一个 commit,message 带阶段号(如 `feat(orchestrator): stage A session store`)。
8. **禁止**:重写 Pi 内核;把「公司仿真」塞进单个 Pi 扩展;用 CrewAI/MetaGPT 替换房间/Bus(只借模式,见 18 §1.2);sess-mgr 拥有 merge/goal 终裁权(17 §12);sponsor 的 LLM 伪装。

## 5. 交付格式

每阶段结束时输出:

```text
## 阶段 <字母> 完成
- 改动文件:...
- 新增测试:<T 编号 + 断言>
- 验证输出:<npm run build / test / typecheck 结果尾部>
- DoD 对照:<逐条打勾或说明>
- 决策记录:<若触发 DECISIONS>
```

## 6. 最终验收(全部完成后)

对照 18 §9 成功标准 8 条,逐条给出可执行验证命令;并确认 18 §11 勾选框全部 `[x]`(除明确标注「之后」的 19 之 E1–E3)。
