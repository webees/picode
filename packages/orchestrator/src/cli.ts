#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRun,
  readGoal,
  resolveRunDir,
  setGoalStatus,
  setProductAcceptance,
  parkGoal,
  unparkGoal,
  sweepDraftPark,
} from "./run-store.js";
import { enqueueMerge, mergeNext, readMergeQueue } from "./merge.js";
import { sweepProgress } from "./progress.js";
import { statusSnapshot } from "./status.js";
import {
  ackMemoryBrief,
  listMemoryBriefs,
  writeMemoryBrief,
} from "./docs-memory.js";
import {
  createChangeOrder,
  ingestTaskKnowledge,
  parkDraft,
  readChangeOrders,
  transitionChangeOrder,
} from "./memory.js";
import {
  addChunkAndTask,
  approveBrief,
  draftBrief,
  prepareTask,
  printSpawnEnv,
} from "./task.js";
import {
  ackHandoff,
  dissolveTask,
  gcFailedWorktrees,
  packageHandoff,
  submitEvidence,
} from "./closure.js";
import { SessionStore } from "./session-store.js";
import { applyEvent, drainSessionCommands, rosterSnapshot } from "./rules-engine.js";
import { sleepWithPi, wakeWithPi, buildPiEnv } from "./pi-adapter.js";
import { OpencodeSpawner, wakeWithOpencode } from "./opencode-adapter.js";
import { writeEvolveKnowledgeLog } from "./evolve-run.js";
import { compressRunWindows, windowStatus } from "./window-store.js";
import { evolveWritePaths, type EvolveGoalSpec } from "@picode/core";
import {
  approveStaffing,
  checkPersonas,
  createStaffingRequest,
  draftPersonas,
  SEATS,
  type Seat,
} from "./staffing.js";
import { readScores, scoreTask } from "./hr-score.js";
import { assertSafeName } from "@picode/core";

