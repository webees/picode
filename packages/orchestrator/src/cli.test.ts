import { test } from "node:test";
import { tmpGitRepo } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

test("E2: --help groups commands by domain and lists every registered command", async () => {
  const { status, stdout } = runCli(["--help"]);
  assert.equal(status, 0);
  for (const domain of ["run:", "goal:", "session:", "staffing:", "task:", "merge:", "memory:", "evolve:", "window:", "status:", "intake:", "self-drive:", "supervise:"]) {
    assert.ok(stdout.includes(domain), `help shows ${domain} group`);
  }
  for (const cmd of [
    "picode init --repo",
    "picode goal set-status",
    "picode session list",
    "picode session audit",
    "picode staffing request",
    "picode staffing pool",
    "picode staffing approve",
    "picode merge process",
    "picode window compress",
    "picode status --repo",
    "picode intake add --repo",
    "picode self-drive tick",
    "picode supervise --repo",
  ]) {
    assert.ok(stdout.includes(cmd), `help lists ${cmd}`);
  }
});

test("E1: per-command --help prints the usage line", async () => {
  const { status, stdout } = runCli(["session", "wake", "--help"]);
  assert.equal(status, 0);
  assert.ok(stdout.includes("picode session wake --repo <path> --run <id> --agent <agent_id>"));
});

test("E3: unknown command renders [picode] ERROR: USAGE with exit 1", async () => {
  const { status, stderr } = runCli(["frobnicate"]);
  assert.equal(status, 1);
  assert.match(stderr, /^\[picode\] ERROR: USAGE: unknown command "frobnicate"/);
  assert.ok(stderr.includes("picode --help"));
});

test("E3: missing --run renders a coded error naming the command's usage", async () => {
  const { status, stderr } = runCli(["status", "--repo", "/tmp"]);
  assert.equal(status, 1);
  assert.match(stderr, /^\[picode\] ERROR: USAGE: missing --run <id>/);
  assert.ok(stderr.includes("picode status --repo"));
});

test("E3: unknown subcommand names the offending verb", async () => {
  const { status, stderr } = runCli(["session", "frob"]);
  assert.equal(status, 1);
  assert.match(stderr, /unknown session subcommand "frob"/);
});

test("E3: run-level errors carry the originating code (config validation)", async () => {
  const repo = tmpGitRepo({ prefix: "picode-cli-", readme: "# t\n" });
  // break the v1-fixed sponsor contract via project config
  fs.mkdirSync(path.join(repo, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".picode", "config.yaml"),
    "sponsor:\n  human_only: false\n",
  );
  const { status, stderr } = runCli(["init", "--repo", repo, "--goal-title", "x"]);
  assert.equal(status, 1);
  assert.match(stderr, /^\[picode\] ERROR: CONFIG_INVALID: sponsor\.human_only must be true/);
});

test("intake E2E: add(open, board Backlog) → triage(triaged+bus, leaves board) → close(done)", async () => {
  const repo = tmpGitRepo({ prefix: "picode-cli-", readme: "# t\n" });
  const init = runCli(["init", "--repo", repo, "--goal-title", "t"]);
  assert.equal(init.status, 0);
  const { runId } = JSON.parse(init.stdout) as { runId: string };
  const runDir = path.join(repo, ".picode", "runs", runId);

  const added = runCli(["intake", "add", "--repo", repo, "--run", runId, "--type", "需求", "--body", "随时投喂需求"]);
  assert.equal(added.status, 0, added.stderr);
  const feed = JSON.parse(added.stdout) as { id: string; status: string };
  assert.equal(feed.status, "open");
  assert.ok(fs.existsSync(path.join(runDir, "intake", `${feed.id}.yaml`)));

  let board = runCli(["board", "--repo", repo, "--run", runId]);
  assert.equal(board.status, 0);
  assert.ok(board.stdout.includes(feed.id), "open feed visible on board");

  const triaged = runCli(["intake", "triage", "--repo", repo, "--run", runId, "--id", feed.id, "--to", "pm"]);
  assert.equal(triaged.status, 0, triaged.stderr);
  const tfeed = JSON.parse(triaged.stdout) as { status: string; assigned_to: string };
  assert.equal(tfeed.status, "triaged");
  assert.equal(tfeed.assigned_to, "pm");

  board = runCli(["board", "--repo", repo, "--run", runId]);
  assert.equal(board.status, 0);
  assert.ok(!board.stdout.includes(feed.id), "triaged feed leaves Backlog");

  const closed = runCli(["intake", "close", "--repo", repo, "--run", runId, "--id", feed.id]);
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal((JSON.parse(closed.stdout) as { status: string }).status, "done");
});

