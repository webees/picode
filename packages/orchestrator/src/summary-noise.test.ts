import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTINUATION_PROMPT,
  CONTINUATION_SUMMARY_HEADER,
  READY_MESSAGE_TEXT,
  SUMMARY_STRIP_NOISE,
} from "./summary-noise.js";

test("D092: READY_MESSAGE_TEXT / CONTINUATION_PROMPT / CONTINUATION_SUMMARY_HEADER 非空且含关键语义", () => {
  assert.ok(READY_MESSAGE_TEXT.length > 0, "ready 模板不得为空");
  assert.ok(READY_MESSAGE_TEXT.startsWith("你已就绪"), "ready 模板以就绪提示开头");
  assert.ok(CONTINUATION_PROMPT.length > 0, "续跑模板不得为空");
  assert.ok(CONTINUATION_PROMPT.startsWith("检测到本会话已空闲"), "续跑模板以空闲检测开头");
  assert.equal(CONTINUATION_SUMMARY_HEADER, "## 上一回合要点（转录摘要）");
});

test("D092: SUMMARY_STRIP_NOISE 恰好 = [READY_MESSAGE_TEXT, CONTINUATION_PROMPT]", () => {
  assert.deepEqual(SUMMARY_STRIP_NOISE, [READY_MESSAGE_TEXT, CONTINUATION_PROMPT]);
  assert.equal(new Set(SUMMARY_STRIP_NOISE).size, SUMMARY_STRIP_NOISE.length, "剔噪清单不得重复");
});

test("D092: summary-noise.ts 零 import（无任何外部依赖，可安全被任意模块引用）", () => {
  const src = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/summary-noise.ts"),
    "utf8",
  );
  assert.ok(!/^\s*import\s/m.test(src), "模块必须零 import");
  assert.ok(!/^\s*require\(/m.test(src), "模块必须零 require");
});