function arg(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function usage(): never {
  console.log(`picode CLI (MVP)

  picode init --repo <path> --goal-title <title> [--scale S|M|L]
  picode goal set-status --repo <path> --run <id> --status intake|draft|active|...
  picode goal set-product-acceptance --repo <path> --run <id> --acceptance "a; b; c"
  picode merge enqueue --repo <path> --run <id> --task <task_id> [--by release-eng]
  picode merge process --repo <path> --run <id>
  picode progress check --repo <path> --run <id>
  picode status --repo <path> --run <id>
  picode change-order create --repo <path> --run <id> --task <task_id> --summary "..." [--by run-lead]
  picode change-order apply --repo <path> --run <id> --id <co_id>
  picode change-order close --repo <path> --run <id> --id <co_id>
  picode change-order list --repo <path> --run <id>
  picode memory brief write --repo <path> --run <id> --summary "..." [--l2 a.md,b.md] [--risk "r"] [--by docs-lead]
  picode memory brief ack --repo <path> --run <id> --id <mb_id> [--by run-lead]
  picode memory brief list --repo <path> --run <id>
  picode goal park --repo <path> --run <id> [--reason r]
  picode goal unpark --repo <path> --run <id>
  picode draft park --repo <path> --run <id> --task <task_id>
  picode draft park-goal --repo <path> --run <id>
  picode draft unpark --repo <path> --run <id>
  picode knowledge ingest --repo <path> --run <id> --task <task_id>
  picode chunk add --repo <path> --run <id> --id chunk-a --write "src/**"
  picode brief draft --repo <path> --run <id> --task <task_id>
  picode brief approve --repo <path> --run <id> --task <task_id> [--by run-lead]
  picode task prepare --repo <path> --run <id> --task <task_id>
  picode task spawn-print --repo <path> --run <id> --task <task_id> --seat squad-lead|engineer|sdet
  picode task dissolve --repo <path> --run <id> --task <task_id> [--force] [--status failed|cancelled]
  picode evidence submit --repo <path> --run <id> --task <task_id> --cmd "..." [--exit-code 0] [--log-ref <path>] [--by sdet@task_id]   # pass 需要 exit-code=0 且 --log-ref
  picode handoff package --repo <path> --run <id> --task <task_id>
  picode handoff ack --repo <path> --run <id> --task <task_id> --by docs-lead|tpm [--notes "..."]
  picode worktree gc --repo <path> --run <id>
  picode session register --repo <path> --run <id> --agent <role_id> [--role <role_id>]
  picode session wake --repo <path> --run <id> --agent <agent_id> [--reason <r>] [--force]
  picode session sleep --repo <path> --run <id> --agent <agent_id> [--reason <r>]
  picode session terminate --repo <path> --run <id> --agent <agent_id> [--reason <r>]
  picode session list --repo <path> --run <id> [--state registered|sleeping|awake|terminated]
  picode session event --repo <path> --run <id> --event <name> [--task <task_id>]
  picode session drain --repo <path> --run <id>
  picode staffing request --repo <path> --run <id> --task <task_id> [--skills a,b] [--notes <n>] [--team-name <n>] [--codename seat:name]
  picode staffing draft-personas --repo <path> --run <id> --task <task_id>
  picode staffing check --repo <path> --run <id> --task <task_id>
  picode staffing approve --repo <path> --run <id> --task <task_id> [--by run-lead]
  picode staffing score --repo <path> --run <id> --task <task_id> [--by people-qa] [--note "..."]
  picode staffing scores --repo <path> --run <id> --task <task_id>
  picode progress sweep --repo <path> --run <id>
  picode merge enqueue --repo <path> --run <id> --task <task_id> [--by release-eng]
  picode merge process --repo <path> --run <id>
  picode evolve write-paths --repo <path> --run <id> [--task <task_id>]
  picode evolve log --repo <path> --run <id> --summary "..."
  picode window compress --repo <path> --run <id> [--rooms a,b]
  picode window status --repo <path> --run <id>
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd) usage();

  const repo = path.resolve(arg("--repo", args) ?? process.cwd());

  if (cmd === "init") {
    const title = arg("--goal-title", args);
    if (!title) usage();
    const scale = (arg("--scale", args) as "S" | "M" | "L") ?? "S";
    const kind = arg("--kind", args) as "delivery" | "self_evolve" | undefined;
    const layers = (arg("--evolve-layers", args) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as EvolveGoalSpec["layers"];
    const { runId, dir } = createRun(repo, {
      title,
      scale,
      kind,
      targetRepo: arg("--target-repo", args),
      evolveLayers: layers.length ? layers : undefined,
      evolveRisk: arg("--evolve-risk", args) as EvolveGoalSpec["risk"] | undefined,
    });
    console.log(JSON.stringify({ runId, dir }, null, 2));
    return;
  }

  const runId = arg("--run", args);
  if (!runId) usage();
  const { dir, config } = resolveRunDir(repo, runId);

  if (cmd === "goal" && args[1] === "set-status") {
    const status = arg("--status", args) as
      | "intake"
      | "draft"
      | "active"
      | "blocked"
      | "completed"
      | "cancelled";
    if (!status) usage();
    const goal = setGoalStatus(dir, status, {
      clearOpenQuestions: true,
      skipProductAcceptanceCheck: !config.product.require_acceptance_before_active,
    });
    console.log(JSON.stringify(goal, null, 2));
    return;
  }

  if (cmd === "merge" && args[1] === "enqueue") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    console.log(JSON.stringify(await enqueueMerge(dir, taskId, arg("--by", args) ?? "release-eng"), null, 2));
    return;
  }
  if (cmd === "merge" && args[1] === "process") {
    console.log(JSON.stringify(await mergeNext(repo, dir, config), null, 2));
    return;
  }
  if (cmd === "evolve" && args[1] === "write-paths") {
    const goal = readGoal(dir);
    if (goal.kind !== "self_evolve" || !goal.evolve) {
      console.log(JSON.stringify({ write_paths: [] }, null, 2));
      return;
    }
    console.log(JSON.stringify({ write_paths: evolveWritePaths(config, goal.evolve) }, null, 2));
    return;
  }
  if (cmd === "evolve" && args[1] === "log") {
    const summary = arg("--summary", args);
    if (!summary) usage();
    const written = writeEvolveKnowledgeLog(repo, dir, config, { summary });
    console.log(JSON.stringify({ written }, null, 2));
    return;
  }
  if (cmd === "window" && args[1] === "compress") {
    const rooms = (arg("--rooms", args) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const r of rooms) {
      if (!/^[A-Za-z0-9_-]+$/.test(r)) {
        throw new Error(`invalid room id: "${r}" (allowed: [A-Za-z0-9_-])`);
      }
    }
    console.log(JSON.stringify(await compressRunWindows(dir, config, { rooms }), null, 2));
    return;
  }
  if (cmd === "window" && args[1] === "status") {
    console.log(JSON.stringify(windowStatus(dir, config), null, 2));
    return;
  }
  if (cmd === "progress" && args[1] === "check") {
    const parked = sweepDraftPark(dir, config);
    const res = await sweepProgress(dir, config);
    console.log(JSON.stringify({ ...res, draft_parked: parked?.parked_at ?? null }, null, 2));
    return;
  }
  if (cmd === "status") {
    console.log(JSON.stringify(statusSnapshot(dir, config), null, 2));
    return;
  }
  if (cmd === "change-order" && args[1] === "create") {
    const taskId = arg("--task", args);
    const summary = arg("--summary", args);
    if (!taskId || !summary) usage();
    console.log(JSON.stringify(await createChangeOrder(dir, taskId, summary, arg("--by", args) ?? "run-lead"), null, 2));
    return;
  }
  if (cmd === "change-order" && (args[1] === "apply" || args[1] === "close")) {
    const id = arg("--id", args);
    if (!id) usage();
    console.log(JSON.stringify(transitionChangeOrder(dir, id, args[1] === "apply" ? "applied" : "closed"), null, 2));
    return;
  }
  if (cmd === "change-order" && args[1] === "list") {
    console.log(JSON.stringify(readChangeOrders(dir), null, 2));
    return;
  }
  if (cmd === "draft" && args[1] === "park") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    console.log(JSON.stringify(parkDraft(dir, taskId), null, 2));
    return;
  }
  if (cmd === "goal" && (args[1] === "park" || args[1] === "unpark")) {
    if (args[1] === "park") {
      console.log(JSON.stringify(parkGoal(dir, arg("--reason", args) ?? "draft-idle"), null, 2));
    } else {
      console.log(JSON.stringify(unparkGoal(dir), null, 2));
    }
    return;
  }
  if (cmd === "memory" && args[1] === "brief") {
    const sub = args[2];
    if (sub === "write") {
      const summary = arg("--summary", args);
      if (!summary) usage();
      const l2 = (arg("--l2", args) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const risks = (arg("--risk", args) ?? "").split(";").map((s) => s.trim()).filter(Boolean);
      console.log(JSON.stringify(writeMemoryBrief(dir, { l1_summary: summary, l2_paths: l2, risks, by: arg("--by", args) ?? "docs-lead" }), null, 2));
      return;
    }
    if (sub === "ack") {
      const id = arg("--id", args);
      if (!id) usage();
      console.log(JSON.stringify(ackMemoryBrief(dir, id, arg("--by", args) ?? "run-lead"), null, 2));
      return;
    }
    if (sub === "list") {
      console.log(JSON.stringify(listMemoryBriefs(dir), null, 2));
      return;
    }
    usage();
  }
  if (cmd === "draft" && args[1] === "park-goal") {
    console.log(JSON.stringify(parkGoal(dir), null, 2));
    return;
  }
  if (cmd === "draft" && args[1] === "unpark") {
    console.log(JSON.stringify(unparkGoal(dir), null, 2));
    return;
  }
  if (cmd === "knowledge" && args[1] === "ingest") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    console.log(JSON.stringify({ written: ingestTaskKnowledge(repo, dir, config, taskId) }, null, 2));
    return;
  }

  if (cmd === "goal" && args[1] === "set-product-acceptance") {
    const acceptance = (arg("--acceptance", args) ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (acceptance.length === 0) usage();
    const goal = setProductAcceptance(dir, acceptance);
    console.log(JSON.stringify({ goal, brief: path.join(dir, "product", "brief.md") }, null, 2));
    return;
  }

  if (cmd === "chunk" && args[1] === "add") {
    const id = arg("--id", args);
    const write = arg("--write", args);
    if (!id || !write) usage();
    const { taskId } = addChunkAndTask(repo, dir, config, {
      chunkId: id,
      writePaths: [write],
    });
    console.log(JSON.stringify({ taskId }, null, 2));
    return;
  }

  if (cmd === "brief" && args[1] === "draft") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    draftBrief(dir, taskId);
    console.log("brief drafted");
    return;
  }

  if (cmd === "brief" && args[1] === "approve") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    approveBrief(dir, taskId, arg("--by", args) ?? "run-lead");
    console.log("brief approved");
    return;
  }

  if (cmd === "task" && args[1] === "prepare") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    const r = prepareTask(repo, dir, config, taskId);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (cmd === "task" && args[1] === "spawn-print") {
    const taskId = arg("--task", args);
    const seat = arg("--seat", args) as "squad-lead" | "engineer" | "sdet";
    if (!taskId || !seat) usage();
    const ext = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../pi-extension/src/index.ts",
    );
    console.log(printSpawnEnv(repo, dir, config, taskId, seat, ext));
    return;
  }

  if (cmd === "task" && args[1] === "dissolve") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    const r = await dissolveTask(repo, dir, config, taskId, {
      force: args.includes("--force"),
      status: arg("--status", args) as "failed" | "cancelled" | undefined,
    });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (cmd === "evidence" && args[1] === "submit") {
    const taskId = arg("--task", args);
    const cmdText = arg("--cmd", args);
    if (!taskId || !cmdText) usage();
    const ev = submitEvidence(dir, taskId, {
      cmds: [
        {
          cmd: cmdText,
          exit_code: Number(arg("--exit-code", args) ?? "0"),
          log_ref: arg("--log-ref", args) ?? null,
        },
      ],
      by: arg("--by", args) ?? `sdet@${taskId}`,
    });
    console.log(JSON.stringify(ev, null, 2));
    return;
  }

  if (cmd === "handoff" && args[1] === "package") {
    const taskId = arg("--task", args);
    if (!taskId) usage();
    console.log(JSON.stringify(packageHandoff(repo, dir, config, taskId), null, 2));
    return;
  }

  if (cmd === "handoff" && args[1] === "ack") {
    const taskId = arg("--task", args);
    const by = arg("--by", args);
    if (!taskId || !by) usage();
    console.log(JSON.stringify(ackHandoff(dir, taskId, by, arg("--notes", args)), null, 2));
    return;
  }

  if (cmd === "worktree" && args[1] === "gc") {
    console.log(JSON.stringify(gcFailedWorktrees(repo, dir, config), null, 2));
    return;
  }

  if (cmd === "staffing") {
    const sub = args[1];
    const taskId = arg("--task", args);
    if (!taskId) usage();
    if (sub === "request") {
      const skills = (arg("--skills", args) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      // repeated `--codename seat:name` (16 §8 naming overrides)
      const codenameOverrides: Record<string, string> = {};
      for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === "--codename") {
          const m = args[i + 1].match(/^([a-z-]+):(.+)$/);
          if (!m) {
            throw new Error(`invalid --codename "${args[i + 1]}"; expected seat:name`);
          }
          if (!SEATS.includes(m[1] as Seat)) {
            throw new Error(
              `unknown seat "${m[1]}" in --codename; expect ${SEATS.join("|")}`,
            );
          }
          assertSafeName(m[2], "codename");
          codenameOverrides[m[1]] = m[2];
          i++;
        }
      }
      const r = await createStaffingRequest(dir, config, taskId, {
        skills,
        notes: arg("--notes", args),
        teamName: arg("--team-name", args),
        codenameOverrides:
          Object.keys(codenameOverrides).length > 0 ? codenameOverrides : undefined,
      });
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    if (sub === "draft-personas") {
      const r = draftPersonas(repo, dir, config, taskId);
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    if (sub === "check") {
      const issues = checkPersonas(dir, config, taskId);
      console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
      return;
    }
    if (sub === "approve") {
      const r = await approveStaffing(dir, config, taskId, arg("--by", args) ?? "run-lead");
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    if (sub === "score") {
      const r = scoreTask(repo, dir, config, taskId, {
        by: arg("--by", args),
        note: arg("--note", args),
      });
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    if (sub === "scores") {
      const s = readScores(dir, taskId);
      if (!s) {
        console.log(JSON.stringify({ error: `no scores yet for ${taskId}` }, null, 2));
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(s, null, 2));
      return;
    }
    usage();
  }

  if (cmd === "progress" && args[1] === "sweep") {
    const res = await sweepProgress(dir, config);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (cmd === "merge") {
    const sub = args[1];
    if (sub === "request") {
      const taskId = arg("--task", args);
      if (!taskId) usage();
      const req = await enqueueMerge(dir, taskId);
      console.log(JSON.stringify(req, null, 2));
      return;
    }
    if (sub === "next") {
      const res = await mergeNext(repo, dir, config);
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    usage();
  }

  if (cmd === "session") {
    const sessions = new SessionStore(dir);
    const sub = args[1];
    const agent = arg("--agent", args);
    const reason = arg("--reason", args) ?? "cli";
    if (sub === "register") {
      if (!agent) usage();
      const role = arg("--role", args) ?? agent;
      const rec = sessions.register(role, { agentId: agent, initialState: "sleeping" });
      console.log(JSON.stringify(rec, null, 2));
      return;
    }
    if (sub === "wake") {
      if (!agent) usage();
      if (config.opencode.enabled) {
        const session = new SessionStore(dir).get(agent);
        if (!session) throw new Error(`session not found: ${agent}`);
        const env = buildPiEnv(dir, config, session);
        const r = await wakeWithOpencode(dir, config, agent, reason, env, {
          maxAwake: config.sess_mgr.max_awake,
          force: args.includes("--force"),
        });
        console.log(JSON.stringify(r, null, 2));
      } else {
        const rec = await wakeWithPi(dir, config, agent, reason, {
          maxAwake: config.sess_mgr.max_awake,
          force: args.includes("--force"),
        });
        console.log(JSON.stringify(rec, null, 2));
      }
      return;
    }
    if (sub === "sleep") {
      if (!agent) usage();
      // opencode sessions carry an "oc-<id>" pi_session_id; stop them server-side
      const cur = sessions.get(agent);
      if (config.opencode.enabled && cur?.pi_session_id?.startsWith("oc-")) {
        const spawner = new OpencodeSpawner(config);
        await spawner.stop({ pid: -1, pi_session_id: cur.pi_session_id });
      }
      console.log(JSON.stringify(await sleepWithPi(dir, config, agent, reason), null, 2));
      return;
    }
    if (sub === "terminate") {
      if (!agent) usage();
      console.log(JSON.stringify(await sessions.terminate(agent, reason), null, 2));
      return;
    }
    if (sub === "list") {
      const state = arg("--state", args);
      let rows = sessions.list();
      if (state) rows = rows.filter((s) => s.state === state);
      console.log(JSON.stringify({ count: rows.length, sessions: rows }, null, 2));
      return;
    }
    if (sub === "event") {
      const event = arg("--event", args);
      if (!event) usage();
      const res = await applyEvent(dir, config, event, {
        taskId: arg("--task", args),
      });
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (sub === "drain") {
      const res = await drainSessionCommands(dir, config);
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (sub === "roster") {
      console.log(JSON.stringify(rosterSnapshot(dir), null, 2));
      return;
    }
    usage();
  }

  usage();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
