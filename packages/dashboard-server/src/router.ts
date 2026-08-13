import fs from "node:fs";
import path from "node:path";
import {
  readYamlFile,
  runsRoot,
  runDir,
  type PicodeConfig,
} from "@picode/core";
import {
  BOARD_COLUMNS,
  SessionStore,
  buildBoard,
  readGoal,
  readMergeQueue,
  readProgress,
  statusSnapshot,
} from "@picode/orchestrator";
import { fetchLiveTokens, type LiveOptions } from "./live.js";

/**
 * 只读路由面（D7 / D070）：全部 GET、无副作用、不写状态文件、不持锁。
 * 复用 orchestrator 纯读投影（statusSnapshot/buildBoard/readMergeQueue/
 * readProgress/readGoal）——面板 = 薄 HTTP 包装。
 *
 * 路由形态：handle(method, pathname) → { status, json }（http 层无关，
 * 便于单测直接断言 JSON）。
 */

export interface RouteResult {
  status: number;
  json: unknown;
}

export interface RouterOpts {
  repo: string;
  config: PicodeConfig;
  live?: Pick<LiveOptions, "timeoutMs"> & { fetchImpl?: typeof fetch };
}

function ok(json: unknown): RouteResult {
  return { status: 200, json };
}

function fail(status: number, message: string): RouteResult {
  return { status, json: { error: message } };
}

/** 读 runs/<id>/ 下可选 YAML，缺失/损坏 → null。 */
function readOptional(dir: string, file: string): unknown {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  try {
    return readYamlFile(p);
  } catch {
    return null;
  }
}

export class DashboardRouter {
  private repo: string;
  private config: PicodeConfig;
  private liveOpts: RouterOpts["live"];

  constructor(opts: RouterOpts) {
    this.repo = opts.repo;
    this.config = opts.config;
    this.liveOpts = opts.live ?? {};
  }

  private root(): string {
    return runsRoot(this.repo, this.config);
  }

  private runDirOf(runId: string): string {
    return runDir(this.repo, this.config, runId);
  }

  private runExists(runId: string): boolean {
    return fs.existsSync(this.runDirOf(runId));
  }

  private listRuns(): string[] {
    const root = this.root();
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((id) => this.runExists(id))
      .sort();
  }

