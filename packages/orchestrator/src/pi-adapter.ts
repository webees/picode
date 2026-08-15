import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  APPROVAL_POLICY_DEFAULT,
  APPROVAL_POLICY_ENV,
  ErrorCode,
  PicodeError,
  READ_BEFORE_EDIT_DEFAULT,
  READ_BEFORE_EDIT_ENV,
  readRunSecret,
  SANDBOX_DEFAULT_MODE,
  SANDBOX_MODE_ENV,
  worktreePath,
  type PicodeConfig,
  type SessionRecord,
} from "@picode/core";
import { issueToken } from "@picode/bus";
import { SessionStore } from "./session-store.js";
import { OpencodeSpawner, wakeWithOpencode } from "./opencode-adapter.js";
import { delay } from "./timing.js";

/**
 * Pi spawn adapter (18 phase C). Interface-isolated so a real `pi` binary,
 * a long-running RPC, or a mock can back it without touching the state machine.
 */
export interface PiHandle {
  pid: number;
  pi_session_id: string;
}

export interface PiSpawner {
  spawn(agentId: string, env: Record<string, string>): PiHandle;
  stop(handle: PiHandle): void;
  isAlive(handle: PiHandle): boolean;
}

/**
 * Module-level handle registry: wake and sleep build fresh PiSpawner
 * instances, but the ChildProcess must stay referenced so Node reaps the
 * child (no zombies) and cross-instance stop works.
 */
const GLOBAL_HANDLES = new Map<number, ChildProcess>();

