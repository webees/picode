# 13 — 配置体系（尽量可配置）

## 1. 原则

|#|原则|
|---|------|
|1|**逻辑 ID 稳定、展示名可配**：代码与状态机使用稳定 `id`；用户/UI/prompt 展示用 `display_name` / `locale`。|
|2|**默认内置 + 分层覆盖**：内置 defaults → 全局用户配置 → 项目配置 → run 覆盖。|
|3|**能配就不写死**：房间、角色、三角编制、工具画像、阈值、文案、门禁开关、路径约定均可配。|
|4|**校验后加载**：配置 MUST 通过 schema 校验；未知键 MAY warn；非法 MUST 拒绝启动。|
|5|**领域中立默认**：默认配置无业务案例关键字；使用方可自建 profile。|

## 2. 配置文件层级（MUST）

```text
# 优先级从低到高（后者覆盖前者）
1. 内置 defaults（包内 default-config.yaml）
2. 用户全局：~/.picode/config.yaml          # 路径可配
3. 项目：   <repo>/.picode/config.yaml
4. Profile： <repo>/.picode/profiles/<name>.yaml
5. Run：    runs/<run_id>/config.override.yaml
6. 环境变量 / CLI flags（仅覆盖标量开关与路径）
```

合并策略：

- **映射/对象**：深合并（deep merge）。  
- **数组**（如 `rooms`、`roles`）：按 `id` 合并；同 id 覆盖字段；无 id 的项追加。  
- **删除**：`id: foo` + `_delete: true` 或 `enabled: false` 禁用内置项。  

## 3. 可配置范围总表

|类别|可配置内容|配置键（逻辑）|
|------|------------|----------------|
|**房间**|id 保留或映射、display_name、purpose、默认 members 模板、是否启用、room prompt 路径|`rooms[]`|
|**角色**|id、display_name、description、tool_profile、默认 model、system_prompt 路径|`roles[]`|
|**三角/细胞**|某 kind 的 lead/doer/check 绑定哪个 role id|`cells.templates[]`|
|**工具画像**|各 profile 允许的 tool 列表与路径策略|`tool_profiles`|
|**Bus**|存储适配器、路径、type 扩展、保留天数|`bus`|
|**Git**|worktree 根路径、分支命名模板、merge 策略、备份 TTL|`git`|
|**调度**|并行数、超时、progress 间隔、draft 策略|`scheduler` / `timeouts`|
|**门禁**|S/M/L 下 review/security 是否启用、命令模板|`gates` / `scale`|
|**文案/Locale**|中英显示名、prompt 片段、公告模板|`i18n` / `prompts`|
|**工作 brief 模板**|工程主责 brief 章节骨架、席位裁剪规则|`work_brief`|
|**路径**|runs 根、skills 根、knowledge 根、secret 排除|`paths`|
|**调研**|是否默认并行、允许域名、TTL|`research`|
|**信息过滤**|申请 SLA、是否强制 run-lead 审阅|`info_pipeline`|
|**跨房**|TTL、是否必须 run-lead 在场|`cross_room`|
|**模型路由**|role/seat → model|`models`|
|**Profile 包**|一组覆盖的命名集合|`profiles`|

**不宜配置（行为语义，只可扩展不可否定核心不变量）：**

- 08 不变量中的硬约束（如 active 前禁实现、token 校验、串行 merge 等）——MAY 通过 `features.experimental_*` 显式打开危险开关，默认关且打日志。

## 4. 房间配置

### 4.1 形状

```yaml
rooms:
  - id: leadership           # 逻辑 id（状态机/代码引用）
    enabled: true
    display_name: "工程领导"   # 可改成任意语言/品牌名
    aliases: ["board", "hq"] # 可选：配置层别名 → 仍规范到 id
    purpose: "intake and final decisions"
    prompt_file: "prompts/rooms/leadership.md"
    default_members:
      - role: run-lead
        access: post
      - role: sponsor
        access: post
      - role: sess-mgr
        access: post
      - role: tpm
        access: post
      - role: proc-audit
        access: post
        post_types_allow: ["drift", "alert"]  # 可选收紧
```

