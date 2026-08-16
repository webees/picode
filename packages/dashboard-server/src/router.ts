import fs from "node:fs";
import path from "node:path";
import {
  ApprovalStore,
  ErrorCode,
  PicodeError,
  readYamlFile,
  runsRoot,
  runDir,
  type PicodeConfig,
} from "@picode/core";
import { RoomStore } from "@picode/bus";
import {
  BOARD_COLUMNS,
  SessionStore,
  buildBoard,
  fetchLiveTokens,
  readChangeOrders,
  readGoal,
  readMergeQueue,
  readProgress,
  statusSnapshot,
  type LiveOptions,
} from "@picode/orchestrator";
import {
  DEFAULT_BUS_LIMIT,
  isSafeRoom,
  listBusRooms,
  readBusMessages,
} from "./bus.js";

/**
 * 路由面（D7 / D070 只读 + D113/D114 局部例外）：除唯一写端点 POST
 * /api/runs/:id/bus/:room（D114 写代理：sponsor chat、ACL fail-closed）外，
 * 全部 GET、无副作用、不写状态文件、不持锁。
 * 复用 orchestrator 纯读投影（statusSnapshot/buildBoard/readMergeQueue/
 * readProgress/readGoal/readChangeOrders）+ ApprovalStore.list（core）——
 * 面板 = 薄 HTTP 包装。
 *
 * 路由形态：handle(method, pathname, opts?) → { status, json }（http 层无关，
 * 便于单测直接断言 JSON）；opts.body 为 POST 写代理的已解析 JSON body。
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

export interface HandleOpts {
  body?: unknown;
}

function ok(json: unknown): RouteResult {
  return { status: 200, json };
}

function fail(status: number, message: string, code?: string): RouteResult {
  return { status, json: code ? { error: message, code } : { error: message } };
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

  async handle(method: string, pathname: string, opts?: HandleOpts): Promise<RouteResult> {
    const [pathPart, queryStr] = pathname.split("?", 2);
    const query = new URLSearchParams(queryStr ?? "");
    const parts = pathPart.split("/").filter(Boolean);
    const [scope, runId, view, ...rest] = parts.slice(1);
    // D114：唯一写面局部例外——POST /api/runs/:id/bus/:room（sponsor 写代理）。
    // 其余路由非 GET 一律 405（D070 只读不变量保持，仅对本端点局部例外）。
    const isBusPost =
      method === "POST" && scope === "runs" && !!runId && view === "bus" && rest.length === 1;
    if (method !== "GET" && !isBusPost) {
      return fail(405, `method ${method} not allowed (read-only)`);
    }
    if (parts[0] !== "api") return fail(404, "not found");
    if (scope === "runs") {
      if (!runId) return this.apiRuns();
      if (!this.runExists(runId)) return fail(404, `run not found: ${runId}`);
      if (isBusPost) return await this.apiBusPost(runId, rest[0], opts?.body);
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
        // D113：读面扩展——聊天室 bus 3 端点 + approvals/change-orders 数据源
        case "bus":
          return this.apiBus(runId, rest, query);
        case "approvals":
          return this.apiApprovals(runId);
        case "change-orders":
          return this.apiChangeOrders(runId);
        default:
          return fail(404, `unknown view: ${view}`);
      }
    }
    if (scope === "live") {
      if (!runId || !view || rest.length > 0) return fail(400, "expected /api/live/:runId/:agent");
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

  /**
   * GET /api/runs/:id/bus[/:room[/members]] — D113 聊天室读面：
   * fs 直读（面板观测者无 agent 身份，不套 ACL，apiGates/statusSnapshot 先例）；
   * 房间名 SAFE_ROOM_RE 校验防路径逃逸（bus.ts 拼接路径前校验）。
   */
  private apiBus(runId: string, rest: string[], query: URLSearchParams): RouteResult {
    const dir = this.runDirOf(runId);
    if (rest.length === 0) {
      // 房间列表：bus/*.jsonl 扫描行计数（与 statusSnapshot.rooms 同源口径）
      return ok({ rooms: listBusRooms(dir) });
    }
    const [room, sub] = rest;
    if (!isSafeRoom(room)) {
      return fail(
        400,
        `房间名非法（SAFE_ROOM_RE 防路径逃逸，仅允许字母/数字/_/-）: ${room}`,
        "BAD_ROOM",
      );
    }
    if (rest.length === 2 && sub === "members") {
      // 参与者：rooms/<room>/members.{yaml,json} 原样（id/access/post_types_allow）
      return ok({ room, members: readRoomMembers(dir, room) ?? [] });
    }
    if (rest.length > 1) return fail(404, `unknown view: ${rest.join("/")}`);
    // 消息流：JSONL 逐行容错跳过损坏行 + ?limit= 切片（默认 50，取最近 N 条）
    const limit = parseLimit(query.get("limit"));
    return ok({ room, messages: readBusMessages(dir, room, { limit }) });
  }

  /**
   * POST /api/runs/:id/bus/:room — D114 写面局部例外（唯一写端点）：
   * 以 sponsor 身份 post type=chat（D018/D035：sponsor 永远人类、通道仅 chat）；
   * 校验链直接走 @picode/bus RoomStore.post（type 注册表 → members ACL →
   * owner 围栏 → sender 围栏），ACL fail-closed——成员表须含 sponsor 且
   * access=post 且 post_types_allow 含 chat（现默认仅 leadership/product 两房，
   * run-store.ts createRun@170-184）；未授权 → 结构化拒绝
   * （ROOM_POST_DENIED / BUS_TYPE_DENIED，含中文可读错误）。
   */
  private async apiBusPost(runId: string, room: string, body: unknown): Promise<RouteResult> {
    if (!isSafeRoom(room)) {
      return fail(400, `房间名非法（SAFE_ROOM_RE 防路径逃逸）: ${room}`, "BAD_ROOM");
    }
    const payload = body as Record<string, unknown> | null;
    if (typeof payload !== "object" || payload === null) {
      return fail(
        400,
        'POST body 须为 JSON 对象 { body: string, refs?: string[], type?: "chat" }',
        "BAD_BODY",
      );
    }
    const type = payload.type === undefined ? "chat" : payload.type;
    if (type !== "chat") {
      return fail(
        400,
        `仅允许 sponsor 以 type=chat 发言（D114 写代理局部例外），收到 type=${String(type)}`,
        "BUS_TYPE_DENIED",
      );
    }
    if (typeof payload.body !== "string" || payload.body.trim() === "") {
      return fail(400, "chat body 不能为空", "BAD_BODY");
    }
    const refs = payload.refs;
    if (refs !== undefined && (!Array.isArray(refs) || refs.some((r) => typeof r !== "string"))) {
      return fail(400, "refs 须为字符串数组", "BAD_BODY");
    }
    try {
      const store = new RoomStore(this.runDirOf(runId));
      const message = await store.post(room, "sponsor", {
        type: "chat",
        body: payload.body,
        refs: refs === undefined ? [] : (refs as string[]),
      });
      return ok({ posted: true, message });
    } catch (e) {
      if (e instanceof PicodeError) {
        switch (e.code) {
          case ErrorCode.ROOM_POST_DENIED:
            return fail(
              403,
              `sponsor 在房间 "${room}" 无发言权限（ACL fail-closed：成员表须含 sponsor 且 access=post 且 post_types_allow 含 chat）`,
              "ROOM_POST_DENIED",
            );
          case ErrorCode.BUS_TYPE_DENIED:
            return fail(400, `未知 bus 消息类型（仅 chat）: ${e.message}`, "BUS_TYPE_DENIED");
          case ErrorCode.BAD_ARGS:
            return fail(400, e.message, "BAD_ROOM");
          case ErrorCode.CONFIG_INVALID:
            return fail(500, `成员表损坏，ACL fail-closed：${e.message}`, "ACL_CORRUPT");
          default:
            return fail(500, e.message);
        }
      }
      throw e;
    }
  }

  /**
   * GET /api/runs/:id/approvals — D113 数据源（供 W2 flow-ui 流程可视化）：
   * approvals/pending-*.json 全量（asked/decided 成对审计字段），
   * asked.at 升序（ApprovalStore.list 语义，approval.ts@112-128）。
   */
  private apiApprovals(runId: string): RouteResult {
    const store = new ApprovalStore(this.runDirOf(runId));
    return ok({ approvals: store.list() });
  }

  /**
   * GET /api/runs/:id/change-orders — D113 数据源（供 W2 flow-ui 流程可视化）：
   * change_orders/*.yaml（proposed→applied→closed 状态机数据源），
   * ts 升序（readChangeOrders 语义，memory.ts@32-34）。
   */
  private apiChangeOrders(runId: string): RouteResult {
    return ok({ change_orders: readChangeOrders(this.runDirOf(runId)) });
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

/** 房间成员（rooms/<room>/members.{yaml,json}，镜像 @picode/bus Member）。 */
interface RoomMember {
  id: string;
  access: string;
  post_types_allow?: string[];
}

/**
 * 容错读房间成员表：缺失/损坏 → null（读面观测者容错先例；写面 ACL 仍由
 * RoomStore.post fail-closed 兜底——损坏成员表在写路径抛 CONFIG_INVALID）。
 * members.json 优先，与 loadMembers 同口径。
 */
function readRoomMembers(dir: string, room: string): RoomMember[] | null {
  const jsonPath = path.join(dir, "rooms", room, "members.json");
  const yamlPath = path.join(dir, "rooms", room, "members.yaml");
  const p = fs.existsSync(jsonPath) ? jsonPath : yamlPath;
  if (!fs.existsSync(p)) return null;
  try {
    const data = p.endsWith(".json")
      ? (JSON.parse(fs.readFileSync(p, "utf8")) as unknown)
      : readYamlFile(p);
    const members = (data as { members?: unknown } | null)?.members ?? data;
    return Array.isArray(members) ? (members as RoomMember[]) : null;
  } catch {
    return null;
  }
}

/** ?limit= 解析：正整数生效，缺省/非法回退 DEFAULT_BUS_LIMIT。 */
function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_BUS_LIMIT;
}
