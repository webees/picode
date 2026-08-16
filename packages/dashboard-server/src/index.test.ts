import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "@picode/core";
import { BOARD_COLUMNS, fetchLiveTokens } from "@picode/orchestrator";
import { DashboardRouter, type RouteResult } from "./router.js";
import { startServer } from "./index.js";

/** Minimal-but-real run fixture: everything the projections derive from. */
function buildFixture(repo: string, runId: string): string {
  const run = path.join(repo, ".picode", "runs", runId);
  fs.mkdirSync(path.join(repo, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".picode", "config.yaml"),
    [
      "paths:",
      "  runs_root: .picode/runs",
      "opencode:",
      "  base_url: http://127.0.0.1:7788",
      "",
    ].join("\n"),
  );
  const taskA = path.join(run, "tasks", "task-a");
  fs.mkdirSync(path.join(taskA, "brief"), { recursive: true });
  fs.mkdirSync(path.join(taskA, "staffing"), { recursive: true });
  fs.mkdirSync(path.join(taskA, "evidence"), { recursive: true });
  fs.mkdirSync(path.join(run, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(run, "gates"), { recursive: true });

  fs.writeFileSync(
    path.join(run, "run.yaml"),
    `schema_version: "1"\nrun_id: ${runId}\ncreated_at: 2026-08-13T12:16:26.549Z\nstatus: open\nhalt: false\n`,
  );
  fs.writeFileSync(
    path.join(run, "goal.yaml"),
    [
      "kind: delivery",
      `id: goal-${runId}`,
      `title: 测试 run ${runId}`,
      "status: active",
      "scale: L",
      "product_acceptance:",
      "  - 可接入真实 run 数据",
      "acceptance:",
      "  - id: A1",
      "    type: command",
      "    spec: npm test",
      "created_at: 2026-08-13T12:16:26.549Z",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "chunks.yaml"),
    [
      'schema_version: "1"',
      "chunks:",
      "  - id: chunk-a",
      "    write_paths:",
      "      - packages/a/src/index.ts",
      "    status: ready",
      "    task_id: task-a",
      "  - id: chunk-b",
      "    write_paths:",
      "      - packages/b/src/index.ts",
      "    status: ready",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "merge_queue.jsonl"),
    [
      JSON.stringify({ id: "m1", ts: "2026-08-13T00:00:00.000Z", task_id: "task-a", from: "release-eng", status: "queued", merged_at: null, error: null }),
      JSON.stringify({ id: "m2", ts: "2026-08-13T00:00:01.000Z", task_id: "task-b", from: "release-eng", status: "merged", merged_at: "2026-08-13T00:00:02.000Z", error: null }),
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "gates", "code-review.json"),
    JSON.stringify({ task_id: "task-a", gate: "code-review", status: "pass" }, null, 2),
  );
  fs.writeFileSync(
    path.join(run, "sessions", "engineer@task-a.yaml"),
    [
      'schema_version: "1"',
      "agent_id: engineer@task-a",
      "role_id: engineer",
      "state: awake",
      "pi_session_id: oc-ses_000000000000000000000001",
      "budget:",
      "  turns: 1",
      "  continuations: 0",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(taskA, "task.yaml"),
    [
      "id: task-a",
      "chunk_id: chunk-a",
      "goal_id: goal-fixture",
      "kind: implement",
      "status: assigned",
      "write_paths:",
      "  - packages/a/src/index.ts",
      "triad:",
      "  squad-lead: squad-lead@task-a",
      "  engineer: engineer@task-a",
      "  sdet: sdet@task-a",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(taskA, "brief", "brief.yaml"),
    ['schema_version: "1"', "task_id: task-a", "version: 1", "status: approved", ""].join("\n"),
  );
  fs.writeFileSync(
    path.join(taskA, "staffing", "staffing.yaml"),
    ['schema_version: "1"', "task_id: task-a", "status: approved", ""].join("\n"),
  );
  fs.writeFileSync(
    path.join(taskA, "progress.json"),
    JSON.stringify({ task_id: "task-a", phase: "implementing", blocked: false, summary: "wip", updated_at: "2026-08-13T00:00:00.000Z" }, null, 2),
  );
  fs.writeFileSync(
    path.join(taskA, "evidence", "evidence.yaml"),
    ['schema_version: "1"', "task_id: task-a", "result: pass", ""].join("\n"),
  );

  // —— D113/D114 fixture：聊天室（bus/ + rooms/）——
  fs.mkdirSync(path.join(run, "bus"), { recursive: true });
  fs.mkdirSync(path.join(run, "rooms", "leadership"), { recursive: true });
  fs.mkdirSync(path.join(run, "rooms", "product"), { recursive: true });
  fs.mkdirSync(path.join(run, "rooms", "docs"), { recursive: true });

  // leadership：5 行含 1 损坏行（消息流 4 条有效；房间列表行计数 = 5，
  // 与 statusSnapshot.rooms 同源口径——损坏行计入原始行数）。
  fs.writeFileSync(
    path.join(run, "bus", "leadership.jsonl"),
    [
      JSON.stringify({ ts: "2026-08-13T00:00:01.000Z", id: "m-1", from: "run-lead", room: "leadership", type: "chat", body: "开工", refs: [], reply_to: null }),
      JSON.stringify({ ts: "2026-08-13T00:00:02.000Z", id: "m-2", from: "sponsor", room: "leadership", type: "chat", body: "收到，开始", refs: [], reply_to: null, meta: { kind: "kickoff" } }),
      "{corrupt line: crash 残留半行",
      JSON.stringify({ ts: "2026-08-13T00:00:03.000Z", id: "m-3", from: "tpm", room: "leadership", type: "status", body: "已就位", refs: ["tasks/task-a/progress.json"], reply_to: "m-1" }),
      JSON.stringify({ ts: "2026-08-13T00:00:04.000Z", id: "m-4", from: "run-lead", room: "leadership", type: "chat", body: "确认", refs: [], reply_to: null }),
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "bus", "product.jsonl"),
    [
      JSON.stringify({ ts: "2026-08-13T00:00:10.000Z", id: "p-1", from: "pm", room: "product", type: "chat", body: "需求已确认", refs: [], reply_to: null }),
      "",
    ].join("\n"),
  );
  // 成员表：leadership 用 members.json（sponsor access=post + post_types_allow chat，
  // 与 run-store createRun 默认成员表同构）；product 用 members.yaml（覆盖 YAML 分支）；
  // docs 无 sponsor（POST → ROOM_POST_DENIED 断言用）。
  fs.writeFileSync(
    path.join(run, "rooms", "leadership", "members.json"),
    JSON.stringify(
      {
        room_id: "leadership",
        members: [
          { id: "run-lead", access: "post" },
          { id: "sponsor", access: "post", post_types_allow: ["chat"] },
          { id: "pm", access: "read" },
        ],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(run, "rooms", "product", "members.yaml"),
    [
      "members:",
      "  - id: pm",
      "    access: post",
      "  - id: sponsor",
      "    access: post",
      "    post_types_allow:",
      "      - chat",
      "  - id: run-lead",
      "    access: post",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "rooms", "docs", "members.yaml"),
    [
      "members:",
      "  - id: docs-lead",
      "    access: post",
      "  - id: tech-writer",
      "    access: post",
      "  - id: run-lead",
      "    access: read",
      "",
    ].join("\n"),
  );

  // —— D113 数据源 fixture：approvals（pending-*.json，asked.at 成对审计）——
  fs.mkdirSync(path.join(run, "approvals"), { recursive: true });
  // 文件名倒序（b 在前 a 在后）而 asked.at 正序（a 早 b 晚）——断言按 asked.at 升序而非文件名。
  fs.writeFileSync(
    path.join(run, "approvals", "pending-b.json"),
    JSON.stringify(
      {
        id: "appr-b",
        kind: "sandbox_escalation",
        status: "pending",
        asked: { at: "2026-08-13T00:00:05.000Z", from_agent: "engineer@task-b", task_id: "task-b", path: "packages/b/src/index.ts", mode: "workspace-write", reason: "需要写包 B" },
        decided: null,
        used_at: null,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(run, "approvals", "pending-a.json"),
    JSON.stringify(
      {
        id: "appr-a",
        kind: "sandbox_escalation",
        status: "approved",
        asked: { at: "2026-08-13T00:00:01.000Z", from_agent: "engineer@task-a", task_id: "task-a", path: "packages/a/src/index.ts", mode: "workspace-write", reason: "需要写包 A" },
        decided: { at: "2026-08-13T00:00:02.000Z", by: "run-lead", decision: "approved", note: "OK" },
        used_at: null,
      },
      null,
      2,
    ),
  );

  // —— D113 数据源 fixture：change_orders（*.yaml，proposed→applied→closed 状态机）——
  fs.mkdirSync(path.join(run, "change_orders"), { recursive: true });
  fs.writeFileSync(
    path.join(run, "change_orders", "co-b.yaml"),
    [
      "id: co-b",
      "task_id: task-b",
      "summary: 追加验收项",
      "status: proposed",
      "by: run-lead",
      "ts: 2026-08-13T00:00:05.000Z",
      "applied_at: null",
      "closed_at: null",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "change_orders", "co-a.yaml"),
    [
      "id: co-a",
      "task_id: task-a",
      "summary: 调整边界",
      "status: applied",
      "by: run-lead",
      "ts: 2026-08-13T00:00:01.000Z",
      "applied_at: 2026-08-13T00:00:02.000Z",
      "closed_at: null",
      "",
    ].join("\n"),
  );
  return run;
}

function makeRouter(repo: string, fetchImpl?: typeof fetch): DashboardRouter {
  return new DashboardRouter({
    repo,
    config: loadConfig(repo),
    live: fetchImpl ? { fetchImpl } : undefined,
  });
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dash-fixture-"));
}

async function get(h: DashboardRouter, url: string): Promise<RouteResult> {
  return h.handle("GET", url);
}

test("router: GET /api/runs lists the fixture run", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs");
  assert.strictEqual(status, 200);
  const { runs } = json as { runs: Array<{ run_id: string }> };
  assert.ok(runs.some((r) => r.run_id === "run-fixture-1"));
});

test("router: GET /api/runs/:id exposes goal + snapshot (sessions/merge_queue)", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1");
  assert.strictEqual(status, 200);
  const detail = json as {
    run_id: string;
    goal: { status: string };
    snapshot: { sessions: { total: number }; merge_queue: { queued: number; merged: number } };
  };
  assert.strictEqual(detail.run_id, "run-fixture-1");
  assert.strictEqual(detail.goal.status, "active");
  assert.strictEqual(detail.snapshot.sessions.total, 1);
  assert.deepStrictEqual(
    { queued: detail.snapshot.merge_queue.queued, merged: detail.snapshot.merge_queue.merged },
    { queued: 1, merged: 1 },
  );
});

test("router: GET /api/runs/:id/board reuses buildBoard 7-column semantics", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/board");
  assert.strictEqual(status, 200);
  const board = json as { run: string; cards: Array<{ id: string; column: string }>; columns: string[] };
  assert.strictEqual(board.run, "run-fixture-1");
  assert.ok(board.cards.length >= 1);
  for (const c of board.cards) assert.ok(BOARD_COLUMNS.includes(c.column as never));
  assert.strictEqual(board.columns.length, 7);
});

test("router: GET /api/runs/:id/tasks includes latches + progress + evidence", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/tasks");
  assert.strictEqual(status, 200);
  const { tasks } = json as {
    tasks: Array<{
      task_id: string;
      latch: { brief: string | null; staffing: string | null };
      progress: { phase: string };
      evidence: { result: string };
    }>;
  };
  const a = tasks.find((t) => t.task_id === "task-a");
  assert.ok(a);
  assert.strictEqual(a.latch.brief, "approved");
  assert.strictEqual(a.latch.staffing, "approved");
  assert.strictEqual(a.progress.phase, "implementing");
  assert.strictEqual(a.evidence.result, "pass");
});

test("router: GET /api/runs/:id/sessions lists roster + continuation", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/sessions");
  assert.strictEqual(status, 200);
  const { sessions, continuation } = json as {
    sessions: Array<{ agent_id: string }>;
    continuation: { sessions: Array<{ agent_id: string; platform_seat: boolean }> };
  };
  assert.ok(sessions.some((s) => s.agent_id === "engineer@task-a"));
  assert.ok(Array.isArray(continuation.sessions));
});

test("router: GET /api/runs/:id/merge reads the merge queue + counts", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/merge");
  assert.strictEqual(status, 200);
  const { queue, counts } = json as { queue: Array<{ task_id: string; status: string }>; counts: { queued: number; merged: number; failed: number } };
  assert.strictEqual(queue.length, 2);
  assert.ok(queue.some((q) => q.task_id === "task-a" && q.status === "queued"));
  assert.deepStrictEqual(counts, { queued: 1, merged: 1, failed: 0 });
});

test("router: GET /api/runs/:id/gates lists gates + per-task evidence", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/gates");
  assert.strictEqual(status, 200);
  const { gates, evidence } = json as {
    gates: Array<{ file: string; data: { status: string } }>;
    evidence: Array<{ task_id: string; evidence: { result: string } }>;
  };
  assert.ok(gates.some((g) => g.file === "code-review.json" && g.data.status === "pass"));
  assert.ok(evidence.some((e) => e.task_id === "task-a" && e.evidence.result === "pass"));
});

