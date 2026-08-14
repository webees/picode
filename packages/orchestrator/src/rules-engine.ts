import fs from "node:fs";
import path from "node:path";
import {
  ErrorCode,
  PicodeError,
  ensureDir,
  readYamlFile,
  withFileLock,
  type PicodeConfig,
} from "@picode/core";
import { SessionStore } from "./session-store.js";
import { sleepAgent, terminateAgent, wakeAgent } from "./pi-adapter.js";
import { hasEvolveLayer, isEvolveRun } from "./evolve-run.js";
import { readJsonl } from "./jsonl.js";

/**
 * Deterministic rules engine (18 phase B / 17 §5.3).
 * L0 rules are mechanical; sess-mgr LLM arbitration (L1) only beyond the table.
 */
export interface ApplyResult {
  event: string;
  actions: Array<{
    agent_id: string;
    action: "wake" | "sleep" | "terminate" | "skip";
    outcome: "ok" | "skipped" | "not_found" | "rejected" | "pending";
    reason?: string;
  }>;
  rejected: boolean;
}

interface TaskTriad {
  "squad-lead": string;
  engineer: string;
  sdet: string;
}

function readTaskTriad(dir: string, taskId: string): TaskTriad | null {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(p)) return null;
  const task = readYamlFile<{ triad?: TaskTriad }>(p);
  return task?.triad ?? null;
}

/**
 * Apply one event from the rules table. Idempotent: waking an already-awake
 * agent is a no-op (skipped), so repeated events are safe.
 */
export async function applyEvent(
  dir: string,
  config: PicodeConfig,
  event: string,
  ctx: { taskId?: string } = {},
): Promise<ApplyResult> {
  const store = new SessionStore(dir);
  const rule = config.sess_mgr.rules.find((r) => r.event === event);
  const result: ApplyResult = { event, actions: [], rejected: false };

  if (!rule) {
    result.rejected = true;
    return result;
  }

  const push = (agentId: string, action: ApplyResult["actions"][0]["action"]) => {
    const existing = result.actions.find((a) => a.agent_id === agentId);
    if (existing) return;
    result.actions.push({ agent_id: agentId, action, outcome: "pending" as const });
  };

  // Unconditional wakes
  for (const id of rule.wake ?? []) push(id, "wake");
  // Conditional wakes (17 §5.3: ind-res only when research.parallel_on_intake)
  if (config.research.parallel_on_intake) {
    for (const id of rule.wake_if ?? []) push(id, "wake");
  }
  // Squad operations
  if (rule.wake_squad || rule.wake_squad_lead || rule.terminate_squad) {
    if (!ctx.taskId) {
      result.rejected = true;
      return result;
    }
    const triad = readTaskTriad(dir, ctx.taskId);
    if (!triad) {
      result.rejected = true;
      return result;
    }
    if (rule.wake_squad) {
      push(triad["squad-lead"], "wake");
      push(triad.engineer, "wake");
      push(triad.sdet, "wake");
    }
    if (rule.wake_squad_lead) push(triad["squad-lead"], "wake");
    if (rule.terminate_squad) {
      push(triad["squad-lead"], "terminate");
      push(triad.engineer, "terminate");
      push(triad.sdet, "terminate");
    }
  }
  // Gate wakes by scale (merge_ready → code-review/sec-eng, decision-catalog §8)
  if (rule.wake_gates) {
    const scale = readGoalScale(dir);
    push("code-review", "wake"); // SHOULD→MUST per scale (decision-catalog §8)
    if (scale === "L") {
      push("sec-eng", "wake"); // MUST at L
    }
    // M/S: sec-eng is risk-triggered — left to LLM arbitration, not mechanical
    // E5 (19 §5): self_evolve code-layer merges MUST wake code-review (high risk).
    if (isEvolveRun(dir) && hasEvolveLayer(dir, "code")) {
      push("code-review", "wake");
      push("sec-eng", "wake");
    }
  }

  // Execute sequentially
  for (const a of result.actions) {
    const cur = store.get(a.agent_id);
    if (!cur) {
      a.outcome = "not_found";
      a.reason = "no session file";
      continue;
    }
    if (a.action === "wake") {
      if (cur.state === "awake") {
        a.outcome = "skipped";
        a.reason = "already awake";
        continue;
      }
      if (cur.state !== "sleeping") {
        a.outcome = "rejected";
        a.reason = `cannot wake from ${cur.state}`;
        continue;
      }
      try {
        const over =
          store.awake().filter((s) => s.agent_id !== a.agent_id).length >=
          config.sess_mgr.max_awake;
        if (over) {
          a.outcome = "rejected";
          a.reason = `max_awake=${config.sess_mgr.max_awake} exceeded`;
          result.rejected = true;
          continue;
        }
        // D057: rules-engine wakes go through the same spawn path as CLI wakes,
        // so an opencode/pi backend actually provisions a real session.
        await wakeAgent(dir, config, a.agent_id, `event:${event}`, {
          maxAwake: config.sess_mgr.max_awake,
        });
        a.outcome = "ok";
      } catch (e) {
        a.outcome = "rejected";
        a.reason = e instanceof Error ? e.message : String(e);
        result.rejected = true;
      }
    } else if (a.action === "sleep") {
      if (cur.state !== "awake") {
        a.outcome = "skipped";
        a.reason = `not awake (${cur.state})`;
        continue;
      }
      try {
        await sleepAgent(dir, config, a.agent_id, `event:${event}`);
        a.outcome = "ok";
      } catch (e) {
        // 与 wake 分支一致：单席失败不中止整轮（P1）
        a.outcome = "rejected";
        a.reason = e instanceof Error ? e.message : String(e);
        result.rejected = true;
      }
    } else if (a.action === "terminate") {
      if (cur.state === "terminated") {
        a.outcome = "skipped";
        a.reason = "already terminated";
        continue;
      }
      if (cur.state === "registered") {
        a.outcome = "rejected";
        a.reason = "cannot terminate from registered";
        continue;
      }
      try {
        await terminateAgent(dir, config, a.agent_id, `event:${event}`);
        a.outcome = "ok";
      } catch (e) {
        // 与 wake 分支一致：单席失败不中止整轮（P1）
        a.outcome = "rejected";
        a.reason = e instanceof Error ? e.message : String(e);
        result.rejected = true;
      }
    }
  }

  return result;
}

