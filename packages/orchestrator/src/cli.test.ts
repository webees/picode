import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

function tmpGitRepo(): string {
  const dir = gitInit({ prefix: "picode-cli-" });
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

test("E2: --help groups commands by domain and lists every registered command", () => {
  const { status, stdout } = runCli(["--help"]);
  assert.equal(status, 0);
  for (const domain of ["run:", "goal:", "session:", "staffing:", "task:", "merge:", "memory:", "evolve:", "window:", "status:", "self-drive:"]) {
    assert.ok(stdout.includes(domain), `help shows ${domain} group`);
  }
  for (const cmd of [
    "picode init --repo",
    "picode goal set-status",
    "picode session list",
    "picode staffing approve",
    "picode merge process",
    "picode window compress",
    "picode status --repo",
    "picode self-drive tick",
  ]) {
    assert.ok(stdout.includes(cmd), `help lists ${cmd}`);
  }
});

test("E1: per-command --help prints the usage line", () => {
  const { status, stdout } = runCli(["session", "wake", "--help"]);
  assert.equal(status, 0);
  assert.ok(stdout.includes("picode session wake --repo <path> --run <id> --agent <agent_id>"));
});

test("E3: unknown command renders [picode] ERROR: USAGE with exit 1", () => {
  const { status, stderr } = runCli(["frobnicate"]);
  assert.equal(status, 1);
  assert.match(stderr, /^\[picode\] ERROR: USAGE: unknown command "frobnicate"/);
  assert.ok(stderr.includes("picode --help"));
});

test("E3: missing --run renders a coded error naming the command's usage", () => {
  const { status, stderr } = runCli(["status", "--repo", "/tmp"]);
  assert.equal(status, 1);
  assert.match(stderr, /^\[picode\] ERROR: USAGE: missing --run <id>/);
  assert.ok(stderr.includes("picode status --repo"));
});

test("E3: unknown subcommand names the offending verb", () => {
  const { status, stderr } = runCli(["session", "frob"]);
  assert.equal(status, 1);
  assert.match(stderr, /unknown session subcommand "frob"/);
});

test("E3: run-level errors carry the originating code (config validation)", () => {
  const repo = tmpGitRepo();
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
