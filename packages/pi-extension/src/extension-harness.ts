/**
 * Shared test harness for the pi-extension (not a test file itself: dist/*.test.js
 * glob skips it). Loads the extension against a fake Pi API and captures tools.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { issueToken } from "@picode/bus";
import picodeExtension from "./index.js";

export interface Tool {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Create a fake run dir with a real secret and return env vars. */
export function makeRun(agentId: string): { runsRoot: string; runId: string; token: string } {
  const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-runs-"));
  const runId = "run-test";
  const secret = "test-secret";
  fs.mkdirSync(path.join(runsRoot, runId), { recursive: true });
  fs.writeFileSync(path.join(runsRoot, runId, "secret.txt"), secret, "utf8");
  return { runsRoot, runId, token: issueToken(agentId, secret) };
}

/** Load the extension against a fake Pi API, capturing registered tools. */
export function loadExtension(env: Record<string, string>): Map<string, Tool> {
  const tools = new Map<string, Tool>();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    picodeExtension({
      registerTool: (t: { name: string }) => tools.set(t.name, t as unknown as Tool),
    } as never);
  } finally {
    process.env = saved;
  }
  return tools;
}

export async function call(
  tools: Map<string, Tool>,
  name: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; code?: string; [k: string]: unknown }> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  const res = await tool.execute("test-call", params);
  return JSON.parse(res.content[0].text);
}

export function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-ext-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@picode"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# repo\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

export const baseEnv = {
  PICODE_RUN_ID: "run-test",
  PICODE_RUNS_ROOT: "/tmp",
  PICODE_AGENT_ID: "engineer@task-a",
  PICODE_AGENT_TOKEN: "x",
  PICODE_TOOL_PROFILE: "implement.engineer",
  PICODE_CWD: "",
  PICODE_WRITE_PATHS: JSON.stringify(["src/**"]),
  PICODE_READ_PATHS: JSON.stringify([]),
  PICODE_RUN_ALLOWLIST: JSON.stringify(["npm test"]),
};
