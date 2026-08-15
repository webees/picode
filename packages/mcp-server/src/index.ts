#!/usr/bin/env node
/**
 * picode MCP server (D064) — stdio transport.
 *
 *   PICODE_REPO=<repo> node packages/mcp-server/dist/index.js
 *
 * Exposes the full picode surface as MCP tools: management (orchestrator
 * store functions, ~36 tools) + execution (pi-extension 20 tools with the
 * ACL stack intact). The server is a trusted local process, like the
 * orchestrator CLI itself — the same gates, locks and invariants apply.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PicodeError, errorCodeOf } from "@picode/core";
import { z } from "zod";
import { resolveServerEnv } from "./context.js";
import { allTools } from "./registry.js";

/**
 * Error mapping for MCP tool calls. picode errors are `PicodeError` carrying
 * a stable `ErrorCode`; the structured shape below keeps the code visible to
 * the MCP client (machine-readable) while `isError: true` marks the call as
 * failed per the MCP spec.
 */
function toMcpError(
  e: unknown,
): { content: Array<{ type: "text"; text: string }>; isError: true } {
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

/**
 * Convert the picode hand-written parameter schemas (plain JSON-Schema-shaped
 * objects, same as the 09 matrix) into a zod raw shape, which is what the MCP
 * SDK's `registerTool` accepts for input validation. Supported keys:
 * type/properties/required/items/enum — the exact subset pi-extension uses.
 */
type JsonSchema = Record<string, unknown>;

function toZodShape(inputSchema: Record<string, unknown>): z.ZodRawShape {
  const props = (inputSchema.properties ?? {}) as Record<string, JsonSchema>;
  const required = (inputSchema.required ?? []) as string[];
  // zod 4 的 ZodRawShape 是 Readonly：用可变 Record 构造再转换
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(props)) {
    const def = toZodType(v);
    shape[k] = required.includes(k) ? def : def.optional();
  }
  return shape as unknown as z.ZodRawShape;
}

function toZodType(s: JsonSchema): z.ZodTypeAny {
  switch (s.type) {
    case "string":
      return Array.isArray(s.enum) && s.enum.length > 0
        ? z.enum(s.enum as [string, ...string[]])
        : z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(toZodType((s.items as JsonSchema | undefined) ?? { type: "string" }));
    default:
      // plain object / anything else (e.g. codename_overrides)
      return z.any();
  }
}

const server = new McpServer({ name: "picode", version: "0.1.0" });
const env = resolveServerEnv();

for (const t of allTools()) {
  server.registerTool(
    t.name,
    // hand-written schemas converted to zod raw shapes (SDK requirement)
    { description: t.description, inputSchema: toZodShape(t.inputSchema) } as never,
    (async (params: Record<string, unknown>) => {
      try {
        const result = await t.run(params, env);
        // MCP-ready results only when content is a block ARRAY (the
        // pi-extension's shape); data objects that merely carry a `content`
        // field (file contents, message bodies) must be JSON-wrapped.
        if (
          result &&
          typeof result === "object" &&
          Array.isArray((result as { content?: unknown }).content)
        ) {
          return result as never;
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return toMcpError(e);
      }
    }) as never,
  );
}

await server.connect(new StdioServerTransport());