/** Default spawner: runs the configured static command template (e.g. `pi --print`). */
export class CommandPiSpawner implements PiSpawner {
  spawn(_agentId: string, env: Record<string, string>): PiHandle {
    const template = this.config.pi.command_template;
    const child = spawn(template, {
      shell: true,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ...env },
    });
    const pid = child.pid ?? -1;
    if (pid <= 0) {
      throw new Error(`failed to spawn pi command: ${template}`);
    }
    const handle: PiHandle = { pid, pi_session_id: `pid-${pid}` };
    GLOBAL_HANDLES.set(pid, child);
    child.unref(); // CLI/orchestrator must not wait on a long-lived Pi process
    child.once("exit", () => GLOBAL_HANDLES.delete(pid));
    return handle;
  }

  stop(handle: PiHandle): void {
    const child = GLOBAL_HANDLES.get(handle.pid);
    // Detached spawn creates a new process group (pgid == pid); signal the
    // group even when this spawner instance did not spawn the child.
    for (const sig of ["SIGTERM", "SIGKILL"] as const) {
      try {
        process.kill(-handle.pid, sig);
        break;
      } catch {
        try {
          process.kill(handle.pid, sig);
          break;
        } catch {
          /* already gone */
        }
      }
    }
    void child;
  }

  isAlive(handle: PiHandle): boolean {
    const child = GLOBAL_HANDLES.get(handle.pid);
    if (!child || child.exitCode !== null) return false;
    try {
      process.kill(handle.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  constructor(private config: PicodeConfig) {}
}

export function makeSpawner(config: PicodeConfig): PiSpawner {
  return new CommandPiSpawner(config);
}

/** Primary room per 17 §3.3 (first column of the platform-roles table). */
const ROLE_PRIMARY_ROOM: Record<string, string> = {
  "run-lead": "leadership",
  tpm: "program",
  "proc-audit": "leadership",
  pm: "product",
  "ind-res": "research",
  scout: "architecture",
  "sys-arch": "architecture",
  "docs-lead": "docs",
  "tech-writer": "docs",
  "docs-qa": "docs",
  "people-lead": "people",
  recruiter: "people",
  "people-qa": "people",
  "code-review": "quality",
  "release-eng": "release",
  "sec-eng": "security",
  "sess-mgr": "leadership",
};

/**
 * ERR-03 (run-lead 决策): task 三角的 cwd 指向其 worktree（存在时）；
 * 平台席与未 prepare 的 task 回退克隆根。
 */
function taskWorktreeCwd(dir: string, config: PicodeConfig, agentId: string): string {
  const m = /@task-(.+)$/.exec(agentId);
  if (!m) return path.resolve(dir, "../..");
  const wt = worktreePath(path.resolve(dir, "../../.."), config, path.basename(dir), `task-${m[1]}`);
  return fs.existsSync(wt) ? wt : path.resolve(dir, "../..");
}

/** Build the Pi session env (18 phase C: token, profile, cwd, room, persona). */
export function buildPiEnv(
  dir: string,
  config: PicodeConfig,
  session: SessionRecord,
): Record<string, string> {
  const runId = path.basename(dir);
  const secret = readRunSecret(dir);
  const profile =
    config.roles.find((r) => r.id === session.role_id)?.tool_profile ?? "implement.engineer";
  const room = ROLE_PRIMARY_ROOM[session.role_id] ?? "leadership";
  const persona = personaForSession(dir, session);
  // C2（D082-3/4）：技能接线 — 全量索引 + 本会话 persona 声明的技能路径
  const repoRoot = path.resolve(dir, "../../..");
  const skillsRoot = config.paths.skills_root ?? "skills";
  const skillIndex = buildSkillIndex(skillsRoot, repoRoot);
  const declaredSkills = personaDeclaredSkills(persona, skillIndex);

  return {
    PICODE_RUN_ID: runId,
    PICODE_RUNS_ROOT: path.dirname(dir),
    PICODE_AGENT_ID: session.agent_id,
    PICODE_AGENT_TOKEN: issueToken(session.agent_id, secret),
    PICODE_TOOL_PROFILE: profile,
    PICODE_ROOM: room,
    PICODE_PERSONA: persona,
    PICODE_SKILLS_INDEX: JSON.stringify(skillIndex),
    PICODE_PERSONA_SKILLS: JSON.stringify(declaredSkills),
    PICODE_CWD: taskWorktreeCwd(dir, config, session.agent_id),
    PICODE_TRANSCRIPT_DIR: path.join(dir, "transcripts"),
    PICODE_RUN_ALLOWLIST: JSON.stringify(config.run_allowlist),
    // E 沙箱/审批/守卫会话 env（chunk-c3）：operator env 覆盖 > 会话默认
    // （本轮不新增 config 键，守 D104；沙箱/审批/守卫配置走 env + core 常量）
    [SANDBOX_MODE_ENV]: process.env[SANDBOX_MODE_ENV] ?? SANDBOX_DEFAULT_MODE,
    [APPROVAL_POLICY_ENV]: process.env[APPROVAL_POLICY_ENV] ?? APPROVAL_POLICY_DEFAULT,
    [READ_BEFORE_EDIT_ENV]: process.env[READ_BEFORE_EDIT_ENV] ?? READ_BEFORE_EDIT_DEFAULT,
  };
}

function personaForSession(dir: string, session: SessionRecord): string {
  // task seats carry an explicit persona file from staffing
  if (session.persona_path) return path.join(dir, session.persona_path);
  // platform seats fall back to the role template under <repo>/.picode/agents
  const repoRoot = path.resolve(dir, "../../..");
  const template = path.join(repoRoot, ".picode", "agents", `${session.role_id}.md`);
  return fs.existsSync(template) ? template : "";
}

/** SKILL.md 元数据（渐进披露 layer 1：只 metadata 不正文）。 */
export interface SkillMeta {
  name: string;
  description: string;
  /** 相对仓库根的 SKILL.md 路径（POSIX 分隔符）。 */
  path: string;
}

/**
 * C2（D082-3/4）：扫描 skills_root 构建全量技能索引。
 * 本地实现占位（C1 task-skill-spec 未合并）；merge 后改走 @picode/core 的 buildSkillIndex。
 */
export function buildSkillIndex(skillsRoot: string, repoRoot: string): SkillMeta[] {
  const absRoot = path.resolve(repoRoot, skillsRoot);
  if (!fs.existsSync(absRoot)) return [];
  const metas: SkillMeta[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "SKILL.md") {
        const meta = readSkillMeta(full, repoRoot);
        if (meta) metas.push(meta);
      }
    }
  };
  walk(absRoot);
  return metas.sort((a, b) => a.name.localeCompare(b.name));
}

