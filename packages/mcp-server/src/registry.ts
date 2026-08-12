/**
 * Tool registry: management surface (orchestrator store functions) +
 * execution surface (pi-extension 20 tools). One array drives `tools/list`
 * and every `tools/call`.
 */
import type { ServerEnv } from "./context.js";
import { managementTools } from "./management.js";
import { executionTools } from "./execution.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Execute the tool; throwing produces a structured error result. */
  run: (params: Record<string, unknown>, env: ServerEnv) => Promise<unknown> | unknown;
}

export function allTools(): ToolDef[] {
  return [...managementTools(), ...executionTools()];
}
