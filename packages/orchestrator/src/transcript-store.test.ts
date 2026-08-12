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
