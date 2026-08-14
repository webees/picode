/**
 * Pi extension entry for picode.
 * Loads when: pi -e packages/pi-extension/src/index.ts
 *
 * Types are structural (duck-typed) so the package builds without
 * @mariozechner/pi-coding-agent installed. At runtime Pi injects ExtensionAPI.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import YAML from "yaml";
import {
  ErrorCode,
  errorCodeOf,
  matchGlob,
  PicodeError,
  profileAllows,
  readRunSecret,
  withFileLock,
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

function err(code: ErrorCode, message: string) {
  return jsonResult({ ok: false, code, message });
}

/** sess-mgr command queue: runs/<id>/session_commands.jsonl (18 phase B). */
async function appendSessionCommand(
  runDir: string,
  from: string,
  cmd: { action: "wake" | "sleep" | "terminate"; agent_id: string; reason: string; force?: boolean },
) {
  if (from !== "sess-mgr") {
    throw new PicodeError(
      ErrorCode.COMMAND_FROM_DENIED,
      `command from non-sess-mgr rejected: ${from}`,
    );
  }
  const file = path.join(runDir, "session_commands.jsonl");
  const full = {
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    from,
    ...cmd,
  };
  await withFileLock(path.join(runDir, ".session_commands.lock"), () => {
    fs.appendFileSync(file, JSON.stringify(full) + "\n", "utf8");
  });
  return full;
}

