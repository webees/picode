import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorCode, PicodeError } from "./errors.js";
import { getDefaultConfig, validateConfig, type PicodeConfig } from "./config.js";

/** Assert validateConfig throws a coded CONFIG_INVALID with a message match. */
function expectConfigError(config: PicodeConfig, re: RegExp): void {
  assert.throws(
    () => validateConfig(config),
    (e: unknown) =>
      e instanceof PicodeError &&
      e.code === ErrorCode.CONFIG_INVALID &&
      re.test(e.message),
  );
}

test("default config validates cleanly", () => {
  assert.doesNotThrow(() => validateConfig(getDefaultConfig()));
});

test("cells.templates role must exist in roles (13 §12.2 / T15)", () => {
  const cfg = getDefaultConfig();
  cfg.cells.templates.implement.doer_role = "ghost-role";
  expectConfigError(cfg, /cells\.templates\.implement\.doer_role/);
});

test("required core rooms cannot be disabled or missing (T14)", () => {
  for (const must of ["leadership", "product", "program", "docs", "people"]) {
    const cfg = getDefaultConfig();
    cfg.rooms = cfg.rooms.filter((r) => r.id !== must);
    expectConfigError(cfg, new RegExp(`required room disabled or missing: ${must}`));
  }
});

test("naming law R1: role id must not collide with a room id", () => {
  const cfg = getDefaultConfig();
  cfg.roles[0].id = "leadership";
  expectConfigError(cfg, /naming law R1/);
});

test("v1-fixed values cannot be changed (17 §10)", () => {
  {
    const cfg = getDefaultConfig();
    cfg.sponsor.human_only = false;
    expectConfigError(cfg, /sponsor\.human_only must be true/);
  }
  {
    const cfg = getDefaultConfig();
    cfg.staffing.mode = "template";
    expectConfigError(cfg, /staffing\.mode must be real_recruit/);
  }
  {
    const cfg = getDefaultConfig();
    cfg.staffing.persona_dimensions = "full" as never; // keep type narrow
    cfg.staffing = { mode: "real_recruit", persona_dimensions: "partial" as never };
    expectConfigError(cfg, /persona_dimensions must be full/);
  }
  {
    const cfg = getDefaultConfig();
    cfg.cells.lifetime = "per_run" as never;
    cfg.cells = { lifetime: "global" as never, templates: cfg.cells.templates };
    expectConfigError(cfg, /cells\.lifetime must be per_run/);
  }
});

test("pi.enabled requires a command_template (18 phase C)", () => {
  const cfg = getDefaultConfig();
  cfg.pi.enabled = true;
  cfg.pi.command_template = "";
  expectConfigError(cfg, /pi\.command_template required/);
});

test("opencode.enabled requires an http(s) base_url (D044)", () => {
  const cfg = getDefaultConfig();
  cfg.opencode.enabled = true;
  cfg.opencode.base_url = "not-a-url";
  expectConfigError(cfg, /opencode\.base_url must be an http\(s\) URL/);
});

test("windows.split_hour must be an integer in 0..23", () => {
  for (const bad of [-1, 24, 12.5] as const) {
    const cfg = getDefaultConfig();
    cfg.windows = { ...cfg.windows, split_hour: bad };
    expectConfigError(cfg, /windows\.split_hour/);
  }
});

test("windows.compression.ratio must be in (0, 1]", () => {
  for (const bad of [0, -0.1, 1.5] as const) {
    const cfg = getDefaultConfig();
    cfg.windows.compression = { ...cfg.windows.compression, ratio: bad };
    expectConfigError(cfg, /windows\.compression\.ratio/);
  }
});

test("windows.compression.min_keep must be a positive integer", () => {
  for (const bad of [0, -3, 2.5] as const) {
    const cfg = getDefaultConfig();
    cfg.windows.compression = { ...cfg.windows.compression, min_keep: bad };
    expectConfigError(cfg, /windows\.compression\.min_keep/);
  }
});

test("sess_mgr.max_awake must be a positive integer", () => {
  for (const bad of [0, -1, 2.5] as const) {
    const cfg = getDefaultConfig();
    cfg.sess_mgr.max_awake = bad;
    expectConfigError(cfg, /sess_mgr\.max_awake/);
  }
});

test("self_evolve.allowed_layers rejects unknown layers", () => {
  const cfg = getDefaultConfig();
  cfg.self_evolve.allowed_layers = ["knowledge", "mystery"] as never;
  expectConfigError(cfg, /allowed_layers contains unknown layer/);
});

test("E5: code layer requires require_code_review_on_code_layer", () => {
  const cfg = getDefaultConfig();
  cfg.self_evolve.allowed_layers = ["code"];
  cfg.self_evolve.require_code_review_on_code_layer = false;
  expectConfigError(cfg, /require_code_review_on_code_layer must be true/);
});
