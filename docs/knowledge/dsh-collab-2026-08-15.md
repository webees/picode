<!-- 会话协作记录。source: DSH 会话（DeepSeek Harness，cordis preset）· date: 2026-08-15 → 2026-08-16 · 状态：归档。不属于任何 self_evolve run；供后续 run-lead / 文档小组参考。 -->

# DSH 会话协作记录（多智能体工坊 + picode 质量工程 + 设计检查）

> 本文件沉淀一段外部协作会话（DeepSeek Harness 与 picode 项目）的完整记录：DSH 侧搭建的多智能体开发预设、
> 对 picode 源码的一轮全面质量工程（已被后续 self_evolve run 吸收演进）、以及对最新自主演进设计的检查意见。

## 1. 背景

- 协作方：DSH（DeepSeek Harness）会话，先运行于「创造模式」（cordis）preset，后转检查 picode 设计。
- 时间线：约 2026-08-13 → 2026-08-16；仓库经历一次路径迁移（`~/Desktop/iOS/picode` → `~/Desktop/picode`）。
- 与并行 self_evolve run 的关系：会话期间有多个自治 run 并行推进（D089 水位机制起），本会话的代码改动以
  独立提交共存于 main，后由并行 run 的基线演进自然融合/修正。

## 2. 阶段一：DSH 侧「多智能体工坊」预设（picode 之外的产物）

- 目标：让 DSH 主会话具备运行「多智能体开发流程」的能力（需求确认 → 规划组队 → 并行开发 → 巡检交接 →
  解散评分 → 再规划；含文档小组 / 调研小组 / 知识库）。
- 交付：`~/.dsh/.agent-presets/picode-studio/`（Agent preset）——
  - 主会话 = 工程主责 + 技术统筹 + 会话调度三位一体；
  - 11 个岗位子代理工具（squad-lead/engineer/sdet 三角 + product/research/people/docs/proc-audit/
    sys-arch/code-review/release-eng），机械 deny web（仅调研岗）/用户通道/目标工具/编排工具；
  - `picode-workflow` 技能手册（SKILL.md + roles/artifacts/knowledge 三份参考），六阶段流程 + 双门闩 +
    评分公式（对齐 16 §9.2）+ 知识库布局；
  - 多轮 `standingKeyFor` 挂载验证通过；真实子代理现场演示验证机制真实性（并抓出模板评分 bug）。
- 与本仓库的关系：仅借鉴 picode 规范（terminology/PROCESSES/spec 16/17）作流程口径；不落本仓库代码。

## 3. 阶段二：picode 质量工程（已由后续 run 吸收）

5 个并行审计面产出 148 条问题（P0×2 / P1×46 / P2×100），按 P0→P1→P2 分层修复，共 20+ 个提交。
**其中多项被后续 self_evolve run 以更优语义修正或重构**（见 §4 演进对照），本记录保留原始成果供溯源。

### 3.1 已修复类别与代表性项

| 类别 | 代表项 |
|---|---|
| 路径安全（P0/P1） | chunkId/agentId/room/taskId 逃逸 ×4；repo_write/repo_read fail-closed + resolveInCwd 边界 |
| glob 语义 | matchGlob/simpleGlobMatch 两套实现分歧 → 统一为段级标准语义（**后被 D100 按层分组修正**） |
| 状态机 | goal / change_order 迁移校验 + 幂等（**后被 D104 扩展为 revision CAS + activation + 回合预算**） |
| evolve 排除 | `!` 前缀排除 + forbidden_paths 统一为排除集（**后被 D100 按层分组修正**） |
| 并发 | chunks.yaml / hr pool-ledger-score 补锁；withFileLock 陈旧锁恢复（pid+时间戳+超龄接管） |
| 容错 | readJsonl 逐行容错（**后被薄壳并入重构**）；applyEvent/guardianTick 单事件容错；feed.mjs 假 posted 修复；progress 损坏抛错 |
| 去重 | briefApproved 单一判据；readYamlDir 目录样板；delay() 三份 → timing.ts；captureTools 公共化；监督脚本 lib.mjs；dashboard 9×Alert → ErrorState |
| 前端 | 监控面板 8 端点自动刷新；runId 响应式；liveError 降级；-1120 行死代码；tab URL 同步；phase 进度映射收敛；BadgeVariant 单一类型 |
| 测试修正 | 5 处固化旧行为的断言更正（evolve E2、T13 room 安全、audit 状态构造、mcp NOT_FOUND、extension glob） |

