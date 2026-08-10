import { SessionStore } from "../session-store.js";
import { applyEvent, drainSessionCommands, rosterSnapshot } from "../rules-engine.js";
import { sleepWithPi, wakeWithPi, buildPiEnv } from "../pi-adapter.js";
import { OpencodeSpawner, wakeWithOpencode } from "../opencode-adapter.js";
import type { Command, CommandContext } from "./types.js";
import { need, unknownSub } from "./util.js";

export const sessionCommands: Command[] = [
  {
    domain: "session",
    path: ["session", "register"],
    summary: "注册会话（平台岗；sponsor 禁止）",
    usage: "picode session register --repo <path> --run <id> --agent <role_id> [--role <role_id>]",
    run: async (ctx: CommandContext) => {
      const agent = need(ctx, "--agent");
      const role = ctx.arg("--role") ?? agent;
      const rec = new SessionStore(ctx.dir!).register(role, {
        agentId: agent,
        initialState: "sleeping",
      });
      console.log(JSON.stringify(rec, null, 2));
    },
  },
  {
    domain: "session",
    path: ["session", "wake"],
    summary: "唤醒会话（opencode 或 pi 后端；--force 绕过 max_awake）",
    usage: "picode session wake --repo <path> --run <id> --agent <agent_id> [--reason <r>] [--force]",
    run: async (ctx: CommandContext) => {
      const agent = need(ctx, "--agent");
      const reason = ctx.arg("--reason") ?? "cli";
      if (ctx.config!.opencode.enabled) {
        const session = new SessionStore(ctx.dir!).get(agent);
        if (!session) throw new Error(`session not found: ${agent}`);
        const env = buildPiEnv(ctx.dir!, ctx.config!, session);
        const r = await wakeWithOpencode(ctx.dir!, ctx.config!, agent, reason, env, {
          maxAwake: ctx.config!.sess_mgr.max_awake,
          force: ctx.has("--force"),
        });
        console.log(JSON.stringify(r, null, 2));
      } else {
        const rec = await wakeWithPi(ctx.dir!, ctx.config!, agent, reason, {
          maxAwake: ctx.config!.sess_mgr.max_awake,
          force: ctx.has("--force"),
        });
        console.log(JSON.stringify(rec, null, 2));
      }
    },
  },
  {
    domain: "session",
    path: ["session", "sleep"],
    summary: "休眠会话（opencode 会话同时服务端关闭）",
    usage: "picode session sleep --repo <path> --run <id> --agent <agent_id> [--reason <r>]",
    run: async (ctx: CommandContext) => {
      const agent = need(ctx, "--agent");
      const reason = ctx.arg("--reason") ?? "cli";
      const sessions = new SessionStore(ctx.dir!);
      // opencode sessions carry an "oc-<id>" pi_session_id; stop them server-side
      const cur = sessions.get(agent);
      if (ctx.config!.opencode.enabled && cur?.pi_session_id?.startsWith("oc-")) {
        const spawner = new OpencodeSpawner(ctx.config!);
        await spawner.stop({ pid: -1, pi_session_id: cur.pi_session_id });
      }
      console.log(JSON.stringify(await sleepWithPi(ctx.dir!, ctx.config!, agent, reason), null, 2));
    },
  },
  {
    domain: "session",
    path: ["session", "terminate"],
    summary: "终止会话（本 run 内不再唤醒）",
    usage: "picode session terminate --repo <path> --run <id> --agent <agent_id> [--reason <r>]",
    run: async (ctx: CommandContext) => {
      const agent = need(ctx, "--agent");
      const reason = ctx.arg("--reason") ?? "cli";
      console.log(JSON.stringify(await new SessionStore(ctx.dir!).terminate(agent, reason), null, 2));
    },
  },
  {
    domain: "session",
    path: ["session", "list"],
    summary: "会话花名册（--state 过滤）",
    usage: "picode session list --repo <path> --run <id> [--state registered|sleeping|awake|terminated]",
    run: async (ctx: CommandContext) => {
      const state = ctx.arg("--state");
      let rows = new SessionStore(ctx.dir!).list();
      if (state) rows = rows.filter((s) => s.state === state);
      console.log(JSON.stringify({ count: rows.length, sessions: rows }, null, 2));
    },
  },
  {
    domain: "session",
    path: ["session", "event"],
    summary: "机械执行一次规则表事件（17 §5.3）",
    usage: "picode session event --repo <path> --run <id> --event <name> [--task <task_id>]",
    run: async (ctx: CommandContext) => {
      const event = need(ctx, "--event");
      const res = await applyEvent(ctx.dir!, ctx.config!, event, {
        taskId: ctx.arg("--task"),
      });
      console.log(JSON.stringify(res, null, 2));
    },
  },
  {
    domain: "session",
    path: ["session", "drain"],
    summary: "执行 session_commands.jsonl 指令队列（D028）",
    usage: "picode session drain --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      const res = await drainSessionCommands(ctx.dir!, ctx.config!);
      console.log(JSON.stringify(res, null, 2));
    },
  },
  {
    domain: "session",
    path: ["session", "roster"],
    summary: "花名册快照（sess-mgr 观测）",
    usage: "picode session roster --repo <path> --run <id>",
    run: async (ctx: CommandContext) => {
      console.log(JSON.stringify(rosterSnapshot(ctx.dir!), null, 2));
    },
  },
];

/** Fallback handler for unknown `session <sub>` (kept for parity with cli.ts dispatch). */
export function sessionFallback(ctx: CommandContext): never {
  return unknownSub("session", ctx.args[1]);
}
