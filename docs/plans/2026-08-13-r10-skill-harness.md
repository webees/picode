# run-lead 自治规划 — Skill Harness：SKILL.md 规范 + skills_root 激活 + persona skills[] 接线 + 渐进披露（run-2026-08-13T23-50-59-484Z · self_evolve · scale M）

> 目标（宽松，run-lead 自主决策）：从 GitHub 学习 agent skill harness 知识（anthropics/skills +
> agentskills spec），改进 picode 自身技能承载体系。product_acceptance：
> 1. SKILL.md 规范接入（frontmatter 校验：name/description 必填、命名规则）
> 2. skills_root 死键激活或明确决策（缓/拒给理由）
> 3. persona skills[] 字段接线（会话/人设可声明携带技能）
> 4. 渐进披露机制（metadata→instructions→resources 分层，不一次性灌入）
> 5. 校验/等价检查（lint 或测试）
>
> 背景：`paths.skills_root`（默认 "skills"）是 D055 死键（声明零读取）；`Persona.skills[]` 是
> 必填维度但无任何消费方；`skills/engineering/{ponytail,ponytail-review}/SKILL.md` 两个种子 skill
> 已按 agentskills 规范格式书写但无校验；`npm run check` 只跑 persona-lint。本轮把技能承载体系
> 落地为可校验、可注入、分层的 harness。
>
> 依据：/private/tmp/anthropics-skills（anthropics/skills clone：skills 示例 + spec + template）；
> agentskills spec（SKILL.md frontmatter：name 小写连字符匹配目录 / description 必填 ≤1024 /
> license / allowed-tools 实验性；目录 SKILL.md+scripts+references+assets；渐进披露
> metadata ~100 tokens 启动 → instructions <5000 激活 → resources 按需；skills-ref 校验工具）；
> 本地成熟 harness 参考 /Users/x/.agents/skills 与 /Users/x/.zcode/skills；
> picode 事实：`config.ts paths.skills_root`（D055）、`persona.ts skills[]`（未接线）、
> `pi-adapter.ts buildPiEnv`（注入 env）、`opencode-adapter.ts buildReadyMessage`（系统 prompt）、
> `repo_read` 恒放行 `**/*.md`（pi-extension index.ts:224）。
> 基线：main = 50fdd0a（上一轮 D077/D078 归档后）；实测 ≥385 tests（实施者确认具体数）。

---

## (a) 处置决策清单

### D082 Skill harness 落地（技能承载体系 · 本轮核心）

