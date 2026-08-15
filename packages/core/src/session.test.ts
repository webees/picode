import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUMAN_ONLY_ROLES,
  assertTransition,
  canTransition,
  type SessionBudgetUsed,
  type SessionRecord,
  type SessionState,
} from "./session.js";
import { ErrorCode, PicodeError, errorCodeOf } from "./errors.js";

const STATES: SessionState[] = ["registered", "sleeping", "awake", "terminated"];

// Legal edges per 17 §4: registered→sleeping, sleeping⇄awake, sleeping/awake→terminated
const LEGAL: Array<[SessionState, SessionState]> = [
  ["registered", "sleeping"],
  ["sleeping", "awake"],
  ["awake", "sleeping"],
  ["sleeping", "terminated"],
  ["awake", "terminated"],
];

test("full 4x4 transition matrix matches 17 §4 exactly", () => {
  for (const from of STATES) {
    for (const to of STATES) {
      const expected = LEGAL.some(([a, b]) => a === from && b === to);
      assert.equal(
        canTransition(from, to),
        expected,
        `canTransition(${from} -> ${to}) should be ${expected}`,
      );
    }
  }
});

test("assertTransition throws coded ILLEGAL_TRANSITION for every illegal pair", () => {
  for (const from of STATES) {
    for (const to of STATES) {
      if (LEGAL.some(([a, b]) => a === from && b === to)) continue;
      assert.throws(
        () => assertTransition(from, to, "agent-x"),
        (e: unknown) =>
          e instanceof PicodeError &&
          e.code === ErrorCode.ILLEGAL_TRANSITION &&
          e.message.includes(`${from} -> ${to}`),
        `expected coded throw for ${from} -> ${to}`,
      );
    }
  }
  // legal edge does not throw
  assert.doesNotThrow(() => assertTransition("sleeping", "awake", "agent-x"));
});

test("errorCodeOf sees the transition code on the thrown error", () => {
  try {
    assertTransition("terminated", "awake", "x");
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(errorCodeOf(e), "ILLEGAL_TRANSITION");
  }
});

test("sponsor is the only non-session role", () => {
  // HUMAN_ONLY_ROLES is the single source of truth for the human channel (C8)
  assert.deepEqual([...HUMAN_ONLY_ROLES], ["sponsor"]);
});

test("SessionBudgetUsed carries both meters: turns (C1) and continuations (C1 continuation)", () => {
  const budget: SessionBudgetUsed = { turns: 1, continuations: 0 };
  assert.equal(budget.turns, 1);
  assert.equal(budget.continuations, 0);
  // SessionRecord.budget stays optional — stale session files (pre-C1) have no
  // meter; consumers must read it with `?? 0` (N3 断连恢复/旧状态兼容).
  const fresh: SessionRecord = {
    schema_version: "1",
    agent_id: "pm",
    role_id: "pm",
    state: "awake",
    pi_session_id: null,
    last_wake_at: null,
    last_sleep_at: null,
    wake_reason: null,
    persona_path: null,
    error: null,
    budget: { turns: 0, continuations: 0 },
  };
  assert.equal(fresh.budget?.continuations, 0);
  const stale: SessionRecord = { ...fresh, budget: undefined };
  assert.equal(stale.budget, undefined);
});
