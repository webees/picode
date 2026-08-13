import { useQuery } from '@tanstack/vue-query'

import { apiFetch } from '@/lib/api-client'

/**
 * Picode dashboard-server 只读 API（D070 / D7 契约，9 端点全 GET）。
 * 类型与 packages/dashboard-server/src/router.ts 的 JSON 响应一一对应。
 * 复用 orchestrator 纯读投影：statusSnapshot / buildBoard / readMergeQueue /
 * readProgress / readGoal / SessionStore。
 */

/* ---------------------------------- types ---------------------------------- */

export interface RunSummary {
  run_id: string
  status: string
  scale: string
  title: string
  kind: string
  created_at: string
  acceptance: number
  product_acceptance: number
}

export interface GoalState {
  schema_version?: string
  id: string
  title: string
  intent: string
  status: string
  scale: string
  kind: string
  target_repo: string | null
  open_questions: string[]
  acceptance: Array<{ id: string, type: string, spec: string }>
  product_acceptance: string[]
  non_goals: string[]
  run_lead_id: string
  user_confirmed_at: string | null
  created_at: string
  parked_at: string | null
  park_reason: string | null
}

export interface ContinuationSession {
  agent_id: string
  state: string
  continuations_used: number
  max_per_session: number
  last_continuation_at: string | null
  in_flight: boolean
  platform_seat: boolean
}

export interface ContinuationTelemetry {
  max_per_session: number
  idle_sec: number
  sessions: ContinuationSession[]
}

export interface StatusSnapshot {
  run_id: string
  goal: {
    status: string
    scale: string
    product_acceptance: number
    acceptance: number
  }
  sessions: {
    total: number
    awake: string[]
    sleeping: number
    terminated: number
    errored: string[]
  }
  rooms: Array<{ room: string, messages: number }>
  tasks: Array<{
    task_id: string
    status: string
    brief: string
    staffing: string
    progress_phase: string | null
  }>
  merge_queue: { queued: number, merged: number, failed: number }
  continuation: ContinuationTelemetry
}

export interface RunDetail {
  run_id: string
  goal: GoalState
  run: Record<string, unknown> | null
  snapshot: StatusSnapshot
}

export type BoardColumn
  = 'Backlog'
    | '分块'
    | '双门闩中'
    | '进行中'
    | '验证中'
    | '交接中'
    | '已完成'

export interface BoardCard {
  id: string
  kind: 'task' | 'intake' | 'chunk'
  title: string
  column: BoardColumn
  owner: string
  blocked: boolean
  detail: string
}

export interface BoardView {
  run: string
  cards: BoardCard[]
  columns: BoardColumn[]
}

export interface ChunkItem {
  id: string
  write_paths: string[]
  read_paths: string[]
  public_contract: string | null
  depends_on: string[]
  shared_files: string[]
  acceptance: Array<{ id?: string, type?: string, spec?: string }>
  status: string | null
  task_id: string | null
}

export interface ChunksView {
  schema_version?: string
  chunks: ChunkItem[]
}

export interface TaskLatch {
  brief: string | null
  staffing: string | null
}

export interface TaskProgress {
  task_id: string
  phase: string
  blocked: boolean
  summary: string
  updated_at: string
}

export interface TaskItem {
  task_id: string
  chunk_id: string
  goal_id: string
  kind: string
  status: string
  write_paths: string[]
  read_paths: string[]
  acceptance: Array<{ id: string, type: string, spec: string }>
  triad: Record<string, string>
  work_room: string
  retries: number
  max_retries: number
  latch: TaskLatch
  progress: TaskProgress | null
  evidence: unknown
}

export interface TasksView {
  tasks: TaskItem[]
}

export interface SessionItem {
  schema_version: string
  agent_id: string
  role_id: string
  state: 'registered' | 'sleeping' | 'awake' | 'terminated'
  pi_session_id: string | null
  last_wake_at: string | null
  last_sleep_at: string | null
  wake_reason: string | null
  persona_path: string | null
  error: string | null
  budget?: { turns: number, continuations: number }
}

export interface SessionsView {
  sessions: SessionItem[]
  continuation: ContinuationTelemetry
}

export interface MergeRequest {
  id: string
  ts: string
  task_id: string
  from: string
  status: 'queued' | 'merged' | 'failed'
  merged_at: string | null
  error: string | null
}

export interface MergeView {
  queue: MergeRequest[]
  counts: { queued: number, merged: number, failed: number }
}

export interface GateFile {
  file: string
  data: Record<string, unknown> | null
}

export interface GateEvidence {
  task_id: string
  evidence: Record<string, unknown> | null
}