/**
 * 评分回路消费侧（scoring-driven §4.2）：`staffing pool` 只读消费人才池——
 * 按 --grade/--skills/--seat 筛选、S/A 优先输出；人才池文件前后字节一致（只读零写）。
 */
test("staffing pool: read-only talent pool consumption (S/A first, filters, zero writes)", async () => {
  const repo = tmpGitRepo({ prefix: "picode-pool-", readme: "# t\n" });
  const init = runCli(["init", "--repo", repo, "--goal-title", "t"]);
  assert.equal(init.status, 0, init.stderr);
  const { runId } = JSON.parse(init.stdout) as { runId: string };

  const poolFile = path.join(repo, "docs", "knowledge", "hr", "talent.yaml");
  fs.mkdirSync(path.dirname(poolFile), { recursive: true });
  fs.writeFileSync(
    poolFile,
    YAML.stringify({
      schema_version: "1",
      updated_at: "2026-08-15T00:00:00.000Z",
      records: [
        {
          at: "2026-08-15T00:00:00.000Z",
          run_id: "r1",
          task_id: "t1",
          team_name: "队甲",
          seat: "engineer",
          codename: "乙-中级",
          skills: ["typescript"],
          score: 60,
          grade: "B",
          result: "dissolved",
        },
        {
          at: "2026-08-15T00:00:00.000Z",
          run_id: "r1",
          task_id: "t2",
          team_name: "队乙",
          seat: "engineer",
          codename: "甲-高级",
          skills: ["typescript"],
          score: 88,
          grade: "A",
          result: "dissolved",
        },
        {
          at: "2026-08-15T00:00:00.000Z",
          run_id: "r1",
          task_id: "t3",
          team_name: "队丙",
          seat: "sdet",
          codename: "丙-顶尖",
          skills: ["testing"],
          score: 95,
          grade: "S",
          result: "dissolved",
        },
      ],
      summary: {
        count: 3,
        avg: 81,
        by_grade: { S: 1, A: 1, B: 1, C: 0, D: 0 },
        by_seat: { engineer: { count: 2, avg: 74 }, sdet: { count: 1, avg: 95 } },
      },
    }),
  );
  const before = fs.readFileSync(poolFile, "utf8");

  // grade + skill 组合筛选：B 被 grade 挡、S 缺 typescript → 只剩 A
  const r1 = runCli([
    "staffing", "pool", "--repo", repo, "--run", runId,
    "--grade", "S,A", "--skills", "typescript",
  ]);
  assert.equal(r1.status, 0, r1.stderr);
  const out1 = JSON.parse(r1.stdout) as {
    count: number;
    records: Array<{ codename: string; grade: string; seat: string }>;
  };
  assert.equal(out1.count, 1);
  assert.deepEqual(out1.records.map((x) => x.codename), ["甲-高级"]);

  // grade + seat 组合筛选 → 仍只剩 A/engineer
  const r2 = runCli([
    "staffing", "pool", "--repo", repo, "--run", runId,
    "--grade", "S,A", "--seat", "engineer",
  ]);
  assert.equal(r2.status, 0, r2.stderr);
  const out2 = JSON.parse(r2.stdout) as { count: number; records: Array<{ codename: string }> };
  assert.equal(out2.count, 1);
  assert.deepEqual(out2.records.map((x) => x.codename), ["甲-高级"]);

  // S/A 优先：无筛选时 S 在前、A 次之、B 垫底（grade 序 + score 降序）
  const r3 = runCli(["staffing", "pool", "--repo", repo, "--run", runId]);
  assert.equal(r3.status, 0, r3.stderr);
  const out3 = JSON.parse(r3.stdout) as { count: number; records: Array<{ codename: string }> };
  assert.equal(out3.count, 3);
  assert.deepEqual(out3.records.map((x) => x.codename), ["丙-顶尖", "甲-高级", "乙-中级"]);

  // 未知 grade 值 → 无匹配（空结果），不写库
  const r4 = runCli(["staffing", "pool", "--repo", repo, "--run", runId, "--grade", "X"]);
  assert.equal(r4.status, 0, r4.stderr);
  assert.deepEqual(JSON.parse(r4.stdout), { count: 0, records: [] });

  // 只读零写（防隐式行为变更）：人才池文件在命令运行前后逐字节一致
  assert.equal(fs.readFileSync(poolFile, "utf8"), before, "talent.yaml must be untouched");
});
