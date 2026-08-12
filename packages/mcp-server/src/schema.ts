/**
 * Convert the picode hand-written parameter schemas (plain JSON-Schema-shaped
 * objects, same as the 09 matrix) into a zod raw shape, which is what the MCP
 * SDK's `registerTool` accepts for input validation. Supported keys:
 * type/properties/required/items/enum — the exact subset pi-extension uses.
 */
import { z } from "zod";

type JsonSchema = Record<string, unknown>;

export function toZodShape(inputSchema: Record<string, unknown>): z.ZodRawShape {
  const props = (inputSchema.properties ?? {}) as Record<string, JsonSchema>;
  const required = (inputSchema.required ?? []) as string[];
  const shape: z.ZodRawShape = {};
  for (const [k, v] of Object.entries(props)) {
    const def = toZodType(v);
    shape[k] = required.includes(k) ? def : def.optional();
  }
  return shape;
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