function readGoalScale(dir: string): "S" | "M" | "L" {
  const p = path.join(dir, "goal.yaml");
  if (!fs.existsSync(p)) return "S";
  const goal = readYamlFile<{ scale?: "S" | "M" | "L" }>(p);
  return goal?.scale ?? "S";
}

/**
 * Command queue (18 phase B): runs/<id>/session_commands.jsonl.
 * sess-mgr appends; orchestrator drains mechanically.
 */
export interface SessionCommand {
  id: string;
  ts: string;
  from: string;
  action: "wake" | "sleep" | "terminate";
  agent_id: string;
  reason: string;
  force?: boolean;
}

const ALLOWED_COMMANDERS = new Set(["sess-mgr"]);

export async function appendSessionCommand(
  dir: string,
  from: string,
  cmd: Omit<SessionCommand, "id" | "ts" | "from">,
): Promise<SessionCommand> {
  if (!ALLOWED_COMMANDERS.has(from)) {
    throw new PicodeError(
      ErrorCode.COMMAND_FROM_DENIED,
      `command from non-sess-mgr rejected: ${from}`,
    );
  }
  const file = path.join(dir, "session_commands.jsonl");
  const full: SessionCommand = {
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    from,
    ...cmd,
  };
  ensureDir(dir);
  await withFileLock(path.join(dir, ".session_commands.lock"), () => {
    fs.appendFileSync(file, JSON.stringify(full) + "\n", "utf8");
  });
  return full;
}

export interface DrainResult {
  processed: number;
  results: Array<{ id: string; action: string; agent_id: string; outcome: string }>;
}

/** Read + apply all pending commands; the file itself is kept (audit trail). */
export async function drainSessionCommands(
  dir: string,
  config: PicodeConfig,
): Promise<DrainResult> {
  const file = path.join(dir, "session_commands.jsonl");
  if (!fs.existsSync(file)) return { processed: 0, results: [] };
  // 逐行容错（P1）：一行损坏不再炸掉整个 drain / guardian tick
  const lines = readJsonl<SessionCommand>(file);

  const drain = await withFileLock(path.join(dir, ".session_commands.lock"), async () => {
    const store = new SessionStore(dir);
    const results: DrainResult["results"] = [];
    for (const cmd of lines) {
      let outcome = "ok";
      try {
        if (!ALLOWED_COMMANDERS.has(cmd.from)) {
          outcome = `error: commander not allowed: ${cmd.from}`;
          results.push({
            id: cmd.id,
            action: cmd.action,
            agent_id: cmd.agent_id,
            outcome,
          });
          continue;
        }
        if (cmd.action === "wake") {
          const cur = store.get(cmd.agent_id);
          if (!cur) throw new Error(`session not found: ${cmd.agent_id}`);
          if (cur.state === "awake") {
            outcome = "skipped";
          } else if (cur.state !== "sleeping") {
            throw new Error(`cannot wake from ${cur.state}`);
          } else {
            await wakeAgent(dir, config, cmd.agent_id, cmd.reason, {
              maxAwake: cmd.force ? undefined : config.sess_mgr.max_awake,
              force: cmd.force,
            });
          }
        } else if (cmd.action === "sleep") {
          await sleepAgent(dir, config, cmd.agent_id, cmd.reason);
        } else if (cmd.action === "terminate") {
          await terminateAgent(dir, config, cmd.agent_id, cmd.reason);
        }
      } catch (e) {
        outcome = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
      results.push({
        id: cmd.id,
        action: cmd.action,
        agent_id: cmd.agent_id,
        outcome,
      });
    }
    return results;
  });

  // audit marker so re-drains can be told apart (kept append-only)
  return { processed: drain.length, results: drain };
}

/** Snapshot of the roster for observability (sess-mgr session_list tool). */
export function rosterSnapshot(dir: string) {
  const store = new SessionStore(dir);
  return {
    count: store.list().length,
    awake: store.awake().map((s) => s.agent_id),
    sessions: store.list(),
  };
}
