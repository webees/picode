import { test } from "node:test";
import { gitInit } from "./test-utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRun, resolveRunDir } from "./run-store.js";
import { TranscriptStore } from "./transcript-store.js";

function setupRun() {
  const repo = gitInit({ prefix: "picode-transcript-" });
  const { runId } = createRun(repo, { title: "goal-001", scale: "S" });
  const { dir } = resolveRunDir(repo, runId);
  return { repo, runId, dir };
}

test("transcript: outgoing/incoming 落盘 runs/<id>/transcripts/<agent>.jsonl（schema_version+type）", async () => {
  const { dir } = setupRun();
  const t = new TranscriptStore(dir);
  await t.recordOutgoing("pm", "你已就绪。开始任务。");
  await t.recordResponse("pm", [{ type: "text", text: "收到，立即执行" }]);

  const entries = t.read("pm");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].schema_version, "1");
  assert.equal(entries[0].type, "outgoing");
  assert.equal(entries[0].agent_id, "pm");
  assert.equal(entries[0].text, "你已就绪。开始任务。");
  assert.equal(entries[1].type, "incoming");
  assert.equal(entries[1].parts?.[0]?.text, "收到，立即执行");

  const file = path.join(dir, "transcripts", "pm.jsonl");
  assert.ok(fs.existsSync(file), "transcript 落盘路径必须存在");
  for (const line of fs.readFileSync(file, "utf8").trim().split("\n")) {
    const obj = JSON.parse(line) as { schema_version?: string; type?: string; agent_id?: string };
    assert.equal(obj.schema_version, "1");
    assert.equal(obj.agent_id, "pm");
    assert.ok(obj.type === "outgoing" || obj.type === "incoming");
  }
});

test("transcript: 无文件时 read 返回 []；损坏文件 historySummary 容错返回 null", async () => {
  const { dir } = setupRun();
  const t = new TranscriptStore(dir);
  assert.deepEqual(t.read("ind-res"), []);
  fs.mkdirSync(path.join(dir, "transcripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "transcripts", "ind-res.jsonl"), "{corrupt!!}\n");
  assert.equal(t.historySummary("ind-res"), null);
});

test("transcript: historySummary 空转录返回 null，有内容生成可读要点", async () => {
  const { dir } = setupRun();
  const t = new TranscriptStore(dir);
  assert.equal(t.historySummary("pm"), null);

  await t.recordOutgoing("pm", "ready 提示：实现模块 A");
  await t.recordResponse("pm", [{ type: "text", text: "模块 A 已实现" }]);
  const summary = t.historySummary("pm")!;
  assert.match(summary, /历史转录共 2 条（outgoing 1 \/ incoming 1）/);
  assert.match(summary, /投喂: ready 提示：实现模块 A/);
  assert.match(summary, /响应: 模块 A 已实现/);
});

test("transcript: historySummary stripNoise 删除 outgoing 命中子串、删空跳过、条数统计不变（纯函数）", async () => {
  const { dir } = setupRun();
  const t = new TranscriptStore(dir);
  await t.recordOutgoing("pm", "你已就绪。按角色 prompt 工作；实现模块 A");
  await t.recordOutgoing("pm", "你已就绪。按角色 prompt 工作；实现模块 B");
  await t.recordOutgoing("pm", "实现模块 C");
  await t.recordResponse("pm", [{ type: "text", text: "模块 C 已实现" }]);

  const summary = t.historySummary("pm", {
    maxEntries: 20,
    stripNoise: ["你已就绪。按角色 prompt 工作；"],
  })!;
  // 条数统计基于原始转录（3 outgoing + 1 incoming），不受 stripNoise 影响
  assert.match(summary, /历史转录共 4 条（outgoing 3 \/ incoming 1）/);
  assert.match(summary, /投喂: 实现模块 A/);
  assert.match(summary, /投喂: 实现模块 B/);
  assert.match(summary, /投喂: 实现模块 C/);
  assert.match(summary, /响应: 模块 C 已实现/);
  assert.ok(!summary.includes("你已就绪"), "stripNoise 命中子串必须从 outgoing 要点中删除");

  // 删除后整条为空 → 该 outgoing 条目跳过（不生成要点行）
  const stripped = t.historySummary("pm", {
    maxEntries: 20,
    stripNoise: ["实现模块"],
  })!;
  assert.match(stripped, /历史转录共 4 条（outgoing 3 \/ incoming 1）/, "统计行仍保留");
  assert.ok(!stripped.includes("投喂: 实现模块"), "删空条目不得生成要点行");
  assert.match(stripped, /响应: 模块 C 已实现/);

  // 纯函数：同输入同输出
  const a = t.historySummary("pm", { stripNoise: ["你已就绪"] });
  const b = t.historySummary("pm", { stripNoise: ["你已就绪"] });
  assert.equal(a, b);
  assert.equal(a, t.historySummary("pm", { stripNoise: ["你已就绪"] }));
});
