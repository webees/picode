/**
 * Config schema, defaults and validation (13-configuration).
 *
 * Pure module: no node:fs / yaml file I/O — loading lives in `loader.ts`
 * (方向 B1). Everything here is deterministic and testable in isolation.
 */
import path from "node:path";
import { ErrorCode, PicodeError } from "./errors.js";
import { SESSION_EVENTS } from "./session.js";

export interface RoomConfig {
  id: string;
  display_name?: string;
  enabled?: boolean;
  purpose?: string;
  prompt_file?: string;
  aliases?: string[];
}

export interface RoleConfig {
  id: string;
  display_name?: string;
  description?: string;
  tool_profile?: string;
  model?: string | null;
  prompt_file?: string;
  enabled?: boolean;
}

export interface CellTemplate {
  lead_role: string;
  doer_role: string;
  check_role: string;
  room?: string;
  room_kind?: string;
}

export interface SessMgrRule {
  /** Event id from 17 §5.3 (run_created, intake_start, sponsor_message, …). */
  event: string;
  /** Roles to wake unconditionally. */
  wake?: string[];
  /** Roles to wake only when a config flag is on (e.g. research.parallel_on_intake). */
  wake_if?: string[];
  /** Gate events that wake gates by scale (merge_ready → code-review/sec-eng). */
  wake_gates?: boolean;
  /** Wake the whole squad of a task (task_ready: double latch). */
  wake_squad?: boolean;
  /** Wake the squad-lead of a task (progress_due). */
  wake_squad_lead?: boolean;
  /** Terminate the squad of a task (task_dissolved). */
  terminate_squad?: boolean;
}

export interface SessMgrConfig {
  /** Reserved (D055): declared per 17 §10; not read by any implementation path yet. */
  enabled: boolean;
  /** Reserved (D055): idle-sleep timer is not implemented; sweeps use timeouts.task_timeout_sec. */
  idle_sleep_sec: number;
  /** Reserved (D055): force-wake is currently allowed unconditionally via `--force`. */
  allow_orch_force_wake: boolean;
  max_awake: number;
  always_register: boolean;
  /** Deterministic event→action table (17 §5.3); LLM arbitration only beyond it. */
  rules: SessMgrRule[];
}

export interface SponsorConfig {
  /** MUST be true in v1 (17 §10): sponsor is always human. */
  human_only: boolean;
}

/** Pi process binding (18 phase C): spawn adapter command template. */
export interface PiConfig {
  /** Wake actually spawns a Pi process only when enabled. */
  enabled: boolean;
  /** Shell command template run on wake (e.g. "pi --print"). Static config, no interpolation. */
  command_template: string;
}

/** Opencode backend (D044): route sessions through an opencode server's HTTP API. */
export interface OpencodeConfig {
  /** Use the opencode adapter instead of the pi command template. */
  enabled: boolean;
  /** Opencode server base URL, e.g. http://127.0.0.1:7788 (opencode serve). */
  base_url: string;
  /** Optional provider/model pair; defaults to the server's configured model. */
  provider_id: string | null;
  model_id: string | null;
  /** System-prompt prefix injected into every session (role + picode env). */
  system_prompt_prefix: string;
}

/** Product intake (18 phase E / U7): acceptance criteria gate on active. */
export interface ProductConfig {
  /** goal must carry product_acceptance[] before intake → active (P01). */
  require_acceptance_before_active: boolean;
}

/** Window compression (上/下午窗口上下文压缩). */
export interface WindowCompressionConfig {
  /**
   * Keep ratio after compression (0–1). Default 0.8 = keep the newest 80% of a
   * window's messages verbatim and fold the oldest 20% into a `window_rollup`
   * summary message. Applied per room bus history + run-level window archive.
   */
  ratio: number;
  /** Floor: a window with ≤ this many messages is never folded. */
  min_keep: number;
}

/** 上/下午窗口:一天按 split_hour 分成上午/下午两个窗口。 */
export interface WindowsConfig {
  /** Hour (0–23) splitting the morning/afternoon windows. Default 12 (noon). */
  split_hour: number;
  compression: WindowCompressionConfig;
}

export interface StaffingConfig {
  /** v1 fixed: real_recruit (17 §10 / D009). */
  mode: "real_recruit" | "template";
  persona_dimensions: "full";
}

