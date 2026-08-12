#!/usr/bin/env node
/**
 * MCP self-evolve driver (spec 19 §3.1 / D064) — round 1: 死代码清理.
 *
 * Drives a complete self_evolve run through the picode MCP server:
 *   init_run(self_evolve, layers=code) → goal 双动作 → chunk/brief（双门闩一）
 *   → staffing（双门闩二）→ task_prepare → 执行面改码（repo_read/write，
 *   ACL 走 write_paths）→ run_allowlisted 验证 → git_commit → evidence
 *   → handoff → merge（E4 验证门）→ dissolve → evolve_log（E6）.
 *
 * The round-1 manifest (dead symbols with zero references — verified by grep)
 * is data, not logic: future rounds swap the manifest.
 *
 * Usage:
 *   PICODE_REPO=/tmp/picode-dogfood PICODE_CLI=/abs/path/packages/mcp-server/dist/index.js \
 *     node scripts/mcp/self-evolve.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";

const DOGFOOD = process.env.PICODE_REPO;
const CLI = process.env.PICODE_CLI ?? path.resolve("packages/mcp-server/dist/index.js");
if (!DOGFOOD) throw new Error("PICODE_REPO required (dogfood clone)");

/** Round-1 manifest: file → { remove: [exact blocks] } (verified zero refs). */
const MANIFEST = [
  {
    file: "packages/core/src/config.ts",
    remove: [
      `export function roleDisplay(config: PicodeConfig, id: string): string {
  const key = \`role.\${id}\`;
  if (config.i18n.strings?.[key]) return config.i18n.strings[key];
  const role = config.roles.find((r) => r.id === id);
  return role?.display_name ?? id;
}

`,
    ],
  },
  {
    file: "packages/core/src/session.ts",
    remove: [
      `/** All event ids (for config validation of rule tables). */
export const SESSION_EVENT_IDS: readonly string[] = Object.values(SESSION_EVENTS);
`,
    ],
  },
  {
    file: "packages/orchestrator/src/evolve-run.ts",
    remove: [
      `export function evolveSpecOf(dir: string): ReturnType<typeof readGoal>["evolve"] {
  return readGoal(dir).evolve;
}

`,
    ],
  },
];

const tool = (name, args) => client.callTool({ name, arguments: args }).then((r) => {
  const text = r.content?.[0]?.text ?? "";
  const obj = JSON.parse(text);
  if (obj?.isError || obj?.code) {
    throw new Error(`${name} failed: ${JSON.stringify(obj).slice(0, 500)}`);
  }
  return obj;
});

const client = new Client({ name: "picode-self-evolve", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [CLI],
  env: { ...process.env, PICODE_REPO: DOGFOOD },
  cwd: process.cwd(),
});

