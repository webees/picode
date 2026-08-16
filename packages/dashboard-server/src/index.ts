#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@picode/core";
import { DashboardRouter } from "./router.js";

/**
 * dashboard-server 启动入口（D8/D070 + D114 局部例外）：轻量只读 HTTP
 * （node:http，零框架依赖）。写面仅 POST /api/runs/:id/bus/:room 写代理例外
 * （D114：sponsor chat、ACL fail-closed），CORS 相应补 POST；读面全 GET 只读、
 * 无副作用。
 *   node dist/index.js [--repo <repoRoot>] [--port <port>]
 * --repo 默认 cwd，读其 .picode/config.yaml 的 runs_root 与 opencode.base_url，
 * 面板可指向任意真实 run 仓（dogfood 克隆等）。
 */

export const DEFAULT_PORT = 8788;

export interface StartOpts {
  repo?: string;
  port?: number;
  fetchImpl?: typeof fetch;
}

/** 写代理 body 上限（本地工具，仅防内存滥用）。 */
const MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** POST 请求体 JSON 读取（仅写代理端点消费；坏 JSON → 400、超大 → 413）。 */
async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "bad json body");
  }
}

function parseArgs(argv: string[]): { repo: string; port: number } {
  let repo = process.cwd();
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) repo = argv[++i];
    else if (argv[i] === "--port" && argv[i + 1]) port = Number(argv[++i]);
  }
  return { repo, port };
}

export function startServer(opts: StartOpts): http.Server {
  const repo = path.resolve(opts.repo ?? process.cwd());
  const config = loadConfig(repo);
  const router = new DashboardRouter({ repo, config, live: opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : undefined });
  const port = opts.port ?? DEFAULT_PORT;

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // D114：写代理端点补 POST（GET,POST,OPTIONS）；OPTIONS 预检保持 204
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad url" }));
      return;
    }
    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await readJsonBody(req);
      } catch (e) {
        if (e instanceof HttpError) {
          res.writeHead(e.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
          return;
        }
        throw e;
      }
    }
    try {
      const { status, json } = await router.handle(
        req.method ?? "GET",
        url.pathname + url.search,
        body !== undefined ? { body } : undefined,
      );
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.error(`[dashboard-server] http://127.0.0.1:${port} repo=${repo}`);
  });
  return server;
}

const isMain =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { repo, port } = parseArgs(process.argv.slice(2));
  startServer({ repo, port });
}
