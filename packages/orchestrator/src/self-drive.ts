import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { SESSION_EVENTS, type PicodeConfig } from "@picode/core";
import { SessionStore } from "./session-store.js";
import {
  applyEvent,
  drainSessionCommands,
  type ApplyResult,
} from "./rules-engine.js";
import { sweepDraftPark, readGoal } from "./run-store.js";
import { sweepProgress, type SweepResult } from "./progress.js";
import { sleepAgent } from "./pi-adapter.js";

/**
 * Self-drive guardian (TC-02): a deterministic loop that advances a run
 * without a human pushing events.
 *
 * The rules engine (`applyEvent`) and command queue (`drainSessionCommands`)
 * only act when invoked. The guardian derives which rule-table events SHOULD
 * fire from the run's state files, applies them mechanically, drains the
 * sess-mgr command queue, sweeps stale progress (`progress_due`) and parks
 * idle drafts — so a run keeps moving while conditions are met.
 *
 * Safety: every applied event goes through the same idempotent rule table as a
 * CLI invocation (already-awake sessions are skipped, max_awake is enforced).
 * The guardian never writes business code; it only drives the session state
 * machine.
 */

/** A rule-table event derived from run state, ready for `applyEvent`. */
export interface DerivedEvent {
  event: string;
  taskId?: string;
}

interface TaskMeta {
  id: string;
  status: string;
  triad?: { "squad-lead": string; engineer: string; sdet: string };
}

interface ChunkMeta {
  id: string;
  status: string;
  task_id?: string;
}

function readChunks(dir: string): ChunkMeta[] {
  const p = path.join(dir, "chunks.yaml");
  if (!fs.existsSync(p)) return [];
  const data = YAML.parse(fs.readFileSync(p, "utf8")) as { chunks?: ChunkMeta[] };
  return data.chunks ?? [];
}

function readTask(dir: string, taskId: string): TaskMeta | null {
  const p = path.join(dir, "tasks", taskId, "task.yaml");
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as TaskMeta;
}

function readRunState(dir: string): { halt?: boolean } | null {
  const p = path.join(dir, "run.yaml");
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as { halt?: boolean };
}

function briefApproved(dir: string, taskId: string): boolean {
  const p = path.join(dir, "tasks", taskId, "brief", "brief.yaml");
  if (!fs.existsSync(p)) return false;
  const b = YAML.parse(fs.readFileSync(p, "utf8")) as { status?: string };
  return b.status === "approved";
}

function seatIdsOf(task: TaskMeta): string[] | null {
  if (!task.triad) return null;
  return [task.triad["squad-lead"], task.triad.engineer, task.triad.sdet];
}

/**
 * Pure derivation: which rule-table events should fire given current run state.
 * Deterministic and read-only — the same inputs always yield the same events.
 */
export function deriveEvents(dir: string, config: PicodeConfig): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const goal = readGoal(dir);
  const sessions = new SessionStore(dir).list();

  // Bootstrap: a fresh run where no session has ever been woken gets run_created.
  if (sessions.length > 0 && sessions.every((s) => !s.last_wake_at)) {
    events.push({ event: SESSION_EVENTS.RUN_CREATED });
  }

  if (goal.status === "active") {
    // Planning seats (scout/sys-arch) get woken once when the goal activates.
    const planning = sessions.filter(
      (s) => s.role_id === "scout" || s.role_id === "sys-arch",
    );
    if (planning.length > 0 && planning.every((s) => !s.last_wake_at)) {
      events.push({ event: SESSION_EVENTS.GOAL_ACTIVE });
    }

    // Task-chain self-next: a ready chunk whose task is still queued and whose
    // triad is registered (staffed) with an approved brief fires task_ready.
    for (const chunk of readChunks(dir)) {
      if (chunk.status !== "ready" || !chunk.task_id) continue;
      const task = readTask(dir, chunk.task_id);
      if (!task || task.status !== "queued") continue;
      const seats = seatIdsOf(task);
      if (!seats) continue;
      const sessionById = new Map(sessions.map((s) => [s.agent_id, s]));
      const registered = seats.every((id) => sessionById.has(id));
      if (!registered) continue;
      const alreadyStarted = seats.some((id) => sessionById.get(id)?.state === "awake");
      if (alreadyStarted) continue;
      if (config.work_brief.require_run_lead_approval && !briefApproved(dir, chunk.task_id)) {
        continue;
      }
      events.push({ event: SESSION_EVENTS.TASK_READY, taskId: chunk.task_id });
    }
  }

  // Dissolution: when the goal closes, dissolve any task not already dissolved.
  if (goal.status === "completed" || goal.status === "cancelled") {
    for (const chunk of readChunks(dir)) {
      if (!chunk.task_id) continue;
      const task = readTask(dir, chunk.task_id);
      if (task && task.status !== "dissolved") {
        events.push({ event: SESSION_EVENTS.TASK_DISSOLVED, taskId: chunk.task_id });
      }
    }
  }

  return events;
}

