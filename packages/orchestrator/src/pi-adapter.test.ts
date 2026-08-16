import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, ErrorCode, PicodeError, worktreePath, type SessionRecord } from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore } from "./session-store.js";
import {
  buildPiEnv,
  buildSkillIndex,
  CORE_TOOLS,
  makeSpawner,
  personaDeclaredSkills,
  piPidOf,
  probeCoreTools,
  sleepAgent,
  sleepWithPi,
  terminateAgent,
  wakeAgent,
  wakeWithPi,
  type PiHandle,
} from "./pi-adapter.js";

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
  const repo = gitInit({ prefix: "picode-test-" });
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

test("buildPiEnv carries token/profile/room/persona/transcript (18 phase C)", async () => {
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

test("E: buildPiEnv 注入沙箱/审批/守卫会话 env — 默认值（workspace-write/ask/开）", async () => {
  const { dir, config } = setup({});
  const store = new SessionStore(dir);
  const session = store.get("pm")!;
  const env = buildPiEnv(dir, config, session);
  assert.equal(env.PICODE_SANDBOX_MODE, "workspace-write");
  assert.equal(env.PICODE_APPROVAL_POLICY, "ask");
  assert.equal(env.PICODE_READ_BEFORE_EDIT, "1");
});

test("E: buildPiEnv 透传 operator env 覆盖（会话级配置，不新增 config 键 D104）", async () => {
  const prev: Record<string, string | undefined> = {};
  for (const k of ["PICODE_SANDBOX_MODE", "PICODE_APPROVAL_POLICY", "PICODE_READ_BEFORE_EDIT"]) {
    prev[k] = process.env[k];
  }
  try {
    process.env.PICODE_SANDBOX_MODE = "read-only";
    process.env.PICODE_APPROVAL_POLICY = "never";
    process.env.PICODE_READ_BEFORE_EDIT = "0";
    const { dir, config } = setup({});
    const store = new SessionStore(dir);
    const env = buildPiEnv(dir, config, store.get("pm")!);
    assert.equal(env.PICODE_SANDBOX_MODE, "read-only");
    assert.equal(env.PICODE_APPROVAL_POLICY, "never");
    assert.equal(env.PICODE_READ_BEFORE_EDIT, "0");
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("buildPiEnv: task seat cwd falls back to repo root before prepare (ERR-03)", async () => {
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

test("spawner stop is idempotent and tolerant of missing pids", async () => {
  const { config } = setup({});
  const spawner = makeSpawner(config);
  const fake: PiHandle = { pid: 999999, pi_session_id: "pid-999999" };
  assert.doesNotThrow(() => spawner.stop(fake));
});

test("C2: buildSkillIndex scans skills_root for SKILL.md metadata", async () => {
  const repo = gitInit({ prefix: "picode-test-" });
  const skillDir = path.join(repo, "skills", "engineering", "ponytail");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: ponytail\ndescription: lazy senior dev discipline\n---\n# body\n",
  );
  const index = buildSkillIndex("skills", repo);
  assert.equal(index.length, 1);
  assert.equal(index[0].name, "ponytail");
  assert.equal(index[0].description, "lazy senior dev discipline");
  assert.equal(index[0].path, "skills/engineering/ponytail/SKILL.md");
});

test("C2: buildSkillIndex missing root → empty; SKILL.md without frontmatter skipped", async () => {
  const repo = gitInit({ prefix: "picode-test-" });
  assert.deepEqual(buildSkillIndex("skills", repo), []);
  const bare = path.join(repo, "skills", "bare");
  fs.mkdirSync(bare, { recursive: true });
  fs.writeFileSync(path.join(bare, "SKILL.md"), "# no frontmatter\n");
  assert.deepEqual(buildSkillIndex("skills", repo), []);
});

test("C2: personaDeclaredSkills resolves declared names to indexed paths", async () => {
  const repo = gitInit({ prefix: "picode-test-" });
  const skillDir = path.join(repo, "skills", "engineering", "ponytail");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: ponytail\ndescription: lazy\n---\n# body\n",
  );
  const index = buildSkillIndex("skills", repo);
  const persona = path.join(repo, ".picode", "agents", "engineer.md");
  fs.mkdirSync(path.dirname(persona), { recursive: true });
  fs.writeFileSync(persona, "---\nname: engineer\nskills: [ponytail, ghost]\n---\n");
  assert.deepEqual(personaDeclaredSkills(persona, index), ["skills/engineering/ponytail/SKILL.md"]);
  assert.deepEqual(personaDeclaredSkills(path.join(repo, "missing.md"), index), []);
});

test("C2: buildPiEnv injects skills index + persona-declared skills (role fallback)", async () => {
  const { dir, config } = setup({});
  const repo = path.resolve(dir, "../../..");
  const skillDir = path.join(repo, "skills", "engineering", "ponytail");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: ponytail\ndescription: lazy\n---\n# body\n",
  );
  fs.writeFileSync(
    path.join(repo, ".picode", "agents", "pm.md"),
    "---\nname: pm\nskills: [ponytail]\n---\n",
  );
  const store = new SessionStore(dir);
  const session = store.get("pm")!;
  const env = buildPiEnv(dir, config, session);
  const index = JSON.parse(env.PICODE_SKILLS_INDEX!) as Array<{ name: string; path: string }>;
  assert.equal(index.length, 1);
  assert.equal(index[0].name, "ponytail");
  assert.deepEqual(JSON.parse(env.PICODE_PERSONA_SKILLS!), ["skills/engineering/ponytail/SKILL.md"]);
});

test("I2: sleepAgent 对 oc- 会话不再 DELETE（mock serve 断言零 DELETE 调用）", async () => {
  const repo = gitInit({ prefix: "picode-sleep-oc-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  fs.writeFileSync(
    path.join(dir, "config.override.yaml"),
    `opencode:\n  enabled: true\n  base_url: "http://127.0.0.1:7788"\n`,
  );
  const config = loadConfig(repo, runId);
  const store = new SessionStore(dir);
  // 造一个 awake + oc- 会话（sleep 前已挂 durable 句柄）
  await store.wake("pm", "pre");
  await store.attachPiSession("pm", "oc-ses_keep");

  const calls: Array<{ method: string; url: string }> = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: String(init?.method ?? "GET"), url: String(input) });
    return new Response("true", { status: 200 });
  }) as typeof fetch;
  try {
    const rec = await sleepAgent(dir, config, "pm", "idle");
    assert.equal(rec.state, "sleeping");
    assert.equal(rec.pi_session_id, "oc-ses_keep", "sleep 保留 oc-<id> 持久会话引用");
    assert.equal(calls.length, 0, "sleep 不得调任何 serve API（零 DELETE）");
    assert.equal(
      calls.filter((c) => c.method === "DELETE").length,
      0,
      "I2: sleep 不再 DELETE opencode 会话",
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test("I3: wakeAgent 深度围栏 — delegation_depth > 3 结构化拒绝 SUBAGENT_DEPTH_EXCEEDED", async () => {
  const { dir, config, store } = setup({ piEnabled: false });
  // 工作房 .picode/config.yaml 默认启用 opencode——本测试走纯状态机路（两路都关）
  config.opencode.enabled = false;
  store.register("engineer", {
    agentId: "engineer@task-x",
    initialState: "sleeping",
    depth: 4,
    parentSession: "squad-lead@task-x",
  });
  await assert.rejects(
    () => wakeAgent(dir, config, "engineer@task-x", "event:task_ready"),
    (e: unknown) => {
      assert.ok(e instanceof PicodeError, "must be a coded PicodeError");
      assert.equal(e.code, ErrorCode.SUBAGENT_DEPTH_EXCEEDED);
      assert.match(e.message, /4/, "消息须含当前深度");
      assert.match(e.message, /3/, "消息须含上限");
      return true;
    },
  );
  // 拒绝不改变会话状态（仍在 sleeping，未触碰后端）
  assert.equal(store.get("engineer@task-x")!.state, "sleeping");
  // 深度 3（== 上限）放行——R17 M4 门闩：task 会话唤醒须有真实 worktree
  // （git worktree list 语义：目录 + .git 元数据指向主仓 .git/worktrees），
  // 先按 M4 判定语义建好 worktree 元数据再验证深度放行。
  const repo = path.resolve(dir, "../../..");
  const wtY = worktreePath(repo, config, path.basename(dir), "task-y");
  fs.mkdirSync(path.join(repo, ".git", "worktrees", "task-y"), { recursive: true });
  fs.mkdirSync(wtY, { recursive: true });
  fs.writeFileSync(
    path.join(wtY, ".git"),
    `gitdir: ${path.join(repo, ".git", "worktrees", "task-y")}\n`,
  );
  store.register("engineer", { agentId: "engineer@task-y", initialState: "sleeping", depth: 3 });
  const r3 = (await wakeAgent(dir, config, "engineer@task-y", "wake")) as {
    session: SessionRecord;
    pi: null;
  };
  assert.equal(r3.session.state, "awake");
  // 缺省（顶层会话 depth 缺省 = 0）放行
  const r0 = (await wakeAgent(dir, config, "pm", "intake")) as { session: SessionRecord; pi: null };
  assert.equal(r0.session.state, "awake");
});

test("I2: terminateAgent 保持终态销毁 — DELETE 语义不变 + pi_session_id 清空", async () => {
  const repo = gitInit({ prefix: "picode-term-oc-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  fs.writeFileSync(
    path.join(dir, "config.override.yaml"),
    `opencode:\n  enabled: true\n  base_url: "http://127.0.0.1:7788"\n`,
  );
  const config = loadConfig(repo, runId);
  const store = new SessionStore(dir);
  await store.wake("pm", "pre");
  await store.attachPiSession("pm", "oc-ses_term");

  const calls: Array<{ method: string; url: string }> = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: String(init?.method ?? "GET"), url: String(input) });
    return new Response("true", { status: 200 });
  }) as typeof fetch;
  try {
    const rec = await terminateAgent(dir, config, "pm", "dissolved");
    assert.equal(rec.state, "terminated");
    assert.equal(rec.pi_session_id, null, "terminate 清空平台会话引用（终态销毁）");
    const deletes = calls.filter(
      (c) => c.method === "DELETE" && c.url.includes("/session/ses_term"),
    );
    assert.equal(deletes.length, 1, "terminate 必须 DELETE 服务端会话（终态销毁语义不变）");
  } finally {
    globalThis.fetch = orig;
  }
});

// --- R17 M2: 工具环境探测（probeCoreTools 纯函数 + wakeAgent 接线） ---

/** 临时目录里放一组可执行文件（写 fake 脚本并 chmod +x），模拟 PATH 的目录内容。 */
function mkBinDir(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-bin-"));
  for (const f of files) {
    const p = path.join(dir, f);
    fs.writeFileSync(p, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(p, 0o755);
  }
  return dir;
}

test("R17 M2: probeCoreTools 纯函数 — 空 PATH 全缺失（ok=false + missing 全量清单）", () => {
  const r = probeCoreTools("");
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [...CORE_TOOLS]);
  for (const t of CORE_TOOLS) assert.equal(r.found[t], null);
});

test("R17 M2: probeCoreTools 纯函数 — PATH 命中可执行则解析出路径（ok=true）", () => {
  const bin = mkBinDir([...CORE_TOOLS]);
  const r = probeCoreTools(bin);
  assert.equal(r.ok, true, `missing: ${r.missing.join(",")}`);
  assert.deepEqual(r.missing, []);
  for (const t of CORE_TOOLS) {
    assert.equal(r.found[t], path.join(bin, t), `${t} 应解析到 PATH 内可执行路径`);
  }
});

test("R17 M2: probeCoreTools 纯函数 — 部分缺失模拟（PATH 只含 bash，缺 node/npm/git）", () => {
  const bin = mkBinDir(["bash"]);
  const r = probeCoreTools(bin);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["node", "npm", "git"]);
  assert.equal(r.found.bash, path.join(bin, "bash"));
});

test("R17 M2: probeCoreTools 纯函数 — 目录无可执行位者不计入命中（候选路径注入）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-bin-"));
  // 普通文件（无 X_OK）不得命中
  fs.writeFileSync(path.join(dir, "node"), "#!/bin/sh\nexit 0\n");
  const r = probeCoreTools(dir);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes("node"), "无执行位文件不应被命中");
  // extraCandidates 注入：PATH 为空时从补充候选目录补齐（候选追加语义）
  const extra = mkBinDir(["node", "npm", "git"]);
  const r2 = probeCoreTools("", [extra]);
  assert.equal(r2.found.node, path.join(extra, "node"));
  assert.equal(r2.found.npm, path.join(extra, "npm"));
  assert.equal(r2.found.git, path.join(extra, "git"));
  assert.ok(r2.missing.includes("bash"), "extra 未覆盖的 bash 仍缺失");
  // PATH 优先于候选：PATH 命中真实工具时，found 指向 PATH 解析结果
  const realPath = process.env.PATH ?? "";
  const r3 = probeCoreTools(realPath, [extra]);
  assert.equal(r3.ok, true, `missing: ${r3.missing.join(",")}`);
  for (const t of CORE_TOOLS) {
    assert.ok(r3.found[t] !== null && r3.found[t]!.length > 0, `${t} 应从真实 PATH 解析`);
  }
});

