import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask } from "./task.js";
import { SessionStore } from "./session-store.js";
import { deriveSuperviseObservation, isIdleStopped } from "./supervise.js";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "supervise-test-", email: "t@picode", name: "t" });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

/** Mock serve: return per-agent token totals keyed by serve session id. */
function fakeServe(totals: Record<string, number>): typeof fetch {
  return (async (url: string) => {
    const id = url.split("/session/")[1]?.split("/")[0] ?? "";
    const total = totals[id];
    if (total === undefined) throw new Error("serve down");
    return {
      ok: true,
      json: async () => [
        { info: { role: "assistant", tokens: { total }, time: { created: 3 } } },
      ],
    };
  }) as unknown as typeof fetch;
}

async function awakeEngineer(dir: string): Promise<void> {
  const store = new SessionStore(dir);
  store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  await store.wake("engineer@task-x", "test");
  await store.attachPiSession("engineer@task-x", "oc-ses_supervise");
}

function addWorktreeFiles(repo: string, runId: string): string {
  const root = path.join(repo, ".picode", "worktrees", runId, "task-x", "src");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(root, "b.ts"), "export const b = 2;\n");
  fs.writeFileSync(path.join(root, "c.js"), "module.exports = {};\n");
  return root;
}

test("D093: deriveSuperviseObservation shape — agents/total/worktrees/tasks/merge_queue", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-supervise", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["a"]);
  setGoalStatus(dir, "active");
  addChunkAndTask(repo, dir, config, { chunkId: "chunk-a", writePaths: ["src/a/**"] });
  await awakeEngineer(dir);
  addWorktreeFiles(repo, runId);

  const fetchImpl = fakeServe({ ses_supervise: 1200 });
  const now = () => new Date("2026-08-14T00:00:00.000Z");
  const obs = await deriveSuperviseObservation(dir, config, { now, fetchImpl });

  assert.equal(obs.ts, "2026-08-14T00:00:00.000Z");
  assert.equal(obs.run_id, runId);
  assert.equal(obs.goal_status, "active");
  assert.ok(Array.isArray(obs.agents));
  assert.ok(Array.isArray(obs.tasks));
  assert.equal(typeof obs.merge_queue.queued, "number");

  const eng = obs.agents.find((a) => a.agent_id === "engineer@task-x");
  assert.ok(eng, "awake engineer appears in agents");
  assert.equal(eng!.state, "awake");
  assert.equal(eng!.tokens, 1200);
  assert.equal(obs.total, 1200, "total = awake tokens sum");
  const sleeping = obs.agents.find((a) => a.agent_id === "pm");
  assert.ok(sleeping, "sleeping platform session appears with tokens null");
  assert.equal(sleeping!.tokens, null);
  assert.equal(obs.worktrees, 2, "counts only .ts files under run worktrees");

  assert.equal(obs.tasks.length, 1);
  assert.equal(obs.tasks[0].task_id, "task-chunk-a");
  assert.deepStrictEqual(
    { queued: obs.merge_queue.queued, merged: obs.merge_queue.merged, failed: obs.merge_queue.failed },
    { queued: 0, merged: 0, failed: 0 },
  );
});

test("D093: POLL_FAIL 会话 tokens=null、不计入 total", async () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-fail", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  await awakeEngineer(dir);
  const throwing = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  const obs = await deriveSuperviseObservation(dir, config, { fetchImpl: throwing });
  const eng = obs.agents.find((a) => a.agent_id === "engineer@task-x");
  assert.ok(eng);
  assert.equal(eng!.tokens, null, "POLL_FAIL → tokens null");
  assert.equal(obs.total, 0, "POLL_FAIL 不计入 total");
});

test("D093: isIdleStopped — 连续 3 轮零增长 → true", () => {
  assert.equal(isIdleStopped([{ total: 100 }, { total: 100 }, { total: 100 }, { total: 100 }]), true);
});

test("D093: isIdleStopped — 样本不足 rounds+1 → false", () => {
  assert.equal(isIdleStopped([{ total: 100 }, { total: 100 }, { total: 100 }]), false);
  assert.equal(isIdleStopped([{ total: 100 }]), false);
  assert.equal(isIdleStopped([]), false);
});

test("D093: isIdleStopped — 中间有增长 → false", () => {
  assert.equal(
    isIdleStopped([{ total: 100 }, { total: 100 }, { total: 150 }, { total: 150 }]),
    false,
  );
  assert.equal(
    isIdleStopped([{ total: 100 }, { total: 100 }, { total: 100 }, { total: 200 }]),
    false,
  );
});

test("D093: isIdleStopped — POLL_FAIL（total=0）不判 idle", () => {
  assert.equal(isIdleStopped([{ total: 0 }, { total: 0 }, { total: 0 }, { total: 0 }]), false);
  const obs = [{ total: 1200 }, { total: 0 }, { total: 0 }, { total: 0 }];
  assert.equal(isIdleStopped(obs), false, "一旦 total 归零（全 POLL_FAIL）不判 STOPPED");
});

test("D093: isIdleStopped — thresholdRounds 容差内微增仍判 stopped", () => {
  assert.equal(
    isIdleStopped([{ total: 100 }, { total: 100 }, { total: 105 }, { total: 105 }], { thresholdRounds: 5 }),
    true,
  );
  assert.equal(
    isIdleStopped([{ total: 100 }, { total: 100 }, { total: 105 }, { total: 105 }], { thresholdRounds: 0 }),
    false,
  );
});

test("D093: isIdleStopped — 自定义 rounds 窗口", () => {
  assert.equal(isIdleStopped([{ total: 100 }, { total: 100 }, { total: 100 }], { rounds: 2 }), true);
  assert.equal(isIdleStopped([{ total: 100 }, { total: 100 }, { total: 100 }], { rounds: 3 }), false);
});
