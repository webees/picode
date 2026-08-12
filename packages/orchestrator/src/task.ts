import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import {
  branchName,
  ensureDir,
  matchGlob,
  readYamlFile,
  worktreePath,
  writeAtomic,
  type PicodeConfig,
} from "@picode/core";
import { RoomStore, issueToken } from "@picode/bus";
import { readGoal } from "./run-store.js";
import { assertStaffingApproved } from "./staffing.js";

export interface TaskState {
  id: string;
  chunk_id: string;
  goal_id: string;
  kind: "implement" | "integrate";
  status: string;
  write_paths: string[];
  read_paths: string[];
  acceptance: Array<{ id: string; type: string; spec: string }>;
  triad: { "squad-lead": string; engineer: string; sdet: string };
  work_room: string;
  retries: number;
  max_retries: number;
}

/** Default first acceptance gate attached to every chunk/task (P02). */
const DEFAULT_ACCEPTANCE = [{ id: "C1", type: "command", spec: "<project-test-command>" }];

export function addChunkAndTask(
  _repoRoot: string,
  dir: string,
  config: PicodeConfig,
  opts: { chunkId: string; writePaths: string[]; readPaths?: string[] },
): { taskId: string } {
  const goal = readGoal(dir);
  if (goal.status !== "active" && !config.features.allow_implement_before_active) {
    throw new Error("goal not active; cannot add implement task");
  }
  const chunksPath = path.join(dir, "chunks.yaml");
  const data = readYamlFile<{ chunks: Array<Record<string, unknown>> }>(chunksPath)!;
  const taskId = `task-${opts.chunkId}`;
  const writePaths = opts.writePaths;
  const readPaths = opts.readPaths ?? [];
  data.chunks.push({
    id: opts.chunkId,
    write_paths: writePaths,
    read_paths: readPaths,
    public_contract: null,
    depends_on: [],
    shared_files: [],
    acceptance: DEFAULT_ACCEPTANCE,
    status: "ready",
    task_id: taskId,
  });
  writeAtomic(chunksPath, YAML.stringify(data));

  const task: TaskState = {
    id: taskId,
    chunk_id: opts.chunkId,
    goal_id: goal.id,
    kind: "implement",
    status: "queued",
    write_paths: writePaths,
    read_paths: readPaths,
    acceptance: DEFAULT_ACCEPTANCE,
    triad: {
      "squad-lead": `squad-lead@${taskId}`,
      engineer: `engineer@${taskId}`,
      sdet: `sdet@${taskId}`,
    },
    work_room: `squad-${taskId}`,
    retries: 0,
    max_retries: 3,
  };
  const taskDir = path.join(dir, "tasks", taskId);
  ensureDir(taskDir);
  ensureDir(path.join(taskDir, "brief"));
  ensureDir(path.join(taskDir, "evidence"));
  ensureDir(path.join(taskDir, "handoff"));
  ensureDir(path.join(taskDir, "inbox"));
  writeAtomic(path.join(taskDir, "task.yaml"), YAML.stringify(task));

  const store = new RoomStore(dir);
  store.saveMembers(task.work_room, [
    { id: task.triad["squad-lead"], access: "post" },
    { id: task.triad.engineer, access: "post" },
    { id: task.triad.sdet, access: "post" },
    { id: "tpm", access: "post" },
    { id: "run-lead", access: "read" },
  ]);

  return { taskId };
}

export function draftBrief(dir: string, taskId: string): void {
  const briefDir = path.join(dir, "tasks", taskId, "brief");
  ensureDir(briefDir);
  const md = `# Work Brief\n\n## Objectives\n\n- (run-lead: fill in)\n\n## Non-goals\n\n- \n\n## Acceptance\n\nSee task.yaml\n\n## Forbidden\n\n- No web access; use request_info\n- Stay inside write_paths\n`;
  writeAtomic(path.join(briefDir, "WORK_BRIEF.md"), md);
  writeAtomic(
    path.join(briefDir, "brief.yaml"),
    YAML.stringify({
      schema_version: "1",
      task_id: taskId,
      version: 1,
      status: "draft",
      drafted_by: "run-lead",
      assembled_by: "tech-writer",
      approved_by: null,
      approved_at: null,
      objectives: [],
      non_goals: [],
    }),
  );
}

export function approveBrief(dir: string, taskId: string, by: string): void {
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  const brief = readYamlFile<Record<string, unknown>>(p)!;
  brief.status = "approved";
  brief.approved_by = by;
  brief.approved_at = new Date().toISOString();
  writeAtomic(p, YAML.stringify(brief));
}

export function assertBriefApproved(dir: string, taskId: string, config: PicodeConfig): void {
  if (!config.work_brief.require_run_lead_approval) return;
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) throw new Error("work brief missing");
  const brief = readYamlFile<{ status?: string; approved_by?: string }>(p)!;
  if (brief.status !== "approved" || !brief.approved_by) {
    throw new Error("work brief not approved by run-lead");
  }
}

