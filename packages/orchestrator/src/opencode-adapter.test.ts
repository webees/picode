import { test } from "node:test";
import assert from "node:assert/strict";
import { getDefaultConfig, type PicodeConfig } from "@picode/core";
import { OpencodeSpawner, opencodeSessionIdOf } from "./opencode-adapter.js";

/** Capture every fetch() call for assertion. */
function mockFetch(
  calls: Array<{ url: string; body: unknown }>,
  opts: { messageTimeoutFailures?: number; messageStatus?: number } = {},
) {
  const orig = globalThis.fetch;
  let messageAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/session") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "ses_mock123" }), { status: 200 });
    }
    if (url.includes("/message") && init?.method === "POST") {
      messageAttempts++;
      if (messageAttempts <= (opts.messageTimeoutFailures ?? 0)) {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      if (opts.messageStatus !== undefined && opts.messageStatus >= 400) {
        return new Response("model error", { status: opts.messageStatus });
      }
      return new Response(JSON.stringify({ info: {}, parts: [] }), { status: 200 });
    }
    if (init?.method === "DELETE") {
      return new Response("true", { status: 200 });
    }
    return new Response(JSON.stringify({ id: "ses_mock123" }), { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

function cfg(): PicodeConfig {
  const c = getDefaultConfig();
  c.opencode = {
    enabled: true,
    base_url: "http://127.0.0.1:7788",
    provider_id: "opencode-go",
    model_id: "deepseek-v4-flash",
    system_prompt_prefix: "You are a picode agent.",
  };
  return c;
}

test("D061: spawn fires the ready message with noReply=true (async, never blocks)", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls);
  try {
    const spawner = new OpencodeSpawner(cfg());
    const handle = await spawner.spawn("engineer@task-a", { PICODE_PERSONA: "role: engineer" });
    assert.equal(handle.pi_session_id, "oc-ses_mock123");
    // POST /session: title only (v1.18 contract — model is message-level)
    assert.deepEqual(calls[0].body, { title: "picode:engineer@task-a" });
    // message: model object + noReply + parts + system prefix+persona
    const msg = calls[1].body as {
      parts: unknown[];
      system: string;
      noReply: boolean;
      model: { providerID: string; modelID: string };
    };
    assert.equal(msg.noReply, true, "noReply must be set so spawn never waits");
    assert.deepEqual(msg.model, { providerID: "opencode-go", modelID: "deepseek-v4-flash" });
    assert.ok(Array.isArray(msg.parts) && msg.parts.length >= 1);
    assert.match(msg.system, /You are a picode agent\./);
    assert.match(msg.system, /role: engineer/);
  } finally {
    restore();
  }
});

test("opencodeSessionIdOf parses oc-<id> and rejects others", () => {
  assert.equal(opencodeSessionIdOf("oc-ses_abc"), "ses_abc");
  assert.equal(opencodeSessionIdOf("ses_abc"), null);
  assert.equal(opencodeSessionIdOf(""), null);
});

test("D061: spawn without provider/model omits the model object (serve default path)", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls);
  try {
    const c = cfg();
    c.opencode.provider_id = null;
    c.opencode.model_id = null;
    const handle = await new OpencodeSpawner(c).spawn("pm", {});
    assert.ok(handle.pi_session_id.startsWith("oc-"));
    const msg = calls[1].body as { model?: unknown; noReply?: boolean };
    assert.equal(msg.model, undefined);
    assert.equal(msg.noReply, true);
  } finally {
    restore();
  }
});

test("TC-01/ERR-01: serve stream hang on the ready message is retried and spawn succeeds", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls, { messageTimeoutFailures: 1 });
  try {
    const handle = await new OpencodeSpawner(cfg()).spawn("engineer@task-a", {});
    assert.equal(handle.pi_session_id, "oc-ses_mock123");
    const msgPosts = calls.filter((c) => c.url.includes("/message"));
    assert.equal(msgPosts.length, 2, "timed-out first attempt must be retried once");
    assert.deepEqual(
      msgPosts[0].body,
      msgPosts[1].body,
      "retry must resend the same ready message",
    );
  } finally {
    restore();
  }
});

test("TC-01/ERR-01: persistent serve hang exhausts retries → spawn fails with descriptive error", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls, { messageTimeoutFailures: Number.MAX_SAFE_INTEGER });
  try {
    await assert.rejects(
      new OpencodeSpawner(cfg()).spawn("engineer@task-a", {}),
      /failed after 3 attempts/,
    );
    assert.equal(
      calls.filter((c) => c.url.includes("/message")).length,
      3,
      "each attempt must hit the server",
    );
  } finally {
    restore();
  }
});

test("TC-01: HTTP-level failure (5xx) is NOT retried — fails fast, behavior unchanged", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls, { messageStatus: 500 });
  try {
    await assert.rejects(
      new OpencodeSpawner(cfg()).spawn("engineer@task-a", {}),
      /→ 500/,
    );
    assert.equal(
      calls.filter((c) => c.url.includes("/message")).length,
      1,
      "HTTP errors must fail fast without retrying",
    );
  } finally {
    restore();
  }
});
