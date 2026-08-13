/**
 * Management surface (D064): wraps orchestrator store functions 1:1 so the
 * MCP client can drive the full picode lifecycle — init → goal → chunk →
 * brief/staffing double latch → prepare → evidence → handoff → merge →
 * dissolve — with every existing gate, lock and invariant intact.
 *
 * All tools accept a `run_id` param (defaults to server env PICODE_RUN_ID).
 * Side-effectful tools (session_wake/sleep/terminate, task_prepare,
 * merge_process, task_dissolve) are flagged in their descriptions.
 */
import {
  approveBrief,
  approveStaffing,
  ackHandoff,
  ackMemoryBrief,
  addChunkAndTask,
  buildBoard,
  checkPersonas,
  createChangeOrder,
  createRun,
  createStaffingRequest,
  deriveEvents,
  deriveContinuationTargets,
  dissolveTask,
  draftBrief,
  draftPersonas,
  enqueueMerge,
  feedContinuation,
  guardianTick,
  ingestTaskKnowledge,
  mergeNext,
  packageHandoff,
  parkGoal,
  prepareTask,
  readGoal,
  readScores,
  renderBoard,
  setGoalStatus,
  setProductAcceptance,
  SessionStore,
  sleepAgent,
  statusSnapshot,
  submitEvidence,
  sweepProgress,
  terminateAgent,
  unparkGoal,
  wakeAgent,
  writeEvolveKnowledgeLog,
  writeMemoryBrief,
  addFeed,
  triageFeed,
  closeFeed,
} from "@picode/orchestrator";
import { evolveWritePaths, type EvolveLayer, type GoalKind } from "@picode/core";
import type { ToolDef } from "./registry.js";
import { requireRun, type ServerEnv } from "./context.js";

/** Common run selector on every management tool. */
function withRun(
  name: string,
  description: string,
  props: Record<string, unknown>,
  required: string[],
  run: (p: Record<string, unknown>, env: ServerEnv) => Promise<unknown> | unknown,
): ToolDef {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        run_id: {
          type: "string",
          description: "run id（默认取服务器环境 PICODE_RUN_ID）",
        },
        ...props,
      },
      required: required.filter((k) => k !== "run_id"),
    },
    run,
  };
}

function str(p: Record<string, unknown>, k: string): string | undefined {
  return p[k] === undefined ? undefined : String(p[k]);
}

function strArr(p: Record<string, unknown>, k: string): string[] | undefined {
  const v = p[k];
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return [String(v)];
  return v.map((x) => String(x));
}

function bool(p: Record<string, unknown>, k: string): boolean | undefined {
  return p[k] === undefined ? undefined : Boolean(p[k]);
}

