#!/usr/bin/env node
/**
 * doc-lean-check.mjs — 文档精简维护检查（零依赖 · 只读 · 退出码 0=通过）。
 *
 * 检查项以 docs/knowledge/feedback/DOC-LIFECYCLE.md（文档生命周期章程 v2 + 索引维护规则）为权威：
 *   1. 决策权威存在（目录结构）：DECISIONS.md / decision-catalog.md / watermark.yaml /
 *      E1-E15-SUMMARY.md（防流水账单一事实源）/ DOC-LIFECYCLE.md
 *   2. 关键目录存在（目录结构）：knowledge/{evolve,feedback,handoffs,hr,research}、plans/、decisions/
 *   3. DECISIONS 行式：详条标题为单行 `## D### — 标题`（或 `## 开放`）、编号唯一、条目非空
 *      （防流水账：只保留决策/教训/可复用知识）
 *   4. feedback 索引覆盖（目录结构）：README.md 存在时须索引全部同级文档
 *      （DOC-LIFECYCLE §2 维护规则：目录文档改动须同步更新本索引表；W3 chunk-docs 转正前缺失仅 warn）
 *   5. 冗余检测：feedback/ 内无字节级重复文档（TTL 表「重复内容立即删除」· 单一事实源）
 *
 * 用法：node scripts/doc-lean-check.mjs [--root <repo-root>]（默认 = 脚本所在目录的上一级）
 * 退出码：0 = 全部检查通过（warn 不影响退出码）；1 = 存在失败项。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");

function parseArgs(argv) {
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") root = path.resolve(argv[i + 1] ?? DEFAULT_ROOT);
  }
  return { root };
}

/** 决策权威存在 + 关键目录存在（DOC-LIFECYCLE 内容地图 / TTL 表）。 */
function checkStructure(root) {
  const problems = [];
  const requiredFiles = [
    "docs/DECISIONS.md",
    "docs/reference/decision-catalog.md",
    "docs/decisions/watermark.yaml",
    "docs/knowledge/evolve/E1-E15-SUMMARY.md",
    "docs/knowledge/feedback/DOC-LIFECYCLE.md",
  ];
  for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(root, rel))) problems.push(`missing: ${rel}`);
  }
  const requiredDirs = [
    "docs/knowledge/evolve",
    "docs/knowledge/feedback",
    "docs/knowledge/handoffs",
    "docs/knowledge/hr",
    "docs/knowledge/research",
    "docs/plans",
    "docs/decisions",
  ];
  for (const rel of requiredDirs) {
    if (!fs.existsSync(path.join(root, rel))) problems.push(`missing dir: ${rel}`);
  }
  return { ok: problems.length === 0, problems, warnings: [] };
}

/**
 * DECISIONS 行式：每条决策详条 = 单行 `## D### — 标题`；编号唯一；条目至少一行事实
 * （决策/教训/可复用知识，防流水账——过程叙述应压缩或删除）。
 */
function checkDecisionsLineFormat(root) {
  const problems = [];
  const warnings = [];
  const file = path.join(root, "docs", "DECISIONS.md");
  if (!fs.existsSync(file)) return { ok: true, problems, warnings: ["docs/DECISIONS.md 缺失（行式检查跳过，结构检查已报）"] };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const seen = new Set();
  let current = null; // current decision number
  let currentHasContent = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      if (current !== null && !currentHasContent) {
        problems.push(`D${current} 条目为空（无事实行）@L${i + 1}`);
      }
      const m = line.match(/^## D(\d{3}) — (.+)$/);
      if (!m) {
        if (line === "## 开放") {
          current = null;
          currentHasContent = true;
          continue;
        }
        problems.push(`非法决策标题（应为 "## D### — 标题" 行式）@L${i + 1}: ${line}`);
        current = null;
        currentHasContent = true;
        continue;
      }
      const num = m[1];
      if (seen.has(num)) problems.push(`决策编号重复 ## D${num} @L${i + 1}`);
      seen.add(num);
      current = num;
      currentHasContent = false;
      continue;
    }
    if (current !== null && line.trim() !== "" && !line.trim().startsWith("|")) {
      currentHasContent = true;
    }
  }
  if (current !== null && !currentHasContent) {
    problems.push(`D${current} 条目为空（无事实行）`);
  }
  return { ok: problems.length === 0, problems, warnings };
}

