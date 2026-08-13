import path from "node:path";
import { readYamlFile } from "@picode/core";

/**
 * Serve 代理（D058 / D070）：GET {base_url}/session/{serveId}/message →
 * 抽取最近一条 assistant 消息的 `info.tokens.total`。只读、有界超时（ERR-01）：
 * serve 失联 / 非 200 / 非 JSON 一律返回 `{ error }`，绝不让 HTTP 进程崩。
 */

export interface LiveTokenSample {
  total: number;
  input: number;
  output: number;
  created: number | null;
}

export type LiveResult =
  | { ok: true; agent_id: string; serve_session_id: string | null; tokens: LiveTokenSample | null; at: string }
  | { ok: false; agent_id: string; serve_session_id: string | null; error: string };

export interface LiveOptions {
  /** opencode serve base URL（config.opencode.base_url）。 */
  baseUrl: string;
  /** run 目录（runs/<runId>）。 */
  runDir: string;
  /** 会话 agent_id（session.yaml 的 agent_id）。 */
  agentId: string;
  /** 有界超时 ms（ERR-01 防 serve 挂死）。 */
  timeoutMs?: number;
  /** 可注入的 fetch（单测 mock）。 */
  fetchImpl?: typeof fetch;
}

export function stripOcPrefix(piSessionId: string): string {
  return piSessionId.startsWith("oc-") ? piSessionId.slice(3) : piSessionId;
}

/** 从 session.yaml 读 pi_session_id（null 未挂 serve → 无 tokens）。 */
export function serveSessionIdOf(runDir: string, agentId: string): string | null {
  const s = readYamlFile<{ pi_session_id?: string | null }>(
    path.join(runDir, "sessions", `${agentId}.yaml`),
  );
  const pid = s?.pi_session_id;
  return pid ? stripOcPrefix(pid) : null;
}

/** 从 serve 返回的消息数组中抽最近一条含 tokens 的样本（info.time.created 秒）。 */
export function lastTokenSample(messages: Array<{
  info?: { tokens?: { total?: number; input?: number; output?: number }; time?: { created?: number } };
}>): LiveTokenSample | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i]?.info;
    if (info?.tokens && typeof info.tokens.total === "number") {
      return {
        total: info.tokens.total,
        input: info.tokens.input ?? 0,
        output: info.tokens.output ?? 0,
        created: info.time?.created ? Math.round(info.time.created / 1000) : null,
      };
    }
  }
  return null;
}

export async function fetchLiveTokens(opts: LiveOptions): Promise<LiveResult> {
  const { baseUrl, runDir, agentId, timeoutMs = 5_000, fetchImpl = fetch } = opts;
  const serveId = serveSessionIdOf(runDir, agentId);
  if (!serveId) {
    return { ok: false, agent_id: agentId, serve_session_id: null, error: `no serve session for ${agentId}` };
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/session/${serveId}/message`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { ok: false, agent_id: agentId, serve_session_id: serveId, error: `serve HTTP ${res.status}` };
    }
    const data = (await res.json()) as Array<{
      info?: { tokens?: { total?: number; input?: number; output?: number }; time?: { created?: number } };
    }>;
    if (!Array.isArray(data)) {
      return { ok: false, agent_id: agentId, serve_session_id: serveId, error: "serve returned non-array" };
    }
    const tokens = lastTokenSample(data);
    if (!tokens) {
      return { ok: false, agent_id: agentId, serve_session_id: serveId, error: "no token sample in serve messages" };
    }
    return {
      ok: true,
      agent_id: agentId,
      serve_session_id: serveId,
      tokens,
      at: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      agent_id: agentId,
      serve_session_id: serveId,
      error: `serve unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
