import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readYamlFile, writeYamlFile } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import { READY_MESSAGE_TEXT } from "./opencode-adapter.js";
import { CONTINUATION_PROMPT } from "./continuation.js";
import { SUMMARY_STRIP_NOISE } from "./summary-noise.js";
import {
  CHECKPOINT_NOISE,
  CHECKPOINT_SCHEMA_VERSION,
  DEFAULT_CHECKPOINT_BOUNDARY,
  GUARDIAN_CHECKPOINT_BOUNDARY,
  PRE_MERGE_CHECKPOINT_BOUNDARY,
  captureDueGuardianCheckpoints,
  captureTaskCheckpoint,
  checkpointDigest,
  deriveTaskCheckpoint,
  guardianCaptureDue,
  latestTaskCheckpoint,
  listCheckpointTasks,
  listTaskCheckpoints,
} from "./checkpoint-store.js";

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/cli.js",
);

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

const TASK_TRIAD = {
  "squad-lead": "squad-lead@task-x",
  engineer: "engineer@task-x",
  sdet: "sdet@task-x",
};

function setupRun() {
  const repo = gitInit({ prefix: "picode-cp-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  return { repo, runId, dir, config, store };
}

function writeTask(dir: string, taskId: string, status = "assigned"): void {
  const taskDir = path.join(dir, "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  writeYamlFile(path.join(taskDir, "task.yaml"), {
    id: taskId,
    chunk_id: "chunk-x",
    goal_id: "goal-1",
    kind: "implement",
    status,
    write_paths: ["packages/**"],
    read_paths: [],
    acceptance: [],
    triad: TASK_TRIAD,
    work_room: `squad-${taskId}`,
    retries: 0,
    max_retries: 3,
  });
}

async function registerTriadSessions(store: SessionStore): Promise<void> {
  for (const agentId of Object.values(TASK_TRIAD)) {
    store.register("engineer", { agentId, initialState: "sleeping" });
  }
}

/** 直改 session.yaml（预算等）。 */
function patchSession(dir: string, agentId: string, patch: Record<string, unknown>): void {
  const p = path.join(dir, "sessions", `${agentId}.yaml`);
  const rec = readYamlFile<Record<string, unknown>>(p)!;
  writeYamlFile(p, { ...rec, ...patch });
}

/** 追加一条转录记录（可控 ts）。 */
function appendTranscript(
  dir: string,
  agentId: string,
  ts: Date,
  entry: Record<string, unknown>,
): void {
  const p = path.join(dir, "transcripts", `${agentId}.jsonl`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(
    p,
    JSON.stringify({ schema_version: "1", agent_id: agentId, ts: ts.toISOString(), ...entry }) + "\n",
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// C1-b：捕获内容正确（task_status / sessions state+budget / 摘要剔噪 / git 指纹）
// ---------------------------------------------------------------------------

test("C1-b: captureTaskCheckpoint 捕获内容正确（task_status + 三角会话 + 剔噪摘要 + git 指纹 + 自指纹）", async () => {
  const { dir, store } = setupRun();
  writeTask(dir, "task-x", "assigned");
  void registerTriadSessions(store);
  patchSession(dir, "engineer@task-x", { budget: { turns: 2, continuations: 3 } });

  const now = new Date("2026-08-14T00:00:00.000Z");
  // 机械投喂噪音（outgoing）→ 应被 strip 跳过；真实响应（incoming）→ 保留
  appendTranscript(dir, "engineer@task-x", now, {
    type: "outgoing",
    text: `${READY_MESSAGE_TEXT}\n${CONTINUATION_PROMPT}`,
  });
  appendTranscript(dir, "engineer@task-x", new Date(now.getTime() + 1000), {
    type: "incoming",
    parts: [{ type: "text", text: "模块 A 完成，验收通过" }],
  });

  const r = captureTaskCheckpoint(dir, "task-x", { now });
  assert.ok(r, "task 存在必须捕获成功");
  const cp = r.checkpoint;
  assert.deepEqual(CHECKPOINT_NOISE, [READY_MESSAGE_TEXT, CONTINUATION_PROMPT], "剔噪口径必须与 feed 路径一致");
  assert.deepEqual(CHECKPOINT_NOISE, [...SUMMARY_STRIP_NOISE], "D092：checkpoint 剔噪必须统一消费 SUMMARY_STRIP_NOISE");
  assert.equal(cp.schema_version, CHECKPOINT_SCHEMA_VERSION);
  assert.equal(cp.task_id, "task-x");
  assert.equal(cp.captured_at, now.toISOString());
  assert.equal(cp.boundary, DEFAULT_CHECKPOINT_BOUNDARY);
  assert.equal(cp.task_status, "assigned");

  // 三角会话快照：顺序 = triad 座席序，state + budget 取自 session.yaml
  assert.deepEqual(
    cp.sessions.map((s) => s.agent_id),
    ["squad-lead@task-x", "engineer@task-x", "sdet@task-x"],
  );
  const eng = cp.sessions.find((s) => s.agent_id === "engineer@task-x")!;
  assert.equal(eng.state, "sleeping");
  assert.deepEqual(eng.budget, { turns: 2, continuations: 3 });

  // 摘要：剔噪后保留真实响应、机械模板句不入摘要
  assert.equal(cp.transcript_summaries.length, 3);
  const engSummary = cp.transcript_summaries.find((s) => s.agent_id === "engineer@task-x")!.summary;
  assert.ok(engSummary, "有真实响应的转录必须产出摘要");
  assert.ok(engSummary.includes("模块 A 完成，验收通过"));
  assert.ok(!engSummary.includes("你已就绪"), "READY_MESSAGE_TEXT 噪音必须被 strip");
  assert.ok(!engSummary.includes("检测到本会话已空闲"), "CONTINUATION_PROMPT 噪音必须被 strip");
  assert.ok(!engSummary.includes("投喂:"), "机械投喂被剔空后不得出现投喂要点行");
  assert.ok(
    cp.transcript_summaries.every((s) => s.agent_id !== "engineer@task-x" || s.summary !== null),
  );

  // git 工作树指纹：64 位 hex（sha256），非 null（在 git 仓库内）
  assert.ok(cp.git.fingerprint !== null, "git 仓库内必须产出指纹");
  assert.match(cp.git.fingerprint, /^[0-9a-f]{64}$/);

  // 自指纹 = 对排除 sha256 的其余内容做 sha256
  const { sha256, ...rest } = cp;
  assert.equal(sha256, checkpointDigest(rest));

  // 落盘文件存在且可读回
  assert.ok(fs.existsSync(r.file), "checkpoint 必须落盘");
  const roundtrip = readYamlFile<typeof cp>(r.file)!;
  assert.equal(roundtrip.task_id, "task-x");
  assert.equal(roundtrip.sha256, sha256);
});

test("C1-b: 注入相同 now + 未变文件 → 两次捕获内容逐字节一致（纯函数、确定性）", async () => {
  const { dir, store } = setupRun();
  writeTask(dir, "task-x", "assigned");
  void registerTriadSessions(store);
  const now = new Date("2026-08-14T00:00:00.000Z");
  appendTranscript(dir, "engineer@task-x", now, {
    type: "incoming",
    parts: [{ type: "text", text: "模块 A 完成" }],
  });

  const a = captureTaskCheckpoint(dir, "task-x", { now })!;
  const b = captureTaskCheckpoint(dir, "task-x", { now })!;
  assert.deepEqual(a.checkpoint, b.checkpoint, "同输入必须同输出（内容逐字节一致）");
  const fileA = fs.readFileSync(a.file, "utf8");
  const fileB = fs.readFileSync(b.file, "utf8");
  assert.equal(fileA, fileB, "落盘内容必须逐字节一致");
});

// ---------------------------------------------------------------------------
// C1-c：task 缺失 → null；两次捕获不同 ts 文件且首文件不被覆盖；list 倒序/latest
// ---------------------------------------------------------------------------

test("C1-c: task 不存在 → capture 返回 null（且不产生目录）", async () => {
  const { dir } = setupRun();
  const now = new Date("2026-08-14T00:00:00.000Z");
  assert.equal(captureTaskCheckpoint(dir, "task-missing", { now }), null);
  assert.equal(deriveTaskCheckpoint(dir, "task-missing", { now }), null);
  assert.ok(!fs.existsSync(path.join(dir, "checkpoints")), "缺失 task 不得产生 checkpoint 目录");
});

test("C1-c: 两次捕获为不同 ts 文件且首文件不被覆盖（不可变）；list 倒序、latest 取最新", async () => {
  const { dir, store } = setupRun();
  writeTask(dir, "task-x", "assigned");
  void registerTriadSessions(store);

  const t1 = new Date("2026-08-14T00:00:00.000Z");
  const t2 = new Date("2026-08-14T00:00:05.000Z");
  const first = captureTaskCheckpoint(dir, "task-x", { now: t1 })!;
  const firstBytes = fs.readFileSync(first.file, "utf8");
  const second = captureTaskCheckpoint(dir, "task-x", { now: t2 })!;

  assert.notEqual(first.file, second.file, "不同 ts 必须落不同文件");
  assert.ok(fs.existsSync(first.file), "首文件不得被覆盖删除");
  assert.equal(fs.readFileSync(first.file, "utf8"), firstBytes, "首文件内容不得被改写");

  const all = listTaskCheckpoints(dir, "task-x");
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((c) => c.captured_at),
    [t2.toISOString(), t1.toISOString()],
    "list 必须按 ts 倒序（最新在前）",
  );
  assert.equal(latestTaskCheckpoint(dir, "task-x")!.captured_at, t2.toISOString());
});

// ---------------------------------------------------------------------------
// C1-d：非 git 仓库 / git 失败 → git.fingerprint null（容错不抛）；
//        转录损坏 → 摘要回退 null 不阻断捕获
// ---------------------------------------------------------------------------

test("C1-d: 非 git 仓库 → git.fingerprint null，捕获不抛", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-cp-nongit-"));
  writeTask(dir, "task-x", "queued");
  const now = new Date("2026-08-14T00:00:00.000Z");
  const r = captureTaskCheckpoint(dir, "task-x", { now });
  assert.ok(r, "非 git 仓库也必须捕获成功");
  assert.equal(r.checkpoint.git.fingerprint, null);
  assert.equal(r.checkpoint.task_status, "queued");
  assert.deepEqual(r.checkpoint.sessions, [], "无会话文件 → sessions 为空");
  assert.deepEqual(
    r.checkpoint.transcript_summaries.map((s) => s.agent_id),
    ["squad-lead@task-x", "engineer@task-x", "sdet@task-x"],
  );
  assert.ok(
    r.checkpoint.transcript_summaries.every((s) => s.summary === null),
    "无转录 → 摘要 null",
  );
});

test("C1-d: 转录损坏 → 摘要回退 null，不阻断捕获（其余字段完整）", async () => {
  const { dir, store } = setupRun();
  writeTask(dir, "task-x", "assigned");
  void registerTriadSessions(store);
  const p = path.join(dir, "transcripts", "engineer@task-x.jsonl");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "{not-valid-json}\n", "utf8");

  const now = new Date("2026-08-14T00:00:00.000Z");
  const r = captureTaskCheckpoint(dir, "task-x", { now });
  assert.ok(r, "转录损坏不得阻断捕获");
  const eng = r.checkpoint.transcript_summaries.find((s) => s.agent_id === "engineer@task-x")!;
  assert.equal(eng.summary, null, "损坏转录摘要必须回退 null");
  assert.equal(r.checkpoint.sessions.length, 3, "会话快照不受转录损坏影响");
  assert.match(r.checkpoint.sha256, /^[0-9a-f]{64}$/, "捕获仍必须产出完整自指纹");
});

// ---------------------------------------------------------------------------
// C1-e：CLI — --help 命令表含 checkpoint capture/status；capture 落盘可被 status 读到
// ---------------------------------------------------------------------------

test("C1-e: --help 命令表含 checkpoint capture / checkpoint status（D074 断言模式）", async () => {
  const { status, stdout } = runCli(["--help"]);
  assert.equal(status, 0);
  assert.ok(stdout.includes("checkpoint:"), "help shows checkpoint group");
  assert.ok(stdout.includes("picode checkpoint capture"), "help lists checkpoint capture");
  assert.ok(stdout.includes("picode checkpoint status"), "help lists checkpoint status");
});

test("C1-e: capture 落盘后 status --task 可读到最新 checkpoint；缺失 task 报 NOT_FOUND", async () => {
  const repo = gitInit({ prefix: "picode-cp-cli-" });
  const init = runCli(["init", "--repo", repo, "--goal-title", "t"]);
  assert.equal(init.status, 0, init.stderr);
  const { runId } = JSON.parse(init.stdout) as { runId: string };
  const dir = path.join(repo, ".picode", "runs", runId);

  writeTask(dir, "task-x", "assigned");
  const store = new SessionStore(dir);
  void registerTriadSessions(store);

  const captured = runCli(["checkpoint", "capture", "--repo", repo, "--run", runId, "--task", "task-x"]);
  assert.equal(captured.status, 0, captured.stderr);
  const out = JSON.parse(captured.stdout) as {
    file: string;
    checkpoint: { task_id: string; task_status: string; sha256: string };
  };
  assert.ok(fs.existsSync(out.file), "capture 必须落盘");
  assert.equal(out.checkpoint.task_id, "task-x");
  assert.equal(out.checkpoint.task_status, "assigned");

  const listed = runCli(["checkpoint", "status", "--repo", repo, "--run", runId, "--task", "task-x"]);
  assert.equal(listed.status, 0, listed.stderr);
  const status = JSON.parse(listed.stdout) as {
    task_id: string;
    count: number;
    latest: { task_id: string; sha256: string };
  };
  assert.equal(status.task_id, "task-x");
  assert.equal(status.count, 1);
  assert.equal(status.latest.task_id, "task-x");
  assert.equal(status.latest.sha256, out.checkpoint.sha256, "status 必须读到刚捕获的 checkpoint");

  const missing = runCli(["checkpoint", "capture", "--repo", repo, "--run", runId, "--task", "task-nope"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^\[picode\] ERROR: NOT_FOUND: task not found: task-nope/);

  // 缺省（无 --task）：列出全部有 checkpoint 的 task
  const all = runCli(["checkpoint", "status", "--repo", repo, "--run", runId]);
  assert.equal(all.status, 0, all.stderr);
  const tasks = (JSON.parse(all.stdout) as { tasks: Array<{ task_id: string; count: number }> }).tasks.map(
    (t) => ({ task_id: t.task_id, count: t.count }),
  );
  assert.deepEqual(tasks, [{ task_id: "task-x", count: 1 }], "listCheckpointTasks 必须汇总出刚捕获的 task");
  assert.deepEqual(
    listCheckpointTasks(dir).map((t) => ({ task_id: t.task_id, count: t.count })),
    [{ task_id: "task-x", count: 1 }],
    "listCheckpointTasks 函数与 CLI 输出一致",
  );
});

// ---------------------------------------------------------------------------
// C1 checkpoint-auto（task-checkpoint-auto）：guardian 周期捕获 + merge 前捕获
// ---------------------------------------------------------------------------

/** 在 chunks.yaml 登记一个 chunk → task 映射（captureDueGuardianCheckpoints 的数据源）。 */
function writeChunk(dir: string, chunkId: string, taskId: string): void {
  const chunksPath = path.join(dir, "chunks.yaml");
  const data = readYamlFile<{ chunks?: Array<Record<string, unknown>> }>(chunksPath)!;
  data.chunks!.push({ id: chunkId, task_id: taskId, status: "ready" });
  writeYamlFile(chunksPath, data);
}

test("C1 checkpoint-auto: 边界常量导出（guardian / pre_merge）", async () => {
  assert.equal(GUARDIAN_CHECKPOINT_BOUNDARY, "guardian");
  assert.equal(PRE_MERGE_CHECKPOINT_BOUNDARY, "pre_merge");
});

test("C1 checkpoint-auto: 默认配置（enabled=false）→ 空结果（D082 显式捕获行为不变）", async () => {
  const { dir, config } = setupRun();
  const r = captureDueGuardianCheckpoints(dir, config);
  assert.deepEqual(r, { boundary: GUARDIAN_CHECKPOINT_BOUNDARY, captured: [] });
  assert.ok(!fs.existsSync(path.join(dir, "checkpoints")), "默认关闭不得落任何 checkpoint");
});

test("C1 checkpoint-auto: enabled + interval=0 → 捕获每个非终态已登记 task（boundary=guardian）", async () => {
  const { dir, config, store } = setupRun();
  config.self_evolve.checkpoints.enabled = true;
  config.self_evolve.checkpoints.guardian_interval_sec = 0;
  writeTask(dir, "task-x", "assigned");
  writeTask(dir, "task-y", "queued");
  writeChunk(dir, "chunk-x", "task-x");
  writeChunk(dir, "chunk-y", "task-y");
  void registerTriadSessions(store);

  const now = new Date("2026-08-14T01:00:00.000Z");
  const r = captureDueGuardianCheckpoints(dir, config, { now });
  assert.deepEqual(r, { boundary: GUARDIAN_CHECKPOINT_BOUNDARY, captured: ["task-x", "task-y"] });
  for (const taskId of ["task-x", "task-y"]) {
    const cps = listTaskCheckpoints(dir, taskId);
    assert.equal(cps.length, 1, `${taskId} 必须恰好捕获一次`);
    assert.equal(cps[0].boundary, GUARDIAN_CHECKPOINT_BOUNDARY, `${taskId} 边界必须为 guardian`);
  }
});

test("C1 checkpoint-auto: 终态 task（merged）跳过不捕获", async () => {
  const { dir, config, store } = setupRun();
  config.self_evolve.checkpoints.enabled = true;
  config.self_evolve.checkpoints.guardian_interval_sec = 0;
  writeTask(dir, "task-x", "merged");
  writeChunk(dir, "chunk-x", "task-x");
  void registerTriadSessions(store);
  const r = captureDueGuardianCheckpoints(dir, config, { now: new Date("2026-08-14T01:00:00.000Z") });
  assert.deepEqual(r.captured, []);
  assert.ok(!fs.existsSync(path.join(dir, "checkpoints")), "终态任务不得捕获");
});

test("C1 checkpoint-auto: 节流 —— interval=600 首次捕获、立即重跑跳过、超间隔再捕获", async () => {
  const { dir, config, store } = setupRun();
  config.self_evolve.checkpoints.enabled = true;
  config.self_evolve.checkpoints.guardian_interval_sec = 600;
  writeTask(dir, "task-x", "assigned");
  writeChunk(dir, "chunk-x", "task-x");
  void registerTriadSessions(store);

  const t0 = new Date("2026-08-14T01:00:00.000Z");
  const first = captureDueGuardianCheckpoints(dir, config, { now: t0 });
  assert.deepEqual(first.captured, ["task-x"], "从未捕获 → due");

  const second = captureDueGuardianCheckpoints(dir, config, { now: t0 });
  assert.deepEqual(second.captured, [], "距上次捕获不足 600s → 跳过");

  const t1 = new Date(t0.getTime() + 601_000);
  const third = captureDueGuardianCheckpoints(dir, config, { now: t1 });
  assert.deepEqual(third.captured, ["task-x"], "超过 600s → 再次捕获");
  assert.equal(listTaskCheckpoints(dir, "task-x").length, 2, "不可变：两次捕获两个 ts 文件");
});

test("C1 checkpoint-auto: 无 task.yaml → 跳过不崩溃", async () => {
  const { dir, config } = setupRun();
  config.self_evolve.checkpoints.enabled = true;
  config.self_evolve.checkpoints.guardian_interval_sec = 0;
  writeChunk(dir, "chunk-ghost", "task-ghost");
  const r = captureDueGuardianCheckpoints(dir, config, { now: new Date("2026-08-14T01:00:00.000Z") });
  assert.deepEqual(r.captured, []);
});

test("C1 checkpoint-auto: guardianCaptureDue 纯函数（interval=0 恒 due；从未捕获 → due；pre_merge 不重置时钟）", async () => {
  const { dir, store } = setupRun();
  writeTask(dir, "task-x", "assigned");
  void registerTriadSessions(store);
  const now = new Date("2026-08-14T01:00:00.000Z");
  // 无 checkpoint → due（interval 任意）
  assert.equal(guardianCaptureDue(dir, "task-x", 600, now), true, "从未捕获 → due");
  // 捕获一次（boundary=guardian）后：interval=0 → 恒 due
  captureTaskCheckpoint(dir, "task-x", { now, boundary: GUARDIAN_CHECKPOINT_BOUNDARY });
  assert.equal(guardianCaptureDue(dir, "task-x", 0, now), true, "interval=0 → 恒 due");
  // interval=600：同 now → 不足 → false；now+601s → true
  assert.equal(guardianCaptureDue(dir, "task-x", 600, now), false);
  assert.equal(guardianCaptureDue(dir, "task-x", 600, new Date(now.getTime() + 601_000)), true);
  // 非 guardian 边界（pre_merge）不参与 guardian 节流
  captureTaskCheckpoint(dir, "task-x", { now: new Date(now.getTime() + 1000), boundary: PRE_MERGE_CHECKPOINT_BOUNDARY });
  assert.equal(guardianCaptureDue(dir, "task-x", 600, now), false, "pre_merge 捕获不得重置 guardian 时钟");
});

test("C1 checkpoint-auto: merge 前捕获边界 → boundary=pre_merge", async () => {
  const { dir, store } = setupRun();
  writeTask(dir, "task-x", "assigned");
  void registerTriadSessions(store);
  const now = new Date("2026-08-14T01:00:00.000Z");
  const r = captureTaskCheckpoint(dir, "task-x", { now, boundary: PRE_MERGE_CHECKPOINT_BOUNDARY });
  assert.ok(r, "pre_merge 捕获必须成功");
  assert.equal(r.checkpoint.boundary, PRE_MERGE_CHECKPOINT_BOUNDARY);
});
