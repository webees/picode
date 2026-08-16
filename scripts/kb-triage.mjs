#!/usr/bin/env node
/**
 * kb-triage.mjs —— picode 知识自主整理器（R17 · D119）
 *
 * 让 picode 自己决定哪些资料入库、哪些忽略：扫描 docs/knowledge 候选，
 * 按四维评分（复用性/新颖性/信号强度/行动关联，各 0-2 分）+ 一票规则
 * （引用保护/重复检测/永久保留）输出「存 / 暂存 / 忽略」建议与理由，
 * 生成整理报告 kb-triage-<run>.md。删除与不确定类批量上报 run-lead，
 * 存储类由 docs 小组自主执行。
 *
 * usage:
 *   node scripts/kb-triage.mjs                      # dry-run：输出建议清单（默认）
 *   node scripts/kb-triage.mjs --apply              # 执行：生成报告入库（不删除任何文件）
 *   node scripts/kb-triage.mjs --run <run-id>       # 指定 run id（报告文件名）
 *   node scripts/kb-triage.mjs -h|--help            # 帮助
 *
 * 护栏：本脚本永不删除文件；「忽略/过时」只出现在建议清单中，
 * 由 docs 小组按 DOC-LIFECYCLE 章程移 .trash/（二次确认）后执行。
 * 零依赖 node（>=20），退出码 0=正常完成（含发现待整理项）。
 */
import fs from "node:fs";
import path from "node:path";

const REPO = process.env.PICODE_REPO_ROOT ?? process.cwd();
const KNOWLEDGE = path.join(REPO, "docs", "knowledge");
const FEEDBACK = path.join(KNOWLEDGE, "feedback");
const EVOLVE = path.join(KNOWLEDGE, "evolve");
const DECISIONS = path.join(REPO, "docs", "DECISIONS.md");
const CATALOG = path.join(REPO, "docs", "reference", "decision-catalog.md");

const RUN_ID = process.argv.find((a, i) => process.argv[i - 1] === "--run")
  ?? "current";
const APPLY = process.argv.includes("--apply");

/* ------------------------------- 评分维度 ------------------------------- */

/** 复用性：内容是否可被未来 run 引用（模板/标准/机制/决策） */
function scoreReuse(file, rel) {
  const base = path.basename(file).toLowerCase();
  if (/template|standard|charter|lifecycle|checklist|quickwin|manual|spec/.test(base))
    return 2;
  if (/decision|e\d+|summary|ledger|persona|talent|research/.test(base))
    return 1;
  return 0;
}

/** 新颖性：是否记录新知识（决策/教训/机制变更） */
function scoreNovelty(text) {
  if (/D\d{3}|决策|决定|修订|修复|新增|教训|根因|机制/.test(text.slice(0, 2000)))
    return 2;
  if (/改进|建议|观察|记录/.test(text.slice(0, 2000)))
    return 1;
  return 0;
}

/** 信号强度：是否含实证数据（数字/命令/exit_code/引用链） */
function scoreSignal(text) {
  let s = 0;
  if (/\b(exit_code|command|log_ref|passed|failed|tests \d+|pass \d+|fail 0)\b/.test(text))
    s += 1;
  if (/([A-Za-z0-9_\-./]+\.(ts|js|sh|mjs|yaml|md))/.test(text))
    s += 1;
  return Math.min(s, 2);
}

/** 行动关联：是否指向后续动作（待办/候选/未闭环） */
function scoreAction(text) {
  if (/待|未|TODO|候选|下轮|后续|需.*(修|补|批|执行)|pending|blocked/.test(text.slice(0, 3000)))
    return 2;
  if (/建议|可|应/.test(text.slice(0, 1000)))
    return 1;
  return 0;
}

/* ------------------------------- 一票规则 ------------------------------- */

function referencedByCore(refs, rel) {
  for (const r of refs)
    if (r.includes(rel) || r.includes(path.basename(rel)))
      return true;
  return false;
}

function permanentClass(rel) {
  // E 纪要 / handoffs / hr 数据底座：永久保留
  return /^evolve\/E\d+|^hr\/(name-ledger|personas|teams)|^handoffs\//.test(rel);
}

/** 字节级重复检测：与 knowledge 内其他文件内容近似（>75% 公共行） */
function detectDuplicate(file, rel, allFiles) {
  const lines = new Set(fs.readFileSync(file, "utf8").split("\n").map(l => l.trim()).filter(Boolean));
  if (lines.size < 10)
    return null;
  for (const other of allFiles) {
    if (other === rel)
      continue;
    try {
      const otherLines = new Set(fs.readFileSync(path.join(KNOWLEDGE, other), "utf8")
        .split("\n").map(l => l.trim()).filter(Boolean));
      if (otherLines.size < 10)
        continue;
      let common = 0;
      for (const l of lines)
        if (otherLines.has(l))
          common += 1;
      if (common / Math.min(lines.size, otherLines.size) > 0.75)
        return other;
    } catch { /* skip */ }
  }
  return null;
}

/* --------------------------------- 扫描 --------------------------------- */

function walk(dir, base = dir) {
  if (!fs.existsSync(dir))
    return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory())
      out.push(...walk(p, base));
    else if (e.isFile() && /\.(md|yaml|yml)$/.test(e.name))
      out.push(p);
  }
  return out;
}