/** Self-evolution layers (19 §2, easy → hard). */
export type EvolveLayer =
  | "knowledge"
  | "prompts"
  | "docs"
  | "tests"
  | "code"
  | "policy";

export type GoalKind = "delivery" | "self_evolve";

/** goal.evolve spec (19 §4 design). */
export interface EvolveGoalSpec {
  layers: EvolveLayer[];
  risk: "low" | "medium" | "high";
  baseline_ref: string;
  success_metrics: string[];
  rollback: string;
  forbidden_paths: string[];
}

/**
 * Runaway budget per session (C1-run-budgets / prime-agent autonomous.ts Q1).
 * 0 = unlimited. Conservative defaults: normal sessions stay far below the
 * ceilings, so existing behavior is unchanged — the cap only stops loops.
 */
export interface EvolveBudgetsConfig {
  /** Max wake turns per session; exceeding → setError + sleep (限额 ≠ 成功). */
  maxTurns: number;
  /** Max tokens per session; v1 has no token meter (declared, 0 = unlimited). */
  maxTokens: number;
  /** Max continuous awake wall-clock ms; 0 = unlimited. */
  timeoutMs: number;
  /** Gate verification commands on budget exhaustion; stopping is not success. */
  gate_commands: string[];
}

/**
 * C1 session continuation (N1/N2/N3 / prime-agent autonomous continuation):
 * guardian 对「已 awake、无 error、任务未终态、空闲超过 idle_sec」的 opencode
 * 会话按 D061 noReply 语义投喂固定续跑 prompt，并用 budget.continuations
 * 有界（max_per_session，0 = 不限）。所有计数持久化、幂等、断连可恢复。
 */
export interface ContinuationConfig {
  /** 每会话最大自动续跑次数；0 = 不限（保守默认有界，续跑耗尽即停）。 */
  max_per_session: number;
  /**
   * 平台席（无 task 绑定会话）独立续跑上限（D078）；0 = 不限。
   * 平台席为监测/调研型角色，续跑需求轻，默认 2 比 task 的 5 更紧。
   */
  max_per_session_platform: number;
  /** 会话空闲超过 idle_sec 秒才投喂续跑（sweep 节流，防连发）。 */
  idle_sec: number;
  /**
   * 语义续跑摘要窗口：historySummary 生成的最近转录要点条数（D077）。
   * 喂入续跑 prompt 的「上一回合要点」条数；0 = 不生成摘要（回退固定模板）。
   */
  summary_entries: number;
  /**
   * 平台席（无 task 绑定会话，如 scout/sys-arch/run-lead）策略（R3-C1）：
   * "skip"（默认）→ 不进候选（防无界空转烧 token）；"allow" → 进入但
   * 仍受 max_per_session 有界（显式逃生）。
   */
  platform_seats: "allow" | "skip";
  /**
   * C2 预留（R3-C1 一次加字段避免 config 冲突）：续跑投喂前的 gate 验证
   * 命令；默认空 = 不启用（行为与 C1 一致）。
   */
  gate_commands: string[];
}

/** C1 checkpoint-auto: checkpoint 自动捕获（guardian 周期捕获 + merge 前捕获）。默认开启（C2 翻转：观测价值验证后默认自动捕获）。 */
export interface CheckpointCaptureConfig {
  /** 自动捕获总开关；true（默认）= guardian 周期捕获 + merge 前捕获生效（C2 默认翻转）。 */
  enabled: boolean;
  /** guardian 周期捕获间隔（秒）；0 = 每次 tick 都捕获；>0 = 距上次 guardian 捕获不足该秒则跳过。 */
  guardian_interval_sec: number;
  /** merge 前捕获：true = mergeNext 实际合并前对入队任务捕获一次（boundary=pre_merge）；enabled 时才生效。 */
  pre_merge: boolean;
}

/**
 * C1 auto-refine review gate (Q2 / refinement.ts): rule-based review of the
 * evidence trajectory before a lesson is distilled/written. Default is the
 * "heuristic" mode — evidence must actually contain evidence (exit_code,
 * log_ref, changed files) or the draft is rejected as noise/empty.
 */
