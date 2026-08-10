import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import {
  ensureDir,
  loadConfig,
  runDir,
  writeAtomic,
  assertEvolveTargetRoot,
  type EvolveGoalSpec,
  type GoalKind,
  type PicodeConfig,
} from "@picode/core";
import { RoomStore } from "@picode/bus";
import { SessionStore, PLATFORM_ROLES } from "./session-store.js";

export interface GoalState {
  schema_version: string;
  id: string;
  title: string;
  intent: string;
  status: "intake" | "draft" | "active" | "blocked" | "completed" | "cancelled";
  scale: "S" | "M" | "L";
  /** 19 §4: delivery | self_evolve. */
  kind: GoalKind;
  /** 19 §4: MUST be picode monorepo for self_evolve. */
  target_repo: string | null;
  /** 19 §4: evolve spec (self_evolve only). */
  evolve: EvolveGoalSpec | null;
  open_questions: string[];
  acceptance: Array<{ id: string; type: string; spec: string }>;
  /** Product acceptance criteria from pm (18 phase E / P01). */
  product_acceptance: string[];
  non_goals: string[];
  run_lead_id: string;
  user_confirmed_at: string | null;
  created_at: string;
  /** Draft park (07§7): set when a draft is parked; unpark clears it. */
  parked_at: string | null;
  park_reason: string | null;
}

export function assertGitRepo(repoRoot: string): void {
  if (!fs.existsSync(path.join(repoRoot, ".git"))) {
    throw new Error("Not a git repository (MVP requires .git)");
  }
}

export function createRun(
  repoRoot: string,
  opts: {
    title: string;
    scale?: "S" | "M" | "L";
    intent?: string;
    kind?: GoalKind;
    targetRepo?: string;
    evolveLayers?: EvolveGoalSpec["layers"];
    evolveRisk?: EvolveGoalSpec["risk"];
  },
): { runId: string; config: PicodeConfig; dir: string } {
  assertGitRepo(repoRoot);
  const config = loadConfig(repoRoot);
  const kind = opts.kind ?? config.self_evolve.default_kind;
  const targetRepo = kind === "self_evolve"
    ? path.resolve(opts.targetRepo ?? repoRoot)
    : null;
  // 19 §4 MUST: self_evolve target must be the picode monorepo.
  if (kind === "self_evolve") {
    assertEvolveTargetRoot(targetRepo as string, config);
  }
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = runDir(repoRoot, config, runId);
  ensureDir(dir);
  ensureDir(path.join(dir, "tasks"));
  ensureDir(path.join(dir, "bus"));
  ensureDir(path.join(dir, "rooms"));
  ensureDir(path.join(dir, "research", "briefs"));
  ensureDir(path.join(dir, "docs"));
  ensureDir(path.join(dir, "gates"));
  ensureDir(path.join(dir, "approvals"));
  ensureDir(path.join(dir, "product"));

  const goal: GoalState = {
    schema_version: "1",
    id: `goal-${runId}`,
    title: opts.title,
    intent: opts.intent ?? opts.title,
    status: "intake",
    scale: opts.scale ?? "S",
    kind,
    target_repo: targetRepo,
    evolve: kind === "self_evolve"
      ? {
          layers: opts.evolveLayers ?? [],
          risk: opts.evolveRisk ?? "medium",
          baseline_ref: "main",
          success_metrics: ["npm test 全绿"],
          rollback: "git revert 合并提交 / 回退 tag",
          forbidden_paths: [...config.self_evolve.forbidden_path_globs],
        }
      : null,
    open_questions: [],
    acceptance: [],
    product_acceptance: [],
    non_goals: [],
    run_lead_id: "run-lead",
    user_confirmed_at: null,
    created_at: new Date().toISOString(),
    parked_at: null,
    park_reason: null,
  };
  writeAtomic(path.join(dir, "goal.yaml"), YAML.stringify(goal));
  writeAtomic(
    path.join(dir, "run.yaml"),
    YAML.stringify({
      schema_version: "1",
      run_id: runId,
      created_at: goal.created_at,
      repo_root: path.resolve(repoRoot),
      status: "open",
      halt: false,
    }),
  );
  writeAtomic(path.join(dir, "chunks.yaml"), YAML.stringify({ chunks: [] }));
  writeAtomic(path.join(dir, "secret.txt"), crypto.randomBytes(32).toString("hex"));

  const bus = new RoomStore(dir);
  // Stage E (18 §4): sponsor is a human channel — only `chat` posts via bus;
  // confirmations/change orders go through CLI (goal set-status etc.).
  bus.saveMembers("leadership", [
    { id: "run-lead", access: "post" },
    { id: "sponsor", access: "post", post_types_allow: ["chat"] },
    { id: "sess-mgr", access: "post" },
    { id: "tpm", access: "post" },
    { id: "proc-audit", access: "post", post_types_allow: ["drift", "alert"] },
    { id: "pm", access: "read" },
    { id: "ind-res", access: "post" },
  ]);
  bus.saveMembers("product", [
    { id: "pm", access: "post" },
    { id: "sponsor", access: "post", post_types_allow: ["chat"] },
    { id: "run-lead", access: "post" },
    { id: "sess-mgr", access: "read" },
  ]);
  bus.saveMembers("program", [
    { id: "tpm", access: "post" },
    { id: "run-lead", access: "read" },
    { id: "proc-audit", access: "read" },
    { id: "sess-mgr", access: "read" },
  ]);
  bus.saveMembers("research", [
    { id: "ind-res", access: "post" },
    { id: "run-lead", access: "read" },
    { id: "tpm", access: "read" },
  ]);
  bus.saveMembers("docs", [
    { id: "docs-lead", access: "post" },
    { id: "tech-writer", access: "post" },
    { id: "docs-qa", access: "post" },
    { id: "run-lead", access: "read" },
  ]);
  bus.saveMembers("people", [
    { id: "people-lead", access: "post" },
    { id: "recruiter", access: "post" },
    { id: "people-qa", access: "post" },
    { id: "run-lead", access: "post" },
    { id: "tpm", access: "read" },
  ]);

  // Stage A (18 §4): register every on platform role as sleeping (sponsor is
  // never registered). Wake decisions belong to the stage-B rules engine.
  const sessions = new SessionStore(dir);
  if (config.sess_mgr.always_register) {
    for (const roleId of PLATFORM_ROLES) {
      sessions.register(roleId, { initialState: "sleeping" });
    }
  }

  return { runId, config, dir };
}

