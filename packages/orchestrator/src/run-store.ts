import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ErrorCode,
  PicodeError,
  assertEvolveTargetRoot,
  ensureDir,
  loadConfig,
  readYamlFile,
  runDir,
  writeAtomic,
  writeYamlFile,
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
  // ---------------------------------------------------------------------------
  // C1 goal-crossrun 增量字段（D002 文件真相不变；revision 仅作 CAS 围栏，
  // 不引入事件日志重建状态）。旧格式 goal.yaml 缺省时由 readGoal Object.assign
  // 补齐默认值（A1 向后兼容）。
  // ---------------------------------------------------------------------------
  /**
   * 修订号（CAS 围栏）：每次 goal 变更 +1；写方携带 expected revision，
   * 与当前不符 → 陈旧写拒绝（ILLEGAL_TRANSITION，复用 errors.ts 既有码）。
   * 旧格式缺省 0。
   */
  revision: number;
  /** 已启动回合数：guardian 每次成功续跑投喂 +1（recordGoalRound）。旧格式缺省 0。 */
  rounds_started: number;
  /**
   * 回合预算上限：rounds_started ≤ max_goal_rounds（0 = 不限）。创建时取自
   * config `self_evolve.goal.max_rounds`；goal.yaml 显式字段可覆盖（文件真相）。
   * 达上限 resume 拒绝且 guardian 自动 block(code:"round-limit")。
   */
  max_goal_rounds: number;
  /**
   * 续跑激活授权：armed = guardian 可机械续跑投喂；disarmed = 零投喂。
   * 新 run 默认 disarmed（无显式 resume 不自动续跑）；set-status 不自动 arm；
   * `picode goal resume` 才置 armed。旧格式 active goal 按 set-status 语义
   * 默认 armed（行为兼容），其余状态默认 disarmed。
   */
  activation: "armed" | "disarmed";
  /** 阻塞政策码 + 解释（status=blocked 时）：{code: lower-kebab, message}。 */
  blocked_reason: { code: string; message: string } | null;
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
    // C1 goal-crossrun 增量字段初值：revision 0、回合预算取自 config（可被
    // goal.yaml 显式覆盖）、activation 默认 disarmed（无显式 resume 不自动续跑）。
    revision: 0,
    rounds_started: 0,
    max_goal_rounds: config.self_evolve.goal.max_rounds,
    activation: "disarmed",
    blocked_reason: null,
  };
  writeYamlFile(path.join(dir, "goal.yaml"), goal);
  writeYamlFile(
    path.join(dir, "run.yaml"),
    {
      schema_version: "1",
      run_id: runId,
      created_at: goal.created_at,
      repo_root: path.resolve(repoRoot),
      status: "open",
      halt: false,
    },
  );
  // 11 stage 0: schema_version on every run state root file
  writeYamlFile(path.join(dir, "chunks.yaml"), { schema_version: "1", chunks: [] });
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
  // Remaining default-on rooms (terminology §3) with a fixed owner cell
  // (02 §2): knowledge is operated by the docs trio (15), the gate rooms by
  // their gate seats, architecture by the planning seats. `announce` / `collab`
  // are dynamic (broadcast on goal completion, handoff notices) — their
  // members are added when used, like squad-*/meeting-*.
  bus.saveMembers("architecture", [
    { id: "scout", access: "post" },
    { id: "sys-arch", access: "post" },
    { id: "run-lead", access: "read" },
    { id: "tpm", access: "read" },
  ]);
  bus.saveMembers("knowledge", [
    { id: "docs-lead", access: "post" },
    { id: "tech-writer", access: "post" },
    { id: "docs-qa", access: "post" },
    { id: "run-lead", access: "read" },
  ]);
  bus.saveMembers("release", [
    { id: "release-eng", access: "post" },
    { id: "run-lead", access: "read" },
  ]);
  bus.saveMembers("quality", [
    { id: "code-review", access: "post" },
    { id: "run-lead", access: "read" },
    { id: "tpm", access: "read" },
  ]);
  bus.saveMembers("security", [
    { id: "sec-eng", access: "post" },
    { id: "run-lead", access: "read" },
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
  const raw = readYamlFile<Partial<GoalState>>(path.join(dir, "goal.yaml")) ?? {};
  return Object.assign(
    {
      // 旧格式缺省（A1 向后兼容）：kind 等既有缺省 + C1 增量字段默认值。
      kind: "delivery",
      target_repo: null,
      evolve: null,
      revision: 0,
      rounds_started: 0,
      max_goal_rounds: 0,
      // activation 按 set-status 语义：旧格式 active goal 曾是显式激活的
      // 运行中 goal，guardian 续跑照旧（armed）；其余状态默认 disarmed。
      activation: raw.status === "active" ? "armed" : "disarmed",
      blocked_reason: null,
    },
    raw,
  ) as GoalState;
}

/**
 * goal.yaml 同步文件锁（withFileLock 同协议：wx 独占创建 + pid 记录 + 重试退避
 * + 陈旧偷锁 + 释放删锁）。为什么在 run-store 内实现同步孪生：goal 变更 API
 * （setGoalStatus/parkGoal/…）被 self-drive.ts / mcp-server 同步调用（不在本
 * chunk 写集，不得改 async），atomic.withFileLock 是 async 不可直接复用；
 * 锁文件 `.goal.yaml.lock` 与 atomic 协议一致，任何写方（含异步 continuation-gate
 * 路径经 run-store 变更函数）经同一协议互斥。
 */
function withGoalFileLock<T>(dir: string, fn: () => T): T {
  const lockPath = path.join(dir, ".goal.yaml.lock");
  const retries = 50;
  const delayMs = 20;
  const staleMs = 30_000;
  for (let i = 0; i < retries; i++) {
    let fd: number | undefined;
    try {
      fd = fs.openSync(lockPath, "wx");
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      } catch {
        /* best-effort（同 atomic.ts） */
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e;
      if (tryStealStaleGoalLock(lockPath, staleMs)) continue;
      sleepSync(delayMs);
      continue;
    }
    try {
      return fn();
    } finally {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore（同 atomic.ts） */
      }
    }
  }
  throw new PicodeError(ErrorCode.LOCK_TIMEOUT, `failed to acquire goal lock: ${lockPath}`);
}

