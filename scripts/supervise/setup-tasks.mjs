#!/usr/bin/env node
/**
 * 监督者装配脚本（幂等）：chunk add → write_paths 合并 → 双门闩 → staffing → task prepare
 * 用法: node setup-tasks.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import YAML from "yaml";

const PICODE = "/Users/x/Desktop/iOS/picode/packages/orchestrator/dist/cli.js";
const REPO = "/tmp/picode-dogfood";
const RUN = "run-2026-08-14T10-07-06-439Z";
const RUN_DIR = `${REPO}/.picode/runs/${RUN}`;

const CHUNKS = {
  "continuation-core": {
    first: "packages/orchestrator/src/continuation.ts",
    write: [
      "packages/orchestrator/src/continuation.ts",
      "packages/orchestrator/src/continuation.test.ts",
      "packages/orchestrator/src/self-drive.ts",
      "packages/orchestrator/src/self-drive.test.ts",
      "packages/orchestrator/src/session-store.ts",
      "packages/orchestrator/src/session-store.test.ts",
      "packages/core/src/session.ts",
      "packages/core/src/config.ts",
      "packages/core/src/config.test.ts",
      "packages/core/src/session.test.ts",
    ],
    skills: "typescript,state-machine,opencode-serve",
  },
  "continuation-docs": {
    first: "docs/DECISIONS.md",
    write: [
      "docs/DECISIONS.md",
      "docs/reference/decision-catalog.md",
      "docs/guides/operations.md",
      "docs/knowledge/prime-agent-study.md",
      "docs/knowledge/evolve/run-2026-08-13T01-15-17-073Z.md",
    ],
    skills: "docs,spec",
  },
  "continuation-recovery": {
    first: "packages/orchestrator/src/commands/self-drive.ts",
    write: [
      "packages/orchestrator/src/commands/self-drive.ts",
      "packages/orchestrator/src/commands/self-drive.test.ts",
      "packages/orchestrator/src/self-drive.ts",
      "packages/orchestrator/src/self-drive.test.ts",
      "packages/mcp-server/src/management.ts",
      "packages/mcp-server/src/registry.test.ts",
    ],
    skills: "typescript,opencode-serve,mcp",
  },
  "merge-terminal": {
    first: "packages/orchestrator/src/merge.ts",
    write: [
      "packages/orchestrator/src/merge.ts",
      "packages/orchestrator/src/merge.test.ts",
      "packages/orchestrator/src/continuation.ts",
      "packages/orchestrator/src/continuation.test.ts",
    ],
    skills: "typescript,state-machine",
  },
  "continuation-bounded": {
    first: "packages/core/src/config.ts",
    write: [
      "packages/core/src/config.ts",
      "packages/core/src/config.test.ts",
      "docs/reference/decision-catalog.md",
    ],
    skills: "typescript,config",
  },
  "guardian-reload-signal": {
    first: "packages/orchestrator/src/self-drive.ts",
    write: [
      "packages/orchestrator/src/self-drive.ts",
      "packages/orchestrator/src/self-drive.test.ts",
      "docs/guides/operations.md",
    ],
    skills: "typescript,ops",
  },
  "round2-docs": {
    first: "docs/knowledge/evolve/run-2026-08-13T01-15-17-073Z.md",
    write: [
      "docs/knowledge/evolve/run-2026-08-13T01-15-17-073Z.md",
      "docs/knowledge/research/README.md",
      "docs/plans/run-2026-08-13T01-15-17-073Z-plan-r2.md",
    ],
    skills: "docs,spec",
  },
  "idle-clock": {
    first: "packages/orchestrator/src/continuation.ts",
    write: [
      "packages/orchestrator/src/continuation.ts",
      "packages/orchestrator/src/continuation.test.ts",
      "packages/core/src/config.ts",
      "packages/core/src/config.test.ts",
      "docs/reference/decision-catalog.md",
    ],
    skills: "typescript,state-machine",
  },
  "continuation-gate": {
    first: "packages/orchestrator/src/continuation-gate.ts",
    write: [
      "packages/orchestrator/src/continuation-gate.ts",
      "packages/orchestrator/src/continuation-gate.test.ts",
      "packages/orchestrator/src/self-drive.ts",
      "packages/orchestrator/src/self-drive.test.ts",
    ],
    skills: "typescript,git",
  },
  "continuation-telemetry": {
    first: "packages/orchestrator/src/status.ts",
    write: [
      "packages/orchestrator/src/status.ts",
      "packages/orchestrator/src/status.test.ts",
      "packages/orchestrator/src/commands/self-drive.ts",
      "packages/orchestrator/src/commands/self-drive.test.ts",
      "packages/mcp-server/src/management.ts",
      "packages/mcp-server/src/management.test.ts",
      "packages/mcp-server/src/registry.test.ts",
      "docs/guides/operations.md",
    ],
    skills: "typescript,mcp,cli",
  },
  "round3-docs": {
    first: "docs/knowledge/evolve/run-2026-08-13T09-36-28-520Z.md",
    write: [
      "docs/knowledge/evolve/run-2026-08-13T09-36-28-520Z.md",
      "docs/DECISIONS.md",
      "docs/reference/decision-catalog.md",
      "docs/guides/operations.md",
      "docs/plans/run-2026-08-13T09-36-28-520Z-plan.md",
    ],
    skills: "docs,spec",
  },
  "dashboard-server": {
    first: "packages/dashboard-server/src/index.ts",
    write: [
      "packages/dashboard-server/**",
      "package.json",
      "tsconfig.json",
    ],
    skills: "typescript,http,node",
  },
  "dashboard-scaffold": {
    first: "packages/dashboard/package.json",
    write: ["packages/dashboard/**"],
    skills: "vue,vite,typescript,tailwind",
  },
  "dashboard-pages": {
    first: "packages/dashboard/src/services/api/picode.api.ts",
    write: [
      "packages/dashboard/src/services/**",
      "packages/dashboard/src/pages/dashboard/**",
    ],
    skills: "vue,tanstack,typescript",
  },
  "dashboard-docs": {
    first: "docs/DECISIONS.md",
    write: [
      "docs/DECISIONS.md",
      "docs/reference/decision-catalog.md",
      "docs/guides/operations.md",
      "README.md",
      "docs/knowledge/evolve/run-2026-08-13T12-16-26-548Z.md",
    ],
    skills: "docs,spec",
  },
  "design-system": {
    first: "packages/dashboard/src/assets/index.css",
    write: ["packages/dashboard/src/assets/**", "packages/dashboard/src/constants/themes.ts", "packages/dashboard/src/stores/theme.ts", "packages/dashboard/src/layouts/**", "packages/dashboard/src/components/global-layout/**", "packages/dashboard/src/components/dashboard/**"],
    skills: "vue,css,tailwind,design",
  },
  "overview": {
    first: "packages/dashboard/src/pages/dashboard/index.vue",
    write: ["packages/dashboard/src/pages/dashboard/index.vue", "packages/dashboard/src/constants/sidebar-data.ts", "packages/dashboard/src/pages/dashboard/index.components.ts"],
    skills: "vue,typescript",
  },
  "run-detail": {
    first: "packages/dashboard/src/pages/dashboard/runs/[runId]/index.vue",
    write: ["packages/dashboard/src/pages/dashboard/runs/**"],
    skills: "vue,typescript",
  },
  "ui-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "README.md"],
    skills: "docs,spec",
  },
  "run-close": {
    first: "packages/orchestrator/src/self-drive.ts",
    write: ["packages/orchestrator/src/self-drive.ts", "packages/orchestrator/src/self-drive.test.ts", "packages/orchestrator/src/commands/goal.ts", "packages/orchestrator/src/commands/goal.test.ts"],
    skills: "typescript,state-machine",
  },
  "session-audit": {
    first: "packages/orchestrator/src/session-audit.ts",
    write: ["packages/orchestrator/src/session-audit.ts", "packages/orchestrator/src/session-audit.test.ts", "packages/orchestrator/src/commands/session.ts", "packages/orchestrator/src/cli.test.ts"],
    skills: "typescript,cli",
  },
  "lifecycle-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-13T17-25-34-974Z.md"],
    skills: "docs,spec",
  },
  "continuation-semantic": {
    first: "packages/orchestrator/src/continuation.ts",
    write: ["packages/orchestrator/src/continuation.ts", "packages/orchestrator/src/continuation.test.ts"],
    skills: "typescript,state-machine",
  },
  "semantic-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-13T18-29-39-276Z.md"],
    skills: "docs,spec",
  },
  "continuation-summary": {
    first: "packages/orchestrator/src/transcript-store.ts",
    write: ["packages/orchestrator/src/transcript-store.ts", "packages/orchestrator/src/transcript-store.test.ts", "packages/orchestrator/src/continuation.ts", "packages/orchestrator/src/continuation.test.ts", "packages/core/src/config.ts", "packages/core/src/config.test.ts"],
    skills: "typescript,state-machine",
  },
  "continuation-budget": {
    first: "packages/orchestrator/src/continuation.ts",
    write: ["packages/orchestrator/src/continuation.ts", "packages/orchestrator/src/continuation.test.ts", "packages/orchestrator/src/status.ts", "packages/orchestrator/src/status.test.ts", "packages/core/src/config.ts", "packages/core/src/config.test.ts"],
    skills: "typescript,config",
  },
  "deep-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-13T21-32-57-118Z.md"],
    skills: "docs,spec",
  },
  "checkpoint-store": {
    first: "packages/orchestrator/src/checkpoint-store.ts",
    write: ["packages/orchestrator/src/checkpoint-store.ts", "packages/orchestrator/src/checkpoint-store.test.ts", "packages/orchestrator/src/commands/checkpoint.ts", "packages/orchestrator/src/commands/index.ts"],
    skills: "typescript,state-machine",
  },
  "respawn-stripnoise": {
    first: "packages/orchestrator/src/opencode-adapter.ts",
    write: ["packages/orchestrator/src/opencode-adapter.ts", "packages/orchestrator/src/opencode-adapter.test.ts", "packages/orchestrator/src/transcript-store.test.ts"],
    skills: "typescript,opencode",
  },
  "checkpoint-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-13T23-48-54-042Z.md"],
    skills: "docs,spec",
  },
  "skill-spec": {
    first: "packages/core/src/skills.ts",
    write: ["packages/core/src/skills.ts", "packages/core/src/skills.test.ts", "packages/core/src/validate/skill-lint.ts", "packages/core/src/validate/skill-lint.test.ts", "packages/core/src/config.ts", "packages/core/src/index.ts", "package.json"],
    skills: "typescript,skill",
  },
  "skill-wiring": {
    first: "packages/orchestrator/src/pi-adapter.ts",
    write: ["packages/orchestrator/src/pi-adapter.ts", "packages/orchestrator/src/pi-adapter.test.ts", "packages/orchestrator/src/opencode-adapter.ts", "packages/orchestrator/src/opencode-adapter.test.ts", ".picode/agents/engineer.md", ".picode/agents/run-lead.md"],
    skills: "typescript,opencode,persona",
  },
  "skill-docs": {
    first: "docs/standards/skill-spec.md",
    write: ["docs/standards/skill-spec.md", "docs/guides/skills/skill-harness.md", "skills/README.md", "docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/knowledge/evolve/run-2026-08-13T23-50-59-484Z.md"],
    skills: "docs,spec",
  },
  "decision-reserve": {
    first: "docs/decisions/watermark.yaml",
    write: ["docs/decisions/watermark.yaml", "scripts/decision-reserve.mjs", "scripts/decision-reserve.test.mjs", "docs/DECISIONS.md"],
    skills: "typescript,scripting",
  },
  "decision-lint": {
    first: "packages/core/src/validate/decision-lint.ts",
    write: ["packages/core/src/validate/decision-lint.ts", "packages/core/src/validate/decision-lint.test.ts", "package.json", "packages/core/src/index.ts"],
    skills: "typescript,validation",
  },
  "decision-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-14T07-27-45-654Z.md"],
    skills: "docs,spec",
  },
  "checkpoint-auto": {
    first: "packages/orchestrator/src/self-drive.ts",
    write: ["packages/orchestrator/src/self-drive.ts", "packages/orchestrator/src/self-drive.test.ts", "packages/orchestrator/src/checkpoint-store.ts", "packages/orchestrator/src/checkpoint-store.test.ts", "packages/orchestrator/src/merge.ts", "packages/orchestrator/src/merge.test.ts", "packages/core/src/config.ts", "packages/core/src/config.test.ts"],
    skills: "typescript,state-machine",
  },
  "decision-reserve-schema": {
    first: "docs/decisions/reserve.mjs",
    write: ["docs/decisions/reserve.mjs", "docs/decisions/reserve.test.mjs", "docs/decisions/watermark.yaml"],
    skills: "scripting",
  },
  "ckauto-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-14T08-55-08-366Z.md"],
    skills: "docs,spec",
  },
  "summary-noise-unify": {
    first: "packages/orchestrator/src/summary-noise.ts",
    write: ["packages/orchestrator/src/summary-noise.ts", "packages/orchestrator/src/summary-noise.test.ts", "packages/orchestrator/src/opencode-adapter.ts", "packages/orchestrator/src/opencode-adapter.test.ts", "packages/orchestrator/src/continuation.ts", "packages/orchestrator/src/continuation.test.ts", "packages/orchestrator/src/checkpoint-store.ts", "packages/orchestrator/src/checkpoint-store.test.ts"],
    skills: "typescript,state-machine",
  },
  "supervise-command": {
    first: "packages/orchestrator/src/live.ts",
    write: ["packages/orchestrator/src/live.ts", "packages/orchestrator/src/live.test.ts", "packages/orchestrator/src/commands/supervise.ts", "packages/orchestrator/src/commands/index.ts", "packages/dashboard-server/src/live.ts", "packages/dashboard-server/src/index.test.ts"],
    skills: "typescript,cli,http",
  },
  "supervise-docs": {
    first: "docs/DECISIONS.md",
    write: ["docs/DECISIONS.md", "docs/reference/decision-catalog.md", "docs/guides/operations.md", "docs/knowledge/evolve/run-2026-08-14T10-07-06-439Z.md"],
    skills: "docs,spec",
  },
};

function picode(args) {
  return execSync(`node ${PICODE} ${args}`, {
    encoding: "utf8",
    cwd: "/Users/x/Desktop/iOS/picode",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function tryPicode(args) {
  try { return picode(args); } catch (e) {
    const msg = String(e.stderr || e.message);
    console.log(`  [skip] ${args.split(" ")[0]}: ${msg.slice(0, 100)}`);
    return null;
  }
}

function patchWritePaths(chunkId, paths) {
  const chunksPath = `${RUN_DIR}/chunks.yaml`;
  const chunks = YAML.parse(fs.readFileSync(chunksPath, "utf8"));
  const c = chunks.chunks.find((x) => x.id === chunkId);
  if (!c) throw new Error(`chunk ${chunkId} not found`);
  c.write_paths = [...new Set([...(c.write_paths ?? []), ...paths])];
  fs.writeFileSync(chunksPath, YAML.stringify(chunks));

  const taskId = c.task_id;
  const taskPath = `${RUN_DIR}/tasks/${taskId}/task.yaml`;
  const task = YAML.parse(fs.readFileSync(taskPath, "utf8"));
  task.write_paths = [...new Set([...(task.write_paths ?? []), ...paths])];
  fs.writeFileSync(taskPath, YAML.stringify(task));
  return taskId;
}

// 每次装配的 chunk 白名单（按 run 指定；防历史 chunk 累积污染新 run）
const RUN_CHUNKS = (process.env.RUN_CHUNKS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

for (const [chunkId, spec] of Object.entries(CHUNKS)) {
  if (RUN_CHUNKS.length > 0 && !RUN_CHUNKS.includes(chunkId)) continue;
  console.log(`=== ${chunkId} ===`);
  // 1. chunk add（幂等：chunks.yaml 已存在该 chunk 则跳过）
  const chunksYaml = YAML.parse(fs.readFileSync(`${RUN_DIR}/chunks.yaml`, "utf8"));
  if (!chunksYaml.chunks.some((x) => x.id === chunkId)) {
    const out = tryPicode(`chunk add --repo ${REPO} --run ${RUN} --id ${chunkId} --write "${spec.first}"`);
    if (out) console.log("  chunk add:", JSON.parse(out).taskId);
  } else {
    console.log("  chunk exists, skip add");
  }
  // 2. write_paths 合并（幂等去重）
  const taskId = patchWritePaths(chunkId, spec.write);
  console.log(`  write_paths: ${spec.write.length} merged → ${taskId}`);
  // 3. 门闩一
  tryPicode(`brief draft --repo ${REPO} --run ${RUN} --task ${taskId}`);
  tryPicode(`brief approve --repo ${REPO} --run ${RUN} --task ${taskId} --by run-lead`);
  // 4. 门闩二 + 会话（先用工单，再机械起草人设，最后 people-qa 校验 approve）
  tryPicode(`staffing request --repo ${REPO} --run ${RUN} --task ${taskId} --skills ${spec.skills} --notes "run-lead 规划 (b) 分配"`);
  tryPicode(`staffing draft-personas --repo ${REPO} --run ${RUN} --task ${taskId}`);
  const appr = tryPicode(`staffing approve --repo ${REPO} --run ${RUN} --task ${taskId} --by run-lead`);
  if (appr && appr.includes("wokeErrors")) console.log("  staffing:", appr.slice(0, 200));
  // 5. prepare（worktree + token）
  const prep = tryPicode(`task prepare --repo ${REPO} --run ${RUN} --task ${taskId}`);
  if (prep) console.log("  prepare:", prep.slice(0, 150));
}
console.log("DONE");
