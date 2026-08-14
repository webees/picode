import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  branchName,
  ensureDir,
  matchGlob,
  readYamlFile,
  withFileLock,
  worktreePath,
  writeAtomic,
  type PicodeConfig,
  writeYamlFile,
} from "@picode/core";
import { RoomStore, issueToken } from "@picode/bus";
import { readGoal } from "./run-store.js";
import { assertStaffingApproved } from "./staffing.js";

/** chunk id safe-name pattern: becomes the `tasks/task-<chunkId>` directory name. */
export const SAFE_CHUNK_ID_RE = /^[A-Za-z0-9_-]+$/;

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

export async function addChunkAndTask(
  _repoRoot: string,
  dir: string,
  config: PicodeConfig,
  opts: { chunkId: string; writePaths: string[]; readPaths?: string[] },
): Promise<{ taskId: string }> {
  // 路径安全：chunkId 直接拼成 tasks/task-<id> 目录名，非法值（含 `/`、`..`）拒绝，
  // 防逃逸 run 布局错写其它状态文件（P0）。
  if (!SAFE_CHUNK_ID_RE.test(opts.chunkId)) {
    throw new Error(`chunk id "${opts.chunkId}" is not safe (letters/digits/_/- only)`);
  }
  const goal = readGoal(dir);
  if (goal.status !== "active" && !config.features.allow_implement_before_active) {
    throw new Error("goal not active; cannot add implement task");
  }
  const chunksPath = path.join(dir, "chunks.yaml");
  const taskId = `task-${opts.chunkId}`;
  const writePaths = opts.writePaths;
  const readPaths = opts.readPaths ?? [];
  // 并发安全（P1）：chunks.yaml 读-改-写持锁，多个进程并发 chunk add 不互相覆盖
  await withFileLock(path.join(dir, ".chunks.lock"), () => {
    const data = readYamlFile<{ chunks: Array<Record<string, unknown>> }>(chunksPath)!;
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
    writeYamlFile(chunksPath, data);
  });

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
  writeYamlFile(path.join(taskDir, "task.yaml"), task);

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
  writeYamlFile(
    path.join(briefDir, "brief.yaml"),
    {
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
    },
  );
}

export function approveBrief(dir: string, taskId: string, by: string): void {
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  const brief = readYamlFile<Record<string, unknown>>(p)!;
  brief.status = "approved";
  brief.approved_by = by;
  brief.approved_at = new Date().toISOString();
  writeYamlFile(p, brief);
}

/**
 * 单一判据（P1：原 self-drive/staffing 各自实现且判据不一致）：
 * brief 已批准 = status==="approved" ∧（配置要求时）approved_by 存在。
 */
export function isBriefApproved(dir: string, taskId: string, config: PicodeConfig): boolean {
  if (!config.work_brief.require_run_lead_approval) return true;
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) return false;
  const b = readYamlFile<{ status?: string; approved_by?: string }>(p);
  return b?.status === "approved" && !!b.approved_by;
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

  const task = readYamlFile<TaskState>(
    path.join(dir, "tasks", taskId, "task.yaml"),
  )!;

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
  writeYamlFile(path.join(dir, "tasks", taskId, "triad.yaml"), triad);
  task.status = "assigned";
  writeYamlFile(path.join(dir, "tasks", taskId, "task.yaml"), task);

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
  const triad = readYamlFile<{
    worktree_path: string;
    seats: Record<string, { agent_id: string; token: string }>;
  }>(path.join(dir, "tasks", taskId, "triad.yaml"))!;
  const task = readYamlFile<TaskState>(
    path.join(dir, "tasks", taskId, "task.yaml"),
  )!;
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