export interface AutoRefineGateConfig {
  /** 评审器: "heuristic"（内置规则，默认）| "none"（关闭评审门，全部放行）。 */
  mode: "heuristic" | "none";
  /** evidence 须含证据（exit_code/log_ref/变更文件）才提炼 lesson。 */
  require_evidence: boolean;
  /** 噪音/空轨迹（无命令、无 log_ref、无变更文件）拒绝提炼。 */
  reject_noise: boolean;
}

/** self_evolve config (19 §10 draft). */
export interface SelfEvolveConfig {
  /** Reserved (D055): enabled is declared per 19 §10; goal.kind drives evolution, not this flag. */
  enabled: boolean;
  /** Ordinary runs default to delivery; evolution must be declared. */
  default_kind: GoalKind;
  /** ★ default: knowledge, prompts, docs, tests; code/policy explicit. */
  allowed_layers: EvolveLayer[];
  /** Merge gate commands (E4); default npm test. */
  verify_commands: string[];
  /** Runaway protection (C1): per-session turn/token/time ceilings. */
  budgets: EvolveBudgetsConfig;
  /** Reserved (D055): sponsor merge approval is not mechanically enforced yet (E3/E6 gate). */
  require_sponsor_merge: boolean;
  /** code layer ⇒ code-review MUST be woken (E5). */
  require_code_review_on_code_layer: boolean;
  /** Reserved (D055): E6 knowledge log path is fixed at knowledge/evolve/<run_id>.md. */
  knowledge_log_glob: string;
  /** §4 MUST: target_repo must contain one of these markers. */
  platform_root_markers: string[];
  forbidden_path_globs: string[];
  /** C1 auto-refine gate (Q2): refine 前对 evidence 轨迹做规则评审。 */
  refine_gate: AutoRefineGateConfig;
  /** C1 session continuation (N1/N2/N3): 空闲会话有界自动投喂续跑 prompt。 */
  continuation: ContinuationConfig;
  /** C1 checkpoint-auto: checkpoint 自动捕获（guardian 周期捕获 + merge 前捕获）。 */
  checkpoints: CheckpointCaptureConfig;
}

export interface PicodeConfig {
  config_schema_version: string;
  active_profile?: string;
  sess_mgr: SessMgrConfig;
  sponsor: SponsorConfig;
  staffing: StaffingConfig;
  cells: {
    lifetime: "per_run";
    templates: Record<string, CellTemplate>;
  };
  paths: {
    runs_root: string;
    /** Skills root (D082): skill harness root — discovery/injection (default "skills"). */
    skills_root: string;
    knowledge_root: string;
    /** Reserved (D055): 13 §7 declares `prompts.root`; the implementation key is `paths.prompts_root`. */
    prompts_root: string;
    secret_globs: string[];
  };
  git: {
    worktree_root: string;
    branch_template: string;
    base_branch: string;
    /** Reserved (D055): rebase-on-merge is not implemented; mergeNext always uses --no-ff. */
    rebase_on_merge: boolean;
    /** Reserved (D055): serialization is unconditional via merge.lock, not switchable. */
    merge_serial: boolean;
    /** Reserved (D055): force-dissolve auto-commit is unconditional in closure.ts. */
    force_dissolve_autocommit: boolean;
  };
  /** Reserved (D055): max_parallel_triads declared per 13 §8; concurrency is governed by max_awake only. */
  scheduler: { max_parallel_triads: number };
  timeouts: {
    /** Reserved (D055): progress reporting interval; sweeps only use task_timeout_sec. */
    progress_interval_sec: number;
    task_timeout_sec: number;
    draft_idle_sec: number;
    draft_idle_policy: "park" | "stop" | "run_lead_advance";
    /** Reserved (D055): cross-room TTL declared per 13 §8; meeting-* TTL is not enforced yet. */
    cross_room_ttl_sec: number;
    failed_branch_ttl_sec: number;
  };
  rooms: RoomConfig[];
  roles: RoleConfig[];
  /** Reserved (D055): model routing declared per 13 §3; the runtime never selects models (opencode server default). */
  models: { default: string | null; check_model: string | null };
  research: { parallel_on_intake: boolean };
  /** Reserved (D055): info-pipeline review is unconditional (I5) — not configurable yet. */
  info_pipeline: { require_run_lead_review: boolean };
  /** Reserved (D055): cross-room supervision is unconditional (I5/D011) — not configurable yet. */
  cross_room: { require_run_lead_present: boolean };
  work_brief: {
    require_run_lead_approval: boolean;
    /** Reserved (D055): seat slicing is always applied by draftPersonas. */
    seat_slicing: boolean;
    /** Reserved (D055): brief assembly is always via the docs cell. */
    require_docs_assemble: boolean;
    /** Reserved (D055): research attachments are always allowed after run-lead review. */
    allow_research_attach: boolean;
  };
  features: Record<string, boolean>;
  /** Reserved (D055): only the "file" adapter exists; "messenger" is declared per 13 §3. */
  bus: { adapter: "file" | "messenger" };
  /** `locale` reserved (D055): only i18n.strings is read by roomDisplay/roleDisplay. */
  i18n: { locale: string; strings?: Record<string, string> };
  pi: PiConfig;
  opencode: OpencodeConfig;
  product: ProductConfig;
  windows: WindowsConfig;
  run_allowlist: string[];
  self_evolve: SelfEvolveConfig;
}

