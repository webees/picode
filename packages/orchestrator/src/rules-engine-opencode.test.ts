import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import { getDefaultConfig, type PicodeConfig } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { sleepAgent, terminateAgent } from "./pi-adapter.js";
import { applyEvent } from "./rules-engine.js";

function opencodeConfig(): PicodeConfig {
  return {
    ...getDefaultConfig(),
    opencode: {
      enabled: true,
      base_url: "http://127.0.0.1:1",
      provider_id: "opencode-go",
      model_id: "deepseek-v4-flash",
      system_prompt_prefix: "You are a picode agent.",
    },
  };
}

/** Fake opencode serve: records calls, answers sessions/messages/DELETE. */
function mockServe(): { calls: Array<{ method: string; url: string }>; restore: () => void } {
  const calls: Array<{ method: string; url: string }> = [];
  const globalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: String(init?.method ?? "GET"), url });
    if (url.endsWith("/session") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "ses_rule" }), { status: 200 });
    }
    if (url.includes("/message")) {
      return new Response(JSON.stringify({ info: { id: "m1" } }), { status: 200 });
    }
    if (url.includes("/session/ses_rule")) {
      return new Response(JSON.stringify({ id: "ses_rule" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = globalFetch; } };
}

test("D057: rules-engine wake with opencode.enabled provisions a real session (oc-<id>)", async () => {
  const repo = tmpGitRepo({ prefix: "picode-ocrule-", readme: "# t\n" });
  const { runId } = createRun(repo, { title: "g" });
  const { dir } = resolveRunDir(repo, runId);
  const config = opencodeConfig();
  const store = new SessionStore(dir);
  // createRun already registered pm as sleeping (always_register) — no register call

  const mock = mockServe();
  try {
    const res = await applyEvent(dir, config, "run_created");
    const action = res.actions.find((a) => a.agent_id === "pm");
    assert.equal(action?.outcome, "ok");
    const rec = store.get("pm")!;
    assert.equal(rec.state, "awake");
    assert.equal(rec.pi_session_id, "oc-ses_rule");
    assert.ok(
      mock.calls.some((c) => c.method === "POST" && c.url.endsWith("/session")),
      "POST /session issued",
    );
    assert.ok(
      mock.calls.some((c) => c.method === "POST" && c.url.includes("/message")),
      "first message issued",
    );
  } finally {
    mock.restore();
  }

  // symmetric teardown: I2 起 sleep 保留 opencode 会话（零 DELETE）；terminate 仍终态销毁
  const mock2 = mockServe();
  try {
    await sleepAgent(dir, config, "pm", "idle");
    assert.equal(store.get("pm")!.state, "sleeping");
    assert.equal(
      store.get("pm")!.pi_session_id,
      "oc-ses_rule",
      "sleep 保留 oc-<id> 平台持久会话引用（I2）",
    );
    assert.ok(
      !mock2.calls.some((c) => c.method === "DELETE"),
      "sleep 不再 DELETE（I2 保留会话）",
    );
    await terminateAgent(dir, config, "pm", "closed");
    assert.equal(store.get("pm")!.state, "terminated");
  } finally {
    mock2.restore();
  }
});

test("D057: default config keeps rules-engine wake state-only (no network)", async () => {
  const repo = tmpGitRepo({ prefix: "picode-ocrule-", readme: "# t\n" });
  const { runId } = createRun(repo, { title: "g" });
  const { dir } = resolveRunDir(repo, runId);
  const config = getDefaultConfig(); // opencode.enabled = false, pi.enabled = false
  const store = new SessionStore(dir);
  // pm already registered (sleeping) by createRun

  const mock = mockServe();
  try {
    const res = await applyEvent(dir, config, "run_created");
    assert.equal(res.actions.find((a) => a.agent_id === "pm")?.outcome, "ok");
    const rec = store.get("pm")!;
    assert.equal(rec.state, "awake");
    assert.equal(rec.pi_session_id, null, "no backend session without a backend");
    assert.equal(mock.calls.length, 0, "no network calls in default config");
  } finally {
    mock.restore();
  }
});
