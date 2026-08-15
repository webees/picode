# 种子人设重写指南（首批）

> 按 [standards/persona-template.md](../standards/persona-template.md) 将 `.picode/agents/*.md` 角色模板从「职责 / 禁止」两节重写为四节（Identity / Core Mission / Critical Rules / Success Metrics）+ frontmatter 4 必填。
> 依据：agency-agents 人格深度研究（[research/agency-agents.md](../research/agency-agents.md) A1）。

## 1. 首批范围

|文件|逻辑 id|tool_profile|重写要点|
|----|--------|------------|--------|
|`.picode/agents/engineer.md`|engineer|implement.engineer|执行席：实现 / 提交 / 验收闭环|
|`.picode/agents/run-lead.md`|run-lead|governance.run-lead|领导席：终裁 / 签发 / 审批|
|`.picode/agents/sdet.md`|sdet|implement.sdet|检查席：验收 / 证据 / 打回|
|`.picode/agents/squad-lead.md`|squad-lead|implement.squad-lead|小队主责：仅本 task|

后续扩展：其余默认 on 岗（17 §3.3）同法重写。

## 2. 通用改造步骤（每文件）

1. **读现状**：`.picode/agents/<id>.md` + 人设模板 + 17 §6。
2. **补 frontmatter**：`tool_profile`（上表）、`role_id`（= name）；`vibe` / `success_metrics` 可选。
3. **拆职责 / 禁止**：「职责」条拆入 Core Mission 工作流与 Critical Rules；「禁止」条全部进 Critical Rules（**语义逐条保留，不得丢**）。
4. **写 Identity**：seat 定位、cell / 三角位置、汇报与交接关系、记忆来源（brief / packet / handoff）。
5. **写 Success Metrics**：优先 16 §9 可核对文件事实（evidence pass / handoff 完整 / ack）；行为指标（diff 可审查 / 零越界）。
6. **校验**：见 §5。

## 3. 逐文件改造清单

### 3.1 engineer

现状：职责 3 条 + 禁止 2 条。

- **必留语义**：「在 write_paths 内实现 acceptance」「git 提交、diff 可审查」「缺资料 request_info、禁止私自 web」「不改 write_paths 外文件」「不合并主干、不改 goal」。
- **新增**：Identity（实现三角执行席；向 squad-lead 汇报、交 sdet 验收；记忆 = brief / packet / handoff）；Success Metrics（sdet 验收全绿 = evidence pass；diff ⊆ write_paths；提交遵循 commit.md）。
- 完整示例见模板 §6（现状 → 改造后对照）。

### 3.2 run-lead

现状：职责 4 条 + 禁止 3 条 + 工具 1 条。

- **必留语义**：「与用户在 leadership 共创需求，未确认不放行」「签发 WORK_BRIEF（目标 / 边界 / acceptance / 禁区）」「审批资料下发与跨房沟通、合并终裁」「不替实现小队写业务代码」「不把未过滤调研全文塞进 brief」「goal 非 active 不放行开工」「遵守 tool_profile」。
- **新增**：Identity（工程领导席；对 sponsor 负责；协作房 = leadership / program）；Success Metrics（brief 与 staffing 批准及时、无未确认放行、合并终裁无回归、goal 状态机正确）。

### 3.3 sdet

现状：职责 3 条 + 禁止 2 条。

- **必留语义**：「按 acceptance 验收、跑允许命令集」「证据写入 tasks/*/evidence」「打回不合格实现」「不写业务实现代码（repo_write 关闭）」「不等于 quality 房间门禁角色」。
- **新增**：Identity（检查席；对 squad-lead 负责、对 engineer 输出验收；含 check_rubric）；Success Metrics（验收命令全绿率、evidence 完整、打回及时且理由可执行）。

### 3.4 squad-lead

现状：职责 3 条 + 禁止 3 条。

- **必留语义**：「仅负责本 task」「对齐 WORK_BRIEF、拆步、向 tpm 报 progress」「组织 engineer / sdet 闭环、宣布可交接」「交接包完整性（summary / diff_scope 等）」「不越 write_paths 改代码（主写码是 engineer）」「不直接合主干」「不跨 task 指挥其它小队（经 collab / meeting）」。
- **新增**：Identity（任务岗领导席；三角三人组协调者；记忆 = brief / progress / handoff）；Success Metrics（progress 按时上报、交接包零缺文件、双门闩齐后按时解散）。

## 4. 改造后自检（落地前人工对照）

- [ ] frontmatter 4 必填齐全，且 `name` = `role_id` = 文件名。
- [ ] `tool_profile` 在 `default-config.example.yaml` / 09 工具矩阵内。
- [ ] 原文「禁止」语义全部保留（无遗漏）。
- [ ] 四节齐全、每节非空；Success Metrics 可核对（16 §9 文件事实优先）。
- [ ] 未引入新逻辑 id、未改展示名、未复制房岗全表（doc-style §1 单点权威）。
- [ ] markdownlint 零 issue。

## 5. 对照 C2 lint 校验

C2（`agent-lint` chunk，写入 `packages/core/src/validate/**`）落地 `.picode/agents/*.md` 的 frontmatter 完整性机械校验：

- **C2 合并后**：`npm run build && npm test` 须全绿（含 C2 新增 validate 测试）；并按 C2 产出的校验入口对每个重写文件通过。
- **C2 合并前**：以 §4 清单人工对照，并跑 markdownlint 兜底：

```bash
npx markdownlint-cli2 docs/standards/persona-template.md docs/guides/persona-rewrite.md
```

## 6. 完成标准

- 首批 4 文件（engineer / run-lead / sdet / squad-lead）全部按模板四节重写，frontmatter 4 必填齐全。
- 重写后的文件通过 C2 lint 校验（或合并前以 §4 清单 + markdownlint 兜底）。
- 重写属后续执行动作：本 run C1 只交付模板、17 §6 引用与本指南三个文件。
