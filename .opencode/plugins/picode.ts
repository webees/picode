/**
 * picode → opencode 桥接插件（P0 工具注入）。
 *
 * 复用 @picode/pi-extension 的 20 个工具定义（registerTool 捕获），
 * 桥接为 opencode 插件 Tool 格式（v2: { tool: { [name]: ToolDefinition } }）。
 * 安装于全局插件目录 ~/.config/opencode/plugins/，serve 启动自动加载。
 */
import { tool } from "@opencode-ai/plugin";
import picodeExt from "/Users/x/Desktop/iOS/picode/packages/pi-extension/dist/index.js";

type PiTool = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

/** Minimal JSON-schema → zod converter (covers the shapes used by pi-extension). */
function toZod(schema: Record<string, unknown>): unknown {
  const s = schema as {
    type?: string;
    properties?: Record<string, Record<string, unknown>>;
    items?: Record<string, unknown>;
    description?: string;
  };
  switch (s.type) {
    case "string":
      return tool.schema.string().describe(s.description ?? "");
    case "number":
      return tool.schema.number().describe(s.description ?? "");
    case "boolean":
      return tool.schema.boolean().describe(s.description ?? "");
    case "array":
      return tool.schema.array(toZod(s.items ?? {}) as never).describe(s.description ?? "");
    case "object": {
      const shape: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) shape[k] = toZod(v);
      return tool.schema.object(shape).describe(s.description ?? "");
    }
    default:
      return tool.schema.any().describe(s.description ?? "");
  }
}

export const Pi = async (_ctx: unknown) => {
  const captured: PiTool[] = [];
  picodeExt({
    registerTool: (t: PiTool) => {
      captured.push(t);
    },
  });

  const tools: Record<string, ReturnType<typeof tool>> = {};
  for (const t of captured) {
    const zodSchema = toZod(t.parameters ?? {});
    const shape =
      (zodSchema as { shape?: Record<string, unknown> }).shape ?? ({} as Record<string, unknown>);
    tools[t.name] = tool({
      description: `${t.label} — ${t.description}`,
      args: shape,
      execute: async (args: Record<string, unknown>) => {
        const r = await t.execute("", args, undefined, undefined, undefined);
        return r.content.map((c) => c.text).join("\n");
      },
    });
  }
  return { tool: tools };
};