test("R17 M2: wakeAgent 探测失败 → TOOL_ENV_BROKEN 结构化拒绝（置 session.error、不 wake、不 spawn）", async () => {
  const { dir, config, store } = setup({ piEnabled: false });
  config.opencode.enabled = false;
  // PATH 指向只含 bash 的空壳目录 → node/npm/git 缺失
  const bin = mkBinDir(["bash"]);
  const prevPath = process.env.PATH;
  process.env.PATH = bin;
  try {
    await assert.rejects(
      () => wakeAgent(dir, config, "pm", "intake"),
      (e: unknown) => {
        assert.ok(e instanceof PicodeError, "必须是 PicodeError");
        assert.equal(e.code, ErrorCode.TOOL_ENV_BROKEN);
        assert.deepEqual(e.details, { missing: ["node", "npm", "git"] }, "缺失清单须为结构化字段");
        assert.match(e.message, /node/, "消息须含缺失工具");
        assert.match(e.message, /DSH runtime-commands/, "中文可操作提示");
        return true;
      },
    );
    const s = store.get("pm")!;
    assert.equal(s.state, "sleeping", "探测失败不得进入 awake（不产生会话）");
    assert.equal(s.pi_session_id, null, "探测失败不得 spawn 任何进程");
    assert.match(s.error ?? "", /^TOOL_ENV_BROKEN:/, "session.error 须带结构化错误码前缀");
    assert.match(s.error ?? "", /node/, "session.error 须含缺失清单");
  } finally {
    if (prevPath === undefined) delete process.env.PATH;
    else process.env.PATH = prevPath;
  }
});

