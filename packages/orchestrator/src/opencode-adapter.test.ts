import { test } from "node:test";
import assert from "node:assert/strict";
import { getDefaultConfig, type PicodeConfig } from "@picode/core";
import { gitInit } from "./test-utils.js";
import { createRun, resolveRunDir } from "./run-store.js";
import { TranscriptStore } from "./transcript-store.js";
import {
  OpencodeSpawner,
  READY_MESSAGE_TEXT,
  opencodeSessionIdOf,
  renderSkillsSection,
  wakeWithOpencode,
} from "./opencode-adapter.js";

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

test("sendReady: 向既有会话重投喂 ready 消息（D061 noReply，P1 恢复用）", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls);
  try {
    const res = await new OpencodeSpawner(cfg()).sendReady("oc-ses_mock123", "engineer@task-a", {
      PICODE_PERSONA: "role: engineer",
    });
    assert.ok(Array.isArray(res.parts));
    const post = calls.find((c) => c.url.includes("/session/ses_mock123/message"));
    assert.ok(post, "必须向既有会话 POST 消息");
    const msg = post.body as { noReply: boolean; parts: Array<{ type: string; text: string }>; system: string };
    assert.equal(msg.noReply, true);
    assert.ok(msg.parts.length >= 1);
    assert.match(msg.system, /role: engineer/);
    const postUrls = calls.filter((c) => c.url.includes("/message"));
    assert.equal(postUrls.length, 1, "sendReady 单次投喂，退避由恢复方负责");
  } finally {
    restore();
  }
});

test("P4: wakeWithOpencode 重 spawn 读取转录，历史要点摘要追加进 ready 消息", async () => {
  const repo = gitInit({ prefix: "picode-wake-oc-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  const transcript = new TranscriptStore(dir);
  await transcript.recordOutgoing("pm", "第一轮任务：实现模块 A");

  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls);
  try {
    const r = await wakeWithOpencode(dir, cfg(), "pm", "re-wake", {});
    assert.ok(r.pi_session_id?.startsWith("oc-"));
    const msg = calls.find((c) => c.url.includes("/message"))?.body as {
      parts: Array<{ type: string; text: string }>;
      noReply: boolean;
    };
    assert.equal(msg.noReply, true);
    const texts = msg.parts.map((p) => p.text).join("\n");
    assert.match(texts, /历史要点摘要/);
    assert.match(texts, /第一轮任务：实现模块 A/);
  } finally {
    restore();
  }
});

test("P4: wakeWithOpencode 空转录不追加摘要（首次 spawn）", async () => {
  const repo = gitInit({ prefix: "picode-wake-oc-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls);
  try {
    await wakeWithOpencode(dir, cfg(), "pm", "wake", {});
    const msg = calls.find((c) => c.url.includes("/message"))?.body as {
      parts: Array<{ type: string; text: string }>;
    };
    assert.equal(msg.parts.length, 1, "无历史转录时只投喂基础 ready 消息");
    assert.ok(!JSON.stringify(msg.parts).includes("历史要点摘要"));
  } finally {
    restore();
  }
});

test("C2: renderSkillsSection renders metadata only from env; empty env → empty string", () => {
  assert.equal(renderSkillsSection({}), "");
  assert.equal(renderSkillsSection({ PICODE_SKILLS_INDEX: "[]", PICODE_PERSONA_SKILLS: "[]" }), "");
  const section = renderSkillsSection({
    PICODE_SKILLS_INDEX: JSON.stringify([
      { name: "ponytail", description: "lazy", path: "skills/engineering/ponytail/SKILL.md" },
    ]),
    PICODE_PERSONA_SKILLS: JSON.stringify(["skills/engineering/ponytail/SKILL.md"]),
  });
  assert.match(section, /ponytail/);
  assert.match(section, /lazy/);
  assert.match(section, /skills\/engineering\/ponytail\/SKILL\.md/);
  assert.ok(!section.includes("SKILL.md body"), "skills 段只渲染 metadata 不渲染正文");
});

test("C2: buildReadyMessage system prompt 追加 skills 段（有 env 时）；无 env 时逐字节不变", () => {
  const spawner = new OpencodeSpawner(cfg());
  const bare = spawner.buildReadyMessage({ PICODE_PERSONA: "role: engineer" });
  assert.equal(
    bare.system,
    "You are a picode agent.\n\nRole prompt:\nrole: engineer",
    "无 skills env 时 system prompt 逐字节不变",
  );
  const withSkills = spawner.buildReadyMessage({
    PICODE_PERSONA: "role: engineer",
    PICODE_SKILLS_INDEX: JSON.stringify([
      { name: "ponytail", description: "lazy", path: "skills/engineering/ponytail/SKILL.md" },
    ]),
  });
  assert.ok(withSkills.system.includes("可用技能"));
  assert.ok(withSkills.system.includes("ponytail"));
  assert.ok(withSkills.system.includes("You are a picode agent."));
  assert.ok(withSkills.system.includes("role: engineer"));
  assert.ok(withSkills.system.startsWith(bare.system), "追加在 persona 段之后");
});

test("D083: wakeWithOpencode 重 spawn 摘要剔除 ready 模板句（stripNoise）", async () => {
  const repo = gitInit({ prefix: "picode-wake-oc-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  const transcript = new TranscriptStore(dir);
  await transcript.recordOutgoing("pm", `${READY_MESSAGE_TEXT}\n\n实现模块 A`);
  await transcript.recordOutgoing("pm", `${READY_MESSAGE_TEXT}\n\n实现模块 B`);

  const calls: Array<{ url: string; body: unknown }> = [];
  const restore = mockFetch(calls);
  try {
    const r = await wakeWithOpencode(dir, cfg(), "pm", "re-wake", {});
    assert.ok(r.pi_session_id?.startsWith("oc-"));
    const msg = calls.find((c) => c.url.includes("/message"))?.body as {
      parts: Array<{ type: string; text: string }>;
    };
    const texts = msg.parts.map((p) => p.text).join("\n");
    assert.match(texts, /历史要点摘要/);
    assert.match(texts, /实现模块 A/);
    assert.match(texts, /实现模块 B/);
    const summarySection = texts.split("## 历史要点摘要（转录恢复）")[1] ?? "";
    assert.ok(
      !summarySection.includes(READY_MESSAGE_TEXT),
      "重 spawn 注入的摘要不得包含 ready 模板句（stripNoise 生效）",
    );
    assert.ok(!summarySection.includes("你已就绪"), "ready 模板句不应残留在摘要任何位置");
  } finally {
    restore();
  }
});
