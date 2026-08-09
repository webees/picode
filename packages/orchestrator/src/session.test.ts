import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  canConsumeModel,
  canTransition,
  assertTransition,
} from "@picode/core";
import { createRun, resolveRunDir } from "./run-store.js";
import { SessionStore, PLATFORM_ROLES } from "./session-store.js";

function tmpGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  return dir;
}

function freshStore(): { dir: string; store: SessionStore } {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-run-"));
  return { dir: runDir, store: new SessionStore(runDir) };
}

test("T20: init registers all platform roles sleeping; sponsor absent", () => {
  const repo = tmpGitRepo();
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  const store = new SessionStore(dir);
  const sessions = store.list();
  const ids = sessions.map((s) => s.agent_id);

  // sponsor never enters the machine
  assert.equal(store.get("sponsor"), null);
  // every platform role is registered exactly once
  for (const role of PLATFORM_ROLES) {
    assert.ok(ids.includes(role), `missing platform role ${role}`);
  }
  assert.equal(ids.length, PLATFORM_ROLES.length);
  // all registered as sleeping (stage A: wake left to the rules engine)
  const nonSleeping = sessions.filter((s) => s.state !== "sleeping");
  assert.deepEqual(nonSleeping, []);
  const sleeping = sessions.filter((s) => s.state === "sleeping");
  assert.equal(sleeping.length, PLATFORM_ROLES.length);
  // DoD: >= platform-role-count sleeping rows
  assert.ok(sleeping.length >= PLATFORM_ROLES.length);
  // roster file shape (17 §4 / reference schema)
  const rec = store.get("run-lead")!;
  assert.equal(rec.schema_version, "1");
  assert.equal(rec.state, "sleeping");
  assert.equal(rec.pi_session_id, null);
  assert.equal(rec.last_wake_at, null);
  assert.equal(rec.persona_path, null);
  assert.ok(fs.existsSync(path.join(dir, "sessions", "run-lead.yaml")));
});

test("T21: sleeping agent cannot consume model calls; awake can", async () => {
  const { store } = freshStore();
  store.register("pm", { initialState: "sleeping" });
  const sleeping = store.get("pm")!;
  assert.equal(canConsumeModel(sleeping), false);

  await store.wake("pm", "intake_start");
  const awake = store.get("pm")!;
  assert.equal(canConsumeModel(awake), true);
  assert.ok(awake.last_wake_at);
  assert.equal(awake.wake_reason, "intake_start");

  // awake set only contains awake sessions
  const awakeSet = store.awake().map((s) => s.agent_id);
  assert.deepEqual(awakeSet, ["pm"]);
});

test("illegal transitions are rejected", async () => {
  const { store } = freshStore();
  store.register("run-lead", { initialState: "sleeping" });

  // self-transition is illegal
  await assert.rejects(() => store.sleep("run-lead", "x"), /illegal session transition/);
  // duplicate registration rejected
  assert.throws(
    () => store.register("run-lead", { initialState: "sleeping" }),
    /already registered/,
  );

  // terminated is terminal: wake/terminate after must fail
  await store.terminate("run-lead", "run-closed");
  assert.equal(store.get("run-lead")!.state, "terminated");
  await assert.rejects(() => store.wake("run-lead", "late"), /illegal session transition/);
  await assert.rejects(() => store.terminate("run-lead", "again"), /illegal session transition/);
  await assert.rejects(() => store.sleep("run-lead", "again"), /illegal session transition/);
});

test("sponsor cannot be registered (17 §3.1 / T26 basis)", () => {
  const { store } = freshStore();
  assert.throws(() => store.register("sponsor"), /human-only/);
});

test("state machine edge table", () => {
  // legal edges from 17 §4: registered→sleeping, sleeping⇄awake, sleeping/awake→terminated
  assert.equal(canTransition("registered", "sleeping"), true);
  assert.equal(canTransition("sleeping", "awake"), true);
  assert.equal(canTransition("awake", "sleeping"), true);
  assert.equal(canTransition("sleeping", "terminated"), true);
  assert.equal(canTransition("awake", "terminated"), true);
  // illegal edges
  assert.equal(canTransition("registered", "awake"), false);
  assert.equal(canTransition("registered", "terminated"), false);
  assert.equal(canTransition("awake", "registered"), false);
  assert.equal(canTransition("terminated", "awake"), false);
  assert.equal(canTransition("terminated", "sleeping"), false);
  assert.throws(() => assertTransition("awake", "registered", "x"), /illegal/);
});

test("T22: max_awake limits concurrent awake sessions", async () => {
  const { store } = freshStore();
  for (const r of ["pm", "run-lead", "ind-res"]) {
    store.register(r, { initialState: "sleeping" });
  }
  await store.wake("pm", "intake_start", { maxAwake: 2 });
  await store.wake("run-lead", "intake_start", { maxAwake: 2 });
  // third wake over the soft limit is rejected
  await assert.rejects(
    () => store.wake("ind-res", "intake_start", { maxAwake: 2 }),
    (e: unknown) => (e as { code?: string }).code === "MAX_AWAKE_EXCEEDED",
  );
  assert.equal(store.awake().length, 2);
  // orchestrator force-wake (17 §4: allow_orch_force_wake) may bypass
  await store.wake("ind-res", "force: intake", { maxAwake: 2, force: true });
  assert.equal(store.awake().length, 3);
});

test("session wake/sleep cycle updates timestamps", async () => {
  const { store } = freshStore();
  store.register("tpm", { initialState: "sleeping" });
  await store.wake("tpm", "progress-overdue");
  const w = store.get("tpm")!;
  assert.equal(w.state, "awake");
  assert.ok(w.last_wake_at);
  await store.sleep("tpm", "idle");
  const s = store.get("tpm")!;
  assert.equal(s.state, "sleeping");
  assert.ok(s.last_sleep_at);
  assert.equal(s.pi_session_id, null);
  assert.equal(s.wake_reason, null);
});