function collectRefs() {
  const refs = [];
  for (const f of [DECISIONS, CATALOG, path.join(REPO, "README.md"),
    path.join(REPO, ".picode", "README.md"), path.join(KNOWLEDGE, "README.md")]) {
    if (fs.existsSync(f))
      refs.push(fs.readFileSync(f, "utf8"));
  }
  return refs;
}

/* --------------------------------- 主流程 --------------------------------- */

const files = [
  ...walk(FEEDBACK).map(p => [p, path.relative(KNOWLEDGE, p)]),
  ...walk(EVOLVE).map(p => [p, path.relative(KNOWLEDGE, p)]),
  ...walk(path.join(KNOWLEDGE, "hr")).map(p => [p, path.relative(KNOWLEDGE, p)]),
  ...walk(path.join(KNOWLEDGE, "research")).map(p => [p, path.relative(KNOWLEDGE, p)]),
];
const allRels = files.map(([, rel]) => rel);
const refs = collectRefs();
const stats = { store: 0, staging: 0, ignore: 0, skipped: 0 };
const rows = [];

for (const [file, rel] of files) {
  if (/README|_index|template|^evolve\/E\d+-SUMMARY/.test(rel)) {
    stats.skipped += 1;
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const sizeKB = Math.round(text.length / 1024);

  // 一票规则
  if (permanentClass(rel)) {
    rows.push({ rel, sizeKB, verdict: "STORE", reason: "永久保留类（E 纪要/handoff/hr 数据底座）", score: 8 });
    stats.store += 1;
    continue;
  }
  const dup = detectDuplicate(file, rel, allRels);
  if (dup) {
    rows.push({ rel, sizeKB, verdict: "IGNORE", reason: `字节重复：与 ${dup} 内容 >75% 相同（合并而非新增）`, score: 0 });
    stats.ignore += 1;
    continue;
  }
  if (sizeKB > 50 && !/research/.test(rel)) {
    rows.push({ rel, sizeKB, verdict: "STAGING", reason: `>50KB 流水账嫌疑（${sizeKB}KB）：暂存待 docs 复核压缩`, score: 3 });
    stats.staging += 1;
    continue;
  }

  // 四维评分
  const score = scoreReuse(file, rel) + scoreNovelty(text) + scoreSignal(text) + scoreAction(text);
  const protectedRef = referencedByCore(refs, rel);
  let verdict, reason;
  if (score >= 6)
    { verdict = "STORE"; reason = `评分 ${score}/8（复用/新颖/信号/行动）`; stats.store += 1; }
  else if (score >= 4 || protectedRef)
    { verdict = "STAGING"; reason = protectedRef ? `评分 ${score}/8 + 被核心文档引用（引用保护）` : `评分 ${score}/8（4-5 分暂存待下轮复核）`; stats.staging += 1; }
  else
    { verdict = "IGNORE"; reason = `评分 ${score}/8（≤3 分：低复用/低信号，忽略不入库）`; stats.ignore += 1; }
  rows.push({ rel, sizeKB, verdict, reason, score });
}

/* --------------------------------- 报告 --------------------------------- */

const reportPath = path.join(FEEDBACK, `kb-triage-${RUN_ID}.md`);
const lines = [];
lines.push(`# kb-triage — ${RUN_ID}（R17 D119 自主知识整理）`);
lines.push("");
lines.push(`- 扫描：docs/knowledge/**（${files.length} 候选，${stats.skipped} 跳过索引/模板）`);
lines.push(`- 判定：STORE ${stats.store} / STAGING ${stats.staging} / IGNORE ${stats.ignore}`);
lines.push(`- 决策标准：四维评分（复用性/新颖性/信号强度/行动关联 0-2 分）+ 一票规则（引用保护/重复检测/永久保留类/流水账上限）`);
lines.push("- 护栏：本报告不删除任何文件；IGNORE/过时项由 docs 按 DOC-LIFECYCLE 移 .trash/ 二次确认后执行");
lines.push("");
lines.push("| 判定 | 文件 | 大小 | 理由 |");
lines.push("|---|---|---|---|");
for (const r of rows)
  lines.push(`| ${r.verdict} | ${r.rel} | ${r.sizeKB}KB | ${r.reason} |`);
lines.push("");
lines.push(`- 生成：${new Date().toISOString()} · kb-triage.mjs（零依赖 node，--apply 生效）`);
lines.push("- 待 run-lead 批阅：STAGING 与 IGNORE 中的「引用保护/删除候选」类批量确认（一次审批多条）");

const report = lines.join("\n") + "\n";
if (APPLY) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  console.log(`[kb-triage] 报告已生成：${reportPath}`);
} else {
  console.log("[kb-triage] dry-run（未写文件）——加 --apply 生成报告");
}
console.log(`[kb-triage] 候选 ${files.length} · STORE ${stats.store} · STAGING ${stats.staging} · IGNORE ${stats.ignore} · 跳过 ${stats.skipped}`);
for (const r of rows.filter(x => x.verdict === "IGNORE").slice(0, 10))
  console.log(`  [IGNORE] ${r.rel} — ${r.reason}`);
process.exit(0);
