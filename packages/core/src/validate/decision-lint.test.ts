import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkDecisions, DecisionLintCode } from "./decision-lint.js";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `picode-${prefix}-`));
}

/** Build a repo fixture at `dir` with DECISIONS.md + optional docs/watermark. */
function writeRepo(
  dir: string,
  opts: {
    tableRows?: string[];
    sections?: string[];
    watermark?: string | null;
    refs?: Record<string, string>;
  } = {},
): void {
  const rows = opts.tableRows ?? ["D001|决策一", "D002|决策二", "D003|决策三"];
  const sections = opts.sections ?? ["D001|决策一", "D002|决策二", "D003|决策三"];

  const table = rows.map((r) => `|${r}|`).join("\n");
  const detail = sections
    .map((entry) => {
      const [id, title] = entry.split("|");
      return `## ${id} — ${title}\n- 内容\n`;
    })
    .join("\n");
  const header =
    opts.watermark === undefined
      ? "# 决策日志（现行有效）\n\n|ID|现行意图|\n|----|----------|\n"
      : "# 决策日志（现行有效）\n\n编号水位见 docs/decisions/watermark.yaml\n\n|ID|现行意图|\n|----|----------|\n";

  fs.mkdirSync(path.join(dir, "docs", "decisions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "DECISIONS.md"), `${header}${table}\n\n${detail}`);
  if (opts.watermark !== undefined && opts.watermark !== null) {
    fs.writeFileSync(path.join(dir, "docs", "decisions", "watermark.yaml"), opts.watermark);
  }
  for (const [rel, content] of Object.entries(opts.refs ?? {})) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function validWatermark(nextNumber = 4, reservations = "[]"): string {
  return `next_number: ${nextNumber}\nreservations: ${reservations}\n`;
}

test("合法 fixture（表行/详条唯一且对齐 + watermark 一致 + 引用可解析）零报错", () => {
  const dir = tmpDir("dec-ok");
  writeRepo(dir, {
    watermark: validWatermark(4),
    refs: { "docs/guide.md": "参考 D001 与 D002 即可" },
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.problems, []);
  assert.ok(result.files.includes("docs/DECISIONS.md"), JSON.stringify(result.files));
  assert.ok(result.files.includes("docs/decisions/watermark.yaml"), JSON.stringify(result.files));
  assert.ok(result.files.includes("docs/guide.md"), JSON.stringify(result.files));
});

test("表行编号重复 → DUP_TABLE error（硬拦截）", () => {
  const dir = tmpDir("dec-duptable");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b", "D002|c"],
    sections: ["D001|a", "D002|b"],
    watermark: validWatermark(3),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const dup = result.problems.filter((p) => p.code === DecisionLintCode.DUP_TABLE);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].number, "D002");
  assert.equal(dup[0].severity, "error");
});

test("详条编号重复 → DUP_SECTION error（硬拦截）", () => {
  const dir = tmpDir("dec-dupsec");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b"],
    sections: ["D001|a", "D002|b", "D002|c"],
    watermark: validWatermark(3),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const dup = result.problems.filter((p) => p.code === DecisionLintCode.DUP_SECTION);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].number, "D002");
  assert.equal(dup[0].severity, "error");
});

test("详条无对应表行 → TABLE_SECTION_MISMATCH error", () => {
  const dir = tmpDir("dec-mismatch");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b"],
    sections: ["D001|a", "D002|b", "D007|orphan"],
    watermark: validWatermark(3),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const mm = result.problems.filter((p) => p.code === DecisionLintCode.TABLE_SECTION_MISMATCH);
  assert.equal(mm.length, 1);
  assert.equal(mm[0].number, "D007");
});

test("watermark 漂移（表内最大 ≥ next_number）→ WATERMARK_DRIFT error", () => {
  const dir = tmpDir("dec-drift");
  writeRepo(dir, {
    tableRows: ["D001|a", "D005|b"],
    sections: ["D001|a", "D005|b"],
    watermark: validWatermark(5),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const drift = result.problems.filter((p) => p.code === DecisionLintCode.WATERMARK_DRIFT);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].number, "D005");
  assert.equal(drift[0].severity, "error");
});