test("router: GET /api/runs/:id/chunks returns chunk list", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/chunks");
  assert.strictEqual(status, 200);
  const { chunks } = json as { chunks: Array<{ id: string }> };
  assert.ok(chunks.some((c) => c.id === "chunk-a"));
});

test("router: unknown run / route and non-GET are rejected", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const h = makeRouter(repo);
  assert.strictEqual((await h.handle("GET", "/api/runs/does-not-exist")).status, 404);
  assert.strictEqual((await h.handle("GET", "/api/runs/run-fixture-1/nope")).status, 404);
  assert.strictEqual((await h.handle("GET", "/api/not-a-route")).status, 404);
  assert.strictEqual((await h.handle("POST", "/api/runs")).status, 405);
});

test("router: GET /api/runs/:id/bus lists rooms with message counts (同源口径)", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/bus");
  assert.strictEqual(status, 200);
  const { rooms } = json as { rooms: Array<{ room: string; messages: number }> };
  const leadership = rooms.find((r) => r.room === "leadership");
  assert.ok(leadership);
  assert.strictEqual(leadership.messages, 5, "含损坏行的原始行数（statusSnapshot 同源口径）");
  const product = rooms.find((r) => r.room === "product");
  assert.ok(product);
  assert.strictEqual(product.messages, 1);
});

