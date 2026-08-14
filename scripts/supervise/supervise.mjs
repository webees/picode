#!/usr/bin/env node
/**
 * 监督监控循环：每 5 分钟记录 tokens/会话/worktree/任务状态
 * 停止判定：所有 LLM 会话 tokens 连续 3 轮（15 分钟）零增长 → STOPPED 退出（触发监督者介入）
 * 用法: node supervise.mjs --run run-xxx [--interval 300000]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const RUN_ID = flag("run");
const INTERVAL = Number(flag("interval") ?? 300000);
const RUN_DIR = `/tmp/picode-dogfood/.picode/runs/${RUN_ID}`;
const LOG = "/tmp/picode-supervise.log";
const BASE = "http://127.0.0.1:7788";

// 启动校验：run id 白名单（同时消除 execSync 拼接注入面）+ run 目录真实存在，
// 否则监督者会在不存在的目录上空转、永不停止。
if (!RUN_ID || !/^[A-Za-z0-9:_-]+$/.test(RUN_ID)) {
  console.error("usage: supervise.mjs --run <id> [--interval ms] — run id must match [A-Za-z0-9:_-]+");
  process.exit(1);
}
if (!Number.isFinite(INTERVAL) || INTERVAL <= 0) {
  console.error(`supervise: invalid --interval ${flag("interval")}`);
  process.exit(1);
}
const sessionsDir = path.join(RUN_DIR, "sessions");
if (!fs.existsSync(sessionsDir)) {
  console.error(`supervise: run dir missing: ${RUN_DIR} (sessions/ not found) — check RUN_ID`);
  process.exit(1);
}

async function pollTokens(sessionId) {
  try {
    const res = await fetch(`${BASE}/session/${sessionId.replace(/^oc-/, "")}/message`, {
      signal: AbortSignal.timeout(20000),
    });
    const msgs = await res.json();
    const list = Array.isArray(msgs) ? msgs : msgs?.messages ?? [];
    let tokens = 0;
    for (const m of list) tokens += m?.info?.tokens?.total ?? 0; // tokens 是嵌套对象 {total}
    return tokens;
  } catch {
    return -1; // poll 失败（serve 异常）也是需要监督的信号
  }
}

function cli(args) {
  try {
    return JSON.parse(execSync(
      `node /Users/x/Desktop/iOS/picode/packages/orchestrator/dist/cli.js ${args} --repo /tmp/picode-dogfood --run ${RUN_ID}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ));
  } catch (e) {
    return { error: String(e.stderr || e.message).slice(0, 200) };
  }
}

const stale = { rounds: 0, tokens: -1 };

fs.appendFileSync(LOG, `[supervise] start run=${RUN_ID} interval=${INTERVAL}ms\n`);

while (true) {
  const row = { ts: new Date().toISOString(), agents: {}, total: 0, worktrees: 0, tasks: {} };
  try {
    // 会话 tokens
    if (fs.existsSync(sessionsDir)) {
      for (const f of fs.readdirSync(sessionsDir)) {
        if (!f.endsWith(".yaml")) continue;
        const y = fs.readFileSync(path.join(sessionsDir, f), "utf8");
        const id = y.match(/pi_session_id: (oc-[\w]+|null)/)?.[1];
        const state = y.match(/^state: (\w+)/m)?.[1];
        if (!id || id === "null") continue;
        const t = await pollTokens(id);
        if (t < 0) row.agents[f] = "POLL_FAIL";
        else {
          row.agents[f] = `${state}:${t}`;
          row.total += t;
        }
      }
    }
    // worktree 文件数
    const wt = `/tmp/picode-dogfood/.picode/worktrees/${RUN_ID}`;
    if (fs.existsSync(wt)) {
      row.worktrees = execSync(`find ${wt} -type f -name "*.ts" | wc -l`, { encoding: "utf8" }).trim();
    }
    // 任务/合并状态
    const st = cli("status");
    if (st && !st.error) {
      row.tasks = {
        chunks: st.chunks?.map((c) => `${c.id}:${c.status}`) ?? [],
        merge_queue: st.mergeQueue ?? 0,
      };
    }
  } catch (e) {
    row.error = String(e.message).slice(0, 200);
  }

  fs.appendFileSync(LOG, JSON.stringify(row) + "\n");

  // 停止判定：全体 tokens 连续 3 轮零增长
  if (row.total === stale.tokens && row.total > 0) {
    stale.rounds++;
  } else {
    stale.rounds = 0;
  }
  stale.tokens = row.total;
  if (stale.rounds >= 3 && row.agents && Object.keys(row.agents).length > 0) {
    fs.appendFileSync(LOG, `[supervise] STOPPED: all agents idle ${stale.rounds*5}min tokens=${row.total}\n`);
    console.log("STOPPED");
    process.exit(0);
  }

  await new Promise((r) => setTimeout(r, INTERVAL));
}