// --- R17 M4: 工作房存在性门闩（task 会话 spawn 前校验，git worktree list 语义） ---

test("R17 M4: task 会话 worktree 缺失 → wakeAgent 拒绝（WORKTREE_MISSING + 中文可操作原因，不 spawn）", async () => {
  // 真实后端路径（pi.enabled=true，setup 默认）→ M4 门闩在 spawn 前拦截；
  // 纯状态机路径不 spawn 后端，门闩不适用（rules-engine 纯状态机测试语义不变）
  const { dir, config, store } = setup({});
  config.opencode.enabled = false;
  store.register("engineer", {
    agentId: "engineer@task-z",
    initialState: "sleeping",
    depth: 1,
    parentSession: "squad-lead@task-z",
  });
  // worktree 从未创建（R16 根因 #2 场景：人设声明的路径不存在）
  await assert.rejects(
    () => wakeAgent(dir, config, "engineer@task-z", "event:task_ready"),
    (e: unknown) => {
      assert.ok(e instanceof PicodeError, "必须是 PicodeError");
      assert.equal(e.code, ErrorCode.WORKTREE_MISSING, "结构化错误码");
      assert.match(e.message, /工作房未创建/, "中文可操作原因");
      assert.match(e.message, /worktree-setup\.sh/, "提示 run-lead 先跑 worktree-setup.sh");
      return true;
    },
  );
  const s = store.get("engineer@task-z")!;
  assert.equal(s.state, "sleeping", "拒绝后会话保持 sleeping（不产生会话）");
  assert.equal(s.pi_session_id, null, "不得 spawn 任何进程");
  assert.match(s.error ?? "", /^WORKTREE_MISSING:/, "session.error 须带结构化错误码前缀");
  assert.match(s.error ?? "", /worktree-setup\.sh/, "session.error 含可操作中文提示");
});