test("router: GET /api/runs/:id/bus/:room streams messages (损坏行跳过 + limit 最近 N)", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const h = makeRouter(repo);
  const all = await get(h, "/api/runs/run-fixture-1/bus/leadership");
  assert.strictEqual(all.status, 200);
  const full = all.json as {
    room: string;
    messages: Array<{ id: string; from: string; type: string; body: string; refs: string[]; reply_to: string | null; meta?: { kind: string } }>;
  };
  assert.strictEqual(full.room, "leadership");
  assert.deepStrictEqual(full.messages.map((m) => m.id), ["m-1", "m-2", "m-3", "m-4"], "损坏行被跳过");
  assert.strictEqual(full.messages[1].from, "sponsor");
  assert.deepStrictEqual(full.messages[1].meta, { kind: "kickoff" }, "meta 字段原样");
  assert.strictEqual(full.messages[2].reply_to, "m-1");
  assert.deepStrictEqual(full.messages[2].refs, ["tasks/task-a/progress.json"]);
  const last2 = await get(h, "/api/runs/run-fixture-1/bus/leadership?limit=2");
  assert.strictEqual(last2.status, 200);
  assert.deepStrictEqual(
    (last2.json as { messages: Array<{ id: string }> }).messages.map((m) => m.id),
    ["m-3", "m-4"],
  );
  // 空房间（无 bus 文件）→ 200 空消息流，不 500
  const ghost = await get(h, "/api/runs/run-fixture-1/bus/ghost");
  assert.strictEqual(ghost.status, 200);
  assert.deepStrictEqual((ghost.json as { messages: unknown[] }).messages, []);
});