| # | 问题 / 候选 | 处置（决定） | 理由 |
|---|---|---|---|
| D082-1 | **SKILL.md 无规范校验**：两个种子 skill 格式合规但无人守卫；新 skill 可任意书写 | **新增 `skill-lint`**（`packages/core/src/validate/skill-lint.ts`，镜像 persona-lint 数据优先设计）：扫描 `skills_root` 下全部 `**/SKILL.md`，校验 frontmatter——`name` 必填且匹配 `SAFE_ID_RE`（小写连字符）且等于目录名；`description` 必填非空（>1024 字为 **warning**，兼容现有 ponytail 826 字）；可选键 `license` / `allowed-tools`（实验性） / `compatibility` / `metadata` / `argument-hint` 白名单，未知键 **warning**（防误杀现有 ponytail 的 `argument-hint`）；结构化返回 `{ok, problems, files}` + CLI 入口 | acceptance #1 直接保障面。镜像 persona-lint 的 code-first / 结构化设计（现有惯例）；长度超限降级 warning 而非 error——agentskills 1024 为建议上限，现有 seed 已合规，避免为新规范误伤存量 |
| D082-2 | **skills_root 死键**：D055 声明零读取，harness 无处落地 | **激活** `paths.skills_root`（默认 "skills" 不变）：`packages/core/src/skills.ts` 新增纯模块——`resolveSkillsRoot(repoRoot, config)` / `discoverSkills(root)`（扫描 `**/SKILL.md` 建元数据目录）/ `buildSkillIndex(metas, opts)`（metadata 层文本：`name: description (相对路径)`，`opts.max` 截断）/ `personaDeclaredSkills(personaFile)`（读 frontmatter `skills[]` 解析声明）。`config.ts` 移除该键的 D055 reserved 注释；`validateConfig` 补 `skills_root` 相对路径校验（禁绝对/`..` 逃逸）；**仅激活此键**，D055 其余死键（prompts_root 等）不动 | acceptance #2「激活」路径。config 面兼容（默认值不变，未配置时 harness 空转零行为变更）；skill 发现与注入都以它为根，D055 局部解除有明确受益 |
| D082-3 | **persona skills[] 未接线**：必填维度但零消费 | **接线到会话 env**：`buildPiEnv` 读会话 persona 文件 frontmatter `skills[]`（实例人设 `tasks/<id>/personas/<seat>.md`；平台席回退 `.picode/agents/<role>.md` 的可选 `skills`），解析为 skill 名 → 对账 skill 目录 → 生成 env：`PICODE_SKILLS_INDEX`（全量目录，渐进 metadata）+ `PICODE_PERSONA_SKILLS`（本会话声明列表，JSON 路径数组）；`buildReadyMessage` 把这两段追加进系统 prompt | acceptance #3。会话/人设声明携带技能 → spawn 即注入声明元数据，agent 自判激活（模型自主，符合 D003 编排器无 LLM）；未知 skill 名 → 目录缺失项在 index 标记 unavailable，不阻断 spawn |
| D082-4 | **渐进披露缺失**：现 ready 消息一次性灌 READY_MESSAGE_TEXT+persona，skill 正文若硬注入会爆 context | **三层分离，只注入 metadata**：① **metadata 层**（启动注入）＝系统 prompt 附 `PICODE_SKILLS_INDEX` 紧凑目录（每项 name+一行 desc+相对路径，`buildSkillIndex` 有界截断）+ 声明列表（声明项给完整路径）；② **instructions 层**（激活时）＝agent 按目录路径 `repo_read` 对应 `SKILL.md` 全文（≤1024 字 desc，正文由 lint 守；repo_read 恒放行 `**/*.md`）；③ **resources 层**（按需）＝SKILL.md 内引用的 `scripts/`/`references/`/`assets/`，agent 按需读取。**SKILL.md 正文绝不进系统 prompt** | acceptance #4。metadata ≈100 tokens 启动、instructions <5000 激活、resources 按需——严格对齐 agentskills spec；不一次性灌入正文 = 不爆 context、不污染 continuation 摘要（正文不进转录，D076 stripNoise 无新负担） |
| D082-5 | **校验/等价检查** | ① `skill-lint` 进 `npm run check`（`npm run build -w @picode/core && node packages/core/dist/validate/persona-lint.js . && node packages/core/dist/validate/skill-lint.js .`）；② 单测覆盖 discover/buildSkillIndex/personaDeclaredSkills 纯函数与 skill-lint 各错误码；③ persona-lint 扩展（可选）：模板/人设 `skills[]` 中出现未知 skill 名记 **warning**（不阻断，等价检查不误伤） | acceptance #5。lint + 单测双通道；skills 增改删强制过校验，与 doc-style §6 维护纪律（M5）衔接 |
| D082-6 | **agent 声明承载**：种子角色模板声明 ponytail（dogfood 接线） | `.picode/agents/engineer.md` 与 `run-lead.md` frontmatter 增可选 `skills: [ponytail]`（引擎/审查席天然携带）；docs-qa 模板可选 `[ponytail-review]` | 用真实模板验证 #3 接线端到端；`persona-lint` TEMPLATE_REQUIRED 不含 skills（可选字段），加字段不破坏现有 lint |

### 处置：缓 / 拒（本轮不做，留档）

| # | 候选 | 处置 | 理由 |
|---|---|---|---|
| D083 | **skills-ref 官方校验工具接入**（agentskills spec 工具链） | **缓** | 官方工具为 npm 包需联网安装/运行，picode 无裸网（D010 信息控制）；自研 skill-lint 覆盖等价语义（name/desc/命名），后续可对齐。留档 |
| D084 | **skill 打包/导入双轨**（mattpocock M6：托管只读 vs 可编辑副本） | **缓** | 已以文档约定存在（skills/README M6 双轨）；机械实现依赖 CLI 下载器（需网），本轮不做。留档 |
| D085 | **skill-creator / 评价循环**（anthropics skill-creator 全套：evals/benchmark/variance） | **拒** | 大项且依赖 LLM 评价循环，超出本轮「承载体系」边界；本轮只做规格+校验+注入。后续独立 run 立项 |
| D086 | **allowed-tools 字段机械强制**（skill 级工具白名单 vs picode tool_profile） | **拒** | skill 级工具面与 picode ACL（09 tool-profiles 六层）关系未定，强制可能破坏现有权限模型；本轮仅解析不强制。留档待设计 |

---

## (b) chunk 分块建议（3 个；C1/C2 代码，C3 文档，串行 merge 列车 D036）

### C1 `chunk-skill-spec`（skills_root 激活 + skills.ts + skill-lint · 代码+测试）

