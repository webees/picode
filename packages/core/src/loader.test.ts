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

test("Bug A: 同一进程两次 loadConfig 互不影响（第一次修改不污染 DEFAULTS/第二次）", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "picode-home-"));
  const repo = tmpRepo();
  withHome(home, () => {
    const first = loadConfig(repo);
    // 模拟 enableOpencode 等"改加载后 config"路径（Bug A 污染入口）：
    // 浅拷贝下这些写入会直改 DEFAULTS 单例，污染同进程后续 loadConfig。
    first.opencode.enabled = true;
    first.opencode.base_url = "http://127.0.0.1:9999";
    first.opencode.provider_id = "opencode-go";
    first.opencode.model_id = "deepseek-v4-flash";

    const second = loadConfig(repo);
    assert.equal(second.opencode.enabled, false, "第二次 loadConfig 必须回到默认值");
    assert.equal(second.opencode.base_url, "http://127.0.0.1:7788");
    assert.equal(second.opencode.provider_id, null);
    assert.equal(second.opencode.model_id, null);
    // DEFAULTS 单例本身也不得被污染
    assert.equal(getDefaultConfig().opencode.enabled, false);
  });
});

test("yagni: 既有用户配置含已删键仍可加载（分层 merge 不拒未知键）", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "picode-home-"));
  fs.mkdirSync(path.join(home, ".picode"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".picode", "config.yaml"),
    [
      "sess_mgr:",
      "  enabled: false", // 已删键（yagni 5删）：残留配置不得拒载
      "  allow_orch_force_wake: false",
      "  idle_sleep_sec: 300", // 保留键：仍生效
      "self_evolve:",
      "  enabled: false",
      "  require_sponsor_merge: false",
      "  knowledge_log_glob: /tmp/evolve/",
    ].join("\n") + "\n",
  );
  const repo = tmpRepo();
  withHome(home, () => {
    const cfg = loadConfig(repo);
    // 已删键被忽略，保留键覆盖生效，未覆盖默认存活
    assert.equal(cfg.sess_mgr.idle_sleep_sec, 300, "保留键 idle_sleep_sec 覆盖仍生效");
    assert.equal(cfg.sess_mgr.max_awake, 8, "未覆盖默认存活");
    assert.equal(cfg.self_evolve.default_kind, "delivery");
    assert.equal(cfg.opencode.enabled, false);
  });
});