/** 陈旧锁偷锁（atomic.ts tryStealStale 同语义）：holder pid 死亡或超龄 → 删锁。 */
function tryStealStaleGoalLock(lockPath: string, staleMs: number): boolean {
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    let holderPid: number | null = null;
    let at: number | null = null;
    try {
      const info = JSON.parse(raw) as { pid?: number; at?: number };
      holderPid = typeof info.pid === "number" ? info.pid : null;
      at = typeof info.at === "number" ? info.at : null;
    } catch {
      /* legacy 空锁文件 → 按 mtime */
    }
    const age = Date.now() - (at ?? fs.statSync(lockPath).mtimeMs);
    if (holderPid === null) {
      if (age < staleMs) return false;
      fs.unlinkSync(lockPath);
      return true;
    }
    let pidAlive = false;
    if (Number.isInteger(holderPid) && holderPid > 0) {
      try {
        process.kill(holderPid, 0);
        pidAlive = true;
      } catch (e) {
        pidAlive = (e as NodeJS.ErrnoException).code === "EPERM";
      }
    }
    if (pidAlive && age < staleMs) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

/** 同步 sleep（重试退避；Atomics.wait 阻塞式休眠）。 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * CAS 围栏读-改-写（全部 goal 变更统一入口，禁止裸 fs 写）：
 *  - 锁内读-改-写 + revision 递增（每次变更 +1）
 *  - expectedRevision 提供且与当前不符 → ILLEGAL_TRANSITION（陈旧写拒绝）
 *
 * @param expectedRevision 写方持有的 revision；undefined = 不校验（向后兼容既有调用方）。
 */
export function updateGoal(
  dir: string,
  expectedRevision: number | undefined,
  mutator: (goal: GoalState) => void,
): GoalState {
  const goalPath = path.join(dir, "goal.yaml");
  return withGoalFileLock(dir, () => {
    const goal = readGoal(dir);
    if (expectedRevision !== undefined && goal.revision !== expectedRevision) {
      throw new PicodeError(
        ErrorCode.ILLEGAL_TRANSITION,
        `goal stale revision: expected ${expectedRevision}, got ${goal.revision} (run: ${path.basename(dir)})`,
      );
    }
    mutator(goal);
    goal.revision += 1;
    writeYamlFile(goalPath, goal);
    return goal;
  });
}

/**
 * Goal state machine (01 §2.1): `intake → draft → active ⇄ blocked →
 * completed | cancelled`; terminal states have no outgoing transitions.
 * （P12 的 goal change_review 未落实现，变更走 change_orders/<id>.yaml。）
 */
const GOAL_TRANSITIONS: Record<GoalState["status"], readonly GoalState["status"][]> = {
  intake: ["draft", "active", "cancelled"],
  draft: ["active", "blocked", "cancelled"],
  active: ["blocked", "completed", "cancelled"],
  blocked: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

export function setGoalStatus(
  dir: string,
  status: GoalState["status"],
  opts?: { clearOpenQuestions?: boolean; skipProductAcceptanceCheck?: boolean },
  expectedRevision?: number,
): GoalState {
  return updateGoal(dir, expectedRevision, (goal) => {
    // 状态机迁移校验（P1）：禁任意跳转/回退（completed→active、intake→completed）
    if (!GOAL_TRANSITIONS[goal.status].includes(status)) {
      throw new Error(
        `goal status transition not allowed: ${goal.status} → ${status} (allowed: ${GOAL_TRANSITIONS[goal.status].join(" | ") || "terminal"})`,
      );
    }
    if (status === "active") {
      if (goal.open_questions.length > 0 && !opts?.clearOpenQuestions) {
        throw new Error("open_questions non-empty; cannot activate");
      }
      if (goal.product_acceptance.length === 0 && !opts?.skipProductAcceptanceCheck) {
        throw new Error("no product acceptance criteria; cannot activate (P01)");
      }
      goal.user_confirmed_at = new Date().toISOString();
    }
    // 注意：activation 不被 set-status 触碰 —— 只有显式 `picode goal resume`
    // 才置 armed（C1 goal-crossrun：无显式 resume 不自动续跑）。
    goal.status = status;
  });
}

/**
 * Draft park (07§7 / 12-threat-model): a parked draft cannot silently become
 * active — activation requires an explicit sponsor/run-lead unpark.
 */
export function parkGoal(dir: string, reason = "draft-idle", expectedRevision?: number): GoalState {
  return updateGoal(dir, expectedRevision, (goal) => {
    if (goal.status !== "draft") {
      throw new Error(`only draft goals can be parked (current: ${goal.status})`);
    }
    goal.parked_at = new Date().toISOString();
    goal.park_reason = reason;
  });
}

export function unparkGoal(dir: string, expectedRevision?: number): GoalState {
  return updateGoal(dir, expectedRevision, (goal) => {
    goal.parked_at = null;
    goal.park_reason = null;
  });
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
export function setProductAcceptance(
  dir: string,
  items: string[],
  expectedRevision?: number,
): GoalState {
  const goal = updateGoal(dir, expectedRevision, (g) => {
    g.product_acceptance = items;
  });
  ensureDir(path.join(dir, "product"));
  const md =
    `# Product Brief\n\n` +
    `## Acceptance criteria\n\n` +
    items.map((i) => `- ${i}`).join("\n") +
    `\n`;
  writeAtomic(path.join(dir, "product", "brief.md"), md);
  return goal;
}

// ---------------------------------------------------------------------------
// C1 goal-crossrun lifecycle：resume / disarm / block / recordGoalRound
// ---------------------------------------------------------------------------

/**
 * goal 级激活授权（resume）：清除 blocker 回 active 且置 armed，guardian 续跑恢复。
 *  - 回合预算达上限（max_goal_rounds > 0 且 rounds_started ≥ 上限）→ 拒绝
 *    （ILLEGAL_STATE；DSH dsh-goal resume 达上限拒绝同语义）。
 *  - 仅 active（重新 arm）或 blocked（解除阻塞）可 resume；其余状态
 *    ILLEGAL_TRANSITION（GOAL_TRANSITIONS 围栏：blocked→active 合法）。
 */
export function resumeGoal(dir: string, expectedRevision?: number): GoalState {
  return updateGoal(dir, expectedRevision, (goal) => {
    if (goal.max_goal_rounds > 0 && goal.rounds_started >= goal.max_goal_rounds) {
      throw new PicodeError(
        ErrorCode.ILLEGAL_STATE,
        `goal round budget exhausted: rounds_started ${goal.rounds_started} >= max_goal_rounds ${goal.max_goal_rounds}; resume rejected`,
      );
    }
    if (goal.status === "blocked") {
      goal.status = "active";
    } else if (goal.status !== "active") {
      throw new PicodeError(
        ErrorCode.ILLEGAL_TRANSITION,
        `goal resume not allowed from ${goal.status} (only active or blocked)`,
      );
    }
    goal.blocked_reason = null;
    goal.activation = "armed";
  });
}

/** 解除 goal 续跑授权（activation=disarmed；guardian 零投喂）。 */
export function disarmGoal(dir: string, expectedRevision?: number): GoalState {
  return updateGoal(dir, expectedRevision, (goal) => {
    goal.activation = "disarmed";
  });
}

/**
 * 阻塞带政策码 + 解释（A3）：status → blocked（GOAL_TRANSITIONS 围栏内合法
 * 迁移 active→blocked / draft→blocked），blocked_reason = {code, message}。
 * 政策码须 lower-kebab（如 draft-idle / round-limit / provider-limit / queue-failed）。
 */
export function blockGoal(
  dir: string,
  code: string,
  message = "",
  expectedRevision?: number,
): GoalState {
  if (typeof code !== "string" || !/^[a-z][a-z0-9-]*$/.test(code)) {
    throw new PicodeError(
      ErrorCode.BAD_ARGS,
      `goal block code must be lower-kebab (got: ${String(code)})`,
    );
  }
  return updateGoal(dir, expectedRevision, (goal) => {
    if (!GOAL_TRANSITIONS[goal.status].includes("blocked")) {
      throw new PicodeError(
        ErrorCode.ILLEGAL_TRANSITION,
        `goal status transition not allowed: ${goal.status} → blocked (allowed: ${GOAL_TRANSITIONS[goal.status].join(" | ") || "terminal"})`,
      );
    }
    goal.status = "blocked";
    goal.blocked_reason = { code, message };
  });
}

/**
 * 回合计数 +1（guardian 每次成功续跑投喂后调用；锁内 revision 递增）。
 * 预算上限由调用方（sweepContinuationsGated）在投喂前检查——计数本身不设限。
 */
export function recordGoalRound(dir: string, expectedRevision?: number): GoalState {
  return updateGoal(dir, expectedRevision, (goal) => {
    goal.rounds_started += 1;
  });
}

export function resolveRunDir(
  repoRoot: string,
  runId: string,
): { dir: string; config: ReturnType<typeof loadConfig> } {
  const config = loadConfig(repoRoot, runId);
  const dir = runDir(repoRoot, config, runId);
  if (!fs.existsSync(dir)) {
    throw new PicodeError(ErrorCode.NOT_FOUND, `run not found: ${runId}`);
  }
  return { dir, config };
}
