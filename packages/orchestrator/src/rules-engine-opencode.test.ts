import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getDefaultConfig, type PicodeConfig } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { sleepAgent, terminateAgent } from "./pi-adapter.js";
import { applyEvent } from "./rules-engine.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ocrule-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

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
  const repo = tmpGitRepo();
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

  // symmetric teardown: sleepAgent / terminateAgent DELETE the server session
  const mock2 = mockServe();
  try {
    await sleepAgent(dir, config, "pm", "idle");
    assert.equal(store.get("pm")!.state, "sleeping");
    assert.ok(
      mock2.calls.some((c) => c.method === "DELETE" && c.url.includes("/session/ses_rule")),
      "DELETE issued on sleep",
    );
    await terminateAgent(dir, config, "pm", "closed");
    assert.equal(store.get("pm")!.state, "terminated");
  } finally {
    mock2.restore();
  }
});

test("D057: default config keeps rules-engine wake state-only (no network)", async () => {
  const repo = tmpGitRepo();
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
