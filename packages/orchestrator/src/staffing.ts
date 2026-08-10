import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  assertSafeName,
  ensureDir,
  evolveWritePaths,
  generateCodename,
  generateTeamName,
  missingPersonaDimensions,
  simpleGlobMatch,
  writeAtomic,
  type Persona,
  type PicodeConfig,
} from "@picode/core";
import { readGoal } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { applyEvent } from "./rules-engine.js";

export interface StaffingRequest {
  id: string;
  task_id: string;
  from: string;
  status: "submitted" | "in_hr" | "run_lead_review" | "approved" | "rejected";
  skills_wanted: string[];
  constraints: string[];
  notes: string;
  reuse_persona_ids: string[];
  /** Optional triad team name; defaults to a deterministic name (16 §8). */
  team_name?: string;
  /** Optional per-seat codename overrides, e.g. { engineer: "白泽" } (16 §8). */
  codename_overrides?: Record<string, string>;
  created_at: string;
}

export interface StaffingSeat {
  role_template: string;
  agent_id: string;
  tool_profile: string;
  persona_file: string;
  display_name: string | null;
}

export interface StaffingState {
  schema_version: "1";
  task_id: string;
  request_id: string;
  status: "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  /** Triad team name (16 §8) — deterministic or requested override. */
  team_name: string;
  triad: Record<string, StaffingSeat>;
}

export const SEATS = ["squad-lead", "engineer", "sdet"] as const;
export type Seat = (typeof SEATS)[number];
function staffingDir(dir: string, taskId: string): string {
  return path.join(dir, "tasks", taskId, "staffing");
}

export function readStaffingRequest(dir: string, taskId: string): StaffingRequest | null {
  const p = path.join(staffingDir(dir, taskId), "request.yaml");
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as StaffingRequest;
}

export function readStaffing(dir: string, taskId: string): StaffingState | null {
  const p = path.join(staffingDir(dir, taskId), "staffing.yaml");
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as StaffingState;
}

export function readTaskYaml(dir: string, taskId: string): {
  id: string;
  write_paths: string[];
  read_paths: string[];
  acceptance: Array<{ id: string; type: string; spec: string }>;
  triad: Record<string, string>;
  work_room: string;
} {
  const task = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "task.yaml"), "utf8"),
  );
  return task as {
    id: string;
    write_paths: string[];
    read_paths: string[];
    acceptance: Array<{ id: string; type: string; spec: string }>;
    triad: Record<string, string>;
    work_room: string;
  };
}

/** `staffing request`: run-lead standard → people. Wakes the people cell. */
export async function createStaffingRequest(
  dir: string,
  config: PicodeConfig,
  taskId: string,
  opts: {
    skills?: string[];
    constraints?: string[];
    notes?: string;
    teamName?: string;
    codenameOverrides?: Record<string, string>;
  } = {},
): Promise<{ request: StaffingRequest }> {
  if (readStaffingRequest(dir, taskId)) {
    throw new Error(`staffing request already exists for ${taskId}`);
  }
  const request: StaffingRequest = {
    id: `staff-req-${taskId}`,
    task_id: taskId,
    from: "run-lead",
    status: "submitted",
    skills_wanted: opts.skills ?? [],
    constraints: opts.constraints ?? [],
    notes: opts.notes ?? "",
    reuse_persona_ids: [],
    ...(opts.teamName ? { team_name: opts.teamName } : {}),
    ...(opts.codenameOverrides && Object.keys(opts.codenameOverrides).length > 0
      ? { codename_overrides: opts.codenameOverrides }
      : {}),
    created_at: new Date().toISOString(),
  };
  ensureDir(staffingDir(dir, taskId));
  writeAtomic(path.join(staffingDir(dir, taskId), "request.yaml"), YAML.stringify(request));
  await applyEvent(dir, config, "staffing_request");
  return { request };
}

/** Parse YAML frontmatter + body of a persona markdown file. */
export function parsePersonaFile(filePath: string): { frontmatter: Persona; body: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`persona file missing frontmatter: ${filePath}`);
  const frontmatter = YAML.parse(m[1]) as Persona;
  if (!frontmatter || typeof frontmatter !== "object") {
    throw new Error(`persona frontmatter not an object: ${filePath}`);
  }
  return { frontmatter, body: m[2] ?? "" };
}

function serializePersona(p: Persona, body: string): string {
  return `---\n${YAML.stringify(p).trimEnd()}\n---\n${body}\n`;
}

/**
 * `staffing draft-personas`: mechanical draft from role template + request +
 * task facts. A real recruiter LLM session would fill the same frontmatter.
 */