/** Result of one guardian tick (one pass over the run). */
export interface GuardianTickResult {
  ticked_at: string;
  drained: number;
  draft_parked: string | null;
  progress: SweepResult;
  events: ApplyResult[];
  slept: string[];
  halt: boolean;
}

/** Sleep sessions awake beyond `sess_mgr.idle_sleep_sec` (opt-in). */
export async function sleepIdleSessions(
  dir: string,
  config: PicodeConfig,
  nowMs: number = Date.now(),
): Promise<string[]> {
  const store = new SessionStore(dir);
  const idleSec = config.sess_mgr.idle_sleep_sec;
  const slept: string[] = [];
  for (const s of store.awake()) {
    if (!s.last_wake_at) continue;
    const idle = (nowMs - Date.parse(s.last_wake_at)) / 1000;
    if (idle > idleSec) {
      await sleepAgent(dir, config, s.agent_id, "guardian:idle");
      slept.push(s.agent_id);
    }
  }
  return slept;
}

/**
 * One guardian pass. Order matters for determinism:
 *   1. park idle drafts
 *   2. drain the sess-mgr command queue
 *   3. derive + apply rule-table events (self-next chain) — start events
 *      (run_created / goal_active / task_ready) fire BEFORE progress nudges,
 *      so a freshly-queued task is woken as a triad, not split by progress_due
 *   4. sweep stale progress → progress_due (nudge for tasks already running)
 *   5. optionally sleep idle sessions (opt-in)
 */
export async function guardianTick(
  dir: string,
  config: PicodeConfig,
  opts: { idleSleep?: boolean } = {},
): Promise<GuardianTickResult> {
  const parked = sweepDraftPark(dir, config);
  const drain = await drainSessionCommands(dir, config);

  const events: ApplyResult[] = [];
  for (const ev of deriveEvents(dir, config)) {
    events.push(await applyEvent(dir, config, ev.event, ev.taskId ? { taskId: ev.taskId } : {}));
  }

  const progress = await sweepProgress(dir, config);

  const slept = opts.idleSleep ? await sleepIdleSessions(dir, config) : [];

  const runState = readRunState(dir);
  return {
    ticked_at: new Date().toISOString(),
    drained: drain.processed,
    draft_parked: parked?.parked_at ?? null,
    progress,
    events,
    slept,
    halt: runState?.halt ?? false,
  };
}

/** Options for the guardian loop. */
export interface GuardianOptions {
  intervalMs?: number;
  maxTicks?: number;
  haltFile?: string;
  idleSleep?: boolean;
}

/** Summary of a guardian loop run. */
export interface GuardianSummary {
  ticks: number;
  halted: boolean;
  ticksRun: GuardianTickResult[];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Guardian loop: tick every `intervalMs` until `maxTicks`, the halt file
 * appears, `run.yaml.halt` is set, or SIGINT/SIGTERM is received.
 */
export async function runGuardian(
  dir: string,
  config: PicodeConfig,
  opts: GuardianOptions = {},
): Promise<GuardianSummary> {
  const intervalMs = opts.intervalMs ?? 60_000;
  const maxTicks = opts.maxTicks ?? Number.POSITIVE_INFINITY;
  const haltFile = opts.haltFile ?? path.join(dir, "guardian.halt");

  let halted = false;
  let ticks = 0;
  const ticksRun: GuardianTickResult[] = [];

  const stop = () => {
    halted = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (ticks < maxTicks && !halted) {
      if (fs.existsSync(haltFile)) {
        halted = true;
        break;
      }
      ticks += 1;
      const result = await guardianTick(dir, config, { idleSleep: opts.idleSleep });
      ticksRun.push(result);
      if (result.halt) {
        halted = true;
        break;
      }
      if (ticks < maxTicks && !halted) {
        await delay(intervalMs);
      }
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }

  return { ticks, halted, ticksRun };
}