export interface GatesView {
  gates: GateFile[]
  evidence: GateEvidence[]
}

export interface LiveTokenSample {
  total: number
  input: number
  output: number
  created: number | null
}

export type LiveResult
  = { ok: true, agent_id: string, serve_session_id: string | null, tokens: LiveTokenSample | null, at: string }
    | { ok: false, agent_id: string, serve_session_id: string | null, error: string }

export interface RunsView {
  runs: RunSummary[]
}

/* --------------------------------- fetchers -------------------------------- */

export function fetchRuns(): Promise<RunsView> {
  return apiFetch<RunsView>('/runs')
}

export function fetchRun(runId: string): Promise<RunDetail> {
  return apiFetch<RunDetail>(`/runs/${runId}`)
}

export function fetchBoard(runId: string): Promise<BoardView> {
  return apiFetch<BoardView>(`/runs/${runId}/board`)
}

export function fetchChunks(runId: string): Promise<ChunksView> {
  return apiFetch<ChunksView>(`/runs/${runId}/chunks`)
}

export function fetchTasks(runId: string): Promise<TasksView> {
  return apiFetch<TasksView>(`/runs/${runId}/tasks`)
}

export function fetchSessions(runId: string): Promise<SessionsView> {
  return apiFetch<SessionsView>(`/runs/${runId}/sessions`)
}

export function fetchMerge(runId: string): Promise<MergeView> {
  return apiFetch<MergeView>(`/runs/${runId}/merge`)
}

export function fetchGates(runId: string): Promise<GatesView> {
  return apiFetch<GatesView>(`/runs/${runId}/gates`)
}

export function fetchLiveTokens(runId: string, agentId: string): Promise<LiveResult> {
  return apiFetch<LiveResult>(`/live/${runId}/${encodeURIComponent(agentId)}`)
}

/* ---------------------------------- hooks ---------------------------------- */

/** 轮询周期：tokens 实时页（D5 约定 2–5s）。 */
export const LIVE_POLL_INTERVAL_MS = 3000

/** GET /api/runs — run 列表卡片。 */
export function useRuns() {
  return useQuery({
    queryKey: ['picode', 'runs'],
    queryFn: () => fetchRuns(),
  })
}

/** GET /api/runs/:id — goal + run.yaml + statusSnapshot。 */
export function useRun(runId: string) {
  return useQuery({
    queryKey: ['picode', 'run', runId],
    queryFn: () => fetchRun(runId),
    enabled: !!runId,
  })
}

/** GET /api/runs/:id/board — buildBoard 7 列看板。 */
export function useBoard(runId: string) {
  return useQuery({
    queryKey: ['picode', 'board', runId],
    queryFn: () => fetchBoard(runId),
    enabled: !!runId,
  })
}

/** GET /api/runs/:id/chunks — chunks.yaml 原样。 */
export function useChunks(runId: string) {
  return useQuery({
    queryKey: ['picode', 'chunks', runId],
    queryFn: () => fetchChunks(runId),
    enabled: !!runId,
  })
}

/** GET /api/runs/:id/tasks — 任务 + latch + progress + evidence。 */
export function useTasks(runId: string) {
  return useQuery({
    queryKey: ['picode', 'tasks', runId],
    queryFn: () => fetchTasks(runId),
    enabled: !!runId,
  })
}

/** GET /api/runs/:id/sessions — 会话表 + continuation 遥测。 */
export function useSessions(runId: string) {
  return useQuery({
    queryKey: ['picode', 'sessions', runId],
    queryFn: () => fetchSessions(runId),
    enabled: !!runId,
  })
}

/** GET /api/runs/:id/merge — merge_queue 全量 + 计数。 */
export function useMerge(runId: string) {
  return useQuery({
    queryKey: ['picode', 'merge', runId],
    queryFn: () => fetchMerge(runId),
    enabled: !!runId,
  })
}

/** GET /api/runs/:id/gates — gates/ + 各任务 evidence。 */
export function useGates(runId: string) {
  return useQuery({
    queryKey: ['picode', 'gates', runId],
    queryFn: () => fetchGates(runId),
    enabled: !!runId,
  })
}

/** GET /api/live/:runId/:agent — serve tokens 实时轮询（D5 2–5s）。 */
export function useLiveTokens(
  runId: string,
  agentId: string,
  opts: { enabled?: boolean, refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: ['picode', 'live', runId, agentId],
    queryFn: () => fetchLiveTokens(runId, agentId),
    enabled: (opts.enabled ?? true) && !!runId && !!agentId,
    refetchInterval: opts.refetchInterval ?? LIVE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: LIVE_POLL_INTERVAL_MS,
  })
}