- **write_paths**：
  - `packages/core/src/skills.ts`（新建：`resolveSkillsRoot` / `discoverSkills` / `buildSkillIndex` / `personaDeclaredSkills`，纯函数 + 读文件）
  - `packages/core/src/validate/skill-lint.ts`（新建：`checkSkillsDir(root, opts)` → `SkillLintResult` + CLI 入口，镜像 persona-lint）
  - `packages/core/src/validate/skill-lint.test.ts`（新建）+ `packages/core/src/skills.test.ts`（新建）
  - `packages/core/src/config.ts`（`skills_root` 移除 `Reserved (D055)` 注释；`validateConfig` 补相对路径校验——非空、非绝对、不含 `..` 逃逸）
  - `packages/core/src/index.ts`（导出 skills 模块）
  - `package.json`（`npm run check` 追加 skill-lint）
  - `docs/reference/schemas/config.yaml` + `docs/reference/default-config.example.yaml`（`skills_root` 注释去 D055）
- **read_paths**：`config.ts`（PicodeConfig 结构 / SAFE_ID_RE）、`persona-lint.ts`（镜像模式）、`skills/engineering/*/SKILL.md`（现有种子，规范依据）
- **public_contract**：`@picode/core` 新增导出 `resolveSkillsRoot/discoverSkills/buildSkillIndex/personaDeclaredSkills` + `SkillMeta`；新 CLI `skill-lint`；`skills_root` 成为有效配置键（默认 "skills"，行为兼容——未配置目录时 discover 返回空）
- **depends_on**：无
- **验收口径**：
  - C1-a `command`：`npm run build && npm test` 全绿（既有 385+ 无回归）+ `npm run check`（persona-lint + skill-lint 双通过）
  - C1-b 单测：`discoverSkills` 在 `skills/` 找到 ponytail/ponytail-review 两项且 name==目录名；`buildSkillIndex` 输出含 `name: desc (path)` 且 `max` 截断生效
  - C1-c 单测：skill-lint 错误码全覆盖——frontmatter 缺失 / YAML 非法 / `name` 缺失 / `name` 不匹配 `SAFE_ID_RE` / `name`≠目录名 / `description` 缺失 / 空；`license`/`argument-hint` 白名单零报错、未知键 warning
  - C1-d 单测：`personaDeclaredSkills` 解析 frontmatter `skills[]`，声明未知名返回 unavailable 标记不抛错
  - C1-e 单测：`validateConfig` 拒绝 `skills_root` 为绝对路径 / `..` 逃逸；默认 "skills" 合法
  - C1-f 核查：现有 2 个种子 SKILL.md 过 skill-lint 零 error（desc 长度 warning 放行）

### C2 `chunk-skill-wiring`（persona skills[] → env → 系统 prompt · 代码+测试）

- **write_paths**：
  - `packages/orchestrator/src/pi-adapter.ts`（`buildPiEnv` 增 `PICODE_SKILLS_INDEX` + `PICODE_PERSONA_SKILLS`：读 `personaForSession` 文件 frontmatter `skills[]`，调 core `discoverSkills`/`buildSkillIndex`/`personaDeclaredSkills` 组装）
  - `packages/orchestrator/src/opencode-adapter.ts`（`buildReadyMessage` 系统 prompt 追加 skills 段——`env.PICODE_SKILLS_INDEX`/`PICODE_PERSONA_SKILLS` 渲染，**只放 metadata 不放正文**；无 env 时行为逐字节不变）
  - `packages/orchestrator/src/pi-adapter.test.ts`（buildPiEnv env 断言）+ `packages/orchestrator/src/opencode-adapter.test.ts`（system 含 skills 段 / 无 env 回归断言）
  - `.picode/agents/engineer.md` + `.picode/agents/run-lead.md`（frontmatter 增 `skills: [ponytail]`，dogfood 接线）
- **read_paths**：`skills.ts`（core 导出）、`persona-lint.ts`（frontmatter 解析参考）、`opencode-adapter.ts` 现有 `buildReadyMessage` 契约
- **public_contract**：新 env 键 `PICODE_SKILLS_INDEX` / `PICODE_PERSONA_SKILLS`（agent 可见）；`buildReadyMessage` 签名不变，新增可选 skills 段（有 env 才出现）
- **depends_on**：C1（core skills 模块）
- **验收口径**：
  - C2-a `command`：`npm run build && npm test` 全绿 + `npm run check`（persona-lint 过——模板加 skills 可选字段不破坏）
  - C2-b 单测：`buildPiEnv` 对 persona 声明 `skills:[ponytail]` 的会话产出 `PICODE_PERSONA_SKILLS` 含 ponytail 路径；`PICODE_SKILLS_INDEX` 含 ponytail/ponytail-review 元数据
  - C2-c 单测：`buildReadyMessage` 系统 prompt 含 `可用技能` 段 + 声明项完整路径；**不含 SKILL.md 正文**（断言正文锚句不在 system 内，渐进披露 #4 硬验证）
  - C2-d 单测：无 skills env（skills_root 缺失 / 空目录）时 system 与现版逐字节一致（零回归）
  - C2-e 核查：`repo_read` 对 `**/*.md` 恒放行（pi-extension 契约不动）；instructions/resources 由 agent 自主 `repo_read` 拉取