export function readGoal(dir: string): GoalState {
  const raw = YAML.parse(fs.readFileSync(path.join(dir, "goal.yaml"), "utf8")) as Partial<GoalState>;
  // Backward-compat: older goals have no kind — treat as delivery.
  return Object.assign({ kind: "delivery", target_repo: null, evolve: null }, raw) as GoalState;
}

export function writeGoal(dir: string, goal: GoalState): void {
  writeAtomic(path.join(dir, "goal.yaml"), YAML.stringify(goal));
}

export function setGoalStatus(
  dir: string,
  status: GoalState["status"],
  opts?: { clearOpenQuestions?: boolean; skipProductAcceptanceCheck?: boolean },
): GoalState {
  const goal = readGoal(dir);
  if (status === "active") {
    if (goal.open_questions.length > 0 && !opts?.clearOpenQuestions) {
      throw new Error("open_questions non-empty; cannot activate");
    }
    if (goal.product_acceptance.length === 0 && !opts?.skipProductAcceptanceCheck) {
      throw new Error("no product acceptance criteria; cannot activate (P01)");
    }
    goal.user_confirmed_at = new Date().toISOString();
  }
  goal.status = status;
  writeGoal(dir, goal);
  return goal;
}

/**
 * Draft park (07§7 / 12-threat-model): a parked draft cannot silently become
 * active — activation requires an explicit sponsor/run-lead unpark.
 */
export function parkGoal(dir: string, reason = "draft-idle"): GoalState {
  const goal = readGoal(dir);
  if (goal.status !== "draft") {
    throw new Error(`only draft goals can be parked (current: ${goal.status})`);
  }
  goal.parked_at = new Date().toISOString();
  goal.park_reason = reason;
  writeGoal(dir, goal);
  return goal;
}

export function unparkGoal(dir: string): GoalState {
  const goal = readGoal(dir);
  goal.parked_at = null;
  goal.park_reason = null;
  writeGoal(dir, goal);
  return goal;
}

/** `draft` goals idle beyond draft_idle_sec are parked by default (park policy). */
export function sweepDraftPark(dir: string, config: PicodeConfig): GoalState | null {
  const goal = readGoal(dir);
  if (goal.status !== "draft" || goal.parked_at) return null;
  if (config.timeouts.draft_idle_policy !== "park") return null;
  const idleSec = config.timeouts.draft_idle_sec;
  const lastTouch = goal.created_at;
  const idle = (Date.now() - Date.parse(lastTouch)) / 1000;
  if (idle >= idleSec) {
    return parkGoal(dir, "draft-idle-sweep");
  }
  return null;
}

/** Record product acceptance criteria (pm) and write product/brief.md (P01). */
export function setProductAcceptance(dir: string, items: string[]): GoalState {
  const goal = readGoal(dir);
  goal.product_acceptance = items;
  writeGoal(dir, goal);
  ensureDir(path.join(dir, "product"));
  const md =
    `# Product Brief\n\n` +
    `## Acceptance criteria\n\n` +
    items.map((i) => `- ${i}`).join("\n") +
    `\n`;
  writeAtomic(path.join(dir, "product", "brief.md"), md);
  return goal;
}

export function resolveRunDir(
  repoRoot: string,
  runId: string,
): { dir: string; config: ReturnType<typeof loadConfig> } {
  const config = loadConfig(repoRoot, runId);
  const dir = runDir(repoRoot, config, runId);
  if (!fs.existsSync(dir)) throw new Error(`run not found: ${runId}`);
  return { dir, config };
}
