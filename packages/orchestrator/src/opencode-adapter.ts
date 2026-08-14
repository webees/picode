import { ErrorCode, PicodeError, type PicodeConfig } from "@picode/core";
import { SessionStore } from "./session-store.js";
import { TranscriptStore } from "./transcript-store.js";

/**
 * Opencode spawn adapter (D044). Uses an `opencode serve` server's HTTP API:
 *   POST /session                  → { id }
 *   POST /session/{id}/message     → { info: { ... }, parts: [...] }
 *
 * Unlike the pi command template, opencode runs as a server; picode keeps a
 * *session handle* (the opencode session id) instead of a child pid. `stop`
 * deletes the session; `isAlive` probes the server.
 */

/** Ready-message 文本（P4：投喂给 agent 的就绪提示，同步落转录归档）。 */
export const READY_MESSAGE_TEXT =
  "你已就绪。按角色 prompt 工作;如需联网/查询按 picode 信息控制流程申请,不要私自 web。文件写入必须在你的 task worktree（.picode/worktrees/<run>/<task>）内，禁止修改仓库根目录文件。提交信息遵循 docs/standards/commit.md：type(scope): 中文摘要 + body 根因 + Reviewed-by footer。";
export interface OpencodeHandle {
  pid: number;
  pi_session_id: string; // "oc-<opencode-session-id>"
}

/**
 * Client-side guard for ERR-01 (serve stream hang): a serve that never flushes
 * its response must not hang spawn forever. `requestWithRetry` bounds total
 * latency while retrying transient failures (timeout / network glitch) with a
 * short backoff; HTTP-level failures still fail fast so behavior is unchanged.
 */
export interface OpencodeRetryPolicy {
  /** Total attempts including the first. */
  attempts: number;
  /** Per-attempt timeout passed to AbortSignal.timeout. */
  timeoutMs: number;
  /** Delay between attempts. */
  backoffMs: number;
}

/** Ready-message POST (the LLM call): noReply fires the prompt without waiting
 * for a model turn, so a serve hang here is a transport issue, not a slow model. */
const READY_MESSAGE_RETRY: OpencodeRetryPolicy = {
  attempts: 3,
  timeoutMs: 30_000,
  backoffMs: 500,
};

/** Ready-message 请求体（D061 noReply：异步入队，不阻塞 spawn/恢复）。 */
export interface ReadyMessage {
  parts: Array<{ type: string; text: string }>;
  system: string;
  noReply: true;
  model?: { providerID: string; modelID: string };
}

/** POST /message 的响应（noReply 下 parts 可能为空或含排队消息）。 */
export interface MessagePostResponse {
  parts: Array<{ type: string; text?: string }>;
}

/** 消息投喂成功事件（P4 转录归档钩子，由 wakeWithOpencode/恢复注入）。 */
export interface OpencodeMessageEvent {
  agent_id: string;
  /** 投喂的完整消息文本。 */
  text: string;
  /** 服务端返回的响应 parts。 */
  parts: Array<{ type: string; text?: string }>;
}

export interface OpencodeSpawnerOpts {
  onMessagePosted?: (e: OpencodeMessageEvent) => void | Promise<void>;
}

/** True for serve-hang / network glitches that justify a bounded retry. */
function isTransientFetchError(e: unknown): boolean {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return true;
    return e instanceof TypeError; // fetch network failures surface as TypeError
  }
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    return e.name === "TimeoutError" || e.name === "AbortError";
  }
  return false;
}

export class OpencodeSpawner {
  constructor(
    private config: PicodeConfig,
    private opts: OpencodeSpawnerOpts = {},
  ) {}

  private base(): string {
    return this.config.opencode.base_url.replace(/\/+$/, "");
  }

  private async request<T>(
    method: string,
    urlPath: string,
    body?: unknown,
    timeoutMs = 120_000,
  ): Promise<T> {
    const res = await fetch(`${this.base()}${urlPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`opencode ${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`opencode returned non-JSON from ${urlPath}`);
    }
  }

