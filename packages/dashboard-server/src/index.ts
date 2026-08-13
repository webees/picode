#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@picode/core";
import { DashboardRouter } from "./router.js";

/**
 * dashboard-server 启动入口（D8/D070）：轻量只读 HTTP（node:http，零框架依赖）。
 *   node dist/index.js [--repo <repoRoot>] [--port <port>]
 * --repo 默认 cwd，读其 .picode/config.yaml 的 runs_root 与 opencode.base_url，
 * 面板可指向任意真实 run 仓（dogfood 克隆等）。全部 GET 只读、无副作用。
 */

export const DEFAULT_PORT = 8788;

export interface StartOpts {
  repo?: string;
  port?: number;
  fetchImpl?: typeof fetch;
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
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad url" }));
      return;
    }
    try {
      const { status, json } = await router.handle(req.method ?? "GET", pathname);
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
