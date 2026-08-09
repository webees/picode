/**
 * Pi extension entry for picode.
 * Loads when: pi -e packages/pi-extension/src/index.ts
 *
 * Types are structural (duck-typed) so the package builds without
 * @mariozechner/pi-coding-agent installed. At runtime Pi injects ExtensionAPI.
 */
import fs from "node:fs";
import path from "node:path";
import {
  matchGlob,
  profileAllows,
  type ToolName,
} from "@picode/core";
import { RoomStore, verifyToken } from "@picode/bus";

interface PiApi {
  registerTool: (tool: {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal: unknown,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }) => void;
}

function jsonResult(obj: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function err(code: string, message: string) {
  return jsonResult({ ok: false, code, message });
}

function loadSecret(runsRoot: string, runId: string): string {
  const p = path.join(runsRoot, runId, "secret.txt");
  if (!fs.existsSync(p)) return "dev-secret";
  return fs.readFileSync(p, "utf8").trim();
}

export default function picodeExtension(pi: PiApi): void {
  const runId = env("PICODE_RUN_ID");
  const runsRoot = env("PICODE_RUNS_ROOT");
  const agentId = env("PICODE_AGENT_ID");
  const token = env("PICODE_AGENT_TOKEN");
  const profile = env("PICODE_TOOL_PROFILE", "implement.engineer");
  const cwd = env("PICODE_CWD", process.cwd());
  const writePaths: string[] = JSON.parse(env("PICODE_WRITE_PATHS", "[]"));
  const readPaths: string[] = JSON.parse(env("PICODE_READ_PATHS", "[]"));

  const runDir = runId && runsRoot ? path.join(runsRoot, runId) : "";
  const store = runDir ? new RoomStore(runDir) : null;
  const secret = runDir ? loadSecret(runsRoot, runId) : "dev-secret";

  function auth(): string | null {
    if (!agentId || !token) return "TOKEN_INVALID: missing PICODE_AGENT_ID/TOKEN";
    if (!verifyToken(token, agentId, secret)) return "TOKEN_INVALID";
    return null;
  }

  function allow(tool: ToolName): boolean {
    return profileAllows(profile, tool);
  }

  pi.registerTool({
    name: "bus_post",
    label: "Picode Bus Post",
    description: "Post a message to a picode room (ACL enforced)",
    parameters: {
      type: "object",
      properties: {
        room: { type: "string" },
        type: { type: "string" },
        body: { type: "string" },
        refs: { type: "array", items: { type: "string" } },
      },
      required: ["room", "type", "body"],
    },
    async execute(_id, params) {
      if (!allow("bus_post")) return err("TOOL_DENIED", "bus_post not in profile");
      const a = auth();
      if (a) return err("TOKEN_INVALID", a);
      if (!store) return err("NO_RUN", "PICODE_RUN_ID/RUNS_ROOT not set");
      try {
        const msg = await store.post(String(params.room), agentId, {
          type: String(params.type),
          body: String(params.body),
          refs: (params.refs as string[]) ?? [],
        });
        return jsonResult({ ok: true, message: msg });
      } catch (e) {
        const code = (e as { code?: string }).code ?? "BUS_ERROR";
        return err(code, e instanceof Error ? e.message : String(e));
      }
    },
  });

  pi.registerTool({
    name: "bus_history",
    label: "Picode Bus History",
    description: "Read recent messages from a picode room",
    parameters: {
      type: "object",
      properties: {
        room: { type: "string" },
        limit: { type: "number" },
      },
      required: ["room"],
    },
    async execute(_id, params) {
      if (!allow("bus_history")) return err("TOOL_DENIED", "bus_history not in profile");
      const a = auth();
      if (a) return err("TOKEN_INVALID", a);
      if (!store) return err("NO_RUN", "run not set");
      try {
        const hist = store.history(
          String(params.room),
          agentId,
          Number(params.limit ?? 50),
        );
        return jsonResult({ ok: true, messages: hist });
      } catch (e) {
        return err("ROOM_READ_DENIED", e instanceof Error ? e.message : String(e));
      }
    },
  });

  pi.registerTool({
    name: "repo_write",
    label: "Picode Repo Write",
    description: "Write a file inside write_paths of the current task worktree",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path in worktree" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    async execute(_id, params) {
      if (!allow("repo_write")) return err("TOOL_DENIED", "repo_write not in profile");
      const a = auth();
      if (a) return err("TOKEN_INVALID", a);
      const rel = String(params.path).replace(/^\/+/, "");
      if (writePaths.length && !matchGlob(rel, writePaths)) {
        return err("WRITE_PATH_DENIED", `path not in write_paths: ${rel}`);
      }
      const abs = path.resolve(cwd, rel);
      if (!abs.startsWith(path.resolve(cwd))) {
        return err("WRITE_PATH_DENIED", "path escapes cwd");
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, String(params.content), "utf8");
      return jsonResult({ ok: true, path: rel });
    },
  });

  pi.registerTool({
    name: "repo_read",
    label: "Picode Repo Read",
    description: "Read a file from the task worktree (read/write paths)",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async execute(_id, params) {
      if (!allow("repo_read")) return err("TOOL_DENIED", "repo_read not in profile");
      const a = auth();
      if (a) return err("TOKEN_INVALID", a);
      const rel = String(params.path).replace(/^\/+/, "");
      const allowed =
        writePaths.length === 0 && readPaths.length === 0
          ? true
          : matchGlob(rel, [...writePaths, ...readPaths, "tasks/**", "**/*.md"]);
      if (!allowed) return err("READ_PATH_DENIED", rel);
      const abs = path.resolve(cwd, rel);
      if (!fs.existsSync(abs)) return err("NOT_FOUND", rel);
      return jsonResult({ ok: true, path: rel, content: fs.readFileSync(abs, "utf8") });
    },
  });

  pi.registerTool({
    name: "progress_report",
    label: "Picode Progress",
    description: "Post progress to task room (for lead seat)",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        phase: { type: "string" },
        blocked: { type: "boolean" },
      },
      required: ["summary"],
    },
    async execute(_id, params) {
      if (!allow("progress_report")) return err("TOOL_DENIED", "progress_report not allowed");
      const a = auth();
      if (a) return err("TOKEN_INVALID", a);
      if (!store) return err("NO_RUN", "no run");
      const room = env("PICODE_SQUAD_ROOM") || env("PICODE_WORK_ROOM", "program");
      try {
        // lead should also be on task room — post to work room
        const msg = await store.post(room, agentId, {
          type: "progress",
          body: String(params.summary),
          refs: [],
          meta: {
            phase: params.phase ?? "running",
            blocked: !!params.blocked,
            task_id: env("PICODE_TASK_ID"),
          },
        });
        return jsonResult({ ok: true, message: msg });
      } catch (e) {
        return err("BUS_ERROR", e instanceof Error ? e.message : String(e));
      }
    },
  });

  pi.registerTool({
    name: "request_info",
    label: "Picode Request Info",
    description: "Request filtered information (no direct web). Goes to docs/run-lead pipeline.",
    parameters: {
      type: "object",
      properties: {
        need: { type: "string" },
        requires_web: { type: "boolean" },
      },
      required: ["need"],
    },
    async execute(_id, params) {
      if (!allow("request_info")) return err("TOOL_DENIED", "request_info denied");
      const a = auth();
      if (a) return err("TOKEN_INVALID", a);
      if (!runDir) return err("NO_RUN", "no run");
      const reqDir = path.join(runDir, "requests");
      fs.mkdirSync(reqDir, { recursive: true });
      const id = `req-${Date.now()}`;
      const body = {
        id,
        from_agent: agentId,
        task_id: env("PICODE_TASK_ID"),
        need: String(params.need),
        requires_web: !!params.requires_web,
        status: "pending",
      };
      fs.writeFileSync(path.join(reqDir, `${id}.json`), JSON.stringify(body, null, 2));
      return jsonResult({ ok: true, request: body });
    },
  });
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