/** 解析单份 SKILL.md 的 frontmatter 元数据；无合法 frontmatter 返回 null。 */
function readSkillMeta(skillFile: string, repoRoot: string): SkillMeta | null {
  const m = fs.readFileSync(skillFile, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  let fm: Record<string, unknown>;
  try {
    fm = YAML.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : null;
  if (!name) return null;
  const description = typeof fm.description === "string" ? fm.description : "";
  return {
    name,
    description,
    path: path.relative(repoRoot, skillFile).split(path.sep).join("/"),
  };
}

/**
 * C2（D082-3/4）：读取本会话 persona 声明的 skills，映射到技能索引中的路径。
 * persona 来源与 personaForSession 一致：实例人设 tasks/<id>/personas/<seat>.md，
 * 回退 .picode/agents/<role>.md。
 */
export function personaDeclaredSkills(personaFile: string, index: SkillMeta[]): string[] {
  if (!personaFile || !fs.existsSync(personaFile)) return [];
  const m = fs.readFileSync(personaFile, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  let fm: Record<string, unknown>;
  try {
    fm = YAML.parse(m[1]) as Record<string, unknown>;
  } catch {
    return [];
  }
  const declared = fm.skills;
  if (!Array.isArray(declared)) return [];
  const byName = new Map(index.map((s) => [s.name, s.path]));
  return declared
    .filter((name): name is string => typeof name === "string" && byName.has(name))
    .map((name) => byName.get(name)!);
}

/**
 * Wake with a real Pi process; spawn failure lands in session.error and the
 * session rolls back to sleeping (17 §4: awake = live Pi session).
 */
export async function wakeWithPi(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  reason: string,
  opts: { maxAwake?: number; force?: boolean } = {},
): Promise<{ session: SessionRecord; pi: PiHandle | null }> {
  const store = new SessionStore(dir);
  const session = await store.wake(agentId, reason, opts);
  if (!config.pi.enabled) {
    return { session, pi: null };
  }
  try {
    const env = buildPiEnv(dir, config, session);
    const spawner = makeSpawner(config);
    const pi = spawner.spawn(session.agent_id, env);
    // fast-fail: a command that exits immediately (missing binary, bad template)
    // must not count as an awake Pi session
    if (!(await waitAlive(spawner, pi, 250))) {
      throw new Error(`pi command exited immediately: ${config.pi.command_template}`);
    }
    const updated = await store.attachPiSession(agentId, pi.pi_session_id);
    return { session: updated, pi };
  } catch (e) {
    const msg = `pi spawn failed: ${e instanceof Error ? e.message : String(e)}`;
    try {
      await store.sleep(agentId, `spawn-failed`);
    } catch {
      /* keep error only */
    }
    await store.setError(agentId, msg);
    throw new PicodeError(ErrorCode.PI_SPAWN_FAILED, msg);
  }
}

/** Parse the pid stored in a pi_session_id ("pid-<n>"). */
export function piPidOf(piSessionId: string): number {
  const n = Number(piSessionId.replace(/^pid-/, ""));
  return Number.isInteger(n) && n > 0 ? n : -1;
}

async function waitAlive(spawner: PiSpawner, handle: PiHandle, ms: number): Promise<boolean> {
  await delay(ms);
  return spawner.isAlive(handle);
}

/** Sleep: gracefully stop the Pi process (if any), then transition. */
export async function sleepWithPi(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  reason: string,
): Promise<SessionRecord> {
  const store = new SessionStore(dir);
  const cur = store.get(agentId);
  if (cur?.state === "awake" && cur.pi_session_id) {
    const pid = piPidOf(cur.pi_session_id);
    if (pid > 0) {
      try {
        makeSpawner(config).stop({ pid, pi_session_id: cur.pi_session_id });
      } catch {
        /* process may already be gone */
      }
    }
  }
  return store.sleep(agentId, reason);
}

/**
 * I3: 子代理嵌套深度上限（对齐 DSH maxDepth 默认 3）。
 * orchestrator 侧常量（D057 统一 spawn 入口 wakeAgent 校验，opencode/pi 两路
 * 全覆盖）；本轮不新增 config 键（衔接 D106 配置旋钮最小化），可配置化列
 * known_issue。
 */
export const MAX_SUBAGENT_DEPTH = 3;

/**
 * 统一会话唤醒入口（D057 缺口 2 修复）：CLI 与规则引擎共用同一条 spawn 路径，
 * 保证「规则引擎 wake 的会话」与「CLI wake 的会话」等价——
 *   - opencode.enabled  → 经 opencode serve 建真实会话（pi_session_id = oc-<id>）
 *   - pi.enabled        → 拉起真 Pi 进程（command_template）
 *   - 两者都关          → 纯状态机（默认配置，行为与 v1 一致）
 *
 * I3 深度围栏：会话 delegation_depth > MAX_SUBAGENT_DEPTH 时结构化拒绝
 * （SUBAGENT_DEPTH_EXCEEDED，消息含当前深度与上限），不触碰任何后端。
 */
export async function wakeAgent(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  reason: string,
  opts: { maxAwake?: number; force?: boolean } = {},
): Promise<{ pi_session_id: string | null } | { session: SessionRecord; pi: PiHandle | null }> {
  const session = new SessionStore(dir).get(agentId);
  if (!session) {
    throw new PicodeError(ErrorCode.SESSION_NOT_FOUND, `session not found: ${agentId}`);
  }
  const depth = session.delegation_depth ?? 0;
  if (depth > MAX_SUBAGENT_DEPTH) {
    throw new PicodeError(
      ErrorCode.SUBAGENT_DEPTH_EXCEEDED,
      `subagent delegation depth ${depth} exceeds limit ${MAX_SUBAGENT_DEPTH} for "${agentId}"`,
    );
  }
  if (config.opencode.enabled) {
    const env = buildPiEnv(dir, config, session);
    return wakeWithOpencode(dir, config, agentId, reason, env, opts);
  }
  return wakeWithPi(dir, config, agentId, reason, opts);
}

/**
 * 统一会话休眠入口：I2 起 sleep 保留 opencode 会话（不再服务端 DELETE）——
 * durable 会话身份由 wake resume 复用；pi 会话仍先停进程；默认纯状态机。
 * 终态销毁（DELETE）仅保留在 terminateAgent。与 wakeAgent 对称。
 */
export async function sleepAgent(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  reason: string,
): Promise<SessionRecord> {
  return sleepWithPi(dir, config, agentId, reason);
}

/**
 * 统一会话终止入口：先清理后端资源（opencode 会话 DELETE 终态销毁 / pi 进程
 * stop），再状态机 terminate。I2：DELETE 语义仅保留在本入口（终态销毁）；
 * sleep 已改为保留会话。与 wakeAgent/sleepAgent 对称。
 */
export async function terminateAgent(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  reason: string,
): Promise<SessionRecord> {
  const cur = new SessionStore(dir).get(agentId);
  if (config.opencode.enabled && cur?.pi_session_id?.startsWith("oc-")) {
    await new OpencodeSpawner(config).stop({ pid: -1, pi_session_id: cur.pi_session_id });
  }
  const store = new SessionStore(dir);
  const rec = store.get(agentId);
  if (rec?.state === "awake" && rec.pi_session_id) {
    const pid = piPidOf(rec.pi_session_id);
    if (pid > 0) {
      try {
        makeSpawner(config).stop({ pid, pi_session_id: rec.pi_session_id });
      } catch {
        /* process may already be gone */
      }
    }
  }
  return store.terminate(agentId, reason);
}