export function managementTools(): ToolDef[] {
  return [
    withRun(
      "init_run",
      "初始化 run（goal intake）。返回 {runId, dir}。self_evolve 时须给 target_repo。",
      {
        title: { type: "string" },
        scale: { type: "string", enum: ["S", "M", "L"] },
        intent: { type: "string" },
        kind: { type: "string", enum: ["delivery", "self_evolve"] },
        target_repo: { type: "string", description: "self_evolve 目标仓（须 picode monorepo）" },
        evolve_layers: { type: "array", items: { type: "string" } },
        evolve_risk: { type: "string", enum: ["low", "medium", "high"] },
      },
      ["title"],
      (p, env) => {
        const { runId, dir } = createRun(env.repo, {
          title: String(p.title),
          scale: p.scale as "S" | "M" | "L" | undefined,
          intent: str(p, "intent"),
          kind: p.kind as GoalKind | undefined,
          targetRepo: str(p, "target_repo"),
          evolveLayers: p.evolve_layers as EvolveLayer[] | undefined,
          evolveRisk: p.evolve_risk as "low" | "medium" | "high" | undefined,
        });
        return { ok: true, runId, dir };
      },
    ),
    withRun(
      "board_view",
      "看板只读投影（run 状态 + 各列卡片），零写路径。",
      {},
      [],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const board = buildBoard(dir);
        return { ok: true, board, rendered: renderBoard(board) };
      },
    ),
    withRun(
      "run_status",
      "run 快照（goal/chunks/tasks/sessions 聚合只读状态）。",
      {},
      [],
      (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, status: statusSnapshot(dir, config) };
      },
    ),
    withRun(
      "goal_set_status",
      "迁移 goal 状态；active 前置门闩：无 open_questions 且产品验收已设（P01）。",
      {
        status: { type: "string", enum: ["active", "completed", "cancelled", "parked"] },
        clear_open_questions: { type: "boolean" },
        skip_product_acceptance_check: { type: "boolean" },
      },
      ["status"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const goal = setGoalStatus(dir, p.status as never, {
          clearOpenQuestions: bool(p, "clear_open_questions"),
          skipProductAcceptanceCheck: bool(p, "skip_product_acceptance_check"),
        });
        return { ok: true, goal };
      },
    ),
    withRun(
      "goal_set_product_acceptance",
      "设置产品验收口径（active 的前置门闩）。items 为字符串数组。",
      { items: { type: "array", items: { type: "string" } } },
      ["items"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const goal = setProductAcceptance(dir, strArr(p, "items") ?? []);
        return { ok: true, goal };
      },
    ),
    withRun(
      "goal_park",
      "停放 goal（draft 防静默激活）。",
      { reason: { type: "string" } },
      [],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, goal: parkGoal(dir, str(p, "reason")) };
      },
    ),
    withRun(
      "goal_unpark",
      "解除停放。",
      {},
      [],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, goal: unparkGoal(dir) };
      },
    ),
    withRun(
      "chunk_add",
      "加实现块/任务（要求 goal active）。write_paths 是任务写集（worktree 内）。",
      {
        chunk_id: { type: "string" },
        write_paths: { type: "array", items: { type: "string" } },
        read_paths: { type: "array", items: { type: "string" } },
      },
      ["chunk_id", "write_paths"],
      (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        const task = addChunkAndTask(repo, dir, config, {
          chunkId: String(p.chunk_id),
          writePaths: strArr(p, "write_paths") ?? [],
          readPaths: strArr(p, "read_paths"),
        });
        return { ok: true, ...task };
      },
    ),
    withRun(
      "brief_draft",
      "起草工作简报（双门闩之一），生成 WORK_BRIEF.md 草稿。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        draftBrief(dir, String(p.task_id));
        return { ok: true, task_id: String(p.task_id), status: "draft" };
      },
    ),
    withRun(
      "brief_approve",
      "批准工作简报（双门闩之一，须 run-lead 身份）。",
      { task_id: { type: "string" }, by: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        approveBrief(dir, String(p.task_id), str(p, "by") ?? "run-lead");
        return { ok: true, task_id: String(p.task_id), status: "approved" };
      },
    ),
    withRun(
      "task_prepare",
      "任务准备：建 git worktree + 签发三角 token（副作用：真实 git worktree）。双门闩未齐被拒。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        const r = prepareTask(repo, dir, config, String(p.task_id));
        return { ok: true, task_id: String(p.task_id), ...r };
      },
    ),
    withRun(
      "task_dissolve",
      "解散任务（普通 5 道闸；force 先 auto-commit WIP 再删 worktree）。副作用：git 清理。",
      {
        task_id: { type: "string" },
        force: { type: "boolean" },
        status: { type: "string", enum: ["failed", "cancelled"] },
      },
      ["task_id"],
      async (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        const r = await dissolveTask(repo, dir, config, String(p.task_id), {
          force: bool(p, "force"),
          status: p.status as "failed" | "cancelled" | undefined,
        });
        return { ok: true, ...r };
      },
    ),
    withRun(
      "staffing_request",
      "用工单（run-lead → people）。唤醒 people 角色。",
      {
        task_id: { type: "string" },
        skills: { type: "array", items: { type: "string" } },
        constraints: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        team_name: { type: "string" },
        codename_overrides: { type: "object" },
      },
      ["task_id"],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const r = await createStaffingRequest(dir, config, String(p.task_id), {
          skills: strArr(p, "skills"),
          constraints: strArr(p, "constraints"),
          notes: str(p, "notes"),
          teamName: str(p, "team_name"),
          codenameOverrides: p.codename_overrides as Record<string, string> | undefined,
        });
        return { ok: true, ...r };
      },
    ),
    withRun(
      "staffing_draft_personas",
      "机械起草三角人设（人员 QA 前一步）。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, ...draftPersonas(repo, dir, config, String(p.task_id)) };
      },
    ),
    withRun(
      "staffing_check",
      "人员 QA：人设维度校验，返回问题清单（空数组 = 通过）。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, issues: checkPersonas(dir, config, String(p.task_id)) };
      },
    ),
    withRun(
      "staffing_approve",
      "批准用工（双门闩之二）：QA 通过 → 锁定身份台账 → 注册三角会话 → brief 已批则触发 task_ready 唤醒。",
      { task_id: { type: "string" }, by: { type: "string" } },
      ["task_id"],
      async (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        const r = await approveStaffing(repo, dir, config, String(p.task_id), str(p, "by") ?? "run-lead");
        return { ok: true, ...r };
      },
    ),
    withRun(
      "staffing_scores",
      "读任务评分（评分档案或 null）。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, scores: readScores(dir, String(p.task_id)) };
      },
    ),
    withRun(
      "session_roster",
      "会话花名册（直接读 SessionStore；状态/角色/pi_session_id）。执行面同名 session_list 走 ACL 校验。",
      {},
      [],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const sessions = new SessionStore(dir).list();
        return {
          ok: true,
          awake_count: sessions.filter((s) => s.state === "awake").length,
          sessions,
        };
      },
    ),
    withRun(
      "session_register",
      "注册会话（sponsor 拒绝；initial_state 默认 registered）。",
      {
        role_id: { type: "string" },
        agent_id: { type: "string" },
        initial_state: { type: "string", enum: ["registered", "sleeping"] },
      },
      ["role_id"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const rec = new SessionStore(dir).register(String(p.role_id), {
          agentId: str(p, "agent_id"),
          initialState: p.initial_state as "registered" | "sleeping" | undefined,
        });
        return { ok: true, session: rec };
      },
    ),
    withRun(
      "session_wake_direct",
      "直接唤醒会话（不经 sess-mgr 指令队列；副作用：opencode serve 建会话 / Pi 进程 / 纯状态机）。force 可绕过 max_awake。",
      { agent_id: { type: "string" }, reason: { type: "string" }, force: { type: "boolean" } },
      ["agent_id"],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const r = await wakeAgent(dir, config, String(p.agent_id), str(p, "reason") ?? "mcp-wake", {
          force: bool(p, "force"),
        });
        return { ok: true, ...r };
      },
    ),
    withRun(
      "session_sleep_direct",
      "直接休眠会话（不经 sess-mgr 指令队列；副作用：opencode 服务端 DELETE / 停 Pi 进程 / 状态机）。",
      { agent_id: { type: "string" }, reason: { type: "string" } },
      ["agent_id"],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const rec = await sleepAgent(dir, config, String(p.agent_id), str(p, "reason") ?? "mcp-sleep");
        return { ok: true, session: rec };
      },
    ),
    withRun(
      "session_terminate",
      "终止会话（副作用：先清后端资源再状态机 terminate）。",
      { agent_id: { type: "string" }, reason: { type: "string" } },
      ["agent_id"],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const rec = await terminateAgent(dir, config, String(p.agent_id), str(p, "reason") ?? "mcp-terminate");
        return { ok: true, session: rec };
      },
    ),
    withRun(
      "evidence_submit",
      "提交 sdet 证据。pass 要求：至少一条命令且全部 exit_code=0 + log_ref（P07）。",
      {
        task_id: { type: "string" },
        cmds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cmd: { type: "string" },
              exit_code: { type: "number" },
              log_ref: { type: "string" },
            },
            required: ["cmd", "exit_code", "log_ref"],
          },
        },
        by: { type: "string" },
      },
      ["task_id", "cmds"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const ev = submitEvidence(dir, String(p.task_id), {
          cmds: p.cmds as Array<{ cmd: string; exit_code: number; log_ref: string | null }>,
          by: str(p, "by") ?? "sdet",
        });
        return { ok: true, evidence: ev };
      },
    ),
    withRun(
      "handoff_package",
      "生成/校验交接包（T06 diff⊆write_paths、T07 证据已过）。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, task_id: String(p.task_id), ...packageHandoff(repo, dir, config, String(p.task_id)) };
      },
    ),
    withRun(
      "handoff_ack",
      "交接确认（T08：docs-lead/tpm 或下游 squad-lead）。",
      { task_id: { type: "string" }, by: { type: "string" }, notes: { type: "string" } },
      ["task_id", "by"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const acc = ackHandoff(dir, String(p.task_id), String(p.by), str(p, "notes"));
        return { ok: true, acceptance: acc };
      },
    ),
    withRun(
      "merge_enqueue",
      "并入队（merge.lock 串行 append）。",
      { task_id: { type: "string" }, from: { type: "string" } },
      ["task_id"],
      async (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, request: await enqueueMerge(dir, String(p.task_id), str(p, "from") ?? "release-eng") };
      },
    ),
    withRun(
      "merge_process",
      "合并队首（副作用：真实 git merge --no-ff 到 base_branch；E4 验证门；拓扑依赖；失败自动 abort）。",
      {},
      [],
      async (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, outcome: await mergeNext(repo, dir, config) };
      },
    ),
    withRun(
      "intake_add",
      "sponsor 随时投喂 feed（内部分诊入口）：写 runs/<id>/intake/feed-<ts>.yaml，status=open。type ∈ 需求|研究|文档|问题。",
      {
        type: { type: "string" },
        body: { type: "string" },
        from: { type: "string", description: "投喂人（默认 sponsor）" },
      },
      ["type", "body"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const feed = addFeed(dir, {
          type: String(p.type),
          body: String(p.body),
          from: str(p, "from"),
        });
        return { ok: true, feed };
      },
    ),
    withRun(
      "intake_triage",
      "run-lead 内部分诊：指派 agent，status→triaged + assigned_to，bus 通知 leadership（intake_triaged）。",
      { id: { type: "string" }, to: { type: "string" } },
      ["id", "to"],
      async (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, feed: await triageFeed(dir, String(p.id), String(p.to)) };
      },
    ),
    withRun(
      "intake_close",
      "关闭 feed（→ done）。",
      { id: { type: "string" } },
      ["id"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, feed: closeFeed(dir, String(p.id)) };
      },
    ),
    withRun(
      "memory_brief_write",
      "写 Memory Brief（docs 小组 → run-lead 交付记忆面）。",
      {
        l1_summary: { type: "string" },
        l2_paths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        by: { type: "string" },
      },
      ["l1_summary"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        const brief = writeMemoryBrief(dir, {
          l1_summary: String(p.l1_summary),
          l2_paths: strArr(p, "l2_paths"),
          risks: strArr(p, "risks"),
          by: str(p, "by"),
        });
        return { ok: true, brief };
      },
    ),
    withRun(
      "memory_brief_ack",
      "run-lead 确认 Memory Brief（幂等）。",
      { id: { type: "string" }, by: { type: "string" } },
      ["id"],
      (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, brief: ackMemoryBrief(dir, String(p.id), str(p, "by")) };
      },
    ),
    withRun(
      "change_order_create",
      "需求变更单（run-lead 签发，bus 通知 leadership）。",
      { task_id: { type: "string" }, summary: { type: "string" }, by: { type: "string" } },
      ["task_id", "summary"],
      async (p, env) => {
        const { dir } = requireRun(env, str(p, "run_id"));
        return { ok: true, change_order: await createChangeOrder(dir, String(p.task_id), String(p.summary), str(p, "by") ?? "run-lead") };
      },
    ),
    withRun(
      "knowledge_ingest",
      "任务知识入库（L2：docs/knowledge/<task_id>.md）。",
      { task_id: { type: "string" } },
      ["task_id"],
      (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, written: ingestTaskKnowledge(repo, dir, config, String(p.task_id)) };
      },
    ),
    withRun(
      "evolve_write_paths",
      "self_evolve 写集（19 §4）。非 self_evolve run 返回空数组。",
      {},
      [],
      (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const goal = readGoal(dir);
        if (goal.kind !== "self_evolve" || !goal.evolve) return { ok: true, write_paths: [] };
        return { ok: true, write_paths: evolveWritePaths(config, goal.evolve) };
      },
    ),
    withRun(
      "evolve_log",
      "写进化知识纪要 knowledge/evolve/<run_id>.md（E6）。",
      {
        summary: { type: "string" },
        diff_summary: { type: "string" },
        tests: { type: "string" },
        risks: { type: "string" },
      },
      ["summary"],
      (p, env) => {
        const { repo, dir, config } = requireRun(env, str(p, "run_id"));
        const written = writeEvolveKnowledgeLog(repo, dir, config, {
          summary: String(p.summary),
          diffSummary: str(p, "diff_summary"),
          tests: str(p, "tests"),
          risks: str(p, "risks"),
        });
        return { ok: true, written };
      },
    ),
    withRun(
      "self_drive_tick",
      "守护 tick：park draft → drain 指令队列 → 推导+应用规则事件 → sweep 进度（可选 idle sleep）。",
      { idle_sleep: { type: "boolean" } },
      [],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, tick: await guardianTick(dir, config, { idleSleep: bool(p, "idle_sleep") }) };
      },
    ),
    withRun(
      "self_drive_events",
      "预览：从 run 状态推导该触发的规则事件（不执行）。",
      {},
      [],
      (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, events: deriveEvents(dir, config) };
      },
    ),
    withRun(
      "progress_sweep",
      "stale 进度清扫（触发 progress_due 事件）。",
      {},
      [],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        return { ok: true, sweep: await sweepProgress(dir, config) };
      },
    ),
    withRun(
      "continuation_status",
      "续跑候选只读预览（C2）：派生当前可续跑的 idle awake oc- 会话（同 deriveContinuationTargets），零投喂、零写路径。",
      {},
      [],
      (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const targets = deriveContinuationTargets(dir, config);
        return { ok: true, count: targets.length, targets };
      },
    ),
    withRun(
      "continuation_feed",
      "向单个会话手动投喂一次续跑 prompt（C2：包装 feedContinuation）。成功 → budget.continuations +1 并持久化；会话非 awake / 非 opencode 会话 → fed:false（不计数）。",
      { agent_id: { type: "string" } },
      ["agent_id"],
      async (p, env) => {
        const { dir, config } = requireRun(env, str(p, "run_id"));
        const res = await feedContinuation(dir, config, String(p.agent_id));
        if (!res) {
          return {
            ok: true,
            fed: false,
            agent_id: String(p.agent_id),
            reason: "not-awake-or-not-opencode-session",
          };
        }
        return { ok: true, fed: true, ...res };
      },
    ),
  ];
}