function listSessions(runDir: string): Array<Record<string, unknown>> {
  const sessionsDir = path.join(runDir, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];
  return fs
    .readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(sessionsDir, f), "utf8");
      try {
        return YAML.parse(raw) as Record<string, unknown>;
      } catch {
        return { agent_id: f.replace(/\.yaml$/, ""), parse_error: true };
      }
    });
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
  const secret = runDir ? readRunSecret(runDir) : "dev-secret";

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
      if (!allow("bus_post")) return err(ErrorCode.TOOL_DENIED, "bus_post not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!store) return err(ErrorCode.NO_RUN, "PICODE_RUN_ID/RUNS_ROOT not set");
      try {
        const msg = await store.post(String(params.room), agentId, {
          type: String(params.type),
          body: String(params.body),
          refs: (params.refs as string[]) ?? [],
        });
        return jsonResult({ ok: true, message: msg });
      } catch (e) {
        const code = errorCodeOf(e) ?? ErrorCode.BUS_ERROR;
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
      if (!allow("bus_history")) return err(ErrorCode.TOOL_DENIED, "bus_history not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!store) return err(ErrorCode.NO_RUN, "run not set");
      try {
        const hist = store.history(
          String(params.room),
          agentId,
          Number(params.limit ?? 50),
        );
        return jsonResult({ ok: true, messages: hist });
      } catch (e) {
        return err(ErrorCode.ROOM_READ_DENIED, e instanceof Error ? e.message : String(e));
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
      if (!allow("repo_write")) return err(ErrorCode.TOOL_DENIED, "repo_write not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const rel = String(params.path).replace(/^\/+/, "");
      // fail-closed: empty write set means NO writes are granted (default deny)
      if (writePaths.length === 0 || !matchGlob(rel, writePaths)) {
        return err(ErrorCode.WRITE_PATH_DENIED, `path not in write_paths: ${rel}`);
      }
      let abs: string;
      try {
        abs = resolveInCwd(rel);
      } catch {
        return err(ErrorCode.WRITE_PATH_DENIED, "path escapes cwd");
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
      if (!allow("repo_read")) return err(ErrorCode.TOOL_DENIED, "repo_read not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const rel = String(params.path).replace(/^\/+/, "");
      // fail-closed: empty read/write sets fall back to the doc/task extras only
      const allowed =
        writePaths.length === 0 && readPaths.length === 0
          ? matchGlob(rel, ["tasks/**", "**/*.md"])
          : matchGlob(rel, [...writePaths, ...readPaths, "tasks/**", "**/*.md"]);
      if (!allowed) return err(ErrorCode.READ_PATH_DENIED, rel);
      let abs: string;
      try {
        abs = resolveInCwd(rel);
      } catch {
        return err(ErrorCode.READ_PATH_DENIED, "path escapes cwd");
      }
      if (!fs.existsSync(abs)) return err(ErrorCode.NOT_FOUND, rel);
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
      if (!allow("progress_report")) return err(ErrorCode.TOOL_DENIED, "progress_report not allowed");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!store) return err(ErrorCode.NO_RUN, "no run");
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
        // phase F: also write the machine-readable progress state for sweeps
        const taskId = env("PICODE_TASK_ID");
        // task id 白名单：与 state_read 一致，防 MCP 客户端经 _task_id 路径穿越写
        if (taskId && runDir && /^[A-Za-z0-9_-]+$/.test(taskId)) {
          const prog = {
            task_id: taskId,
            phase: params.phase ?? "running",
            blocked: !!params.blocked,
            summary: String(params.summary),
            updated_at: new Date().toISOString(),
          };
          await withFileLock(path.join(runDir, ".progress.lock"), () => {
            fs.mkdirSync(path.join(runDir, "tasks", taskId), { recursive: true });
            fs.writeFileSync(
              path.join(runDir, "tasks", taskId, "progress.json"),
              JSON.stringify(prog, null, 2),
            );
          });
        }
        return jsonResult({ ok: true, message: msg });
      } catch (e) {
        return err(ErrorCode.BUS_ERROR, e instanceof Error ? e.message : String(e));
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
      if (!allow("request_info")) return err(ErrorCode.TOOL_DENIED, "request_info denied");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!runDir) return err(ErrorCode.NO_RUN, "no run");
      const reqDir = path.join(runDir, "requests");
      fs.mkdirSync(reqDir, { recursive: true });
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const runAllowlist: string[] = JSON.parse(env("PICODE_RUN_ALLOWLIST", "[]"));

  /** Is `rel` inside the union of write/read paths (or a passthrough when both empty)? */
  function pathAllowed(rel: string, extra: string[] = []): boolean {
    if (writePaths.length === 0 && readPaths.length === 0 && extra.length === 0) return true;
    return matchGlob(rel, [...writePaths, ...readPaths, ...extra]);
  }

  /** Resolve `rel` inside cwd, refusing escapes. */
  function resolveInCwd(rel: string): string {
    const root = path.resolve(cwd);
    const abs = path.resolve(root, rel.replace(/^\/+/, ""));
    // boundary check: abs must equal root or start with root + sep
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw Object.assign(new Error("path escapes cwd"), { code: ErrorCode.PATH_ESCAPE });
    }
    return abs;
  }

  /** Run a read-only git command in the worktree; returns trimmed stdout. */
  function git(args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  }

  function walk(dir: string, relBase: string, out: string[]): void {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".git") || ent.name === "node_modules") continue;
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs, rel, out);
      else out.push(rel);
    }
  }

  function fileList(): string[] {
    if (!fs.existsSync(cwd)) return [];
    const all: string[] = [];
    walk(cwd, "", all);
    return all.filter((f) => pathAllowed(f, ["**/*.md"]));
  }

  function readText(rel: string): string {
    const abs = resolveInCwd(rel);
    if (!fs.existsSync(abs)) throw Object.assign(new Error("NOT_FOUND"), { code: ErrorCode.NOT_FOUND });
    return fs.readFileSync(abs, "utf8");
  }

  const sessionTargets = (params: Record<string, unknown>) => ({
    action: params.action as "wake" | "sleep" | "terminate",
    agent_id: String(params.agent_id),
    reason: String(params.reason ?? "sess-mgr"),
    force: !!params.force,
  });

  const sessionTool = (action: "wake" | "sleep") => {
    pi.registerTool({
      name: `session_${action}`,
      label: `Picode Session ${action[0].toUpperCase()}${action.slice(1)}`,
      description:
        `Enqueue a ${action} command for an agent (sess-mgr only). Orchestrator drains the queue.`,
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          reason: { type: "string" },
          ...(action === "wake"
            ? { force: { type: "boolean", description: "bypass max_awake" } }
            : {}),
        },
        required: ["agent_id"],
      },
      async execute(_id, params) {
        if (!allow(`session_${action}` as ToolName))
          return err(ErrorCode.TOOL_DENIED, `session_${action} not in profile`);
        const a = auth();
        if (a) return err(ErrorCode.TOKEN_INVALID, a);
        if (!runDir) return err(ErrorCode.NO_RUN, "no run");
        try {
          const cmd = await appendSessionCommand(runDir, agentId, {
            ...sessionTargets(params),
            action,
          });
          return jsonResult({ ok: true, queued: cmd });
        } catch (e) {
          return err(ErrorCode.COMMAND_FROM_DENIED, e instanceof Error ? e.message : String(e));
        }
      },
    });
  };
  sessionTool("wake");
  sessionTool("sleep");

  pi.registerTool({
    name: "session_list",
    label: "Picode Session List",
    description: "List the run's session roster (awake count, states).",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute() {
      if (!allow("session_list")) return err(ErrorCode.TOOL_DENIED, "session_list not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!runDir) return err(ErrorCode.NO_RUN, "no run");
      const sessions = listSessions(runDir);
      const awake = sessions.filter((s) => s.state === "awake").length;
      return jsonResult({ ok: true, awake_count: awake, sessions });
    },
  });

  pi.registerTool({
    name: "repo_glob",
    label: "Picode Repo Glob",
    description: "List files in the worktree inside read/write paths matching a glob",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: ["pattern"],
    },
    async execute(_id, params) {
      if (!allow("repo_glob")) return err(ErrorCode.TOOL_DENIED, "repo_glob not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const pattern = String(params.pattern);
      const matches = fileList().filter((f) => matchGlob(f, [pattern]));
      return jsonResult({ ok: true, pattern, matches });
    },
  });

  pi.registerTool({
    name: "repo_grep",
    label: "Picode Repo Grep",
    description: "Search file contents inside read/write paths for a regex",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        glob: { type: "string" },
        max: { type: "number" },
      },
      required: ["pattern"],
    },
    async execute(_id, params) {
      if (!allow("repo_grep")) return err(ErrorCode.TOOL_DENIED, "repo_grep not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const raw = String(params.pattern);
      if (raw.length > 200) return err(ErrorCode.BAD_REGEX, "pattern too long (max 200)");
      let re: RegExp;
      try {
        re = new RegExp(raw);
      } catch {
        return err(ErrorCode.BAD_REGEX, raw);
      }
      const glob = params.glob ? String(params.glob) : null;
      const max = Number(params.max ?? 50);
      const hits: Array<{ file: string; line: number; text: string }> = [];
      for (const f of fileList()) {
        if (glob && !matchGlob(f, [glob])) continue;
        let content = "";
        try {
          content = readText(f);
        } catch {
          continue;
        }
        for (const [i, line] of content.split("\n").entries()) {
          if (re.test(line)) {
            hits.push({ file: f, line: i + 1, text: line.slice(0, 300) });
            if (hits.length >= max) return jsonResult({ ok: true, hits, truncated: true });
          }
        }
      }
      return jsonResult({ ok: true, hits, truncated: false });
    },
  });

  const gitTool = (name: string, args: (p: Record<string, unknown>) => string[]) => {
    pi.registerTool({
      name,
      label: `Picode ${name}`,
      description: `Read-only git: ${name} in the worktree`,
      parameters: { type: "object", properties: {} },
      async execute() {
        if (!allow(name as never)) return err(ErrorCode.TOOL_DENIED, `${name} not in profile`);
        const a = auth();
        if (a) return err(ErrorCode.TOKEN_INVALID, a);
        try {
          return jsonResult({ ok: true, output: git(args({})) });
        } catch (e) {
          return err(ErrorCode.GIT_ERROR, e instanceof Error ? e.message : String(e));
        }
      },
    });
  };
  gitTool("git_status", () => ["status", "--short", "--branch"]);
  gitTool("git_diff", () => ["diff", "--stat", "HEAD"]);
  gitTool("git_log", () => ["log", "--oneline", "-15"]);

  pi.registerTool({
    name: "git_commit",
    label: "Picode Git Commit",
    description: "Stage all changes in the worktree and commit (engineer/squad-lead). Message MUST follow docs/standards/commit.md: <type>(<scope>): <中文摘要> + Reviewed-by footer (C5).",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    async execute(_id, params) {
      if (!allow("git_commit")) return err(ErrorCode.TOOL_DENIED, "git_commit not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const msg = String(params.message);
      if (!msg.trim()) return err(ErrorCode.BAD_ARGS, "message required");
      try {
        git(["add", "-A"]);
        git(["commit", "-qm", msg]);
        const sha = git(["rev-parse", "HEAD"]);
        return jsonResult({ ok: true, sha });
      } catch (e) {
        return err(ErrorCode.GIT_ERROR, e instanceof Error ? e.message : String(e));
      }
    },
  });

  pi.registerTool({
    name: "run_allowlisted",
    label: "Picode Run Allowlisted",
    description: "Run a command from the run allowlist (test scripts etc.)",
    parameters: {
      type: "object",
      properties: { cmd: { type: "string" } },
      required: ["cmd"],
    },
    async execute(_id, params) {
      if (!allow("run_allowlisted")) return err(ErrorCode.TOOL_DENIED, "run_allowlisted not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const cmd = String(params.cmd);
      // token-boundary match (13 §6.1): entry must equal the command or be
      // followed by whitespace — `npm test` does not allow `npm test-ci`
      // (no boundary), but does allow `npm test --x` (entry + whitespace args)
      const allowed = runAllowlist.some(
        (entry) => cmd === entry || cmd.startsWith(`${entry} `) || cmd.startsWith(`${entry}\t`),
      );
      if (!allowed) {
        return err(ErrorCode.COMMAND_NOT_ALLOWLISTED, `command not in run_allowlist: ${cmd}`);
      }
      try {
        const [bin, ...rest] = cmd.split(/\s+/);
        const out = execFileSync(bin, rest, { cwd, encoding: "utf8", stdio: "pipe" });
        return jsonResult({ ok: true, exit_code: 0, output: out.slice(-4000) });
      } catch (e) {
        const stderr = (e as { stderr?: Buffer }).stderr?.toString?.() ?? "";
        const stdout = (e as { stdout?: Buffer }).stdout?.toString?.() ?? "";
        return jsonResult({
          ok: false,
          code: ErrorCode.COMMAND_FAILED,
          exit_code: (e as { status?: number }).status ?? 1,
          output: (stdout + stderr).slice(-4000),
        });
      }
    },
  });

  pi.registerTool({
    name: "web_search",
    label: "Picode Web Search",
    description: "Search the web (research/ind-res only). Returns result snippets.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, max: { type: "number" } },
      required: ["query"],
    },
    async execute(_id, params) {
      if (!allow("web_search")) return err(ErrorCode.TOOL_DENIED, "web_search not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const query = String(params.query);
      const max = Number(params.max ?? 5);
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "picode-research/0.1" },
        });
        const html = await res.text();
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null && results.length < max) {
          const href = m[1];
          const clean = href.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").replace(/&rut=.*$/, "");
          results.push({
            title: m[2].replace(/<[^>]+>/g, ""),
            url: decodeURIComponent(clean),
            snippet: m[3].replace(/<[^>]+>/g, ""),
          });
        }
        return jsonResult({ ok: true, query, results });
      } catch (e) {
        return err(ErrorCode.WEB_ERROR, e instanceof Error ? e.message : String(e));
      }
    },
  });

  /** Refuse private/loopback/link-local hosts (SSRF guard). */
  function isBlockedHost(host: string): boolean {
    let h = host.replace(/^\[|\]$/g, "").toLowerCase();
    // strip a single trailing dot (FQDN form: localhost. → localhost)
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (h === "localhost") return true;

    // IPv4: use node:net to normalize dotted-quad, shorthand (127.1) and
    // integer (2130706433) forms; v4-mapped IPv6 (::ffff:127.0.0.1) too.
    const ip = isIP(h);
    if (ip === 4) {
      const parts = h.split(".").map(Number);
      const [a, b] = [parts[0] ?? 0, parts[1] ?? 0];
      // 10/8, 127/8, 169.254/16, 172.16-31/12, 192.168/16, 0/8, 100.64/10
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      return false;
    }
    if (ip === 6) {
      const lo = h.toLowerCase();
      // loopback / unspecified
      if (lo === "::1" || lo === "::") return true;
      // ULA fc00::/7 and link-local fe80::/10
      if (lo.startsWith("fc") || lo.startsWith("fd") || /^fe[89ab]/.test(lo)) return true;
      // v4-mapped ::ffff:a.b.c.d / ::ffff:xxxx:xxxx (hex) → re-check embedded IPv4
      if (lo.startsWith("::ffff:")) {
        const tail = lo.slice(7);
        const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(tail);
        if (m) return isBlockedHost(`${m[1]}.${m[2]}.${m[3]}.${m[4]}`);
        const hex = /^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.exec(tail);
        if (hex) {
          const [hi, lo16] = tail.split(":").map((s) => parseInt(s, 16));
          return isBlockedHost(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo16 >> 8) & 0xff}.${lo16 & 0xff}`);
        }
      }
      return false;
    }
    // hostnames ending in .local / .internal / .localhost / .localdomain
    return /\.(local|internal|localhost|localdomain)$/.test(h);
  }

  pi.registerTool({
    name: "web_fetch",
    label: "Picode Web Fetch",
    description: "Fetch a URL and return its text (research/ind-res only)",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    async execute(_id, params) {
      if (!allow("web_fetch")) return err(ErrorCode.TOOL_DENIED, "web_fetch not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      const raw = String(params.url);
      if (!/^https?:\/\//.test(raw)) return err(ErrorCode.BAD_URL, "http(s) only");
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        return err(ErrorCode.BAD_URL, raw);
      }
      if (isBlockedHost(u.hostname)) return err(ErrorCode.URL_BLOCKED, "private/loopback host refused");
      try {
        const res = await fetch(raw, {
          headers: { "User-Agent": "picode-research/0.1" },
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (loc) {
            const next = new URL(loc, raw);
            if (isBlockedHost(next.hostname)) return err(ErrorCode.URL_BLOCKED, "redirect to private host refused");
          }
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const text = buf.subarray(0, 20000).toString("utf8");
        return jsonResult({ ok: true, status: res.status, url: raw, text, truncated: buf.length > 20000 });
      } catch (e) {
        return err(ErrorCode.WEB_ERROR, e instanceof Error ? e.message : String(e));
      }
    },
  });

  pi.registerTool({
    name: "request_cross_room",
    label: "Picode Cross-Room Request",
    description: "Request a temporary cross-room bridge (run-lead approves)",
    parameters: {
      type: "object",
      properties: {
        target_room: { type: "string" },
        need: { type: "string" },
      },
      required: ["target_room", "need"],
    },
    async execute(_id, params) {
      if (!allow("request_cross_room")) return err(ErrorCode.TOOL_DENIED, "request_cross_room not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!runDir) return err(ErrorCode.NO_RUN, "no run");
      const reqDir = path.join(runDir, "requests");
      fs.mkdirSync(reqDir, { recursive: true });
      const id = `xreq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const body = {
        id,
        from_agent: agentId,
        task_id: env("PICODE_TASK_ID"),
        type: "cross_room",
        target_room: String(params.target_room),
        need: String(params.need),
        status: "pending",
      };
      fs.writeFileSync(path.join(reqDir, `${id}.json`), JSON.stringify(body, null, 2));
      return jsonResult({ ok: true, request: body });
    },
  });

  pi.registerTool({
    name: "state_read",
    label: "Picode State Read",
    description: "Read run state files (goal, chunks, sessions, tasks) — read-only",
    parameters: {
      type: "object",
      properties: { rel: { type: "string", description: "path under run dir, e.g. goal.yaml, chunks.yaml, tasks/<id>/task.yaml" } },
      required: ["rel"],
    },
    async execute(_id, params) {
      if (!allow("state_read")) return err(ErrorCode.TOOL_DENIED, "state_read not in profile");
      const a = auth();
      if (a) return err(ErrorCode.TOKEN_INVALID, a);
      if (!runDir) return err(ErrorCode.NO_RUN, "no run");
      const rel = String(params.rel).replace(/^\/+/, "");
      // whitelist state files only — never arbitrary run files
      const allowed =
        /^goal\.yaml$/.test(rel) ||
        /^chunks\.yaml$/.test(rel) ||
        /^sessions\/[A-Za-z0-9@_.-]+\.yaml$/.test(rel) ||
        /^tasks\/[A-Za-z0-9_-]+\/(task|progress)\.(yaml|json)$/.test(rel) ||
        /^tasks\/[A-Za-z0-9_-]+\/brief\/[A-Za-z0-9_.-]+\.(md|yaml|json)$/.test(rel) ||
        /^windows\/[A-Za-z0-9_-]+\.yaml$/.test(rel);
      if (!allowed) return err(ErrorCode.STATE_DENIED, rel);
      const abs = path.join(runDir, rel);
      if (!abs.startsWith(path.join(runDir))) return err(ErrorCode.STATE_DENIED, "escape");
      if (!fs.existsSync(abs)) return err(ErrorCode.NOT_FOUND, rel);
      return jsonResult({ ok: true, rel, content: fs.readFileSync(abs, "utf8") });
    },
  });
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
