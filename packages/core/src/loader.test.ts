import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./loader.js";
import { getDefaultConfig } from "./config.js";

/** Point HOME at a scratch dir for the duration of the test (13 §2 layer 2). */
function withHome(home: string, fn: () => void): void {
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    fn();
  } finally {
    process.env.HOME = saved;
  }
}

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-loader-"));
  fs.mkdirSync(path.join(dir, ".picode"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".picode", "config.yaml"), "");
  return dir;
}

test("D057: user-global ~/.picode/config.yaml merges under the project config (13 §2)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "picode-home-"));
  fs.mkdirSync(path.join(home, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".picode", "config.yaml"),
    "opencode:\n  enabled: true\n  base_url: http://127.0.0.1:9999\n",
  );
  const repo = tmpRepo();
  withHome(home, () => {
    const cfg = loadConfig(repo);
    assert.equal(cfg.opencode.enabled, true);
    assert.equal(cfg.opencode.base_url, "http://127.0.0.1:9999");
    // untouched defaults survive
    assert.equal(cfg.windows.split_hour, 12);
  });
});

test("D057: project config overrides the user-global layer", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "picode-home-"));
  fs.mkdirSync(path.join(home, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".picode", "config.yaml"),
    "opencode:\n  enabled: true\n  base_url: http://127.0.0.1:9999\n",
  );
  const repo = tmpRepo();
  fs.writeFileSync(
    path.join(repo, ".picode", "config.yaml"),
    "opencode:\n  base_url: http://127.0.0.1:7788\n",
  );
  withHome(home, () => {
    const cfg = loadConfig(repo);
    assert.equal(cfg.opencode.enabled, true, "user-global enabled survives (deep merge)");
    assert.equal(cfg.opencode.base_url, "http://127.0.0.1:7788", "project wins on the same key");
  });
});

test("without ~/.picode/config.yaml behavior is unchanged (defaults only)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "picode-home-"));
  const repo = tmpRepo();
  withHome(home, () => {
    const cfg = loadConfig(repo);
    assert.deepEqual(cfg.opencode, getDefaultConfig().opencode);
    assert.equal(cfg.sess_mgr.max_awake, 8);
  });
});