export const DEFAULTS: PicodeConfig = {
  config_schema_version: "1",
  sess_mgr: {
    enabled: true,
    idle_sleep_sec: 600,
    allow_orch_force_wake: true,
    max_awake: 8,
    always_register: true,
    rules: [
      { event: SESSION_EVENTS.RUN_CREATED, wake: ["sess-mgr", "run-lead", "pm"] },
      {
        event: SESSION_EVENTS.INTAKE_START,
        wake: ["run-lead", "pm"],
        wake_if: ["ind-res"],
      },
      { event: SESSION_EVENTS.SPONSOR_MESSAGE, wake: ["run-lead"] },
      { event: SESSION_EVENTS.GOAL_ACTIVE, wake: ["scout", "sys-arch"] },
      { event: SESSION_EVENTS.STAFFING_REQUEST, wake: ["people-lead", "recruiter", "people-qa"] },
      { event: SESSION_EVENTS.BRIEF_ASSEMBLE, wake: ["docs-lead", "tech-writer", "docs-qa"] },
      { event: SESSION_EVENTS.TASK_READY, wake_squad: true },
      { event: SESSION_EVENTS.PROGRESS_DUE, wake_squad_lead: true },
      { event: SESSION_EVENTS.MERGE_READY, wake: ["release-eng"], wake_gates: true },
      { event: SESSION_EVENTS.TASK_DISSOLVED, terminate_squad: true },
      { event: SESSION_EVENTS.CHANGE_APPLIED, wake_squad_lead: true },
    ],
  },
  sponsor: { human_only: true },
  staffing: { mode: "real_recruit", persona_dimensions: "full" },
  paths: {
    runs_root: ".picode/runs",
    skills_root: "skills",
    knowledge_root: "docs/knowledge",
    prompts_root: ".picode/prompts",
    secret_globs: ["**/.env", "**/.env.*", "**/secrets/**"],
  },
  git: {
    worktree_root: ".picode/worktrees",
    branch_template: "picode/{run_id}/{task_id}",
    base_branch: "main",
    rebase_on_merge: true,
    merge_serial: true,
    force_dissolve_autocommit: true,
  },
  scheduler: { max_parallel_triads: 3 },
  timeouts: {
    progress_interval_sec: 300,
    task_timeout_sec: 7200,
    draft_idle_sec: 86400,
    draft_idle_policy: "park",
    cross_room_ttl_sec: 1800,
    failed_branch_ttl_sec: 604800,
  },
  rooms: [
    { id: "leadership", display_name: "工程领导", enabled: true },
    { id: "product", display_name: "产品共创", enabled: true },
    { id: "announce", display_name: "全员公告", enabled: true },
    { id: "program", display_name: "项目统筹", enabled: true },
    { id: "people", display_name: "人力资源", enabled: true },
    { id: "research", display_name: "行业研究", enabled: true },
    { id: "architecture", display_name: "架构设计", enabled: true },
    { id: "knowledge", display_name: "知识管理", enabled: true },
    { id: "docs", display_name: "技术文档", enabled: true },
    { id: "collab", display_name: "跨组协同", enabled: true },
    { id: "release", display_name: "发布工程", enabled: true },
    { id: "quality", display_name: "质量保障", enabled: true },
    { id: "security", display_name: "安全合规", enabled: true },
  ],
  roles: [
    { id: "sponsor", display_name: "业务赞助", tool_profile: "human.sponsor" },
    { id: "sess-mgr", display_name: "会话调度", tool_profile: "governance.sess-mgr" },
    { id: "run-lead", display_name: "工程主责", tool_profile: "governance.run-lead" },
    { id: "tpm", display_name: "技术统筹", tool_profile: "governance.tpm" },
    { id: "proc-audit", display_name: "流程审计", tool_profile: "governance.proc-audit" },
    { id: "pm", display_name: "产品策划", tool_profile: "product.pm" },
    { id: "squad-lead", display_name: "小队主责", tool_profile: "implement.squad-lead" },
    { id: "engineer", display_name: "软件开发", tool_profile: "implement.engineer" },
    { id: "sdet", display_name: "测试验证", tool_profile: "implement.sdet" },
    { id: "ind-res", display_name: "行业分析", tool_profile: "research.ind-res" },
    { id: "tech-writer", display_name: "技术写作", tool_profile: "docs.doer" },
    { id: "docs-lead", display_name: "文档主责", tool_profile: "docs.lead" },
    { id: "docs-qa", display_name: "文档质检", tool_profile: "docs.check" },
    { id: "people-lead", display_name: "人才主责", tool_profile: "people.lead" },
    { id: "recruiter", display_name: "招聘专员", tool_profile: "people.doer" },
    { id: "people-qa", display_name: "编制合规", tool_profile: "people.check" },
    { id: "scout", display_name: "代码勘察", tool_profile: "architecture.scout" },
    { id: "sys-arch", display_name: "软件架构", tool_profile: "architecture.sys-arch" },
    { id: "code-review", display_name: "代码审查", tool_profile: "gate.code-review" },
    { id: "release-eng", display_name: "发布执行", tool_profile: "gate.release-eng" },
    { id: "sec-eng", display_name: "安全工程", tool_profile: "gate.sec-eng" },
  ],
  cells: {
    lifetime: "per_run",
    templates: {
      implement: {
        lead_role: "squad-lead",
        doer_role: "engineer",
        check_role: "sdet",
        room_kind: "squad",
      },
      docs: {
        lead_role: "docs-lead",
        doer_role: "tech-writer",
        check_role: "docs-qa",
        room: "docs",
      },
      people: {
        lead_role: "people-lead",
        doer_role: "recruiter",
        check_role: "people-qa",
        room: "people",
      },
    },
  },
  models: { default: null, check_model: null },
  research: { parallel_on_intake: true },
  info_pipeline: { require_run_lead_review: true },
  cross_room: { require_run_lead_present: true },
  work_brief: {
    require_run_lead_approval: true,
    seat_slicing: true,
    require_docs_assemble: true,
    allow_research_attach: true,
  },
  features: {
    // Reserved (D055): declared per 13 §11; only allow_implement_before_active is read today.
    allow_bypass_write_paths: false,
    allow_implement_before_active: false,
    allow_agent_direct_messenger_io: false,
    allow_bare_bash: false,
    run_lead_advance_force_without_sponsor: false,
  },
  bus: { adapter: "file" },
  i18n: { locale: "zh-CN" },
  pi: { enabled: false, command_template: "pi --print" },
  opencode: {
    enabled: false,
    base_url: "http://127.0.0.1:7788",
    provider_id: null,
    model_id: null,
    system_prompt_prefix: "You are a picode agent. Follow your role prompt.",
  },
  product: { require_acceptance_before_active: true },
  windows: {
    split_hour: 12,
    compression: { ratio: 0.8, min_keep: 20 },
  },
  // run_allowlisted (spec 09): commands sdet/release-eng MAY run via the
  // pi-extension tool. Default empty = tool returns COMMAND_NOT_ALLOWLISTED.
  run_allowlist: [],
  self_evolve: {
    enabled: true,
    default_kind: "delivery",
    allowed_layers: ["knowledge", "prompts", "docs", "tests"],
    verify_commands: ["npm run build && npm test"],
    // C1 conservative defaults: 0 = unlimited; 20 wake-turns is a far ceiling
    // that only runaway wake/sleep loops hit, so default behavior is unchanged.
    budgets: {
      maxTurns: 20,
      maxTokens: 0,
      timeoutMs: 0,
      gate_commands: [],
    },
    require_sponsor_merge: true,
    require_code_review_on_code_layer: true,
    knowledge_log_glob: "docs/knowledge/evolve/",
    platform_root_markers: ["package.json"],
    forbidden_path_globs: ["**/.env", "**/.env.*", "**/secrets/**", "**/*.pem"],
    // C1 auto-refine gate conservative defaults: heuristic on, evidence+noise
    // filtering on — noise/empty trajectories never get distilled into lessons.
    refine_gate: {
      mode: "heuristic",
      require_evidence: true,
      reject_noise: true,
    },
    // C1 continuation conservative defaults (N2): bounded 5 per session so a
    // taskless/mis-assigned seat cannot burn tokens unboundedly (R2-C2);
    // idle_sec (5 min) spaces feeds so a session is never spammed within a
    // window. 0 = unlimited must be declared explicitly.
    // R3-C1: platform_seats default "skip"（无 task 会话不进候选，防空转）；
    // gate_commands 默认空（C2 预留，不启用 gate）。
    // D078: max_per_session_platform 默认 2 —— 平台席独立更紧预算（监测/调研型
    // 续跑需求轻，防烧 token）。
    continuation: {
      max_per_session: 5,
      max_per_session_platform: 2,
      idle_sec: 300,
      summary_entries: 8,
      platform_seats: "skip",
      gate_commands: [],
    },
    // C1 checkpoint-auto 保守默认：关闭自动捕获（D082 显式捕获行为不变）；
    // guardian 周期默认 600s 节流、merge 前捕获默认开启但受 enabled 总开关约束。
    // C2 checkpoint-auto-default：enabled 默认翻转评估 → 默认开启（自动捕获生效），
    // guardian_interval_sec/pre_merge 默认不变；需显式捕获行为可配置 enabled=false。
    checkpoints: {
      enabled: true,
      guardian_interval_sec: 600,
      pre_merge: true,
    },
  },
};