export function draftPersonas(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
): { personas: string[] } {
  const request = readStaffingRequest(dir, taskId);
  if (!request) throw new Error(`no staffing request for ${taskId}`);
  const task = readTaskYaml(dir, taskId);
  const outDir = path.join(staffingDir(dir, taskId), "personas");
  ensureDir(outDir);

  const roles = new Map(config.roles.map((r) => [r.id, r]));
  const overrides = request.codename_overrides ?? {};
  const written: string[] = [];
  for (const seat of SEATS) {
    const instanceId = `${seat}@${taskId}`;
    const role = roles.get(seat);
    const profile = role?.tool_profile ?? `implement.${seat}`;
    const templatePath = path.join(repoRoot, ".picode", "agents", `${seat}.md`);
    const templateBody = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, "utf8").trim()
      : `你是 ${seat}(逻辑 id: ${seat})。\n`;
    const persona: Persona = {
      schema_version: "1",
      seat,
      instance_id: instanceId,
      codename: overrides[seat] ?? generateCodename(instanceId),
      display_name: role?.display_name ?? seat,
      mission: `完成 ${taskId} 的职责(见 brief 与 acceptance)`,
      scope_in: task.write_paths,
      scope_out: ["修改 write_paths 之外文件", ...request.constraints],
      skills: request.skills_wanted,
      stack: [],
      communication: "concise",
      risk_posture: "conservative",
      tool_profile: profile,
      write_paths: task.write_paths,
      read_paths: task.read_paths,
      reports_to: seat === "squad-lead" ? "run-lead" : `${"squad-lead"}@${taskId}`,
      handoff_to:
        seat === "squad-lead" ? `sdet@${taskId}` : seat === "engineer" ? `sdet@${taskId}` : null,
      rooms_post: [task.work_room],
      acceptance_focus: task.acceptance.map((a) => a.spec),
      definition_of_done: `evidence pass + acceptance 全部通过(exit_code=0)`,
      forbidden: ["私自 web 访问", "修改 write_paths 之外文件", "终裁 goal/merge"],
      must_read_refs: [
        path.join(dir, "tasks", taskId, "brief", "WORK_BRIEF.md"),
        path.join(dir, "tasks", taskId, "task.yaml"),
      ],
      check_rubric: seat === "sdet" ? "打回标准:acceptance 未达 / evidence 缺失 / 越界 diff" : null,
    };
    const file = path.join(outDir, `${seat}.md`);
    writeAtomic(file, serializePersona(persona, templateBody));
    written.push(file);
  }
  request.status = "in_hr";
  writeAtomic(path.join(staffingDir(dir, taskId), "request.yaml"), YAML.stringify(request));
  return { personas: written };
}

export interface QaIssue {
  seat: string;
  problems: string[];
}

/** people-qa validator (16 §5 / 17 §6): dimension completeness + profile/paths consistency. */
export function checkPersonas(dir: string, config: PicodeConfig, taskId: string): QaIssue[] {
  const base = staffingDir(dir, taskId);
  const task = readTaskYaml(dir, taskId);
  const goal = readGoal(dir);
  const evolve = goal.kind === "self_evolve" ? goal.evolve : null;
  const evolveAllowed = evolve
    ? evolveWritePaths(config, evolve)
    : null;
  const expectedProfiles = new Map(
    config.roles.filter((r) => r.enabled !== false).map((r) => [r.id, r.tool_profile]),
  );
  const issues: QaIssue[] = [];

  for (const seat of SEATS) {
    const file = path.join(base, "personas", `${seat}.md`);
    const problems: string[] = [];
    if (!fs.existsSync(file)) {
      problems.push(`persona file missing: personas/${seat}.md`);
      issues.push({ seat, problems });
      continue;
    }
    const { frontmatter } = parsePersonaFile(file);
    const missing = missingPersonaDimensions(frontmatter);
    if (missing.length) problems.push(`missing dimensions: ${missing.join(", ")}`);
    // 16 §8: codename doubles as an archive file name — unsafe names must fail
    try {
      assertSafeName(frontmatter.codename, "codename");
    } catch (e) {
      problems.push((e as Error).message);
    }
    if (frontmatter.seat !== seat) problems.push(`seat mismatch: ${frontmatter.seat}`);
    const expectedId = `${seat}@${taskId}`;
    if (frontmatter.instance_id !== expectedId) {
      problems.push(`instance_id should be ${expectedId}`);
    }
    const expectedProfile = expectedProfiles.get(seat);
    if (expectedProfile && frontmatter.tool_profile !== expectedProfile) {
      problems.push(`tool_profile=${frontmatter.tool_profile}, expected ${expectedProfile}`);
    }
    const outOfWrite = (frontmatter.write_paths ?? []).filter(
      (w) => !task.write_paths.includes(w),
    );
    if (outOfWrite.length) problems.push(`write_paths outside task: ${outOfWrite.join(", ")}`);
    // E7 (19 §5): self_evolve personas must declare forbidden paths and stay
    // inside the allowed-layer write paths.
    if (evolve && evolveAllowed) {
      const forbidden = Array.isArray(frontmatter.forbidden)
        ? (frontmatter.forbidden as string[])
        : [];
      if (forbidden.length === 0) {
        problems.push("E7: self_evolve persona must declare forbidden[]");
      }
      const wp = Array.isArray(frontmatter.write_paths)
        ? (frontmatter.write_paths as string[])
        : [];
      const outsideLayer = wp.filter(
        (w) => !evolveAllowed.some((glob) => simpleGlobMatch(glob, w.replace(/\\/g, "/"))),
      );
      if (outsideLayer.length) {
        problems.push(`E7: write_paths outside evolve layers: ${outsideLayer.join(", ")}`);
      }
    }
    if (problems.length) issues.push({ seat, problems });
  }
  return issues;
}

