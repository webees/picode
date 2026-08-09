import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { fileURLToPath } from "node:url";

export type Access = "post" | "read";

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
  enabled: boolean;
  idle_sleep_sec: number;
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

export interface StaffingConfig {
  /** v1 fixed: real_recruit (17 §10 / D009). */
  mode: "real_recruit" | "template";
  persona_dimensions: "full";
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
    skills_root: string;
    knowledge_root: string;
    prompts_root: string;
    secret_globs: string[];
  };
  git: {
    worktree_root: string;
    branch_template: string;
    base_branch: string;
    rebase_on_merge: boolean;
    merge_serial: boolean;
    force_dissolve_autocommit: boolean;
  };
  scheduler: { max_parallel_triads: number };
  timeouts: {
    progress_interval_sec: number;
    task_timeout_sec: number;
    draft_idle_sec: number;
    draft_idle_policy: "park" | "stop" | "run_lead_advance";
    cross_room_ttl_sec: number;
    failed_branch_ttl_sec: number;
  };
  rooms: RoomConfig[];
  roles: RoleConfig[];
  models: { default: string | null; check_model: string | null };
  research: { parallel_on_intake: boolean };
  info_pipeline: { require_run_lead_review: boolean };
  cross_room: { require_run_lead_present: boolean };
  work_brief: {
    require_run_lead_approval: boolean;
    seat_slicing: boolean;
    require_docs_assemble: boolean;
    allow_research_attach: boolean;
  };
  features: Record<string, boolean>;
  bus: { adapter: "file" | "messenger" };
  i18n: { locale: string; strings?: Record<string, string> };
}

const DEFAULTS: PicodeConfig = {
  config_schema_version: "1",
  sess_mgr: {
    enabled: true,
    idle_sleep_sec: 600,
    allow_orch_force_wake: true,
    max_awake: 8,
    always_register: true,
    rules: [
      { event: "run_created", wake: ["sess-mgr", "run-lead", "pm"] },
      {
        event: "intake_start",
        wake: ["run-lead", "pm"],
        wake_if: ["ind-res"],
      },
      { event: "sponsor_message", wake: ["run-lead"] },
      { event: "goal_active", wake: ["scout", "sys-arch"] },
      { event: "staffing_request", wake: ["people-lead", "recruiter", "people-qa"] },
      { event: "brief_assemble", wake: ["docs-lead", "tech-writer", "docs-qa"] },
      { event: "task_ready", wake_squad: true },
      { event: "progress_due", wake_squad_lead: true },
      { event: "merge_ready", wake: ["release-eng"], wake_gates: true },
      { event: "task_dissolved", terminate_squad: true },
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
    allow_bypass_write_paths: false,
    allow_implement_before_active: false,
    allow_agent_direct_messenger_io: false,
    allow_bare_bash: false,
    run_lead_advance_force_without_sponsor: false,
  },
  bus: { adapter: "file" },
  i18n: { locale: "zh-CN" },
};

// Note: sess_mgr / sponsor / staffing / cells.lifetime are typed per 17 §10.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(a: unknown, b: unknown): unknown {
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

function loadYamlFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return {};
  return YAML.parse(fs.readFileSync(filePath, "utf8")) ?? {};
}

export function loadConfig(repoRoot: string, runId?: string): PicodeConfig {
  const project = loadYamlFile(path.join(repoRoot, ".picode", "config.yaml"));
  let merged = deepMerge(DEFAULTS, project) as PicodeConfig;

  const profile = merged.active_profile;
  if (profile && profile !== "default") {
    const p = loadYamlFile(path.join(repoRoot, ".picode", "profiles", `${profile}.yaml`));
    merged = deepMerge(merged, p) as PicodeConfig;
  }

  if (runId) {
    const o = loadYamlFile(
      path.join(repoRoot, merged.paths.runs_root, runId, "config.override.yaml"),
    );
    merged = deepMerge(merged, o) as PicodeConfig;
  }

  validateConfig(merged);
  return merged;
}

export function validateConfig(config: PicodeConfig): void {
  const roleIds = new Set(config.roles.filter((r) => r.enabled !== false).map((r) => r.id));
  for (const [kind, t] of Object.entries(config.cells.templates)) {
    for (const key of ["lead_role", "doer_role", "check_role"] as const) {
      if (!roleIds.has(t[key])) {
        throw new Error(`cells.templates.${kind}.${key}=${t[key]} not in roles`);
      }
    }
  }
  const roomIds = new Set(config.rooms.filter((r) => r.enabled !== false).map((r) => r.id));
  for (const must of ["leadership", "product", "program", "docs", "people"]) {
    if (!roomIds.has(must)) {
      throw new Error(`required room disabled or missing: ${must}`);
    }
  }
  // Naming law R1: role id must never equal a room id
  for (const r of config.roles) {
    if (r.enabled === false) continue;
    if (roomIds.has(r.id)) {
      throw new Error(`naming law R1: role id "${r.id}" collides with room id`);
    }
  }
  // 17 §10 v1-fixed values: changing them is a config error, not a silent override.
  if (config.sponsor.human_only !== true) {
    throw new Error("sponsor.human_only must be true in v1 (sponsor is always human)");
  }
  if (config.staffing.mode !== "real_recruit") {
    throw new Error("staffing.mode must be real_recruit in v1 (true recruiting)");
  }
  if (config.staffing.persona_dimensions !== "full") {
    throw new Error("staffing.persona_dimensions must be full in v1 (17 §6)");
  }
  if (config.cells.lifetime !== "per_run") {
    throw new Error("cells.lifetime must be per_run in v1 (D019)");
  }
  if (!Number.isInteger(config.sess_mgr.max_awake) || config.sess_mgr.max_awake < 1) {
    throw new Error("sess_mgr.max_awake must be a positive integer");
  }
  if (config.features.allow_implement_before_active) {
    console.warn("[picode] WARNING: allow_implement_before_active=true");
  }
}

export function roomDisplay(config: PicodeConfig, id: string): string {
  const key = `room.${id}`;
  if (config.i18n.strings?.[key]) return config.i18n.strings[key];
  const room = config.rooms.find((r) => r.id === id);
  return room?.display_name ?? id;
}

export function roleDisplay(config: PicodeConfig, id: string): string {
  const key = `role.${id}`;
  if (config.i18n.strings?.[key]) return config.i18n.strings[key];
  const role = config.roles.find((r) => r.id === id);
  return role?.display_name ?? id;
}

export function getDefaultConfig(): PicodeConfig {
  return structuredClone(DEFAULTS);
}

/** Path to package root (picode monorepo). */
export function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..");
}
