import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fetchLiveTokens,
  lastTokenSample,
  serveSessionIdOf,
  stripOcPrefix,
  type LiveResult,
} from "./live.js";
import * as orchestrator from "./index.js";

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "live-fixture-"));
}

function buildFixture(repo: string, runId: string): string {
  const run = path.join(repo, ".picode", "runs", runId);
  fs.mkdirSync(path.join(run, "sessions"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".picode", "config.yaml"),
    ["paths:", "  runs_root: .picode/runs", "opencode:", "  base_url: http://127.0.0.1:7788", ""].join("\n"),
  );
  fs.writeFileSync(
    path.join(run, "sessions", "engineer@task-a.yaml"),
    [
      'schema_version: "1"',
      "agent_id: engineer@task-a",
      "role_id: engineer",
      "state: awake",
      "pi_session_id: oc-ses_000000000000000000000001",
      "",
    ].join("\n"),
  );
  return run;
}

test("D093: orchestrator re-exports live primitives (dashboard-server 兼容)", () => {
  assert.equal(typeof orchestrator.fetchLiveTokens, "function");
  assert.equal(typeof orchestrator.lastTokenSample, "function");
  assert.equal(typeof orchestrator.serveSessionIdOf, "function");
  assert.equal(typeof orchestrator.stripOcPrefix, "function");
});

test("stripOcPrefix strips oc- prefix (dashboard-server 原语义)", () => {
  assert.equal(stripOcPrefix("oc-ses_abc"), "ses_abc");
  assert.equal(stripOcPrefix("ses_abc"), "ses_abc");
});

test("lastTokenSample picks the most recent message with tokens", () => {
  const messages = [
    { info: { role: "user", time: { created: 1 } } },
    { info: { role: "assistant", tokens: { total: 1234 }, time: { created: 2 } } },
    { info: { role: "assistant", tokens: { total: 5678 }, time: { created: 3 } } },
  ];
  const sample = lastTokenSample(messages);
  assert.ok(sample);
  assert.equal(sample!.total, 5678);
  assert.equal(sample!.created, 0);
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
  const live = (await fetchLiveTokens({
    baseUrl: "http://127.0.0.1:7788",
    runDir: run,
    agentId: "engineer@task-a",
    fetchImpl: fake,
  })) as Extract<LiveResult, { ok: true }>;
  assert.strictEqual(live.ok, true);
  assert.strictEqual(live.tokens?.total, 5678);
  assert.strictEqual(live.tokens?.created, 0);
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

test("serveSessionIdOf returns null when no serve session", () => {
  const repo = tmpRepo();
  const run = buildFixture(repo, "run-live-1");
  assert.equal(serveSessionIdOf(run, "ghost@nowhere"), null);
});
