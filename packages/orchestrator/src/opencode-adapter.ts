import { ErrorCode, PicodeError, type PicodeConfig } from "@picode/core";
import { SessionStore } from "./session-store.js";

/**
 * Opencode spawn adapter (D044). Uses an `opencode serve` server's HTTP API:
 *   POST /session                  → { id }
 *   POST /session/{id}/message     → { info: { ... }, parts: [...] }
 *
 * Unlike the pi command template, opencode runs as a server; picode keeps a
 * *session handle* (the opencode session id) instead of a child pid. `stop`
 * deletes the session; `isAlive` probes the server.
 */
export interface OpencodeHandle {
  pid: number;
  pi_session_id: string; // "oc-<opencode-session-id>"
}

export class OpencodeSpawner {
  constructor(private config: PicodeConfig) {}

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

  async spawn(agentId: string, env: Record<string, string>): Promise<OpencodeHandle> {
    const persona = env.PICODE_PERSONA ? `\n\nRole prompt:\n${env.PICODE_PERSONA}` : "";
    const system = `${this.config.opencode.system_prompt_prefix}${persona}`;
    const { id } = await this.request<{ id: string }>("POST", "/session", {
      title: `picode:${agentId}`,
    });
    // fire the first message so the session is actually live on the server
    const parts: Array<{ type: string; text: string }> = [
      { type: "text", text: "你已就绪。按角色 prompt 工作;如需联网/查询按 picode 信息控制流程申请,不要私自 web。" },
    ];
    const model =
      this.config.opencode.provider_id && this.config.opencode.model_id
        ? { providerID: this.config.opencode.provider_id, modelID: this.config.opencode.model_id }
        : undefined;
    await this.request("POST", `/session/${id}/message`, {
      parts,
      system,
      ...(model ? { model } : {}),
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
  const spawner = new OpencodeSpawner(config);
  try {
    await store.wake(agentId, reason, opts);
    const handle = await spawner.spawn(agentId, env);
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
