import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeName, generateCodename, generateTeamName } from "./naming.js";

test("codename/team name are deterministic per id (16 §8)", () => {
  assert.equal(generateCodename("engineer@task-a"), generateCodename("engineer@task-a"));
  assert.equal(generateTeamName("task-a"), generateTeamName("task-a"));
  // different ids can (rarely) collide modulo pool size, but the mapping is pure
  const c1 = generateCodename("engineer@task-a");
  assert.ok(c1.length > 0);
});

test("codename/team names draw from the default pools", () => {
  const codenames = new Set(Array.from({ length: 200 }, (_, i) => generateCodename(`x-${i}`)));
  const teams = new Set(Array.from({ length: 200 }, (_, i) => generateTeamName(`t-${i}`)));
  assert.ok(codenames.size > 10, "codename pool is diverse");
  assert.ok(teams.size > 10, "team name pool is diverse");
});

test("assertSafeName accepts CJK/ascii/hyphen and rejects path-unsafe names", () => {
  for (const ok of ["白泽", "engineer", "team-1", "A_b", "x".repeat(32)]) {
    assert.doesNotThrow(() => assertSafeName(ok, "codename"), ok);
  }
  for (const bad of ["../escape", "a/b", "a b", "", "a".repeat(33), "a*b", "a\\b", 42 as never]) {
    assert.throws(() => assertSafeName(bad, "codename"), undefined as never);
  }
  // the error message carries the kind so callers can tell codename vs team_name apart
  assert.throws(() => assertSafeName("../escape", "team_name"), /team_name/);
  assert.throws(() => assertSafeName("../escape", "codename"), /codename/);
});
