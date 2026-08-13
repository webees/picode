import { test } from "node:test";
import { gitInit } from "../test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRun, resolveRunDir } from "../run-store.js";
import { SessionStore } from "../session-store.js";

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../dist/cli.js",
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

/** opencode serve mock 的脚本（跑在独立子进程：请求日志写文件，/message 返回 parts）。 */
function serveScript(logFile: string): string {
  return `const fs=require("node:fs");const http=require("node:http");
const s=http.createServer((req,res)=>{req.resume();req.on("end",()=>{
  fs.appendFileSync(${JSON.stringify(logFile)},req.method+" "+req.url+"\\n");
  res.setHeader("Content-Type","application/json");
  if(req.method==="POST"&&req.url.includes("/message")){res.end(JSON.stringify({info:{},parts:[{type:"text",text:"ack"}]}))}else{res.end(JSON.stringify({ok:true}))}
})});
s.listen(0,"127.0.0.1",()=>console.log("PORT "+s.address().port));`;
}

/**
 * 把 serve mock 启动为独立 node 子进程（NOT in the test process）——
 * 同步 execFileSync 会阻塞宿主进程事件循环，宿主内联 server 将无法响应 CLI 子进程
 * （死锁）；独立进程自带事件循环，CLI 的 fetch 才能命中。
 */
async function startServeProcess(tmpDir: string): Promise<{
  port: number;
  logFile: string;
  kill: () => void;
}> {
  const logFile = path.join(tmpDir, "serve.log");
  const child: ChildProcess = spawn(process.execPath, ["-e", serveScript(logFile)], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const port = await new Promise<number>((resolve, reject) => {
    let buf = "";
    child.stdout?.on("data", (d: Buffer) => {
      buf += String(d);
      const m = /PORT (\d+)/.exec(buf);
      if (m) resolve(Number(m[1]));
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!/PORT /.test(buf)) reject(new Error(`serve subprocess exited ${code}`));
    });
  });
  return {
    port,
    logFile,
    kill: () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    },
  };
}

function messagePosts(logFile: string): string[] {
  if (!fs.existsSync(logFile)) return [];
  return fs
    .readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .filter((l) => l.includes("POST") && l.includes("/message"));
}

/** 造一个含 run 的 git 仓库，opencode.base_url 指向独立 serve mock 进程。 */
async function setupCliRun(): Promise<{
  repo: string;
  runId: string;
  dir: string;
  store: SessionStore;
  logFile: string;
  closeServe: () => void;
}> {
  const repo = gitInit({ prefix: "picode-cont-cli-" });
  fs.writeFileSync(path.join(repo, "README.md"), "# t\n");
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: repo });

  const serve = await startServeProcess(repo);

  fs.mkdirSync(path.join(repo, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".picode", "config.yaml"),
    [
      "opencode:",
      `  enabled: true`,
      `  base_url: http://127.0.0.1:${serve.port}`,
      "  provider_id: opencode-go",
      "  model_id: deepseek-v4-flash",
      "self_evolve:",
      "  continuation:",
      "    max_per_session: 5",
      "    idle_sec: 60",
      "",
    ].join("\n"),
  );

  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  return { repo, runId, dir, store: new SessionStore(dir), logFile: serve.logFile, closeServe: serve.kill };
}

/** awake oc- 会话 + 回拨 last_wake_at（空闲超 idle_sec）。 */
async function idleAwakeOcSession(
  store: SessionStore,
  dir: string,
  agentId: string,
  sesId: string,
): Promise<void> {
  store.register("engineer", { agentId, initialState: "sleeping" });
  await store.wake(agentId, "test");
  await store.attachPiSession(agentId, `oc-${sesId}`);
  const rec = store.get(agentId)!;
  rec.last_wake_at = new Date(Date.now() - 600_000).toISOString();
  const YAML = (await import("yaml")).default;
  fs.writeFileSync(path.join(dir, "sessions", `${agentId}.yaml`), YAML.stringify(rec));
}

test("C2-d: continuation --status 只读输出候选，不投喂不写状态", async () => {
  const { repo, runId, dir, store, logFile, closeServe } = await setupCliRun();
  try {
    await idleAwakeOcSession(store, dir, "engineer@task-cont-cli", "ses_c2d1");
    if (fs.existsSync(logFile)) fs.rmSync(logFile);

    const { status, stdout } = runCli([
      "self-drive", "continuation", "--status",
      "--repo", repo, "--run", runId,
    ]);
    assert.equal(status, 0, stdout);
    const out = JSON.parse(stdout) as { count: number; targets: Array<{ agent_id: string }> };
    assert.equal(out.count, 1);
    assert.deepEqual(out.targets, [
      { agent_id: "engineer@task-cont-cli", session_id: "oc-ses_c2d1" },
    ]);
    assert.deepEqual(messagePosts(logFile), [], "--status 只读：不得 POST /message");
    assert.equal(
      store.get("engineer@task-cont-cli")!.budget?.continuations ?? 0,
      0,
      "--status 不得写计数",
    );
  } finally {
    closeServe();
  }
});

test("C2-d: continuation --feed 投喂 1 次并计数（budget.continuations +1）", async () => {
  const { repo, runId, dir, store, logFile, closeServe } = await setupCliRun();
  try {
    await idleAwakeOcSession(store, dir, "engineer@task-cont-cli", "ses_c2d2");

    const { status, stdout } = runCli([
      "self-drive", "continuation", "--feed", "engineer@task-cont-cli",
      "--repo", repo, "--run", runId,
    ]);
    assert.equal(status, 0, stdout);
    const out = JSON.parse(stdout) as { fed: boolean; continuations_used: number };
    assert.equal(out.fed, true);
    assert.equal(out.continuations_used, 1);

    assert.deepEqual(messagePosts(logFile), ["POST /session/ses_c2d2/message"]);

    const rec = store.get("engineer@task-cont-cli")!;
    assert.equal(rec.budget?.continuations, 1, "投喂成功必须计数 +1 并持久化");

    const tx = path.join(dir, "transcripts", "engineer@task-cont-cli.jsonl");
    assert.ok(fs.existsSync(tx), "投喂必须写转录");
  } finally {
    closeServe();
  }
});

test("C2-d: continuation --feed 对非 awake / 非 opencode 会话返回 fed:false 不计数", async () => {
  const { repo, runId, store, logFile, closeServe } = await setupCliRun();
  try {
    store.register("engineer", { agentId: "engineer-sleeping", initialState: "sleeping" });

    const { status, stdout } = runCli([
      "self-drive", "continuation", "--feed", "engineer-sleeping",
      "--repo", repo, "--run", runId,
    ]);
    assert.equal(status, 0, stdout);
    const out = JSON.parse(stdout) as { fed: boolean; reason: string };
    assert.equal(out.fed, false);
    assert.match(out.reason, /not-awake-or-not-opencode-session/);
    assert.deepEqual(messagePosts(logFile), [], "非投喂目标不得 POST");
    assert.equal(store.get("engineer-sleeping")!.budget?.continuations ?? 0, 0);
  } finally {
    closeServe();
  }
});
