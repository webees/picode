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
import { resolveServerEnv } from "./context.js";
import { toMcpError } from "./errors.js";
import { allTools } from "./registry.js";
import { toZodShape } from "./schema.js";

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
