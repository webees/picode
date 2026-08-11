/**
 * picode → opencode 桥接插件（P0 工具注入）。
 *
 * 复用 @picode/pi-extension 的 20 个工具定义（registerTool 捕获），
 * 桥接为 opencode 插件 Tool 格式（v2: { tool: { [name]: ToolDefinition } }）。
 * 安装于全局插件目录 ~/.config/opencode/plugins/，serve 启动自动加载。
 *
 * ─────────────────────────────────────────────────────────────
 * 逐工具权限分类（permission: allow | ask | deny）
 * ─────────────────────────────────────────────────────────────
 * 规则：
 *   · 只读且局限 worktree/run 内          → allow
 *   · 有副作用但受控于 worktree/run 内     → ask
 *   · 网络 / 出仓路径                      → deny（默认）
 *   · 未列入矩阵的工具                    → deny（fail-closed）
 * 说明：deny 档在桥接层直接拦截（不转发到 pi-extension）；
 *       放开需 run-lead 经 PICODE_TOOL_PERMISSION_OVERRIDES 注入，
 *       代理自身不可修改。
 *
 * 权限矩阵清单（20 工具）：
 * | 工具                 | 档位  | 理由                                       |
 * |----------------------|-------|--------------------------------------------|
 * | bus_history          | allow | 只读房间历史，ACL 校验                      |
 * | repo_read            | allow | 只读 worktree（read/write_paths）          |
 * | repo_glob            | allow | 只读列出 worktree 文件                      |
 * | repo_grep            | allow | 只读搜索 worktree 文件内容                  |
 * | session_list         | allow | 只读会话花名册                              |
 * | git_status           | allow | git 只读 status                             |
 * | git_diff             | allow | git 只读 diff                               |
 * | git_log              | allow | git 只读 log                                |
 * | state_read           | allow | 只读 run 状态白名单文件                     |
 * | bus_post             | ask   | 向房间发消息（对外副作用）                   |
 * | repo_write           | ask   | 写 worktree（write_paths 约束）             |
 * | progress_report      | ask   | 发进度 + 写 run 状态                        |
 * | request_info         | ask   | 写申请入 runs/requests 队列                 |
 * | request_cross_room   | ask   | 申请跨房间桥（run-lead 审批）               |
 * | session_wake         | ask   | 改会话状态（唤醒）                           |
 * | session_sleep        | ask   | 改会话状态（休眠）                           |
 * | git_commit           | ask   | git add -A + commit（改仓库历史）           |
 * | run_allowlisted      | ask   | 执行 allowlist 内命令（测试/构建）           |
 * | web_search           | deny  | 联网搜索（网络出口默认 deny）               |
 * | web_fetch            | deny  | 联网抓取（网络出口默认 deny）               |
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

type PiPermission = "allow" | "ask" | "deny";

type PiPermissionEntry = {
  permission: PiPermission;
  reason: string;
};

/** 20 个 pi-extension 工具的显式权限矩阵（fail-closed：未列出 → deny）。 */
const PI_TOOL_PERMISSIONS: Record<string, PiPermissionEntry> = {
  // ——— allow：只读、局限 worktree/run 内、无副作用 ———
  bus_history: { permission: "allow", reason: "只读房间历史，ACL 校验后返回" },
  repo_read: { permission: "allow", reason: "只读 worktree 内 read/write_paths 文件" },
  repo_glob: { permission: "allow", reason: "只读列出 worktree 文件" },
  repo_grep: { permission: "allow", reason: "只读搜索 worktree 文件内容" },
  session_list: { permission: "allow", reason: "只读会话花名册" },
  git_status: { permission: "allow", reason: "git 只读 status" },
  git_diff: { permission: "allow", reason: "git 只读 diff" },
  git_log: { permission: "allow", reason: "git 只读 log" },
  state_read: { permission: "allow", reason: "只读 run 状态白名单文件" },

  // ——— ask：有副作用但受控于 worktree/run 内 ———
  bus_post: { permission: "ask", reason: "向房间发消息（对外副作用，ACL 校验）" },
  repo_write: { permission: "ask", reason: "写 worktree 文件（write_paths 约束）" },
  progress_report: { permission: "ask", reason: "向任务房发进度并写 run 状态" },
  request_info: { permission: "ask", reason: "写 info 申请入 runs/requests 队列" },
  request_cross_room: { permission: "ask", reason: "申请跨房间桥（run-lead 审批）" },
  session_wake: { permission: "ask", reason: "唤醒会话（改会话状态，sess-mgr）" },
  session_sleep: { permission: "ask", reason: "休眠会话（改会话状态，sess-mgr）" },
  git_commit: { permission: "ask", reason: "git add -A + commit（改仓库历史）" },
  run_allowlisted: { permission: "ask", reason: "执行 allowlist 内命令（测试/构建）" },

  // ——— deny：网络 / 出仓，默认拒绝 ———
  web_search: { permission: "deny", reason: "联网搜索（网络出口，默认 deny）" },
  web_fetch: { permission: "deny", reason: "联网抓取（网络出口，默认 deny）" },
};

/** run-lead 注入的覆盖（代理不可自改）：JSON map tool → tier。 */
function permissionOverride(): Record<string, PiPermission> {
  try {
    const raw = process.env.PICODE_TOOL_PERMISSION_OVERRIDES;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PiPermission>;
    const valid: Record<string, PiPermission> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "allow" || v === "ask" || v === "deny") valid[k] = v;
    }
    return valid;
  } catch {
    return {};
  }
}

/** 解析某工具的最终权限档（矩阵 + run-lead 覆盖，未列入默认 deny）。 */
function classify(toolName: string): PiPermissionEntry {
  const override = permissionOverride()[toolName];
  const entry = PI_TOOL_PERMISSIONS[toolName] ?? {
    permission: "deny" as PiPermission,
    reason: "未在权限矩阵中的工具，fail-closed 默认 deny",
  };
  if (override) {
    return { permission: override, reason: `${entry.reason}（run-lead 覆盖为 ${override}）` };
  }
  return entry;
}

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

type BridgedTool = ReturnType<typeof tool> & { permission: PiPermissionEntry };

export const Pi = async (_ctx: unknown) => {
  const captured: PiTool[] = [];
  picodeExt({
    registerTool: (t: PiTool) => {
      captured.push(t);
    },
  });

  const tools: Record<string, BridgedTool> = {};
  for (const t of captured) {
    const permission = classify(t.name);
    const zodSchema = toZod(t.parameters ?? {});
    const shape =
      (zodSchema as { shape?: Record<string, unknown> }).shape ?? ({} as Record<string, unknown>);
    const def = tool({
      description: `${t.label} — ${t.description} [permission:${permission.permission}]`,
      args: shape,
      execute: async (args: Record<string, unknown>) => {
        if (permission.permission === "deny") {
          return `[picode] ${t.name} denied（permission: deny — ${permission.reason}）`;
        }
        const r = await t.execute("", args, undefined, undefined, undefined);
        return r.content.map((c) => c.text).join("\n");
      },
    });
    tools[t.name] = { ...def, permission };
  }
  return { tool: tools };
};
