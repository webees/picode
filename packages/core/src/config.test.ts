import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultConfig, validateConfig } from "./config.js";
import { loadConfig } from "./loader.js";
import { ErrorCode, PicodeError } from "./errors.js";

function tmpRepoWithConfig(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picode-cfg-"));
  fs.mkdirSync(path.join(dir, ".picode"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".picode", "config.yaml"), yaml);
  return dir;
}

test("windows defaults: split_hour 12, keep ratio 0.8", () => {
  const cfg = getDefaultConfig();
  assert.equal(cfg.windows.split_hour, 12);
  assert.equal(cfg.windows.compression.ratio, 0.8);
  assert.equal(cfg.windows.compression.min_keep, 20);
});

test("windows config overridable via project yaml", () => {
  const dir = tmpRepoWithConfig(
    "windows:\n  split_hour: 14\n  compression:\n    ratio: 0.9\n    min_keep: 5\n",
  );
  const cfg = loadConfig(dir);
  assert.equal(cfg.windows.split_hour, 14);
  assert.equal(cfg.windows.compression.ratio, 0.9);
  assert.equal(cfg.windows.compression.min_keep, 5);
});

test("validateConfig rejects invalid windows values", () => {
  const base = getDefaultConfig();
  for (const patch of [
    { windows: { ...base.windows, split_hour: 24 } },
    { windows: { ...base.windows, split_hour: -1 } },
    { windows: { ...base.windows, compression: { ...base.windows.compression, ratio: 0 } } },
    { windows: { ...base.windows, compression: { ...base.windows.compression, ratio: 1.5 } } },
    { windows: { ...base.windows, compression: { ...base.windows.compression, min_keep: 0 } } },
  ] as const) {
    assert.throws(() => validateConfig({ ...base, ...patch }));
  }
});

test("D3: run-level override cannot downgrade v1-fixed values (13 §2 validation after merge)", () => {
  const dir = tmpRepoWithConfig(""); // defaults only
  fs.mkdirSync(path.join(dir, ".picode", "runs", "run-x"), { recursive: true });
  // override tries to turn sponsor into an LLM — must be rejected, not merged in
  fs.writeFileSync(
    path.join(dir, ".picode", "runs", "run-x", "config.override.yaml"),
    "sponsor:\n  human_only: false\n",
  );
  assert.throws(
    () => loadConfig(dir, "run-x"),
    (e: unknown) =>
      e instanceof PicodeError &&
      e.code === ErrorCode.CONFIG_INVALID &&
      /sponsor\.human_only must be true/.test(e.message),
  );
});

test("D3: run-level override can legitimately tune non-fixed keys", () => {
  const dir = tmpRepoWithConfig("");
  fs.mkdirSync(path.join(dir, ".picode", "runs", "run-x"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".picode", "runs", "run-x", "config.override.yaml"),
    "windows:\n  split_hour: 14\n",
  );
  const cfg = loadConfig(dir, "run-x");
  assert.equal(cfg.windows.split_hour, 14);
  // untouched defaults survive the merge
  assert.equal(cfg.windows.compression.ratio, 0.8);
  assert.equal(cfg.sess_mgr.max_awake, 8);
});

test("D4: reserved keys keep their defaults but are documented (no reads in impl)", () => {
  const cfg = getDefaultConfig();
  // values exist and are stable — the comments in PicodeConfig mark the D055 set
  assert.equal(cfg.scheduler.max_parallel_triads, 3);
  assert.equal(cfg.git.merge_serial, true);
  assert.equal(cfg.i18n.locale, "zh-CN");
  assert.equal(cfg.bus.adapter, "file");
  assert.equal(cfg.self_evolve.enabled, true);
});
