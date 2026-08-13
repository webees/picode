#!/usr/bin/env node
/**
 * 监督者启动脚本（幂等）：run init + product acceptance + status active
 * 用法: node scripts/supervise/launch-run.mjs
 * 之后: 投喂 run-lead → 按其规划 chunk/staffing/task prepare
 */
import { execSync } from "node:child_process";

const PICODE = "/Users/x/Desktop/iOS/picode/packages/orchestrator/dist/cli.js";
const REPO = "/tmp/picode-dogfood";

function picode(args) {
  return execSync(`node ${PICODE} ${args}`, {
    encoding: "utf8",
    cwd: "/Users/x/Desktop/iOS/picode",
  });
}

const GOAL_TITLE = "会话续跑机制（continuation）：picode 无输入长时自治闭环";
const ACCEPTANCE = [
  "会话完成单回合后由机械层自动续跑，不再空等（长时编程能力）",
  "续跑有界（预算/最大续跑次数）且断连可恢复（可靠性）",
  "本轮 run 自身作为验证载体：无人干预完成至少 2 个任务并合并",
];

// 1. init（幂等：已存在则复用）
let runId = null;
try {
  const out = JSON.parse(picode(`init --repo ${REPO} --goal-title "${GOAL_TITLE}" --kind self_evolve --evolve-layers knowledge,prompts,docs,tests,code --evolve-risk medium --scale L`));
  runId = out.runId;
  console.log("init:", runId);
} catch (e) {
  const m = String(e.stderr || e.message);
  const hit = m.match(/run-[\dTZ:.-]+/);
  if (hit) {
    runId = hit[0];
    console.log("init (existing):", runId);
  } else {
    throw e;
  }
}

// 2. product acceptance（幂等：重复写覆盖）
console.log(picode(`goal set-product-acceptance --repo ${REPO} --run ${runId} --acceptance "${ACCEPTANCE.join("; ")}"`));

// 3. status active（幂等：active 再设 active 会报错则跳过）
try {
  console.log(JSON.parse(picode(`goal set-status --repo ${REPO} --run ${runId} --status active`)).status);
} catch (e) {
  console.log("status:", String(e.stderr || e.message).trim().slice(0, 80));
}

console.log("RUN_ID=" + runId);
