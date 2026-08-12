/**
 * Error mapping for MCP tool calls. picode errors are `PicodeError` carrying
 * a stable `ErrorCode`; the structured shape below keeps the code visible to
 * the MCP client (machine-readable) while `isError: true` marks the call as
 * failed per the MCP spec.
 */
import { PicodeError, errorCodeOf } from "@picode/core";

export interface McpErrorResult {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

export function toMcpError(e: unknown): McpErrorResult {
  const code = e instanceof PicodeError ? e.code : (errorCodeOf(e) ?? "INTERNAL");
  const message = e instanceof Error ? e.message : String(e);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: false, code, message }, null, 2),
      },
    ],
    isError: true,
  };
}