### 4.2 规则

- 代码与 `bus.post(room=...)` MUST 使用逻辑 `id`。  
- UI/prompt 展示 MUST 使用 `display_name`。  
- 使用方可 **禁用** 某房：`enabled: false`（若工作流引用被禁房 → 启动校验失败或走 fallback 映射）。  
- 使用方可 **新增** 自定义房（`id` 唯一），并在 `workflows` 或 cell 模板中引用。  
- **动态房** 模板：

```yaml
dynamic_rooms:
  squad:
    id_template: "squad-{task_id}"
    display_name_template: "交付小队-{task_id}"
  meeting:
    id_template: "meeting-{topic}"
    display_name_template: "会议-{topic}"
```

## 5. 角色配置

```yaml
roles:
  - id: run-lead
    enabled: true
    display_name: "工程主责"
    description: "..."
    tool_profile: governance.run-lead
    model: null                  # null = 用 models.default
    prompt_file: "prompts/roles/run-lead.md"
    seats_allowed: ["lead"]      # 可参与哪些 seat 类型
```

- 实现三角席位绑定：

```yaml
cells:
  templates:
    implement:
      lead_role: lead
      doer_role: engineer
      check_role: sdet
      room_kind: work
    docs:                      # 文档小组：记忆 + 知识管理 + 向工程主责汇报
      lead_role: docs-lead
      doer_role: tech-writer
      check_role: docs-qa
      room: docs
    hr:                        # 人事部：按任务招聘实现组
      lead_role: people-lead
      doer_role: recruiter
      check_role: people-qa
      room: hr
```

```yaml
hr:
  default_mode: hire_fresh     # ★ hire_fresh；pool_reuse 不推荐（见 16 §7）
  require_run_lead_staffing_approval: true
```

使用方可把 `display_name` 改成任意称谓，或把 `engineer` 的展示名改成「开发」等；**id 不变则状态机兼容**。

若要替换实现执行角色：

```yaml
cells:
  templates:
    implement:
      doer_role: my_dev_role   # 自定义 roles[] 中的 id
```

## 6. 工具画像可配

内置画像见 09；覆盖示例：

```yaml
tool_profiles:
  implement.engineer:
    allow: [bus_post, bus_history, repo_read, repo_write, git_commit, git_status, request_info]
    repo_write: { mode: write_paths }
  implement.sdet:
    allow: [bus_post, bus_history, repo_read, run_allowlisted, request_info]
    deny: [repo_write, web_search, web_fetch]
```

## 6.1 `run_allowlisted` 白名单

`run_allowlisted`（sdet/release-eng/sec-eng MAY）执行的命令须命中本白名单（**token 边界匹配**：命令须等于条目，或以条目 + 空白开头；`npm test` 不会放行 `npm test-ci`），默认空 = 全部拒绝（`COMMAND_NOT_ALLOWLISTED`）。spawn 时经 `PICODE_RUN_ALLOWLIST` 注入扩展。

```yaml
run_allowlist:
  - "npm test"
  - "npm run build"
```

## 7. 文案与 Prompt 可配

```yaml
prompts:
  root: ".picode/prompts"      # 或包内默认
  # 文件缺失时回退内置
i18n:
  locale: "zh-CN"
  strings:
    room.leadership: "工程领导"
    role.run-lead: "工程主责"
    msg.progress: "进度汇报"
```

Prompt 模板支持变量：`{{display_name}}` `{{room_id}}` `{{write_paths}}` 等（实现 MUST 提供安全子集，禁止任意代码执行）。

## 7.1 工作 brief 可配

```yaml
work_brief:
  require_run_lead_approval: true    # MUST 默认 true；危险开关才可 false
  seat_slicing: true              # squad-lead/engineer/sdet 不同侧重
  template_file: "prompts/work_brief_template.md"
  allow_research_attach: true        # 调研要点经工程主责审后可进 attachments
  require_docs_assemble: true  # 文档小组落盘 WORK_BRIEF.md
```

## 8. 调度与超时可配