// Note: sess_mgr / sponsor / staffing / cells.lifetime are typed per 17 §10.

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Layered deep merge (13 §2): maps/objects merge recursively; arrays merge by
 * `id` (same id overrides fields, `_delete: true` / `enabled: false` removes);
 * items without an id are appended. Used by the loader for
 * DEFAULTS → project → profile → run override.
 */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) {
    const byId = new Map<string, Record<string, unknown>>();
    const rest: unknown[] = [];
    for (const item of a) {
      if (isPlainObject(item) && typeof item.id === "string") {
        byId.set(item.id, { ...item });
      } else rest.push(item);
    }
    for (const item of b) {
      if (isPlainObject(item) && typeof item.id === "string") {
        if (item._delete === true || item.enabled === false) {
          byId.delete(item.id);
          continue;
        }
        const prev = byId.get(item.id) ?? {};
        byId.set(item.id, deepMerge(prev, item) as Record<string, unknown>);
      } else rest.push(item);
    }
    return [...byId.values(), ...rest];
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = k in a ? deepMerge(a[k], v) : v;
    }
    return out;
  }
  return b === undefined ? a : b;
}

/** Throw a coded config-validation error (方向 A2: uniform ErrorCode registry). */
function configError(message: string): never {
  throw new PicodeError(ErrorCode.CONFIG_INVALID, message);
}

