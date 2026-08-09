#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRun, resolveRunDir, setGoalStatus } from "./run-store.js";
import {
  addChunkAndTask,
  approveBrief,
  draftBrief,
  prepareTask,
  printSpawnEnv,
} from "./task.js";
import { SessionStore } from "./session-store.js";

function arg(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function usage(): never {
  console.log(`picode CLI (MVP)

  picode init --repo <path> --goal-title <title> [--scale S|M|L]
  picode goal set-status --repo <path> --run <id> --status intake|draft|active|...
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
    const goal = setGoalStatus(dir, status, { clearOpenQuestions: true });
    console.log(JSON.stringify(goal, null, 2));
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
      const rec = await sessions.wake(agent, reason, {
        maxAwake: config.sess_mgr.max_awake,
        force: args.includes("--force"),
      });
      console.log(JSON.stringify(rec, null, 2));
      return;
    }
    if (sub === "sleep") {
      if (!agent) usage();
      console.log(JSON.stringify(await sessions.sleep(agent, reason), null, 2));
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
    usage();
  }

  usage();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