export function assertStaffingApproved(
  dir: string,
  taskId: string,
  opts: { require?: boolean } = {},
): void {
  if (opts.require === false) return;
  const staffing = readStaffing(dir, taskId);
  if (!staffing || staffing.status !== "approved" || !staffing.approved_by) {
    throw new Error("staffing not approved by run-lead (double latch unmet)");
  }
}

function briefApproved(dir: string, taskId: string, config: PicodeConfig): boolean {
  if (!config.work_brief.require_run_lead_approval) return true;
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) return false;
  const b = YAML.parse(fs.readFileSync(p, "utf8")) as {
    status?: string;
    approved_by?: string;
  };
  return b.status === "approved" && !!b.approved_by;
}

/**
 * `staffing approve`: people-qa check → lock staffing.yaml → register triad
 * sessions → if work brief already approved, fire task_ready (both latches).
 */
export async function approveStaffing(
  dir: string,
  config: PicodeConfig,
  taskId: string,
  by = "run-lead",
): Promise<{ staffing: StaffingState; wokeSquad: boolean }> {
  const issues = checkPersonas(dir, config, taskId);
  if (issues.length) {
    throw new Error(
      `people-qa failed:\n` +
        issues.map((i) => `  ${i.seat}: ${i.problems.join("; ")}`).join("\n"),
    );
  }
  const request = readStaffingRequest(dir, taskId);
  if (!request) throw new Error(`no staffing request for ${taskId}`);

  const task = readTaskYaml(dir, taskId);
  const teamName = request.team_name ?? generateTeamName(taskId);
  // 16 §8: team_name doubles as an archive file name — unsafe overrides must fail
  assertSafeName(teamName, "team_name");
  const triad: Record<string, StaffingSeat> = {};
  for (const seat of SEATS) {
    const persona = parsePersonaFile(
      path.join(staffingDir(dir, taskId), "personas", `${seat}.md`),
    ).frontmatter;
    triad[seat] = {
      role_template: seat,
      agent_id: persona.instance_id,
      tool_profile: persona.tool_profile,
      persona_file: `personas/${seat}.md`,
      display_name: persona.display_name,
    };
  }
  const staffing: StaffingState = {
    schema_version: "1",
    task_id: taskId,
    request_id: request.id,
    status: "approved",
    approved_by: by,
    approved_at: new Date().toISOString(),
    team_name: teamName,
    triad,
  };
  writeAtomic(path.join(staffingDir(dir, taskId), "staffing.yaml"), YAML.stringify(staffing));

  // recruiter builds the group: register triad sessions as sleeping (17 §3.4)
  const sessions = new SessionStore(dir);
  for (const seat of SEATS) {
    const s = triad[seat];
    if (!sessions.get(s.agent_id)) {
      sessions.register(seat, { agentId: s.agent_id, initialState: "sleeping" });
    }
  }
  request.status = "approved";
  writeAtomic(path.join(staffingDir(dir, taskId), "request.yaml"), YAML.stringify(request));

  // P04 delivery: the people cell's job is done — put it back to sleep so
  // gate wakes (merge_ready etc.) are not throttled by max_awake.
  for (const p of ["people-lead", "recruiter", "people-qa"]) {
    const s = sessions.get(p);
    if (s?.state === "awake") {
      await sessions.sleep(p, "staffing-delivered");
    }
  }

  // Double latch: wake squad when the work brief is also approved (P05).
  let wokeSquad = false;
  if (briefApproved(dir, taskId, config)) {
    await applyEvent(dir, config, "task_ready", { taskId });
    wokeSquad = true;
  }
  return { staffing, wokeSquad };
}
