#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { enqueueMerge, mergeNext, readMergeQueue } from "./merge.js";
import { sweepProgress } from "./progress.js";
import { statusSnapshot } from "./status.js";
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
import { SessionStore } from "./session-store.js";
import { applyEvent, drainSessionCommands, rosterSnapshot } from "./rules-engine.js";
import { sleepWithPi, wakeWithPi } from "./pi-adapter.js";
import {
  approveStaffing,
  checkPersonas,
  createStaffingRequest,
  draftPersonas,
} from "./staffing.js";

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
  picode draft park --repo <path> --run <id> --task <task_id>
  picode knowledge ingest --repo <path> --run <id> --task <task_id>
  picode chunk add --repo <path> --run <id> --id chunk-a --write "src/**"
  picode brief draft --repo <path> --run <id> --task <task_id>
  picode brief approve --repo <path> --run <id> --task <task_id> [--by run-lead]
  picode task prepare --repo <path> --run <id> --task <task_id>
  picode task spawn-print --repo <path> --run <id> --task <task_id> --seat squad-lead|engineer|sdet
  picode session register --repo <path> --run <id> --agent <role_id> [--role <role_id>]
  picode session wake --repo <path> --run <id> --agent <agent_id> [--reason <r>] [--force]
  picode session sleep --repo <path> --run <id> --agent <agent_id> [--reason <r>]
  picode session terminate --repo <path> --run <id> --agent <agent_id> [--reason <r>]
  picode session list --repo <path> --run <id> [--state registered|sleeping|awake|terminated]
  picode session event --repo <path> --run <id> --event <name> [--task <task_id>]
  picode session drain --repo <path> --run <id>
  picode staffing request --repo <path> --run <id> --task <task_id> [--skills a,b] [--notes <n>]
  picode staffing draft-personas --repo <path> --run <id> --task <task_id>
  picode staffing check --repo <path> --run <id> --task <task_id>
  picode staffing approve --repo <path> --run <id> --task <task_id> [--by run-lead]
  picode progress sweep --repo <path> --run <id>
  picode merge request --repo <path> --run <id> --task <task_id>
  picode merge next --repo <path> --run <id>
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
    const { runId, dir } = createRun(repo, { title, scale });
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
  if (cmd === "progress" && args[1] === "check") {
    console.log(JSON.stringify(await sweepProgress(dir, config), null, 2));
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

  if (cmd === "staffing") {
    const sub = args[1];
    const taskId = arg("--task", args);
    if (!taskId) usage();
    if (sub === "request") {
      const skills = (arg("--skills", args) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const r = await createStaffingRequest(dir, config, taskId, {
        skills,
        notes: arg("--notes", args),
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
      const rec = await wakeWithPi(dir, config, agent, reason, {
        maxAwake: config.sess_mgr.max_awake,
        force: args.includes("--force"),
      });
      console.log(JSON.stringify(rec, null, 2));
      return;
    }
    if (sub === "sleep") {
      if (!agent) usage();
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