```yaml
scheduler:
  max_parallel_triads: 3
timeouts:
  progress_interval_sec: 300
  task_timeout_sec: 7200
  draft_idle_sec: 86400
  draft_idle_policy: park      # park | stop | run_lead_advance
  cross_room_ttl_sec: 1800
  failed_branch_ttl_sec: 604800
```

## 8.1 上/下午窗口压缩（可配）

一天按 `split_hour` 分成上/下午两个窗口；`picode window compress` 将每个房间 bus 中**旧窗口**的最老 `1 - ratio` 消息折叠为一条 `window_rollup` 摘要（原文归档到 `bus/archive/<room>.<window>.jsonl`），保留最近 `ratio` 原文，当前窗口不折叠。结果写 run 级 `windows/<window>.yaml`，供会话唤醒/文档小组作为压缩记忆引用。

```yaml
windows:
  split_hour: 12            # 0–23，上/下午分界小时（默认 12）
  compression:
    ratio: 0.8              # (0,1] 保留比例：默认保留最近 80% 原文，折叠最老 20%
    min_keep: 20            # 窗口消息 ≤ 此数则不折叠（防过度压缩）
```

CLI：`picode window compress [--rooms a,b]`、`picode window status`。

## 9. Git / 路径可配

```yaml
git:
  worktree_root: ".picode/worktrees"
  branch_template: "picode/{run_id}/{task_id}"
  base_branch: "main"
  rebase_on_merge: true
  merge_serial: true
  force_dissolve_autocommit: true
paths:
  runs_root: ".picode/runs"    # 或 runs/
  skills_root: "skills"
  knowledge_root: "docs/knowledge"
  secret_globs: ["**/.env", "**/.env.*", "**/secrets/**"]
```

## 10. Profile 包

```yaml
# .picode/config.yaml
active_profile: default

# .picode/profiles/strict.yaml
scale_defaults:
  S: { max_parallel_triads: 1, gates: { review: false, security: false } }
  M: { max_parallel_triads: 3, gates: { review: milestone, security: on_risk } }
  L: { max_parallel_triads: 6, gates: { review: true, security: true } }
ind-res:
  parallel_on_intake: true
info_pipeline:
  require_run_lead_review: true
cross_room:
  require_run_lead_present: true
```

## 11. 功能开关（危险项默认关）

```yaml
features:
  allow_bypass_write_paths: false
  allow_implement_before_active: false
  allow_agent_direct_messenger_io: false
  allow_bare_bash: false
  run_lead_advance_force_without_sponsor: false
```

任一 `true` MUST 打启动警告日志。

## 12. 校验

加载配置时 MUST：

1. Schema 校验（版本 `config_schema_version`）  
2. 所有 `cells.templates.*.*_role` 存在于 `roles`  
3. 所有工作流引用的 `room` 存在且 enabled  
4. `tool_profiles` 中 tool 名 ∈ 实现注册表  
5. 不变量冲突（如关闭 token 校验）→ 失败  

## 13. 运行时查询 API（供编排器/工具）

```text
config.room_display(id) -> string
config.role_display(id) -> string
config.tool_profile(name) -> Profile
config.cell_template(kind) -> Template
config.get(path) -> value
```

Agent prompt 渲染 MUST 走上述 API，避免硬编码中文名。

## 14. 最小默认集

内置 defaults MUST 提供当前 **terminology 默认 on** 的 rooms/roles/cells  
（含 `leadership`/`product`/`program`/… 与 `sponsor`/`sess-mgr`/`run-lead`/`pm`/…），  
保证零配置可 init 出完整花名册（会话是否 awake 见 17/18）。  
用户配置只覆盖想改的部分。权威摘录：[default-config.snippet.yaml](../reference/default-config.snippet.yaml)。

## 15. 与不变量关系

|可配|不可配掉（除非 features 危险开关）|
|------|-----------------------------------|
|房间叫什么|active 前禁实现|
|角色叫什么|bus token、写集校验|
|谁当 doer|handoff 前 evidence|
|间隔秒数|串行 merge|
|是否启用某扩展房|工作组专一与信息过滤默认开|

详见 [08-invariants.md](./08-invariants.md)。