test("router: GET /api/runs/:id/bus/:room/members returns members 原样 (json + yaml 分支)", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const h = makeRouter(repo);
  const { status, json } = await get(h, "/api/runs/run-fixture-1/bus/leadership/members");
  assert.strictEqual(status, 200);
  const lead = json as { room: string; members: Array<{ id: string; access: string; post_types_allow?: string[] }> };
  assert.strictEqual(lead.room, "leadership");
  const sponsor = lead.members.find((m) => m.id === "sponsor");
  assert.ok(sponsor);
  assert.strictEqual(sponsor.access, "post");
  assert.deepStrictEqual(sponsor.post_types_allow, ["chat"]);
  assert.ok(lead.members.some((m) => m.id === "pm" && m.access === "read"));
  // YAML 分支：product 用 members.yaml
  const prod = await get(h, "/api/runs/run-fixture-1/bus/product/members");
  assert.strictEqual(prod.status, 200);
  const prodMembers = (prod.json as { members: Array<{ id: string; access: string }> }).members;
  assert.ok(prodMembers.some((m) => m.id === "pm" && m.access === "post"));
  // 无成员表的房间 → 200 空列表
  const empty = await get(h, "/api/runs/run-fixture-1/bus/ghost/members");
  assert.strictEqual(empty.status, 200);
  assert.deepStrictEqual((empty.json as { members: unknown[] }).members, []);
});

