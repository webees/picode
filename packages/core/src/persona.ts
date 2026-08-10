/**
 * Persona schema (17-agent-runtime §6: real recruiting, multi-dimensional).
 * Stored as YAML frontmatter of staffing/personas/<seat>.md.
 */

export interface Persona {
  schema_version: "1";
  seat: string;
  instance_id: string;
  /** 人设名（代号）— deterministic codename, see naming.ts (16 §8). */
  codename: string;
  display_name: string;
  /** 使命 — one-line mission for this task. */
  mission: string;
  /** 边界 */
  scope_in: string[];
  scope_out: string[];
  /** 能力 */
  skills: string[];
  stack: string[];
  /** 风格 */
  communication: string;
  risk_posture: string;
  /** 工具 — must agree with config tool_profiles and task write_paths */
  tool_profile: string;
  write_paths: string[];
  read_paths: string[];
  /** 协作 */
  reports_to: string | null;
  handoff_to: string | null;
  rooms_post: string[];
  /** 质量 */
  acceptance_focus: string[];
  definition_of_done: string;
  /** 禁区 */
  forbidden: string[];
  /** 记忆 — packet / brief paths */
  must_read_refs: string[];
  /** 检查 — check seats only (sdet). */
  check_rubric?: string | null;
}

/** Dimensions required by people-qa for every seat (16 §5.1 minimum checklist). */
export const REQUIRED_PERSONA_DIMENSIONS: Array<keyof Persona> = [
  "mission",
  "scope_in",
  "scope_out",
  "skills",
  "codename",
  "tool_profile",
  "write_paths",
  "forbidden",
  "must_read_refs",
  "definition_of_done",
];

export function hasPersonaDimension(p: Partial<Persona>, dim: keyof Persona): boolean {
  const v = p[dim];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

export function missingPersonaDimensions(p: Partial<Persona>): Array<keyof Persona> {
  return REQUIRED_PERSONA_DIMENSIONS.filter((d) => !hasPersonaDimension(p, d));
}