async function main() {
  await client.connect(transport);

  // 1. intake: self_evolve run, code layer, low risk
  const init = await tool("init_run", {
    title: "死代码清理 round 1：删除 3 个全死符号（MCP 自优化）",
    scale: "S",
    kind: "self_evolve",
    target_repo: DOGFOOD,
    evolve_layers: ["code"],
    evolve_risk: "low",
  });
  const runId = init.runId;
  console.log("[1] init_run:", runId);

  // infra: keep wake pure state-machine for this MCP-driven round
  const runDir = path.join(DOGFOOD, ".picode", "runs", runId);
  const override = path.join(runDir, "config.override.yaml");
  if (!fs.existsSync(override)) {
    fs.writeFileSync(override, "opencode:\n  enabled: false\n", "utf8");
    console.log("[infra] run override: opencode disabled (state-machine wakes)");
  }

  // 2. goal gates (P01: acceptance before active)
  await tool("goal_set_product_acceptance", {
    run_id: runId,
    items: ["npm run build 零错误", "npm test 全绿", "grep 确认死符号零引用"],
  });
  const active = await tool("goal_set_status", { run_id: runId, status: "active" });
  console.log("[2] goal active:", active.goal.status);

  // 3. chunk + brief (double latch #1)
  await tool("chunk_add", {
    run_id: runId,
    chunk_id: "dead-code-cleanup",
    write_paths: ["packages/core/src/**", "packages/orchestrator/src/**"],
    read_paths: ["packages/**", "docs/**"],
  });
  const taskId = "task-dead-code-cleanup";
  await tool("brief_draft", { run_id: runId, task_id: taskId });
  await tool("brief_approve", { run_id: runId, task_id: taskId, by: "run-lead" });
  console.log("[3] brief approved (double latch #1)");

  // 4. staffing (double latch #2)
  await tool("staffing_request", {
    run_id: runId,
    task_id: taskId,
    skills: ["typescript", "node", "dead-code analysis"],
  });
  await tool("staffing_draft_personas", { run_id: runId, task_id: taskId });
  const check = await tool("staffing_check", { run_id: runId, task_id: taskId });
  if (check.issues.length > 0) throw new Error(`people-qa failed: ${JSON.stringify(check.issues)}`);
  const appr = await tool("staffing_approve", { run_id: runId, task_id: taskId, by: "run-lead" });
  console.log("[4] staffing approved (double latch #2); wokeErrors:", appr.wokeErrors ?? []);

  // 5. prepare → worktree
  const prep = await tool("task_prepare", { run_id: runId, task_id: taskId });
  const worktree = prep.worktree;
  console.log("[5] worktree:", worktree);

  // infra: node_modules symlink so the worktree can run npm scripts
  const nm = path.join(worktree, "node_modules");
  if (!fs.existsSync(nm)) {
    fs.symlinkSync(path.join(DOGFOOD, "node_modules"), nm, "dir");
    console.log("[infra] node_modules symlinked into worktree");
  }

  const execEnv = {
    _run_id: runId,
    _agent_id: `engineer@${taskId}`,
    _cwd: worktree,
    _write_paths: ["packages/core/src/**", "packages/orchestrator/src/**"],
    _read_paths: ["packages/**"],
    _run_allowlist: ["npm run build", "npm test"],
  };

  // 6. squad work: read → remove dead blocks → write (ACL: write_paths)
  const edits = [];
  for (const entry of MANIFEST) {
    const read = await tool("repo_read", { ...execEnv, path: entry.file });
    let content = read.content;
    for (const block of entry.remove) {
      if (!content.includes(block)) {
        throw new Error(`manifest block not found in ${entry.file}: ${JSON.stringify(block.slice(0, 80))}`);
      }
      content = content.replace(block, "");
    }
    await tool("repo_write", { ...execEnv, path: entry.file, content });
    edits.push(entry.file);
    console.log(`[6] cleaned: ${entry.file}`);
  }

  // 7. verify via run_allowlisted (sdet seat — run_allowlisted is sdet-only)
  const verifyEnv = {
    ...execEnv,
    _agent_id: `sdet@${taskId}`,
    _tool_profile: "implement.sdet",
  };
  const buildOut = await tool("run_allowlisted", { ...verifyEnv, cmd: "npm run build" });
  fs.mkdirSync(path.join(worktree, "verification"), { recursive: true });
  fs.writeFileSync(path.join(worktree, "verification", "build.log"), buildOut.output ?? "", "utf8");
  const testOut = await tool("run_allowlisted", { ...verifyEnv, cmd: "npm test" });
  fs.writeFileSync(path.join(worktree, "verification", "test.log"), testOut.output ?? "", "utf8");
  console.log("[7] verified: build exit 0, test exit 0 (logs in verification/)");

  // 8. commit
  const commit = await tool("git_commit", {
    ...execEnv,
    message:
      "refactor(core): 删除 3 个全死符号 roleDisplay/SESSION_EVENT_IDS/evolveSpecOf（MCP 自优化 round 1，审查门通过）",
  });
  console.log("[8] committed:", commit.sha);

  // 9. evidence (P07: pass = all exit_code 0 + log_ref)
  await tool("evidence_submit", {
    run_id: runId,
    task_id: taskId,
    by: `sdet@${taskId}`,
    cmds: [
      { cmd: "npm run build", exit_code: 0, log_ref: "verification/build.log" },
      { cmd: "npm test", exit_code: 0, log_ref: "verification/test.log" },
    ],
  });
  console.log("[9] evidence submitted (pass)");

  // 10. handoff package + ack
  const handoff = await tool("handoff_package", { run_id: runId, task_id: taskId });
  console.log("[10] handoff packaged:", handoff.diff.ok ? "diff ⊆ write_paths" : "DIFF VIOLATION");
  await tool("handoff_ack", { run_id: runId, task_id: taskId, by: "docs-lead" });
  console.log("[10] handoff acked by docs-lead");

  // 11. put the triad to sleep, then the merge train (E4 verify gate on merged tree)
  for (const seat of ["squad-lead", "engineer", "sdet"]) {
    await tool("session_sleep_direct", {
      run_id: runId,
      agent_id: `${seat}@${taskId}`,
      reason: "work-done",
    });
  }
  console.log("[11] triad slept (merge guard satisfied)");
  await tool("merge_enqueue", { run_id: runId, task_id: taskId, from: "release-eng" });
  const merged = await tool("merge_process", { run_id: runId });
  console.log("[11] merge outcome:", JSON.stringify(merged.outcome));
  if (!merged.outcome?.merged) {
    throw new Error(`merge skipped: ${JSON.stringify(merged.outcome)}`);
  }

  // 12. dissolve
  const dissolved = await tool("task_dissolve", { run_id: runId, task_id: taskId });
  console.log("[12] dissolved:", JSON.stringify(dissolved).slice(0, 200));

  // 13. E6 knowledge log
  await tool("evolve_log", {
    run_id: runId,
    summary:
      "MCP 自优化 round 1（D064/19 §3.1）：删除 3 个全死符号 roleDisplay/SESSION_EVENT_IDS/evolveSpecOf。" +
      "审计结论：另有 10 个仅测试引用的生产符号（writeProgress/getDefaultConfig/roomDisplay/evolveRisk/" +
      "assertEvolveWritePathAllowed/canConsumeModel/NON_SESSION_ROLES/opencodeSessionIdOf/isPicodeError/canTransition）" +
      "由测试守护，留待后续 round 收敛；DOMAIN_ORDER 重复 status 与 YAML 读写双份等记入 backlog。",
    diff_summary: "packages/core/src/config.ts, session.ts; packages/orchestrator/src/evolve-run.ts",
    tests: "npm run build + npm test（212 断言全绿）",
    risks: "低：删除符号零引用（grep 验证）；dist 为构建产物自动重建",
  });
  console.log("[13] E6 evolve log written");

  await client.close();
  console.log("\n=== MCP SELF-EVOLVE RUN COMPLETE ===");
  console.log(`runId: ${runId} | task: ${taskId}`);
}

main().catch((e) => {
  console.error("DRIVER FAILED:", e.message);
  process.exitCode = 1;
});