/** P05 double latch: goal active ∧ work brief approved ∧ staffing approved. */
export function assertPrepareAllowed(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
): void {
  void repoRoot;
  const goal = readGoal(dir);
  if (goal.status !== "active" && !config.features.allow_implement_before_active) {
    throw new Error("goal not active");
  }
  assertBriefApproved(dir, taskId, config);
  assertStaffingApproved(dir, taskId);
}

export function prepareTask(
  repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
): { worktree: string; branch: string } {
  // P05 double latch: goal active ∧ work brief approved ∧ staffing approved.
  assertPrepareAllowed(repoRoot, dir, config, taskId);

  const task = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "task.yaml"), "utf8"),
  ) as TaskState;

  const wt = worktreePath(repoRoot, config, path.basename(dir), taskId);
  const branch = branchName(config, path.basename(dir), taskId);
  ensureDir(path.dirname(wt));

  if (!fs.existsSync(wt)) {
    try {
      execFileSync(
        "git",
        ["worktree", "add", "-b", branch, wt, config.git.base_branch],
        { cwd: repoRoot, stdio: "pipe" },
      );
    } catch (e) {
      // branch may exist
      execFileSync("git", ["worktree", "add", wt, branch], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    }
  }

  const secret = fs.readFileSync(path.join(dir, "secret.txt"), "utf8").trim();
  const triad = {
    task_id: taskId,
    status: "forming",
    worktree_path: wt,
    branch,
    seats: {
      "squad-lead": {
        agent_id: task.triad["squad-lead"],
        token: issueToken(task.triad["squad-lead"], secret),
      },
      engineer: {
        agent_id: task.triad.engineer,
        token: issueToken(task.triad.engineer, secret),
      },
      sdet: {
        agent_id: task.triad.sdet,
        token: issueToken(task.triad.sdet, secret),
      },
    },
  };
  writeAtomic(path.join(dir, "tasks", taskId, "triad.yaml"), YAML.stringify(triad));
  task.status = "assigned";
  writeAtomic(path.join(dir, "tasks", taskId, "task.yaml"), YAML.stringify(task));

  return { worktree: wt, branch };
}

export function printSpawnEnv(
  _repoRoot: string,
  dir: string,
  config: PicodeConfig,
  taskId: string,
  seat: "squad-lead" | "engineer" | "sdet",
  extensionPath: string,
): string {
  const triad = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "triad.yaml"), "utf8"),
  ) as {
    worktree_path: string;
    seats: Record<string, { agent_id: string; token: string }>;
  };
  const task = YAML.parse(
    fs.readFileSync(path.join(dir, "tasks", taskId, "task.yaml"), "utf8"),
  ) as TaskState;
  const seatInfo = triad.seats[seat];
  const profile =
    seat === "squad-lead"
      ? "implement.squad-lead"
      : seat === "engineer"
        ? "implement.engineer"
        : "implement.sdet";

  const env = {
    PICODE_RUN_ID: path.basename(dir),
    PICODE_RUNS_ROOT: path.dirname(dir),
    PICODE_AGENT_ID: seatInfo.agent_id,
    PICODE_AGENT_TOKEN: seatInfo.token,
    PICODE_TOOL_PROFILE: profile,
    PICODE_WRITE_PATHS: JSON.stringify(task.write_paths),
    PICODE_READ_PATHS: JSON.stringify(task.read_paths),
    PICODE_CWD: triad.worktree_path,
    PICODE_TASK_ID: taskId,
    PICODE_SQUAD_ROOM: task.work_room,
    PICODE_WORK_ROOM: task.work_room, // alias
    PICODE_BRIEF: path.join(dir, "tasks", taskId, "brief", "WORK_BRIEF.md"),
    PICODE_RUN_ALLOWLIST: JSON.stringify(config.run_allowlist ?? []),
  };

  const exportLines = Object.entries(env)
    .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
    .join("\n");

  return `${exportLines}\ncd ${JSON.stringify(triad.worktree_path)}\npi -e ${JSON.stringify(extensionPath)}\n# then paste role prompt + brief for ${seat}\n`;
}

export function checkWritePathsInDiff(
  worktree: string,
  baseSha: string,
  writePaths: string[],
): { ok: boolean; offenders: string[]; files: string[] } {
  let out = "";
  try {
    out = execFileSync("git", ["diff", "--name-only", `${baseSha}...HEAD`], {
      cwd: worktree,
      encoding: "utf8",
    });
  } catch {
    // base may be unresolvable (unborn branch etc.). A write-path gate must
    // never silently relax to a weaker check: refuse unless the base is real.
    try {
      execFileSync("git", ["rev-parse", "--verify", baseSha], {
        cwd: worktree,
        stdio: "pipe",
      });
    } catch {
      throw new Error(
        `cannot resolve base ref "${baseSha}" for write-path gate; refusing weaker check`,
      );
    }
    out = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: worktree,
      encoding: "utf8",
    });
  }
  const files = out.split("\n").map((s) => s.trim()).filter(Boolean);
  const offenders = files.filter((f) => !matchGlob(f, writePaths));
  return { ok: offenders.length === 0, offenders, files };
}
