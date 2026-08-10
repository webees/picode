import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultConfig, loadConfig, validateConfig } from "./config.js";

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