test("表内最大 = next_number-1 合法（漂移边界通过）", () => {
  const dir = tmpDir("dec-drift-ok");
  writeRepo(dir, {
    tableRows: ["D001|a", "D005|b"],
    sections: ["D001|a", "D005|b"],
    watermark: validWatermark(6),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});

test("引用悬空 → REF_UNRESOLVED warning（不阻断）", () => {
  const dir = tmpDir("dec-ref");
  writeRepo(dir, {
    watermark: validWatermark(4),
    refs: { "docs/guide.md": "引用 D999 不存在" },
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, true, "unresolved reference is only a warning");
  assert.ok(
    result.problems.some(
      (p) => p.code === DecisionLintCode.REF_UNRESOLVED && p.severity === "warning" && p.number === "D999",
    ),
    JSON.stringify(result.problems),
  );
});

test("预留区间与 DECISIONS 冲突 → RESERVATION_COLLISION error", () => {
  const dir = tmpDir("dec-collide");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b"],
    sections: ["D001|a", "D002|b"],
    watermark: validWatermark(6, '[{run: "run-x", start: 2, end: 3}]'),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const col = result.problems.filter((p) => p.code === DecisionLintCode.RESERVATION_COLLISION);
  assert.equal(col.length, 1);
  assert.equal(col[0].number, "D002");
});

test("两个预留区间重叠 → RESERVATION_COLLISION error（幂等破坏）", () => {
  const dir = tmpDir("dec-overlap");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b"],
    sections: ["D001|a", "D002|b"],
    watermark: validWatermark(10, '[{run: "run-a", start: 5, end: 6}, {run: "run-b", start: 6, end: 8}]'),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const col = result.problems.filter((p) => p.code === DecisionLintCode.RESERVATION_COLLISION);
  assert.ok(col.length >= 1, JSON.stringify(result.problems));
});

test("landed 预留不冲突（已消费进 DECISIONS，豁免）", () => {
  const dir = tmpDir("dec-landed");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b"],
    sections: ["D001|a", "D002|b"],
    watermark: validWatermark(6, '[{run: "run-x", start: 2, end: 2, status: "landed"}]'),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});

test("watermark 缺失 → WATERMARK_MISSING warning，漂移/预留检查跳过", () => {
  const dir = tmpDir("dec-nowm");
  writeRepo(dir, { watermark: null });
  const result = checkDecisions(dir);
  assert.equal(result.ok, true);
  assert.ok(
    result.problems.some((p) => p.code === DecisionLintCode.WATERMARK_MISSING && p.severity === "warning"),
    JSON.stringify(result.problems),
  );
});

test("DECISIONS.md 缺失 → DECISIONS_MISSING error", () => {
  const dir = tmpDir("dec-missing");
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.code === DecisionLintCode.DECISIONS_MISSING && p.severity === "error"),
    JSON.stringify(result.problems),
  );
});

test("watermark YAML 非法 → WATERMARK_INVALID error", () => {
  const dir = tmpDir("dec-badwm");
  writeRepo(dir, {
    watermark: "next_number: [not-a-number]\n",
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.code === DecisionLintCode.WATERMARK_INVALID && p.severity === "error"),
    JSON.stringify(result.problems),
  );
});

test("--plan 预检：未预留的 D0xx → REF_UNRESOLVED；预留区间零报错（C2-c）", () => {
  const dir = tmpDir("dec-plan");
  writeRepo(dir, {
    tableRows: ["D001|a", "D002|b"],
    sections: ["D001|a", "D002|b"],
    watermark: validWatermark(10, '[{run: "run-2026", start: 5, end: 9}]'),
  });
  fs.writeFileSync(
    path.join(dir, "plan.md"),
    "本 run 决策：D005（预留）、D007（预留）、D099（未预留）\n",
  );
  const result = checkDecisions(dir, { planFile: path.join(dir, "plan.md") });
  assert.ok(
    result.problems.some(
      (p) => p.code === DecisionLintCode.REF_UNRESOLVED && p.number === "D099" && p.file?.includes("plan.md"),
    ),
    JSON.stringify(result.problems),
  );
  assert.ok(
    !result.problems.some((p) => p.number === "D005" || p.number === "D007"),
    "reserved numbers must not be flagged: " + JSON.stringify(result.problems),
  );
});

test("--plan 预检：plan 文件缺失 → PLAN_MISSING error", () => {
  const dir = tmpDir("dec-noplan");
  writeRepo(dir, { watermark: validWatermark(4) });
  const result = checkDecisions(dir, { planFile: path.join(dir, "nope.md") });
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.code === DecisionLintCode.PLAN_MISSING && p.severity === "error"),
    JSON.stringify(result.problems),
  );
});

test("修复前损坏样本（表行/详条重复片段）报 DUP 错误（C2-d 防回归护栏）", () => {
  const dir = tmpDir("dec-guard");
  writeRepo(dir, {
    tableRows: ["D087|缓项", "D088|skill", "D089|skill", "D087|缓项", "D088|拒", "D089|拒"],
    sections: ["D088|skill", "D089|缓项", "D087|缓项", "D088|拒", "D089|拒"],
    watermark: validWatermark(10),
  });
  const result = checkDecisions(dir);
  assert.equal(result.ok, false);
  const codes = result.problems.map((p) => p.code);
  assert.ok(codes.includes(DecisionLintCode.DUP_TABLE), JSON.stringify(result.problems));
  assert.ok(codes.includes(DecisionLintCode.DUP_SECTION), JSON.stringify(result.problems));
});
