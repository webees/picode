#!/usr/bin/env node
/**
 * 监督者会话工具（serve API 直连）
 * 用法:
 *   node feed.mjs spawn --title picode:run-lead        → 创建会话, 输出 oc-ses_xxx
 *   node feed.mjs ask --session oc-ses_xxx --text "..." [--timeout 540000]
 *       同步投喂并等待模型回合完成（轮询 message history 兜底）
 *   node feed.mjs poll --session oc-ses_xxx            → 最近消息 + tokens（监控）
 */
const BASE = "http://127.0.0.1:7788";
const MODEL = { providerID: "opencode-go", modelID: "deepseek-v4-flash" };

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const cmd = args[0];

async function req(method, urlPath, body, timeoutMs = 60000) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`opencode ${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

/** GET message history → 最后一条 assistant 文本 + tokens 统计 */
async function lastActivity(sessionId) {
  const msgs = await req("GET", `/session/${sessionId}/message`);
  const list = Array.isArray(msgs) ? msgs : msgs?.messages ?? [];
  let lastText = null, lastTs = null, tokens = 0;
  for (const m of list) {
    const text = typeof m?.content === "string" ? m.content
      : Array.isArray(m?.content) ? m.content.map((p) => p.text ?? "").join("") : "";
    if (m?.info?.role === "assistant" && text.trim()) {
      lastText = text.slice(0, 400);
      lastTs = m.info.time?.created ?? m.created_at ?? null;
      tokens = m.info?.tokens?.total ?? 0; // tokens 是嵌套对象 {total}
    }
  }
  return { lastText, lastTs, tokens, count: list.length };
}

if (cmd === "spawn") {
  const { id } = await req("POST", "/session", { title: flag("title") ?? "picode:agent" });
  console.log(`oc-${id}`);
} else if (cmd === "ask") {
  const sessionId = (flag("session") ?? "").replace(/^oc-/, "");
  const text = flag("text");
  if (!sessionId || !text) {
    console.error("usage: feed.mjs ask --session <id> --text <text> [--timeout ms]");
    process.exit(1);
  }
  const timeoutMs = Number(flag("timeout") ?? 540000);
  const before = await lastActivity(sessionId);
  const body = { parts: [{ type: "text", text }], noReply: false, model: MODEL };
  const t0 = Date.now();
  let postOk = false;
  try {
    await req("POST", `/session/${sessionId}/message`, body, timeoutMs);
    postOk = true;
  } catch (e) {
    // 仅"请求超时但模型可能仍在工作"才走轮询兜底；网络/HTTP 失败 = 投递失败，如实退出
    const msg = String(e?.message ?? "");
    const timedOut = e?.name === "TimeoutError" || /timed?\s*out|abort/i.test(msg);
    if (!timedOut) throw e;
    console.error(`[feed] POST timed out (${msg}) — polling history for completion`);
  }
  // 等 tokens 增长（模型回合完成）或剩余超时（不再叠加完整超时）
  let after = await lastActivity(sessionId);
  while (
    Date.now() - t0 < timeoutMs &&
    (after.tokens <= before.tokens || after.count <= before.count)
  ) {
    await new Promise((r) => setTimeout(r, 8000));
    after = await lastActivity(sessionId);
  }
  const used = after.tokens - before.tokens;
  console.log(JSON.stringify({
    posted: postOk,
    tokens_delta: used,
    last_text: after.lastText,
  }, null, 2));
} else if (cmd === "poll") {
  const sessionId = (flag("session") ?? "").replace(/^oc-/, "");
  if (!sessionId) {
    console.error("usage: feed.mjs poll --session <id>");
    process.exit(1);
  }
  const a = await lastActivity(sessionId);
  console.log(JSON.stringify(a));
} else {
  console.error("usage: feed.mjs spawn|ask|poll ...");
  process.exit(1);
}
