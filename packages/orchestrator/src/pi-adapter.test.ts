import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import {
  buildPiEnv,
  makeSpawner,
  piPidOf,
  sleepWithPi,
  wakeWithPi,
  type PiHandle,
} from "./pi-adapter.js";

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-test-" });
  return dir;
}

/** Long-running mock "Pi" process. */
function writeMockPi(): string {
  const p = path.join(os.tmpdir(), `mock-pi-${process.pid}.mjs`);
  fs.writeFileSync(
    p,
    `import fs from "node:fs";\n` +
      `import path from "node:path";\n` +
      `fs.mkdirSync(process.env.PICODE_TRANSCRIPT_DIR, { recursive: true });\n` +
      `fs.writeFileSync(path.join(process.env.PICODE_TRANSCRIPT_DIR, "mock-env.json"), JSON.stringify({ agent: process.env.PICODE_AGENT_ID, room: process.env.PICODE_ROOM, profile: process.env.PICODE_TOOL_PROFILE }));\n` +
      `setInterval(() => {}, 1000);\n`,
  );
  return p;
}

function setup(opts: { piEnabled?: boolean; command?: string }) {
  const repo = tmpGitRepo();
  // role templates live at <repo>/.picode/agents/<role>.md
  fs.mkdirSync(path.join(repo, ".picode", "agents"), { recursive: true });
  for (const role of ["pm", "ind-res", "run-lead"]) {
    fs.writeFileSync(path.join(repo, ".picode", "agents", `${role}.md`), `# ${role} template\n`);
  }
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  const mock = writeMockPi();
  const cmd = opts.command ?? `node ${mock}`;
  fs.writeFileSync(
    path.join(dir, "config.override.yaml"),
    `pi:\n  enabled: ${opts.piEnabled ?? true}\n  command_template: "${cmd}"\n`,
  );
  const config = loadConfig(repo, runId);
  return { repo, runId, dir, config, store: new SessionStore(dir), mock };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("buildPiEnv carries token/profile/room/persona/transcript (18 phase C)", () => {
  const { dir, config } = setup({});
  const store = new SessionStore(dir);
  const session = store.get("pm")!;
  const env = buildPiEnv(dir, config, session);
  assert.ok(env.PICODE_AGENT_TOKEN.length >= 32, "token issued");
  assert.equal(env.PICODE_TOOL_PROFILE, "product.pm");
  assert.equal(env.PICODE_ROOM, "product");
  assert.ok(env.PICODE_TRANSCRIPT_DIR.endsWith(path.join("runs", path.basename(dir), "transcripts")) || env.PICODE_TRANSCRIPT_DIR.includes("transcripts"));
  assert.ok(env.PICODE_PERSONA.endsWith(path.join(".picode", "agents", "pm.md")));
  assert.equal(env.PICODE_AGENT_ID, "pm");
  assert.equal(env.PICODE_RUN_ALLOWLIST, JSON.stringify(config.run_allowlist), "ERR-05: allowlist 注入");
});

test("buildPiEnv: task seat cwd falls back to repo root before prepare (ERR-03)", () => {
  const { dir, config } = setup({});
  const store = new SessionStore(dir);
  const seat = store.register("engineer", { agentId: "engineer@task-x", initialState: "sleeping" });
  // 未 prepare：回退克隆根
  const env = buildPiEnv(dir, config, seat);
  assert.equal(env.PICODE_CWD, path.resolve(dir, "../.."));
});

test("DoD: wake spawns a live Pi process; sleep exits it and returns to sleeping", async () => {
  const { dir, config } = setup({});
  const { session, pi } = await wakeWithPi(dir, config, "ind-res", "intake");
  assert.ok(pi, "pi handle expected when enabled");
  assert.equal(session.state, "awake");
  assert.equal(session.pi_session_id, `pid-${pi!.pid}`);
  const pid = piPidOf(session.pi_session_id!);
  assert.equal(pid, pi!.pid);
  assert.ok(alive(pid), "pi process must be alive after wake");

  const after = await sleepWithPi(dir, config, "ind-res", "done");
  assert.equal(after.state, "sleeping");
  assert.equal(after.pi_session_id, null);
  // give the group signal a moment; SIGTERM on detached group
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(alive(pid), false, "pi process must be gone after sleep");
});

test("spawn failure writes session.error and rolls back to sleeping", async () => {
  const { dir, config, store } = setup({ command: "definitely-not-a-real-command-xyz" });
  await assert.rejects(
    () => wakeWithPi(dir, config, "pm", "intake"),
    (e: unknown) => (e as { code?: string }).code === "PI_SPAWN_FAILED",
  );
  const s = store.get("pm")!;
  assert.equal(s.state, "sleeping");
  assert.match(s.error ?? "", /pi spawn failed/);
});

test("mock Pi received env (transcript dir) — end to end through the adapter", async () => {
  const { dir, config, store, mock } = setup({});
  const { pi } = await wakeWithPi(dir, config, "run-lead", "run-created");
  // wait for mock to write its probe
  const probe = path.join(dir, "transcripts", "mock-env.json");
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(probe) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(fs.existsSync(probe), "mock pi should have written transcript probe");
  const probeJson = JSON.parse(fs.readFileSync(probe, "utf8"));
  assert.equal(probeJson.agent, "run-lead");
  assert.equal(probeJson.room, "leadership");
  assert.equal(probeJson.profile, "governance.run-lead");

  await sleepWithPi(dir, config, "run-lead", "done");
  if (pi) {
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(alive(pi.pid), false);
  }
  // transcript dir retained after sleep (memory pointer preserved)
  assert.ok(fs.existsSync(path.join(dir, "transcripts")));
  void store;
  void mock;
});

test("pi disabled: wake is state-only, no process", async () => {
  const { dir, config } = setup({ piEnabled: false });
  const { session, pi } = await wakeWithPi(dir, config, "pm", "intake");
  assert.equal(pi, null);
  assert.equal(session.state, "awake");
  assert.equal(session.pi_session_id, null);
});

test("spawner stop is idempotent and tolerant of missing pids", () => {
  const { config } = setup({});
  const spawner = makeSpawner(config);
  const fake: PiHandle = { pid: 999999, pi_session_id: "pid-999999" };
  assert.doesNotThrow(() => spawner.stop(fake));
});