test("router: POST /api/runs/:id/bus/:room writes as sponsor (D114 写代理) and stream reflects it", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const h = makeRouter(repo);
  const { status, json } = await h.handle("POST", "/api/runs/run-fixture-1/bus/leadership", {
    body: { body: "sponsor 发言", refs: ["tasks/task-a"] },
  });
  assert.strictEqual(status, 200);
  const res = json as { posted: true; message: { from: string; type: string; room: string; body: string; refs: string[]; ts: string; id: string } };
  assert.strictEqual(res.posted, true);
  assert.strictEqual(res.message.from, "sponsor");
  assert.strictEqual(res.message.type, "chat");
  assert.strictEqual(res.message.room, "leadership");
  assert.strictEqual(res.message.body, "sponsor 发言");
  assert.deepStrictEqual(res.message.refs, ["tasks/task-a"]);
  assert.ok(res.message.ts);
  assert.ok(res.message.id);
  // 消息流最近一条可见（append 落盘）
  const stream = await get(h, "/api/runs/run-fixture-1/bus/leadership?limit=1");
  const last = (stream.json as { messages: Array<{ body: string; from: string; type: string }> }).messages[0];
  assert.strictEqual(last.body, "sponsor 发言");
  assert.strictEqual(last.from, "sponsor");
  assert.strictEqual(last.type, "chat");
  // 房间列表消息数 +1（6 = 5 行 + 新写入）
  const rooms = (await get(h, "/api/runs/run-fixture-1/bus")).json as { rooms: Array<{ room: string; messages: number }> };
  assert.strictEqual(rooms.rooms.find((r) => r.room === "leadership")?.messages, 6);
});