/** feedback 索引覆盖（DOC-LIFECYCLE §2 维护规则；README 缺失 = W3 chunk-docs 转正项，仅 warn）。 */
function checkFeedbackIndex(root) {
  const problems = [];
  const warnings = [];
  const dir = path.join(root, "docs", "knowledge", "feedback");
  if (!fs.existsSync(dir)) {
    return { ok: true, problems, warnings: ["docs/knowledge/feedback/ 不存在（索引检查跳过）"] };
  }
  const entries = fs.readdirSync(dir).filter((e) => fs.statSync(path.join(dir, e)).isFile());
  const nonMd = entries.filter((e) => !e.toLowerCase().endsWith(".md"));
  if (nonMd.length) problems.push(`feedback/ 存在非 .md 文件（冗余）：${nonMd.join(", ")}`);
  const mdFiles = entries.filter((e) => e.toLowerCase().endsWith(".md") && e !== "README.md");
  const readmePath = path.join(dir, "README.md");
  if (!fs.existsSync(readmePath)) {
    warnings.push(
      "feedback/README.md 缺失：DOC-LIFECYCLE §2 索引表待 chunk-docs（W3）转正；索引落地后强制覆盖检查",
    );
  } else {
    const readmeText = fs.readFileSync(readmePath, "utf8");
    const missing = mdFiles.filter((f) => !readmeText.includes(f));
    if (missing.length) {
      problems.push(
        `feedback/README.md 未索引以下文档（DOC-LIFECYCLE §2 维护规则）：${missing.join(", ")}`,
      );
    }
  }
  return { ok: problems.length === 0, problems, warnings };
}

/** 冗余检测：feedback/ 内字节级重复文档（TTL 表「重复内容立即删除」· 单一事实源）。 */
function checkRedundancy(root) {
  const problems = [];
  const warnings = [];
  const dir = path.join(root, "docs", "knowledge", "feedback");
  if (!fs.existsSync(dir)) return { ok: true, problems, warnings };
  const mdFiles = fs
    .readdirSync(dir)
    .filter((e) => e.toLowerCase().endsWith(".md") && fs.statSync(path.join(dir, e)).isFile());
  const byHash = new Map();
  for (const f of mdFiles) {
    const h = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(dir, f)))
      .digest("hex");
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }
  for (const [h, names] of byHash) {
    if (names.length > 1) {
      problems.push(`feedback/ 冗余重复文档（字节一致，应保留单一事实源）：${names.join(", ")}`);
    }
  }
  return { ok: problems.length === 0, problems, warnings };
}

const { root } = parseArgs(process.argv.slice(2));
const checks = [
  { name: "结构（决策权威 + 关键目录）", ...checkStructure(root) },
  { name: "DECISIONS 行式", ...checkDecisionsLineFormat(root) },
  { name: "feedback 索引覆盖", ...checkFeedbackIndex(root) },
  { name: "冗余检测（feedback/）", ...checkRedundancy(root) },
];

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log(`[ok] ${c.name}`);
  else {
    failed++;
    console.log(`[fail] ${c.name}`);
  }
  for (const w of c.warnings) console.log(`  [warn] ${w}`);
  for (const p of c.problems) console.log(`  - ${p}`);
}
if (failed > 0) {
  console.error(`doc-lean-check: FAIL（${failed} 项检查未通过）`);
  process.exit(1);
}
console.log("doc-lean-check: OK — 文档精简结构检查通过（可作 merge gate 输入）");
