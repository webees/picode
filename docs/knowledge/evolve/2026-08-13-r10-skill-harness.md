# Evolve run-2026-08-13T23-50-59-484Z

- goal: Skill Harness 学习与激活：Agent Skills spec 融入 picode（skills_root 激活/SKILL.md 规范/persona 接线/渐进披露）
- kind: self_evolve · scale: M（run-lead 自主决策，宽松目标）
- baseline: main（50fdd0a 后）
- status: 已完成（C1 skill-spec 合并 = 884af8d；C2 skill-wiring 合并 = d5d3aeb + 冲突修复 3ddabcc；C3 本文档）

## Intent

从 anthropics/skills + agentskills spec 学习技能承载体系（Skill Harness），改 picode 自身：
`paths.skills_root` 是 D055 死键（声明零读取）、`Persona.skills[]` 必填维度但零消费、两个种子
SKILL.md 无校验守卫。product_acceptance：

1. 学习 Agent Skills spec（agentskills.io/anthropics/skills）并落地：SKILL.md 规范接入（frontmatter 校验）
2. skills_root 死键激活或明确决策
3. persona skills[] 字段接线（会话可携带技能）
4. 渐进披露机制（metadata→instructions→resources）
5. 校验工具或等价检查

## 决策要点（D084–D088）

- **D084 Skill harness 落地**（C1 skill-spec + C2 skill-wiring）：
  - **skill-lint**（`packages/core/src/validate/skill-lint.ts`，镜像 persona-lint 数据优先不抛错）：
    校验 `skills_root` 下全部 `**/SKILL.md` frontmatter——`name` 必填匹配 `SAFE_ID_RE` 且等于
    目录名、`description` 必填（>1024 仅 warning，agentskills 建议上限，兼容存量 ponytail）、
    `license`/`allowed-tools`/`compatibility`/`argument-hint`/`metadata` 白名单、未知键 warning
  - **skills_root 激活**：`packages/core/src/skills.ts` 新增纯模块（`resolveSkillsRoot`/
    `discoverSkills`/`buildSkillIndex`/`personaDeclaredSkills`），D055 死键局部解除（默认 `skills`
    不变，`validateConfig` 禁绝对/`..` 逃逸）；仅激活此键，其余死键不动；未配置时 harness 空转
    零行为变更
  - **persona skills[] 接线**：`buildPiEnv` 注入 `PICODE_SKILLS_INDEX`（全量目录）+
    `PICODE_PERSONA_SKILLS`（本会话声明路径），`buildReadyMessage` 系统 prompt 追加
    「可用技能（metadata）」+「本会话声明技能」两段；未知 skill 名标记 unavailable 不阻断
  - **渐进披露三层**：metadata（启动注入，有界截断 ≈100 tokens）→ instructions（激活时
    `repo_read` SKILL.md 正文）→ resources（按需读 scripts/references/assets）；**SKILL.md
    正文绝不进系统 prompt**（不爆 context、不进转录 → D076 stripNoise 无新负担）
  - **校验/等价检查**：`npm run check` 追加 skill-lint（persona-lint + skill-lint 双通过）；
    单测覆盖 discover/buildSkillIndex/personaDeclaredSkills + skill-lint 全错误码 + 路径逃逸拒绝
  - **种子声明**：`.picode/agents/engineer.md` 与 `run-lead.md` frontmatter 增 `skills: [ponytail]`
- **D085 缓项**：skills-ref 官方校验工具接入（npm 包需联网，picode 无裸网 D010；自研已覆盖等价语义）
- **D086 缓项**：skill 打包/导入双轨机械实现（M6 已文档约定，机械实现需网下载器）
- **D087 拒**：skill-creator / 评价循环（依赖 LLM 评价，超出承载体系边界）
- **D088 拒**：allowed-tools 机械强制（与 09 ACL 关系未定，仅解析不强制）

## Diff（2 chunk + docs，串行 merge 列车 D036）

- **C1 `task-skill-spec`**（884af8d）：`packages/core/src/skills.ts`（新模块）+ `skills.test.ts`、
  `validate/skill-lint.ts`（新 CLI + `SkillLintCode` 全集）+ `skill-lint.test.ts`、`config.ts`
  （skills_root 激活 + 相对路径校验）、`index.ts`（导出 skills）、`package.json`（check 接线 skill-lint）
- **C2 `task-skill-wiring`**（d5d3aeb + 冲突修复 3ddabcc）：`pi-adapter.ts`（buildPiEnv 注入
  `PICODE_SKILLS_INDEX`/`PICODE_PERSONA_SKILLS`）、`opencode-adapter.ts`（`renderSkillsSection`
  system prompt 追加 skills 段，无 env 逐字节不变）、`.picode/agents/{engineer,run-lead}.md`
  （frontmatter `skills: [ponytail]`）、对应测试（渐进披露正文不进 prompt 硬验证 / 无 env 零回归）
- **C3 `task-skill-docs`（本任务）**：DECISIONS D084 落地 + D055 行移除 skills_root 死键标记 +
  D085-086 记录；decision-catalog §15 Skill harness；skill-spec.md 规范正文（frontmatter + 目录结构 +
  三层披露）；skill-harness.md 人读指南；skills/README 校验入口；本 E11 纪要

## Verification

- C1：`npm run build && npm test` 全绿（core 92 测试 + 全仓 414 测试零失败）+ `npm run check`
  （persona-lint + skill-lint 双通过）；skill-lint 全错误码单测覆盖；validateConfig 路径逃逸拒绝
  （evidence 见 task-skill-spec/evidence/evidence.yaml）
- C2：`npm run build && npm test` 全绿 + `npm run check`（persona-lint 过——模板加 skills 可选
  字段不破坏）；C2-b/c/d 断言：`PICODE_PERSONA_SKILLS` 含 ponytail 路径 / system prompt 含
  skills 段且不含 SKILL.md 正文 / 无 env 逐字节不变
- C3（本任务）：文档不破坏构建；`npm run check`（persona-lint + skill-lint）通过

## 剩余风险

- **allowed-tools 未强制**：skill 级工具白名单仅解析不强制（D088 拒），与 picode ACL（09
  tool-profiles 六层）的整合关系留档待设计；agent 可能用任意工具执行 skill 指令
- **官方 skills-ref 未接入**：自研 skill-lint 覆盖 name/desc/命名等价语义，但未逐项对齐官方
  工具链（D085 缓）；描述长度等建议阈值以 agentskills 为参照，非官方实现
- **激活依赖模型自主**：渐进披露的 instructions/resources 层由 agent 自判 `repo_read`，弱模型
  可能不主动拉取正文，技能实际生效程度依赖模型能力
- **C2 本地占位实现**：C2 的 buildSkillIndex/personaDeclaredSkills 为本地实现（C1 未合并时），
  merge 后与 core 导出可能并存两套——C1 已在 3ddabcc 冲突修复中改走 core 导出（无残留）

## 后续候选

1. **skills-ref 官方工具对齐**（D085）：picode 信息控制允许后接官方校验工具或对齐其语义
2. **skill 打包/导入双轨机械实现**（D086）：托管只读 vs 可编辑副本的 CLI 下载/安装器（需网）
3. **skill-creator 评价循环**（D087）：evals/benchmark/variance，依赖 LLM 评价，独立立项
4. **allowed-tools 与 ACL 整合设计**（D088）：skill 级工具白名单与 09 tool-profiles 关系设计先行
