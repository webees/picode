import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { getDefaultConfig, type PicodeConfig } from "@picode/core";
import { OpencodeSpawner, opencodeSessionIdOf, wakeWithOpencode } from "./opencode-adapter.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-oc-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

function ocConfig(baseUrl = "http://127.0.0.1:1"): PicodeConfig {
  return {
    ...getDefaultConfig(),
    opencode: {
      enabled: true,
      base_url: baseUrl,
      provider_id: "opencode-go",
      model_id: "deepseek-v4-flash",
      system_prompt_prefix: "You are a picode agent.",
    },
  };
}

test("opencodeSessionIdOf parses oc- prefix", () => {
  assert.equal(opencodeSessionIdOf("oc-ses_abc"), "ses_abc");
  assert.equal(opencodeSessionIdOf("pid-123"), null);
});

test("OpencodeSpawner issues POST /session then POST /session/{id}/message", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const globalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: String(init?.method ?? "GET"), url });
    if (url.endsWith("/session") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "ses_test" }), { status: 200 });
    }
    if (url.includes("/session/ses_test/message")) {
      return new Response(JSON.stringify({ info: { id: "m1" } }), { status: 200 });
    }
    if (url.includes("/session/ses_test") && init?.method === "GET") {
      return new Response(JSON.stringify({ id: "ses_test" }), { status: 200 });
    }
    if (url.includes("/session/ses_test") && init?.method === "DELETE") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const cfg = ocConfig();
    const spawner = new OpencodeSpawner(cfg);
    const handle = await spawner.spawn("engineer@t", { PICODE_PERSONA: "你是工程师" });
    assert.equal(handle.pi_session_id, "oc-ses_test");
    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/session")));
    assert.ok(
      calls.some((c) => c.method === "POST" && c.url.endsWith("/session/ses_test/message")),
    );
    assert.equal(await spawner.isAlive(handle), true);
    await spawner.stop(handle);
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test("wakeWithOpencode attaches oc session id; spawn failure rolls back to sleeping + error", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "g" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  store.register("engineer", { agentId: "engineer@t", initialState: "sleeping" });

  const globalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/session") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "ses_w" }), { status: 200 });
    }
    if (url.includes("/message")) {
      return new Response(JSON.stringify({ info: { id: "m1" } }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const r = await wakeWithOpencode(dir, config, "engineer@t", "test", {
      PICODE_PERSONA: "",
    });
    assert.ok(r.pi_session_id?.startsWith("oc-"));
    const rec = store.get("engineer@t");
    assert.equal(rec?.state, "awake");
    assert.equal(rec?.pi_session_id, r.pi_session_id);
  } finally {
    globalThis.fetch = globalFetch;
  }

  // failure path: server down → session back to sleeping with error
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const cfg = ocConfig("http://127.0.0.1:1");
    const before = store.get("engineer@t");
    assert.equal(before?.state, "awake");
    await assert.rejects(
      () => wakeWithOpencode(dir, cfg, "engineer@t", "test2", { PICODE_PERSONA: "" }),
      /opencode spawn failed/,
    );
    const after = store.get("engineer@t");
    assert.equal(after?.state, "sleeping");
    assert.ok(after?.error?.includes("opencode"));
  } finally {
    globalThis.fetch = globalFetch;
  }
});
