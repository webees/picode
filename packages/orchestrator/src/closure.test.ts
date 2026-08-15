import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRun, resolveRunDir, setGoalStatus, setProductAcceptance } from "./run-store.js";
import { addChunkAndTask, prepareTask, draftBrief, approveBrief, checkWritePathsInDiff } from "./task.js";
import {
  createStaffingRequest,
  draftPersonas,
  approveStaffing,
} from "./staffing.js";
import { SessionStore } from "./session-store.js";
import {
  ackHandoff,
  assertEvidencePassed,
  dissolveTask,
  evidencePath,
  gcFailedWorktrees,
  packageHandoff,
  submitEvidence,
} from "./closure.js";

async function setupPreparedTask(opts: { writePaths?: string[] } = {}) {
  const repo = tmpGitRepo({
    prefix: "picode-test-",
    email: "test@picode",
    name: "picode-test",
    readme: "# test\n",
  });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir, config } = resolveRunDir(repo, runId);
  setProductAcceptance(dir, ["feature works"]);
  setGoalStatus(dir, "active");
  const { taskId } = await addChunkAndTask(repo, dir, config, {
    chunkId: "chunk-a",
    writePaths: opts.writePaths ?? ["src/module-a/**"],
  });
  draftBrief(dir, taskId);
  approveBrief(dir, taskId, "run-lead");
  await createStaffingRequest(dir, config, taskId, { skills: ["typescript"] });
  draftPersonas(repo, dir, config, taskId);
  await approveStaffing(repo, dir, config, taskId, "run-lead");
  const { worktree, branch } = prepareTask(repo, dir, config, taskId);
  return { repo, runId, dir, config, taskId, worktree, branch };
}

function commitOnWorktree(worktree: string, rel: string, content: string, msg: string): void {
  fs.mkdirSync(path.dirname(path.join(worktree, rel)), { recursive: true });
  fs.writeFileSync(path.join(worktree, rel), content);
  execFileSync("git", ["-C", worktree, "add", "."], { cwd: worktree });
  execFileSync("git", ["-C", worktree, "commit", "-qm", msg], { cwd: worktree });
}

/** Standard happy path: deliver in-write-path commit + passing evidence. */
async function setupDelivered() {
  const ctx = await setupPreparedTask();
  commitOnWorktree(ctx.worktree, "src/module-a/a.ts", "export const a = 1;\n", "feat: module-a");
  submitEvidence(ctx.dir, ctx.taskId, {
    cmds: [
      {
        cmd: "npm test --filter module-a",
        exit_code: 0,
        log_ref: `tasks/${ctx.taskId}/evidence/test.log`,
      },
    ],
    by: `sdet@${ctx.taskId}`,
  });
  return ctx;
}

test("T07: no evidence → handoff package is rejected", async () => {
  const ctx = await setupPreparedTask();
  commitOnWorktree(ctx.worktree, "src/module-a/a.ts", "export const a = 1;\n", "feat: module-a");
  assert.throws(() => packageHandoff(ctx.repo, ctx.dir, ctx.config, ctx.taskId), /evidence/);
  assert.throws(() => assertEvidencePassed(ctx.dir, ctx.taskId), /evidence/);
});

test("T06: diff outside write_paths → handoff package is rejected", async () => {
  const ctx = await setupDelivered();
  // out-of-scope file lands on the task branch
  commitOnWorktree(ctx.worktree, "out.txt", "oops\n", "out of scope");
  assert.throws(
    () => packageHandoff(ctx.repo, ctx.dir, ctx.config, ctx.taskId),
    /T06/,
  );
});

test("T08: no handoff ack → dissolve rejected; ack → dissolve completes", async () => {
  const ctx = await setupDelivered();
  // package complete, no ack yet
  packageHandoff(ctx.repo, ctx.dir, ctx.config, ctx.taskId);
  await assert.rejects(
    () => dissolveTask(ctx.repo, ctx.dir, ctx.config, ctx.taskId),
    /T08/,
  );
  // ack by an unallowed role is rejected
  assert.throws(
    () => ackHandoff(ctx.dir, ctx.taskId, "run-lead"),
    /not allowed/,
  );
  // docs-lead acks; a second acceptor appends (no clobber)
  ackHandoff(ctx.dir, ctx.taskId, "docs-lead", "handoff package complete");
  const second = ackHandoff(ctx.dir, ctx.taskId, "tpm");
  assert.deepEqual(second.accepted_by, [`docs-lead`, `tpm`]);

  const r = await dissolveTask(ctx.repo, ctx.dir, ctx.config, ctx.taskId);
  assert.equal(r.status, "dissolved");
  assert.equal(r.backup_ref, null); // clean dissolve, no force
  assert.equal(r.worktree_removed, true); // domains/git-worktree §3
  assert.ok(!fs.existsSync(ctx.worktree));

  // triad terminated (T27 basis)
  const sessions = new SessionStore(ctx.dir);
  for (const seat of [
    `squad-lead@${ctx.taskId}`,
    `engineer@${ctx.taskId}`,
    `sdet@${ctx.taskId}`,
  ]) {
    assert.equal(sessions.get(seat)?.state, "terminated");
  }

  // chunk unlocked (done) + invariant 08 §49: evidence/handoff NOT deleted
  const chunks = fs.readFileSync(path.join(ctx.dir, "chunks.yaml"), "utf8");
  assert.match(chunks, /id: chunk-a[\s\S]*status: done/);
  assert.ok(fs.existsSync(evidencePath(ctx.dir, ctx.taskId)));
  const hd = path.join(ctx.dir, "tasks", ctx.taskId, "handoff");
  for (const f of ["summary.md", "artifact_index.md", "diff_scope.md", "acceptance.yaml"]) {
    assert.ok(fs.existsSync(path.join(hd, f)), `expected ${f} kept after dissolve`);
  }
});

