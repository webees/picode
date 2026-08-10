import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEnv, call, loadExtension, makeRun } from "./extension-harness.js";

function webTools(): { runsRoot: string; runId: string; token: string; tools: Map<string, import("./extension-harness.js").Tool> } {
  // keep the baseEnv agent id (engineer@task-a) so the issued token matches auth
  const { runsRoot, runId, token } = makeRun("engineer@task-a");
  const tools = loadExtension({
    ...baseEnv,
    PICODE_TOOL_PROFILE: "research.ind-res",
    PICODE_RUNS_ROOT: runsRoot,
    PICODE_RUN_ID: runId,
    PICODE_AGENT_TOKEN: token,
  });
  return { runsRoot, runId, token, tools };
}

test("web_fetch refuses non-http(s) schemes (BAD_URL)", async () => {
  const { tools } = webTools();
  const file = await call(tools, "web_fetch", { url: "file:///etc/passwd" });
  assert.equal(file.ok, false);
  assert.equal(file.code, "BAD_URL");
});

test("web_fetch blocks private/loopback/link-local hosts (SSRF guard)", async () => {
  const { tools } = webTools();
  const cases: Array<[string, string]> = [
    ["http://localhost:8080/x", "localhost"],
    ["http://169.254.169.254/latest", "169.254.169.254"],
    // bypass variants: IPv4 shorthand, integer form, IPv6 loopback, trailing dot
    ["http://127.1/x", "127.1"],
    ["http://2130706433/x", "2130706433"],
    ["http://[::1]/x", "::1"],
    ["http://localhost./x", "localhost."],
    // v4-mapped hex form, IPv6 ULA + link-local
    ["http://[::ffff:7f00:1]/x", "::ffff:7f00:1"],
    ["http://[fc00::1]/x", "fc00::1"],
    ["http://[fe80::1]/x", "fe80::1"],
  ];
  for (const [url, label] of cases) {
    const r = await call(tools, "web_fetch", { url });
    assert.equal(r.ok, false, `${url} must be blocked`);
    assert.equal(r.code, "URL_BLOCKED", `${label} blocked with URL_BLOCKED`);
  }
});

test("web_fetch rejects malformed URLs", async () => {
  const { tools } = webTools();
  const r = await call(tools, "web_fetch", { url: "not a url" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "BAD_URL");
});