### C3 `chunk-skill-docs`（决策留痕 + 规范文档 + 知识沉淀 · docs 层）

- **write_paths**：
  - `docs/DECISIONS.md`（新增 **D082** skill harness；D055 行移除 `paths.skills_root` 死键标记）
  - `docs/reference/decision-catalog.md`（§12.x 新增「Skill Harness」：SKILL.md 规范 / 渐进披露三层 / persona skills[] 接线 / skill-lint）
  - `docs/standards/skill-spec.md`（新建：SKILL.md frontmatter 规范正文——name/description/license/allowed-tools/compatibility/metadata；目录结构 SKILL.md+scripts+references+assets；渐进披露三层说明；锚定 agentskills spec）
  - `docs/guides/skills/README.md` 或新增 `docs/guides/skills/skill-harness.md`（人读页：如何写/校验/注入 skill）
  - `skills/README.md`（索引补「校验入口：npm run check 内 skill-lint」）
  - `docs/knowledge/evolve/run-2026-08-13T23-50-59-484Z.md`（E11 纪要：意图/决策/diff/验证/剩余风险/后续候选）
  - `docs/plans/2026-08-13-r10-skill-harness.md`（本规划，已含）
- **read_paths**：C1/C2 产出、skills.ts / skill-lint.ts / pi-adapter.ts / opencode-adapter.ts（措辞依据）、anthropics spec 摘要
- **depends_on**：C1、C2（机制落地才写得准）
- **验收口径**：
  - C3-a `command`：`npm run build && npm test` 全绿 + `npm run check`（persona-lint + skill-lint 双通过）
  - C3-b 核查：DECISIONS 含 D082 且 D055 已去除 skills_root；catalog §12 新节；skill-spec.md 规范正文落地（frontmatter 字段表 + 三层披露）
  - C3-c 核查：E11 纪要含决策要点/验证（lint+test 证据）/剩余风险（allowed-tools 未强制、官方 skills-ref 未接入）

**编排**：C1（spec/校验）→ C2（注入接线）→ C3（文档收尾）；串行 merge 列车 D036。E4 gate：代码层显式 `npm run build && npm test` + `npm run check`；merge_ready 强制唤醒 code-review（E5，code 层 MUST）。

---

## (c) 实施者分配

| 任务 | 实施方 | 说明 |
|---|---|---|
| 决策清单（本文档 D082–D086） | run-lead（本会话） | 已产出 |
| C1 skill-spec | **三角 A**（squad-lead/engineer/sdet，真招聘） | core skills.ts + skill-lint + config 激活 + check 接线 + 测试；engineer 主实现，sdet 验证（错误码全覆盖/`max` 截断/路径逃逸拒绝） |
| C2 skill-wiring | **三角 B**（squad-lead/engineer/sdet，真招聘） | buildPiEnv + buildReadyMessage 注入 + persona skills[] 解析 + 模板 dogfood；sdet 验证（渐进披露正文不进 prompt / 无 env 零回归） |
| C3 skill-docs | **文档小组**（docs-lead/tech-writer/docs-qa） | DECISIONS D082 + D055 修订 + catalog + skill-spec.md + 人读页 + E11 纪要 |
| 评审 | code-review（E5 code 层 MUST） | C1/C2 merge_ready 机械唤醒 |

人员调度：C1/C2 各一三角经标准 staffing 真招聘（D025/D030），C1 合并后 C2 开工（依赖 core 模块）；C3 文档小组在 C1/C2 合并后收尾。改动集中在 core（新模块+config）+ orchestrator（env/system）+ docs 层 + 2 个角色模板，**不触碰** bus / 规则表 / merge / continuation / 面板。

---

## (d) 后续候选（本轮不做，留档）

1. **skills-ref 官方工具对齐（D083）**：picode 信息控制允许后接官方校验工具或对齐其语义
2. **skill 打包/导入双轨机械实现（D084）**：托管只读 vs 可编辑副本的 CLI 下载/安装器
3. **skill-creator 评价循环（D085）**：evals/benchmark/variance，依赖 LLM 评价，独立立项
4. **allowed-tools 与 ACL 整合设计（D086）**：skill 级工具白名单与 09 tool-profiles 的关系设计先行

---

## 本轮验证载体

无人干预下由 self-drive guardian 推进（三角会话 ready → 自主实现 → 续跑 → 自测 → evidence/handoff → 串行 merge）。
验收判定：C1/C2 代码任务合并入 main（acceptance 1/2/3/4/5 达成——skill-lint 校验、skills_root 激活、persona skills[] 接线、三层渐进披露、lint+测试），C3 文档归档（E11 纪要），既有单测全绿。