/**
 * Naming-law id charset (glossary §0 / 方向 C4): ids double as file/dir names,
 * so only lowercase letters/digits/hyphens are allowed and the first char must
 * be a letter (a room or role id like `../x` would otherwise escape its
 * directory). Enforced for `rooms[].id` and `roles[].id`.
 */
export const SAFE_ID_RE = /^[a-z][a-z0-9-]*$/;

export function validateConfig(config: PicodeConfig): void {
  const roleIds = new Set(config.roles.filter((r) => r.enabled !== false).map((r) => r.id));
  // C4 (命名律 R2–R7 复核): ids become file/dir names (sessions/<id>.yaml,
  // rooms/<id>/members.yaml), so they must be path-safe and match the
  // lowercase-hyphen convention. R1 (role ∩ room = ∅) is enforced below.
  for (const room of config.rooms) {
    if (!SAFE_ID_RE.test(room.id)) {
      configError(
        `rooms[].id "${room.id}" invalid — must match ${String(SAFE_ID_RE)} (lowercase letters/digits/hyphen, leading letter)`,
      );
    }
  }
  for (const role of config.roles) {
    if (!SAFE_ID_RE.test(role.id)) {
      configError(
        `roles[].id "${role.id}" invalid — must match ${String(SAFE_ID_RE)} (lowercase letters/digits/hyphen, leading letter)`,
      );
    }
  }
  // Duplicate ids would break array-merge-by-id semantics (13 §2) and the
  // session roster (one file per agent).
  const seenRooms = new Set<string>();
  for (const room of config.rooms) {
    if (seenRooms.has(room.id)) configError(`duplicate room id: ${room.id}`);
    seenRooms.add(room.id);
  }
  const seenRoles = new Set<string>();
  for (const role of config.roles) {
    if (seenRoles.has(role.id)) configError(`duplicate role id: ${role.id}`);
    seenRoles.add(role.id);
  }
  for (const [kind, t] of Object.entries(config.cells.templates)) {
    for (const key of ["lead_role", "doer_role", "check_role"] as const) {
      if (!roleIds.has(t[key])) {
        configError(`cells.templates.${kind}.${key}=${t[key]} not in roles`);
      }
    }
  }
  const roomIds = new Set(config.rooms.filter((r) => r.enabled !== false).map((r) => r.id));
  for (const must of ["leadership", "product", "program", "docs", "people"]) {
    if (!roomIds.has(must)) {
      configError(`required room disabled or missing: ${must}`);
    }
  }
  // Naming law R1: role id must never equal a room id
  for (const r of config.roles) {
    if (r.enabled === false) continue;
    if (roomIds.has(r.id)) {
      configError(`naming law R1: role id "${r.id}" collides with room id`);
    }
  }
  // 17 §10 v1-fixed values: changing them is a config error, not a silent override.
  if (config.sponsor.human_only !== true) {
    configError("sponsor.human_only must be true in v1 (sponsor is always human)");
  }
  if (config.staffing.mode !== "real_recruit") {
    configError("staffing.mode must be real_recruit in v1 (true recruiting)");
  }
  if (config.staffing.persona_dimensions !== "full") {
    configError("staffing.persona_dimensions must be full in v1 (17 §6)");
  }
  if (config.cells.lifetime !== "per_run") {
    configError("cells.lifetime must be per_run in v1 (D019)");
  }
  if (config.pi.enabled && !config.pi.command_template) {
    configError("pi.command_template required when pi.enabled (18 phase C)");
  }
  if (config.opencode.enabled && !/^https?:\/\/.+/.test(config.opencode.base_url)) {
    configError("opencode.base_url must be an http(s) URL when opencode.enabled (D044)");
  }
  if (
    !Number.isInteger(config.windows.split_hour) ||
    config.windows.split_hour < 0 ||
    config.windows.split_hour > 23
  ) {
    configError("windows.split_hour must be an integer in 0..23");
  }
  const { ratio, min_keep } = config.windows.compression;
  if (!(ratio > 0 && ratio <= 1)) {
    configError("windows.compression.ratio must be in (0, 1] (keep ratio after compression)");
  }
  if (!Number.isInteger(min_keep) || min_keep < 1) {
    configError("windows.compression.min_keep must be a positive integer");
  }
  if (!Number.isInteger(config.sess_mgr.max_awake) || config.sess_mgr.max_awake < 1) {
    configError("sess_mgr.max_awake must be a positive integer");
  }
  // D082: skills_root is now an active config key — it must be a non-empty
  // relative path that cannot escape the repo (absolute / `..` traversal).
  const skillsRoot = config.paths.skills_root;
  if (typeof skillsRoot !== "string" || skillsRoot.trim() === "") {
    configError("paths.skills_root must be a non-empty string");
  }
  if (path.isAbsolute(skillsRoot) || /^[A-Za-z]:[\\/]/.test(skillsRoot)) {
    configError(`paths.skills_root must be a relative path (got absolute: "${skillsRoot}")`);
  }
  if (skillsRoot.split(/[\\/]+/).includes("..")) {
    configError(`paths.skills_root must not escape the repo (got ".." segment: "${skillsRoot}")`);
  }
  if (config.features.allow_implement_before_active) {
    console.warn("[picode] WARNING: allow_implement_before_active=true");
  }
  const EVOLVE_LAYERS = new Set<EvolveLayer>([
    "knowledge",
    "prompts",
    "docs",
    "tests",
    "code",
    "policy",
  ]);
  for (const layer of config.self_evolve.allowed_layers) {
    if (!EVOLVE_LAYERS.has(layer)) {
      configError(`self_evolve.allowed_layers contains unknown layer: ${layer}`);
    }
  }
  if (config.self_evolve.allowed_layers.includes("code") &&
      !config.self_evolve.require_code_review_on_code_layer) {
    configError(
      "self_evolve.require_code_review_on_code_layer must be true when code layer is allowed (E5)",
    );
  }
  if (config.self_evolve.allowed_layers.includes("policy")) {
    console.warn("[picode] WARNING: self_evolve policy layer is high-risk (19 §5 E3/E5)");
  }
  const b = config.self_evolve.budgets;
  for (const [key, val] of [
    ["maxTurns", b.maxTurns],
    ["maxTokens", b.maxTokens],
    ["timeoutMs", b.timeoutMs],
  ] as const) {
    if (!Number.isInteger(val) || val < 0) {
      configError(
        `self_evolve.budgets.${key} must be a non-negative integer (0 = unlimited)`,
      );
    }
  }
  if (
    !Array.isArray(b.gate_commands) ||
    b.gate_commands.some((c) => typeof c !== "string")
  ) {
    configError(
      "self_evolve.budgets.gate_commands must be an array of command strings",
    );
  }
  const gate = config.self_evolve.refine_gate;
  if (gate.mode !== "heuristic" && gate.mode !== "none") {
    configError(
      'self_evolve.refine_gate.mode must be "heuristic" or "none" (C1 auto-refine gate)',
    );
  }
  for (const [key, val] of [
    ["require_evidence", gate.require_evidence],
    ["reject_noise", gate.reject_noise],
  ] as const) {
    if (typeof val !== "boolean") {
      configError(`self_evolve.refine_gate.${key} must be a boolean (C1)`);
    }
  }
  const cont = config.self_evolve.continuation;
  for (const [key, val] of [
    ["max_per_session", cont.max_per_session],
    ["max_per_session_platform", cont.max_per_session_platform],
    ["idle_sec", cont.idle_sec],
    ["summary_entries", cont.summary_entries],
  ] as const) {
    if (!Number.isInteger(val) || val < 0) {
      configError(
        `self_evolve.continuation.${key} must be a non-negative integer (0 = unlimited)`,
      );
    }
  }
  if (cont.platform_seats !== "allow" && cont.platform_seats !== "skip") {
    configError(
      'self_evolve.continuation.platform_seats must be "allow" or "skip" (R3-C1 platform-seat policy)',
    );
  }
  if (
    !Array.isArray(cont.gate_commands) ||
    cont.gate_commands.some((c) => typeof c !== "string")
  ) {
    configError(
      "self_evolve.continuation.gate_commands must be an array of command strings (R3-C2 gate)",
    );
  }
  const cp = config.self_evolve.checkpoints;
  if (typeof cp.enabled !== "boolean") {
    configError("self_evolve.checkpoints.enabled must be a boolean");
  }
  if (!Number.isInteger(cp.guardian_interval_sec) || cp.guardian_interval_sec < 0) {
    configError(
      "self_evolve.checkpoints.guardian_interval_sec must be a non-negative integer (0 = every tick)",
    );
  }
  if (typeof cp.pre_merge !== "boolean") {
    configError("self_evolve.checkpoints.pre_merge must be a boolean");
  }
}

export function roomDisplay(config: PicodeConfig, id: string): string {
  const key = `room.${id}`;
  if (config.i18n.strings?.[key]) return config.i18n.strings[key];
  const room = config.rooms.find((r) => r.id === id);
  return room?.display_name ?? id;
}

export function getDefaultConfig(): PicodeConfig {
  return structuredClone(DEFAULTS);
}