  /** Bounded retry for transient failures (ERR-01): transient errors are
   * retried up to `policy.attempts`; anything else propagates immediately. */
  private async requestWithRetry<T>(
    method: string,
    urlPath: string,
    body: unknown,
    policy: OpencodeRetryPolicy,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < policy.attempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, policy.backoffMs));
      }
      try {
        return await this.request<T>(method, urlPath, body, policy.timeoutMs);
      } catch (e) {
        lastErr = e;
        if (!isTransientFetchError(e)) throw e;
      }
    }
    throw new Error(
      `opencode ${method} ${urlPath} failed after ${policy.attempts} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    );
  }

  /** 组装 ready 消息（D061 noReply + 可选历史摘要追加，P4）。 */
  buildReadyMessage(
    env: Record<string, string>,
    extraText?: string,
  ): ReadyMessage {
    const persona = env.PICODE_PERSONA ? `\n\nRole prompt:\n${env.PICODE_PERSONA}` : "";
    const system = `${this.config.opencode.system_prompt_prefix}${persona}`;
    const parts: Array<{ type: string; text: string }> = [
      { type: "text", text: READY_MESSAGE_TEXT },
    ];
    if (extraText) {
      parts.push({ type: "text", text: extraText });
    }
    const model =
      this.config.opencode.provider_id && this.config.opencode.model_id
        ? { providerID: this.config.opencode.provider_id, modelID: this.config.opencode.model_id }
        : undefined;
    return {
      parts,
      system,
      noReply: true,
      ...(model ? { model } : {}),
    };
  }

  /** 低层 POST /session/{id}/message；policy 提供时走有界重试（ERR-01）。 */
  async postMessage(
    sessionId: string,
    message: ReadyMessage,
    policy?: OpencodeRetryPolicy,
  ): Promise<MessagePostResponse> {
    const body = policy
      ? await this.requestWithRetry<{ parts?: Array<{ type: string; text?: string }> }>(
          "POST",
          `/session/${sessionId}/message`,
          message,
          policy,
        )
      : await this.request<{ parts?: Array<{ type: string; text?: string }> }>(
          "POST",
          `/session/${sessionId}/message`,
          message,
        );
    return { parts: body?.parts ?? [] };
  }

  /** 向既有会话重投喂 ready 消息（serve 自动恢复用；单次尝试，退避由调用方）。 */
  async sendReady(
    piSessionId: string,
    agentId: string,
    env: Record<string, string>,
    extraText?: string,
  ): Promise<MessagePostResponse> {
    const sessionId = piSessionId.replace(/^oc-/, "");
    const message = this.buildReadyMessage(env, extraText);
    const res = await this.postMessage(sessionId, message);
    await this.opts.onMessagePosted?.({
      agent_id: agentId,
      text: message.parts.map((p) => p.text).join("\n"),
      parts: res.parts,
    });
    return res;
  }

  async spawn(agentId: string, env: Record<string, string>, extraText?: string): Promise<OpencodeHandle> {
    const { id } = await this.request<{ id: string }>("POST", "/session", {
      title: `picode:${agentId}`,
    });
    // fire the first message so the session is actually live on the server.
    // D061: noReply — the message is queued asynchronously and spawn returns
    // immediately. Waiting synchronously is unsafe: the build agent may start
    // acting on the "ready" prompt (exploring the repo, running tools), and a
    // long-running model turn would abort the spawn (120s timeout, observed in
    // dogfood E2E). The agent processes the ready message in its own loop.
    const message = this.buildReadyMessage(env, extraText);
    const res = await this.postMessage(id, message, READY_MESSAGE_RETRY);
    await this.opts.onMessagePosted?.({
      agent_id: agentId,
      text: message.parts.map((p) => p.text).join("\n"),
      parts: res.parts,
    });
    return { pid: -1, pi_session_id: `oc-${id}` };
  }

  async stop(handle: OpencodeHandle): Promise<void> {
    const id = handle.pi_session_id.replace(/^oc-/, "");
    try {
      await this.request("DELETE", `/session/${id}`, undefined, 10_000);
    } catch {
      /* server may already have dropped it */
    }
  }

  async isAlive(handle: OpencodeHandle): Promise<boolean> {
    const id = handle.pi_session_id.replace(/^oc-/, "");
    try {
      await this.request("GET", `/session/${id}`, undefined, 10_000);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Wake with a real opencode session. Keeps the same rollback contract as
 * wakeWithPi: spawn failure → session sleeps + error recorded.
 *
 * P4: 重 spawn 时读取 runs/<id>/transcripts/<agent>.jsonl，把历史要点摘要
 * 追加进 ready 消息（断点续跑）；每次成功投喂/响应都写回转录归档。
 *
 * D083: 摘要生成传 stripNoise:[READY_MESSAGE_TEXT]，剔除重 spawn 时转录里
 * 反复出现的 ready 模板句，避免摘要被机械噪音淹没；maxEntries 保持默认 20。
 */
export async function wakeWithOpencode(
  dir: string,
  config: PicodeConfig,
  agentId: string,
  reason: string,
  env: Record<string, string>,
  opts: { maxAwake?: number; force?: boolean } = {},
): Promise<{ pi_session_id: string | null }> {
  const store = new SessionStore(dir);
  const transcript = new TranscriptStore(dir);
  const spawner = new OpencodeSpawner(config, {
    onMessagePosted: (e) => {
      const jobs: Promise<unknown>[] = [transcript.recordOutgoing(e.agent_id, e.text)];
      if (e.parts.length > 0) {
        jobs.push(transcript.recordResponse(e.agent_id, e.parts));
      }
      return Promise.all(jobs).then(() => {});
    },
  });
  try {
    await store.wake(agentId, reason, opts);
    const summary = transcript.historySummary(agentId, { stripNoise: [READY_MESSAGE_TEXT] });
    const extraText = summary ? `\n\n## 历史要点摘要（转录恢复）\n${summary}` : undefined;
    const handle = await spawner.spawn(agentId, env, extraText);
    const updated = await store.attachPiSession(agentId, handle.pi_session_id);
    return { pi_session_id: updated.pi_session_id ?? null };
  } catch (e) {
    const msg = `opencode spawn failed: ${e instanceof Error ? e.message : String(e)}`;
    try {
      await store.sleep(agentId, `spawn-failed`);
    } catch {
      /* keep error only */
    }
    await store.setError(agentId, msg);
    throw new PicodeError(ErrorCode.OPENCODE_SPAWN_FAILED, msg);
  }
}

/** Parse the opencode session id from a pi_session_id ("oc-<id>"). */
export function opencodeSessionIdOf(piSessionId: string): string | null {
  return piSessionId.startsWith("oc-") ? piSessionId.slice(3) : null;
}