test("normal dissolve refuses uncommitted tracked changes in worktree", async () => {
  const ctx = await setupDelivered();
  packageHandoff(ctx.repo, ctx.dir, ctx.config, ctx.taskId);
  ackHandoff(ctx.dir, ctx.taskId, "docs-lead");
  // modify a tracked file without committing
  fs.appendFileSync(path.join(ctx.worktree, "src", "module-a", "a.ts"), "// dirty\n");
  await assert.rejects(
    () => dissolveTask(ctx.repo, ctx.dir, ctx.config, ctx.taskId),
    /uncommitted tracked changes/,
  );
  assert.ok(fs.existsSync(ctx.worktree)); // nothing was dropped
});

test("T12: force dissolve backs up dirty WIP and removes the worktree", async () => {
  const ctx = await setupPreparedTask();
  // dirty (uncommitted) out-of-scope work in the worktree
  fs.mkdirSync(path.join(ctx.worktree, "src"), { recursive: true });
  fs.writeFileSync(path.join(ctx.worktree, "src", "wip.ts"), "wip\n");

  const r = await dissolveTask(ctx.repo, ctx.dir, ctx.config, ctx.taskId, {
    force: true,
    status: "cancelled",
  });
  assert.equal(r.status, "cancelled");
  assert.ok(r.backup_ref, "backup_ref must be recorded");
  assert.equal(r.worktree_removed, true);

  // backup ref is a real, reachable commit in the repo
  const backup = fs.readFileSync(
    path.join(ctx.dir, "tasks", ctx.taskId, "backup.yaml"),
    "utf8",
  );
  assert.match(backup, /backup_ref: .+/);
  execFileSync("git", ["cat-file", "-e", `${r.backup_ref}^{commit}`], {
    cwd: ctx.repo,
    stdio: "pipe",
  });
  // WIP content is preserved inside that commit
  const wip = execFileSync(
    "git",
    ["show", `${r.backup_ref}:src/wip.ts`],
    { cwd: ctx.repo, encoding: "utf8" },
  );
  assert.equal(wip, "wip\n");
  // worktree is gone
  assert.ok(!fs.existsSync(ctx.worktree));
});

test("gc reclaims failed tasks past TTL, keeps fresh ones", async () => {
  const ctx = await setupDelivered();
  // force-dissolve one task as failed, leave another failed-but-fresh
  const r = await dissolveTask(ctx.repo, ctx.dir, ctx.config, ctx.taskId, {
    force: true,
    status: "failed",
  });
  assert.equal(r.status, "failed");

  // second task, failed and fresh (now)
  const { taskId: task2 } = await addChunkAndTask(ctx.repo, ctx.dir, ctx.config, {
    chunkId: "chunk-b",
    writePaths: ["src/module-b/**"],
  });
  draftBrief(ctx.dir, task2);
  approveBrief(ctx.dir, task2, "run-lead");
  await createStaffingRequest(ctx.dir, ctx.config, task2, { skills: ["typescript"] });
  draftPersonas(ctx.repo, ctx.dir, ctx.config, task2);
  await approveStaffing(ctx.repo, ctx.dir, ctx.config, task2, "run-lead");
  const { worktree: wt2 } = prepareTask(ctx.repo, ctx.dir, ctx.config, task2);
  void wt2;
  await dissolveTask(ctx.repo, ctx.dir, ctx.config, task2, { force: true, status: "failed" });

  // rewrite the first task's mtime to look ancient (older than TTL)
  const tp = path.join(ctx.dir, "tasks", ctx.taskId, "task.yaml");
  const old = new Date(Date.now() - 8 * 24 * 3600 * 1000); // 8 days
  fs.utimesSync(tp, old, old);

  const res = gcFailedWorktrees(ctx.repo, ctx.dir, ctx.config);
  assert.deepEqual(res.removed, [ctx.taskId]); // old one reclaimed
  assert.deepEqual(res.skipped, [task2]); // fresh one kept
  assert.ok(!fs.existsSync(ctx.worktree));
  // task2 was skipped: its branch must still exist in the repo
  const branches = execFileSync("git", ["branch"], { cwd: ctx.repo, encoding: "utf8" });
  assert.match(branches, new RegExp(ctx.config.git.branch_template
    .replace("{run_id}", path.basename(ctx.dir))
    .replace("{task_id}", task2)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("write-path gate refuses an unresolvable base instead of weakening", async () => {
  const ctx = await setupDelivered();
  assert.throws(
    () => checkWritePathsInDiff(ctx.worktree, "no-such-ref-xyz", ["src/**"]),
    /refusing weaker check/,
  );
});

test("repeat ack by the same acceptor is idempotent", async () => {
  const ctx = await setupDelivered();
  packageHandoff(ctx.repo, ctx.dir, ctx.config, ctx.taskId);
  ackHandoff(ctx.dir, ctx.taskId, "docs-lead");
  const again = ackHandoff(ctx.dir, ctx.taskId, "docs-lead");
  assert.deepEqual(again.accepted_by, ["docs-lead"]);
});
