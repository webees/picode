/**
 * Shared tool-capture for the pi-extension (审计 P1-5 去重：mcp-server
 * execution.ts 与测试 harness 各自实现同一 env 快照/注入/收集/恢复样板)。
 *
 * Loads the extension against a fake/real Pi API and captures registered
 * tools. Structural types: the extension builds without pi-coding-agent.
 */
import picodeExtension from "./index.js";

export interface CapturedTool {
  name: string;
  label?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Capture the extension's tool table against the given env snapshot. */
export function captureTools(env: Record<string, string>): Map<string, CapturedTool> {
  const tools = new Map<string, CapturedTool>();
  const saved: Record<string, string | undefined> = { ...process.env };
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    picodeExtension({
      registerTool: (t: CapturedTool) => tools.set(t.name, t),
    } as never);
  } finally {
    // restore exactly: drop keys the snapshot did not have, restore the rest
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
  }
  return tools;
}