  async handle(method: string, pathname: string): Promise<RouteResult> {
    if (method !== "GET") return fail(405, `method ${method} not allowed (read-only)`);
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] !== "api") return fail(404, "not found");
    const [scope, runId, view, agentId] = parts.slice(1);
    if (scope === "runs") {
      if (!runId) return this.apiRuns();
      if (!this.runExists(runId)) return fail(404, `run not found: ${runId}`);
      switch (view) {
        case undefined:
          return this.apiRun(runId);
        case "board":
          return this.apiBoard(runId);
        case "chunks":
          return this.apiChunks(runId);
        case "tasks":
          return this.apiTasks(runId);
        case "sessions":
          return this.apiSessions(runId);
        case "merge":
          return this.apiMerge(runId);
        case "gates":
          return this.apiGates(runId);
        default:
          return fail(404, `unknown view: ${view}`);
      }
    }
    if (scope === "live") {
      if (!runId || !view || agentId) return fail(400, "expected /api/live/:runId/:agent");
      return this.apiLive(runId, view);
    }
    return fail(404, "not found");
  }

  /** GET /api/runs — 列所有 run（id + goal 摘要）。 */
  private apiRuns(): RouteResult {
    const runs = this.listRuns().map((id) => {
      const goal = readGoal(this.runDirOf(id));
      return {
        run_id: id,
        status: goal.status,
        scale: goal.scale,
        title: goal.title,
        kind: goal.kind,
        created_at: goal.created_at,
        acceptance: goal.acceptance?.length ?? 0,
        product_acceptance: goal.product_acceptance?.length ?? 0,
      };
    });
    return ok({ runs });
  }

  /** GET /api/runs/:id — goal + run.yaml + statusSnapshot（D4 投影复用）。 */
  private apiRun(runId: string): RouteResult {
    const dir = this.runDirOf(runId);
    return ok({
      run_id: runId,
      goal: readGoal(dir),
      run: readOptional(dir, "run.yaml"),
      snapshot: statusSnapshot(dir, this.config),
    });
  }

  /** GET /api/runs/:id/board — buildBoard 7 列看板（D4）。 */
  private apiBoard(runId: string): RouteResult {
    return ok({ ...buildBoard(this.runDirOf(runId)), columns: BOARD_COLUMNS });
  }

  /** GET /api/runs/:id/chunks — chunks.yaml 原样。 */
  private apiChunks(runId: string): RouteResult {
    return ok(readOptional(this.runDirOf(runId), "chunks.yaml") ?? { chunks: [] });
  }

  /** GET /api/runs/:id/tasks — task.yaml + brief/staffing latch + progress + evidence。 */
  private apiTasks(runId: string): RouteResult {
    const dir = this.runDirOf(runId);
    const tasksDir = path.join(dir, "tasks");
    if (!fs.existsSync(tasksDir)) return ok({ tasks: [] });
    const tasks = fs
      .readdirSync(tasksDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .map((taskId) => {
        const tdir = path.join(tasksDir, taskId);
        const task = readOptional(tdir, "task.yaml") ?? {};
        const brief = readOptional(path.join(tdir, "brief"), "brief.yaml");
        const staffing = readOptional(path.join(tdir, "staffing"), "staffing.yaml");
        const evidence = readOptional(path.join(tdir, "evidence"), "evidence.yaml");
        return {
          task_id: taskId,
          ...(task as object),
          latch: {
            brief: (brief as { status?: string } | null)?.status ?? null,
            staffing: (staffing as { status?: string } | null)?.status ?? null,
          },
          progress: readProgress(dir, taskId),
          evidence,
        };
      });
    return ok({ tasks });
  }

  /** GET /api/runs/:id/sessions — 会话表 + continuation 遥测（D069）。 */
  private apiSessions(runId: string): RouteResult {
    const dir = this.runDirOf(runId);
    const store = new SessionStore(dir);
    return ok({
      sessions: store.list(),
      continuation: statusSnapshot(dir, this.config).continuation,
    });
  }

  /** GET /api/runs/:id/merge — merge_queue.jsonl 全量 + 计数。 */
  private apiMerge(runId: string): RouteResult {
    const queue = readMergeQueue(this.runDirOf(runId));
    return ok({
      queue,
      counts: {
        queued: queue.filter((q) => q.status === "queued").length,
        merged: queue.filter((q) => q.status === "merged").length,
        failed: queue.filter((q) => q.status === "failed").length,
      },
    });
  }

  /** GET /api/runs/:id/gates — gates/ 门禁文件 + 各任务 evidence（E4/E6）。 */
  private apiGates(runId: string): RouteResult {
    const dir = this.runDirOf(runId);
    const gates: Array<{ file: string; data: unknown }> = [];
    const gatesDir = path.join(dir, "gates");
    if (fs.existsSync(gatesDir)) {
      for (const f of fs.readdirSync(gatesDir).sort()) {
        gates.push({ file: f, data: readOptional(gatesDir, f) });
      }
    }
    const evidence: Array<{ task_id: string; evidence: unknown }> = [];
    const tasksDir = path.join(dir, "tasks");
    if (fs.existsSync(tasksDir)) {
      for (const e of fs.readdirSync(tasksDir, { withFileTypes: true }).filter((x) => x.isDirectory())) {
        const ev = readOptional(path.join(tasksDir, e.name, "evidence"), "evidence.yaml");
        if (ev) evidence.push({ task_id: e.name, evidence: ev });
      }
    }
    return ok({ gates, evidence });
  }

  /** GET /api/live/:runId/:agent — 代理 serve tokens（oc- 剥离 + info.tokens.total）。 */
  private async apiLive(runId: string, agentId: string): Promise<RouteResult> {
    const baseUrl = (this.config.opencode?.base_url ?? "http://127.0.0.1:7788").replace(/\/+$/, "");
    const result = await fetchLiveTokens({
      baseUrl,
      runDir: this.runDirOf(runId),
      agentId,
      timeoutMs: this.liveOpts?.timeoutMs,
      fetchImpl: this.liveOpts?.fetchImpl,
    });
    return ok(result);
  }
}