test("router: POST 写代理拒绝路径（fail-closed + 405 只读不变量保持）", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const h = makeRouter(repo);
  // 未授权房间（sponsor 不在 docs 成员表）→ 403 ROOM_POST_DENIED（结构化拒绝，含中文可读错误）
  const denied = await h.handle("POST", "/api/runs/run-fixture-1/bus/docs", { body: { body: "hi" } });
  assert.strictEqual(denied.status, 403);
  const deniedJson = denied.json as { error: string; code: string };
  assert.strictEqual(deniedJson.code, "ROOM_POST_DENIED");
  assert.match(deniedJson.error, /sponsor/);
  // 非 chat 类型 → BUS_TYPE_DENIED（D114 局部例外不放大）
  const badType = await h.handle("POST", "/api/runs/run-fixture-1/bus/leadership", { body: { body: "hi", type: "drift" } });
  assert.strictEqual(badType.status, 400);
  assert.strictEqual((badType.json as { code: string }).code, "BUS_TYPE_DENIED");
  // 缺 body / 空 body → BAD_BODY
  assert.strictEqual((await h.handle("POST", "/api/runs/run-fixture-1/bus/leadership", { body: {} })).status, 400);
  assert.strictEqual((await h.handle("POST", "/api/runs/run-fixture-1/bus/leadership", { body: { body: "  " } })).status, 400);
  // 非对象 body → BAD_BODY
  assert.strictEqual((await h.handle("POST", "/api/runs/run-fixture-1/bus/leadership", { body: "nope" })).status, 400);
  // 路径逃逸 → BAD_ROOM（SAFE_ROOM_RE）
  const escape = await h.handle("POST", "/api/runs/run-fixture-1/bus/..%2F..%2Fsecret", { body: { body: "x" } });
  assert.strictEqual(escape.status, 400);
  assert.strictEqual((escape.json as { code: string }).code, "BAD_ROOM");
  // 其余路由/形态 POST 仍 405（只读不变量仅对单端点局部例外）
  assert.strictEqual((await h.handle("POST", "/api/runs/run-fixture-1/bus")).status, 405);
  assert.strictEqual((await h.handle("POST", "/api/runs/run-fixture-1/bus/leadership/members", { body: { body: "x" } })).status, 405);
  assert.strictEqual((await h.handle("POST", "/api/runs/run-fixture-1/board")).status, 405);
  assert.strictEqual((await h.handle("PUT", "/api/runs/run-fixture-1/bus/leadership")).status, 405);
  assert.strictEqual((await h.handle("DELETE", "/api/runs/run-fixture-1/board")).status, 405);
});

test("router: bus 读面非法子路径/路径逃逸拒绝", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const h = makeRouter(repo);
  const escape = await get(h, "/api/runs/run-fixture-1/bus/..%2F..%2Fsecret");
  assert.strictEqual(escape.status, 400);
  assert.strictEqual((escape.json as { code: string }).code, "BAD_ROOM");
  assert.strictEqual((await get(h, "/api/runs/run-fixture-1/bus/leadership/nope")).status, 404);
  assert.strictEqual((await get(h, "/api/runs/run-fixture-1/bus/leadership/members/extra")).status, 404);
});

test("router: GET /api/runs/:id/approvals lists pending-*.json sorted by asked.at asc", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/approvals");
  assert.strictEqual(status, 200);
  const { approvals } = json as {
    approvals: Array<{ id: string; status: string; asked: { at: string }; decided: { decision: string } | null }>;
  };
  assert.strictEqual(approvals.length, 2);
  assert.deepStrictEqual(approvals.map((a) => a.id), ["appr-a", "appr-b"], "asked.at 升序（与文件名无关）");
  assert.strictEqual(approvals[0].status, "approved");
  assert.ok(approvals[0].decided);
  assert.strictEqual(approvals[0].decided?.decision, "approved");
  assert.strictEqual(approvals[1].status, "pending");
  assert.strictEqual(approvals[1].decided, null);
});

