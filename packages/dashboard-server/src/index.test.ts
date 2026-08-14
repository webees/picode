import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "@picode/core";
import { BOARD_COLUMNS, fetchLiveTokens } from "@picode/orchestrator";
import { DashboardRouter, type RouteResult } from "./router.js";

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