### 3.2 验证

- 后端：每批修复后全量 `npm test`（HOME 隔离）全绿；本会话终点 489 测试。
- 前端：每步 `vue-tsc` + `vite build` 通过。
- 并行 run 演进后基线：502/502（D099-D103 终态）→ 562/562（D104-D108 终态）——已覆盖并超越本会话成果。

## 4. 阶段三：最新设计检查（D095-D108）

检查范围：`docs/plans/` 最新规划（run-11-14 checkpoint 三面 / run-01-12 Bug A+B / run-02-30 DSH 四 C）+ DECISIONS 详条 +
continuable 蓝图（D107），并实测验证关键实现落地（evolve.ts `isEvolveWritePathAllowed`、config.ts `cloneValue`、
run-store.ts goal 增量字段）。

### 4.1 演进对照（本会话成果 → 后续 run 修正）

| 本会话原始实现 | 后续 run 修正 | 评价 |
|---|---|---|
| evolve 排除：扁平并集 + 全局排除优先 | **D100 按层分组判定**（`isEvolveWritePathAllowed`：路径 ∈ 某层 includes ∧ ∉ 该层 excludes；forbidden_paths 全局否决） | ✅ 更正确：`layers=[knowledge,docs]` 时 docs 层 carve-out 不再误拒 knowledge 层；且保留「docs 单层仍拒」回归保护 |
| goal 状态机迁移表 + 幂等 | **D104**：revision CAS（`updateGoal(expectedRevision)`）+ activation armed/disarmed + rounds_started 预算 + 政策码 + `withSyncFileLock` | ✅ 大幅扩展：从「防非法跳转」升级为「并发围栏 + 续跑授权 + 预算天花板」 |
| readJsonl（新模块） | 薄壳并入 rules-engine.ts 单宿主 + merge.ts 跨引 | ✅ 减少模块面 |
| 死导出/夹具（审计清单项） | D102 ponytail 清理（roomDisplay/isPicodeError/canConsumeModel + 24 处夹具单源） | ✅ 覆盖 |

### 4.2 审查意见（6 条，供后续 run 参考）

1. **D104 锁统一**：`withSyncFileLock` 与 `withFileLock` 两套并存（协议等价、调用面不同）——建议未来统一时明确「同步调用面用同步锁」边界。
2. **D104 预算解锁路径未写明**：round-limit blocked 后的人工解锁方式（改 goal.yaml `max_goal_rounds`？显式 reset？）建议补入 operations。
3. **D106 read-before-edit observed 集进程模型**：observed 为「extension 进程内」——若多会话共享进程会跨会话串扰；D103 每-worktree 自链暗示进程隔离，需确认每会话独立进程。
4. **D107 I1 与 D104 续跑合并**：下轮实现最大风险（两套续跑逻辑），建议第一优先级收敛进 continuation.ts。
5. **D108 遗留**：mcp `registry.test.ts` 标题仍写「20 spec-09 tools」——措辞性，顺手可更名。
6. **D100 边角**：`splitEvolveGlobs` 保留为导出（展示面），确认无生产路径仍依赖旧的扁平并集全局排除判定。

## 5. 后续建议

- 下轮候选（按 D107 蓝图 I1-I7）：续跑投喂语义分级、resume API 接线（sleep 保留替代 DELETE）、
  三道围栏（深度/写集继承/所有权）——实现时优先 I1 与 D104 续跑逻辑合并。
- 本会话的 6 条审查意见可作为下一轮 run-lead 的输入（编号走 D089 水位流程）。

## 6. 参考

- 会话中的提交与文件均在 picode main 历史（被并行 run 演进覆盖后以最终实现为准）。
- 关联文档：`docs/DECISIONS.md`（D095-D108）、`docs/plans/continuable-subagents-blueprint.md`（D107）、
  `docs/knowledge/evolve/run-2026-08-15T01-12-43-3NZ.md`（E16）、`run-2026-08-15T02-30-00-DSH.md`（E17）。