test("router: GET /api/runs/:id/change-orders lists change_orders/*.yaml sorted by ts asc", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const { status, json } = await get(makeRouter(repo), "/api/runs/run-fixture-1/change-orders");
  assert.strictEqual(status, 200);
  const { change_orders } = json as { change_orders: Array<{ id: string; status: string; ts: string; applied_at: string | null }> };
  assert.deepStrictEqual(change_orders.map((c) => c.id), ["co-a", "co-b"], "ts 升序（与文件名无关）");
  assert.strictEqual(change_orders[0].status, "applied");
  assert.strictEqual(change_orders[0].applied_at, "2026-08-13T00:00:02.000Z");
  assert.strictEqual(change_orders[1].status, "proposed");
});

test("server: CORS 补 POST + OPTIONS 预检 204 + HTTP 面写代理端到端（acceptance ⑤/④）", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-fixture-1");
  const server = startServer({ repo, port: 0 });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    // OPTIONS 预检：204 + Access-Control-Allow-Methods 含 POST（D114 CORS 落点）
    const preflight = await fetch(`${base}/api/runs/run-fixture-1/bus/leadership`, {
      method: "OPTIONS",
    });
    assert.strictEqual(preflight.status, 204);
    assert.strictEqual(
      preflight.headers.get("access-control-allow-methods"),
      "GET,POST,OPTIONS",
    );
    assert.strictEqual(preflight.headers.get("access-control-allow-origin"), "*");
    // ?limit= 经 HTTP 透传（index.ts 传 url.pathname+url.search，handle 内解析）
    const stream = await fetch(`${base}/api/runs/run-fixture-1/bus/leadership?limit=1`);
    assert.strictEqual(stream.status, 200);
    const streamBody = (await stream.json()) as { messages: Array<{ body: string }> };
    assert.strictEqual(streamBody.messages.length, 1);
    assert.strictEqual(streamBody.messages[0].body, "确认", "最近一条 = m-4");
    // POST 写代理：body 读取 → {body} 透传 → RoomStore.post 落盘
    const post = await fetch(`${base}/api/runs/run-fixture-1/bus/leadership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "HTTP 冒烟", refs: [] }),
    });
    assert.strictEqual(post.status, 200);
    const posted = (await post.json()) as {
      posted: boolean;
      message: { from: string; type: string; body: string };
    };
    assert.strictEqual(posted.posted, true);
    assert.strictEqual(posted.message.from, "sponsor");
    assert.strictEqual(posted.message.type, "chat");
    assert.strictEqual(posted.message.body, "HTTP 冒烟");
    // 坏 JSON body → 400（index.ts readJsonBody）
    const bad = await fetch(`${base}/api/runs/run-fixture-1/bus/leadership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    assert.strictEqual(bad.status, 400);
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
});

test("live: mock fetch returns tokens from last assistant message (oc- 剥离)", async () => {
  const repo = tmpRepo();
  const run = buildFixture(repo, "run-live-1");
  const seen: string[] = [];
  const fake = (async (url: string) => {
    seen.push(url);
    return {
      ok: true,
      json: async () => [
        { info: { role: "user", time: { created: 1 } } },
        { info: { role: "assistant", tokens: { total: 1234 }, time: { created: 2 } } },
        { info: { role: "assistant", tokens: { total: 5678 }, time: { created: 3 } } },
      ],
    };
  }) as unknown as typeof fetch;
  const live = await fetchLiveTokens({
    baseUrl: "http://127.0.0.1:7788",
    runDir: run,
    agentId: "engineer@task-a",
    fetchImpl: fake,
  });
  assert.strictEqual(live.ok, true);
  if (live.ok) {
    assert.strictEqual(live.tokens?.total, 5678);
    assert.strictEqual(live.tokens?.created, 0);
  }
  assert.ok(seen[0].includes("/session/ses_000000000000000000000001/message"), "oc- 前缀已剥离");
});

