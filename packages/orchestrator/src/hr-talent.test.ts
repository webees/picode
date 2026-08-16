import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeFor,
  queryTalentPool,
  type TalentPool,
  type TalentRecord,
} from "./hr-talent.js";

/**
 * Talent-pool consumption tests (16 §9 → hiring reuse · scoring-driven §4.2).
 *
 * queryTalentPool is the READ-ONLY consumption entry: filter by grade/skills/seat,
 * S/A-grade first. It must never write — the pool fixture is passed in and the
 * original records array must stay untouched (no mutation, no auto-injection).
 */

let n = 0;
function rec(over: Partial<TalentRecord>): TalentRecord {
  n++;
  return {
    at: "2026-08-15T00:00:00.000Z",
    run_id: "run-fixture",
    task_id: `task-${n}`,
    team_name: "队甲",
    seat: "engineer",
    codename: `n${n}`,
    skills: ["typescript", "testing"],
    score: 90,
    grade: "A",
    result: "dissolved",
    ...over,
  };
}

function makePool(records: TalentRecord[]): TalentPool {
  return {
    schema_version: "1",
    updated_at: "2026-08-15T00:00:00.000Z",
    records,
    summary: {
      count: records.length,
      avg: records.length ? 90 : 0,
      by_grade: { S: 0, A: records.length, B: 0, C: 0, D: 0 },
      by_seat: { engineer: { count: records.length, avg: 90 } },
    },
  };
}

test("queryTalentPool: empty pool returns []", () => {
  assert.deepEqual(queryTalentPool(makePool([])), []);
});

test("queryTalentPool: no query returns all records, S/A grade first, score desc", () => {
  const pool = makePool([
    rec({ codename: "b-low", grade: "B", score: 55 }),
    rec({ codename: "a-mid", grade: "A", score: 72 }),
    rec({ codename: "s-top", grade: "S", score: 90 }),
    rec({ codename: "a-top", grade: "A", score: 95 }),
    rec({ codename: "d-low", grade: "D", score: 30 }),
  ]);
  const out = queryTalentPool(pool).map((r) => r.codename);
  assert.deepEqual(out, ["s-top", "a-top", "a-mid", "b-low", "d-low"]);
});

test("queryTalentPool: grades filter keeps only matching grades", () => {
  const pool = makePool([
    rec({ codename: "s1", grade: "S", score: 88 }),
    rec({ codename: "a1", grade: "A", score: 75 }),
    rec({ codename: "b1", grade: "B", score: 60 }),
  ]);
  const out = queryTalentPool(pool, { grades: ["S", "A"] }).map((r) => r.codename);
  assert.deepEqual(out, ["s1", "a1"]);
});

test("queryTalentPool: skills filter requires every requested skill (AND)", () => {
  const pool = makePool([
    rec({ codename: "both", skills: ["typescript", "testing"] }),
    rec({ codename: "ts-only", skills: ["typescript"] }),
    rec({ codename: "other", skills: ["python"] }),
  ]);
  const out = queryTalentPool(pool, { skills: ["typescript", "testing"] }).map(
    (r) => r.codename,
  );
  assert.deepEqual(out, ["both"]);
});

test("queryTalentPool: seats filter keeps only matching seats", () => {
  const pool = makePool([
    rec({ codename: "eng", seat: "engineer" }),
    rec({ codename: "sd", seat: "sdet" }),
    rec({ codename: "sl", seat: "squad-lead" }),
  ]);
  const out = queryTalentPool(pool, { seats: ["sdet"] }).map((r) => r.codename);
  assert.deepEqual(out, ["sd"]);
});

test("queryTalentPool: combined filters intersect", () => {
  const pool = makePool([
    rec({ codename: "eng-a", grade: "A", seat: "engineer", skills: ["typescript"] }),
    rec({ codename: "eng-s", grade: "S", seat: "engineer", skills: ["typescript"] }),
    rec({ codename: "sd-a", grade: "A", seat: "sdet", skills: ["typescript"] }),
    rec({ codename: "eng-b", grade: "B", seat: "engineer", skills: ["typescript"] }),
  ]);
  const out = queryTalentPool(pool, { grades: ["S", "A"], seats: ["engineer"] }).map(
    (r) => r.codename,
  );
  assert.deepEqual(out, ["eng-s", "eng-a"]);
});

test("queryTalentPool: no match returns []", () => {
  const pool = makePool([rec({ codename: "a1", grade: "A" })]);
  assert.deepEqual(queryTalentPool(pool, { grades: ["S"] }), []);
  assert.deepEqual(queryTalentPool(pool, { seats: ["sdet"] }), []);
  assert.deepEqual(queryTalentPool(pool, { skills: ["rust"] }), []);
});

test("queryTalentPool: read-only — never mutates the source pool", () => {
  const recA = rec({ codename: "a1", grade: "A", score: 80 });
  const recS = rec({ codename: "s1", grade: "S", score: 86 });
  const pool = makePool([recA, recS]);
  const snapshot = JSON.stringify(pool);
  const out = queryTalentPool(pool, { grades: ["A"] });
  assert.equal(out.length, 1);
  assert.equal(JSON.stringify(pool), snapshot, "pool must not be mutated");
  assert.deepEqual(pool.records.map((r) => r.codename), ["a1", "s1"]);
});

test("gradeFor: grade band thresholds (S≥85 A≥70 B≥55 C≥40 D<40)", () => {
  assert.equal(gradeFor(100), "S");
  assert.equal(gradeFor(85), "S");
  assert.equal(gradeFor(84), "A");
  assert.equal(gradeFor(70), "A");
  assert.equal(gradeFor(69), "B");
  assert.equal(gradeFor(55), "B");
  assert.equal(gradeFor(54), "C");
  assert.equal(gradeFor(40), "C");
  assert.equal(gradeFor(39), "D");
  assert.equal(gradeFor(0), "D");
});