test("live: non-200 serve response yields {error}, no throw", async () => {
  const repo = tmpRepo();
  const run = buildFixture(repo, "run-live-1");
  const fake = (async () => ({ ok: false, status: 502, statusText: "Bad Gateway" })) as unknown as typeof fetch;
  const live = await fetchLiveTokens({
    baseUrl: "http://127.0.0.1:7788",
    runDir: run,
    agentId: "engineer@task-a",
    fetchImpl: fake,
  });
  assert.strictEqual(live.ok, false);
  if (!live.ok) assert.match(live.error, /502/);
});

test("live: fetch throwing (serve down) yields {error}, no crash", async () => {
  const repo = tmpRepo();
  const run = buildFixture(repo, "run-live-1");
  const fake = (async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:7788");
  }) as unknown as typeof fetch;
  const live = await fetchLiveTokens({
    baseUrl: "http://127.0.0.1:7788",
    runDir: run,
    agentId: "engineer@task-a",
    fetchImpl: fake,
  });
  assert.strictEqual(live.ok, false);
  if (!live.ok) assert.match(live.error, /ECONNREFUSED/);
});

test("live: unknown agent session yields {error}", async () => {
  const repo = tmpRepo();
  const run = buildFixture(repo, "run-live-1");
  const live = await fetchLiveTokens({
    baseUrl: "http://127.0.0.1:7788",
    runDir: run,
    agentId: "ghost@nowhere",
  });
  assert.strictEqual(live.ok, false);
  if (!live.ok) assert.match(live.error, /no serve session/);
});

test("router: live endpoint proxies and degrades without 5xx", async () => {
  const repo = tmpRepo();
  buildFixture(repo, "run-live-1");
  const fake = (async () => {
    throw new Error("serve down");
  }) as unknown as typeof fetch;
  const { status, json } = await get(makeRouter(repo, fake), "/api/live/run-live-1/engineer@task-a");
  assert.strictEqual(status, 200);
  const body = json as { ok: false; error: string };
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /serve down/);
});

const DOGFOOD_REPO = "/private/tmp/picode-dogfood";
const DOGFOOD_RUN = "run-2026-08-13T12-16-26-548Z";

test("dogfood: real run repo returns the current run (C1-b)", { skip: !fs.existsSync(DOGFOOD_REPO) }, async () => {
  const h = makeRouter(DOGFOOD_REPO);
  const { status, json } = await get(h, "/api/runs");
  assert.strictEqual(status, 200);
  const { runs } = json as { runs: Array<{ run_id: string }> };
  assert.ok(runs.some((r) => r.run_id === DOGFOOD_RUN));
});

test("dogfood: current run detail has sessions + merge_queue + board cards (C1-c)", { skip: !fs.existsSync(DOGFOOD_REPO) }, async () => {
  const h = makeRouter(DOGFOOD_REPO);
  const detail = (await get(h, `/api/runs/${DOGFOOD_RUN}`)).json as {
    snapshot: { sessions: { total: number }; merge_queue: { queued: number } };
  };
  assert.ok(detail.snapshot.sessions.total > 0);
  assert.strictEqual(typeof detail.snapshot.merge_queue.queued, "number");

  const board = (await get(h, `/api/runs/${DOGFOOD_RUN}/board`)).json as {
    cards: Array<{ column: string }>;
  };
  assert.ok(board.cards.length > 0);
  for (const c of board.cards) assert.ok(BOARD_COLUMNS.includes(c.column as never));

  const tasks = (await get(h, `/api/runs/${DOGFOOD_RUN}/tasks`)).json as {
    tasks: Array<{ task_id: string }>;
  };
  assert.ok(tasks.tasks.some((t) => t.task_id === "task-dashboard-server"));
});
