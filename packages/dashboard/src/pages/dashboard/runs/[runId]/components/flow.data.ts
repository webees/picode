import type { BadgeVariant } from '@/lib/utils'

import type { ChunkItem, MergeRequest, TaskItem } from '@/services/api/picode.api'

import type { ApprovalItem, ApprovalStatus, ChangeOrder, ChangeOrderStatus } from '@/services/api/flow.api'

/**
 * 流程可视化派生层（chunk-flow-ui）：审批流 / 变更单 / 门禁状态机 / 合并等待原因。
 * 纯函数，无副作用 —— __tests__/flow.test.ts fixture 断言。
 * 标签本地化策略（labels.ts owner=chunk-chat-ui，不改）：审批/变更单/门禁阶段标签
 * 落本文件（gates-panel resultLabel 先例）。
 */

/* ------------------------------ 标签与徽章映射 ------------------------------ */

export const APPROVAL_STATUS_ZH: Record<ApprovalStatus, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
  used: '已使用',
}

export const APPROVAL_STATUS_BADGE: Record<ApprovalStatus, BadgeVariant> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
  used: 'secondary',
}

export const CHANGE_ORDER_STATUS_ZH: Record<ChangeOrderStatus, string> = {
  proposed: '已提议',
  applied: '已应用',
  closed: '已关闭',
}

export const CHANGE_ORDER_STATUS_BADGE: Record<ChangeOrderStatus, BadgeVariant> = {
  proposed: 'outline',
  applied: 'default',
  closed: 'secondary',
}

export const SANDBOX_MODE_ZH: Record<string, string> = {
  read: '只读',
  'workspace-write': '工作区写入',
  'danger-full-access': '完整访问',
}

/** 双门闩：latch 状态 → 徽章变体与文案（状态集对齐 staffing.ts/brief latch：submitted/in_hr/run_lead_review/approved/rejected）。 */
export interface LatchBadge {
  variant: BadgeVariant
  label: string
}

export function latchBadge(value: string | null | undefined): LatchBadge {
  if (value === 'approved')
    return { variant: 'default', label: '已批' }
  if (value === 'submitted')
    return { variant: 'secondary', label: '已提交' }
  if (value === 'in_hr')
    return { variant: 'outline', label: '招聘中' }
  if (value === 'run_lead_review')
    return { variant: 'outline', label: '待审批' }
  if (value === 'rejected')
    return { variant: 'destructive', label: '已拒绝' }
  if (value === 'pending')
    return { variant: 'outline', label: '审批中' }
  return { variant: 'secondary', label: '未就绪' }
}

export function dualLatchState(brief: string | null | undefined, staffing: string | null | undefined): LatchBadge {
  const ready = brief === 'approved' && staffing === 'approved'
  if (ready)
    return { variant: 'default', label: '门闩齐' }
  return { variant: 'outline', label: '审批中' }
}

/* -------------------------------- 审批汇总 -------------------------------- */

export interface ApprovalSummary {
  total: number
  pending: number
  approved: number
  rejected: number
  used: number
}

export function deriveApprovalSummary(approvals: ApprovalItem[]): ApprovalSummary {
  const summary: ApprovalSummary = { total: approvals.length, pending: 0, approved: 0, rejected: 0, used: 0 }
  for (const a of approvals)
    summary[a.status] += 1
  return summary
}

/* -------------------------------- 变更单时间线 -------------------------------- */

export interface ChangeOrderTimelineEvent {
  at: string | null
  text: string
  kind: ChangeOrderStatus
}

/** 变更单状态机事件序列：proposed(ts) → applied(applied_at) → closed(closed_at)。 */
export function deriveChangeOrderTimeline(co: ChangeOrder): ChangeOrderTimelineEvent[] {
  const events: ChangeOrderTimelineEvent[] = [{ at: co.ts, text: '提议', kind: 'proposed' }]
  if (co.applied_at)
    events.push({ at: co.applied_at, text: '应用', kind: 'applied' })
  if (co.closed_at)
    events.push({ at: co.closed_at, text: '关闭', kind: 'closed' })
  return events
}

/* -------------------------------- 门禁状态机 -------------------------------- */

export type GateStage = '待分块' | '双门闩中' | '进行中' | '验证中' | '交接中' | '失败' | '已解散' | '已合并'

export interface GateStageRow {
  task_id: string
  chunk_id: string | null
  status: string
  phase: string | null
  brief: string | null
  staffing: string | null
  latched: boolean
  evidence: 'pass' | 'fail' | 'pending'
  merged: boolean
  stage: GateStage
}

function evidenceResultOf(task: TaskItem): 'pass' | 'fail' | 'pending' {
  const v = task.evidence
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const result = String((v as { result: unknown }).result)
    if (result === 'pass')
      return 'pass'
    if (result === 'fail')
      return 'fail'
  }
  return 'pending'
}

/**
 * 门禁状态机：每任务阶段映射（双门闩 → 进行中 → 验证中 → 交接中 → 已合并）。
 * 判定优先级：merged（合并队列已合并）> 交接/验证 phase > 双门闩 latch > 待分块。
 */
export function deriveGateStages(tasks: TaskItem[], mergeQueue: MergeRequest[]): GateStageRow[] {
  const mergedTaskIds = new Set(mergeQueue.filter(m => m.status === 'merged').map(m => m.task_id))
  return tasks.map((task) => {
    const merged = mergedTaskIds.has(task.task_id)
    const latched = task.latch?.brief === 'approved' && task.latch?.staffing === 'approved'
    const evidence = evidenceResultOf(task)
    let stage: GateStage
    if (merged)
      stage = '已合并'
    else if (task.status === 'failed')
      stage = '失败'
    else if (task.status === 'dissolved')
      stage = '已解散'
    else if (task.progress?.phase === 'handing_over')
      stage = '交接中'
    else if (task.progress?.phase === 'verifying')
      stage = '验证中'
    else if (task.progress?.phase)
      stage = '进行中'
    else if (!latched)
      stage = '双门闩中'
    else
      stage = '待分块'
    return {
      task_id: task.task_id,
      chunk_id: task.chunk_id ?? null,
      status: task.status,
      phase: task.progress?.phase ?? null,
      brief: task.latch?.brief ?? null,
      staffing: task.latch?.staffing ?? null,
      latched,
      evidence,
      merged,
      stage,
    }
  })
}

export const GATE_STAGE_BADGE: Record<GateStage, BadgeVariant> = {
  待分块: 'secondary',
  双门闩中: 'outline',
  进行中: 'default',
  验证中: 'default',
  交接中: 'outline',
  失败: 'destructive',
  已解散: 'secondary',
  已合并: 'secondary',
}

/* -------------------------------- 合并等待原因 -------------------------------- */

export interface MergeWait {
  task_id: string
  reason: string | null
}

/**
 * 拓扑依赖等待原因：queued 合并请求所在 chunk 的 depends_on 中，
 * 任一依赖 chunk 的 task 尚未满足合并条件 → 给出等待原因（「等待依赖：xxx」）。
 * 满足语义对齐服务器 merge.ts depSatisfied（D045）：依赖任务 merged **或 failed**
 * 均视为已满足（failed 上游由 release-eng 处置，不永久阻塞队列）。
 */
export function deriveMergeWaitReasons(
  tasks: TaskItem[],
  chunks: ChunkItem[],
  mergeQueue: MergeRequest[],
): MergeWait[] {
  const satisfiedTaskIds = new Set(
    mergeQueue.filter(m => m.status === 'merged' || m.status === 'failed').map(m => m.task_id),
  )
  const taskByChunk = new Map(chunks.map(c => [c.id, c]))
  const taskIdByChunk = new Map<string, string>()
  for (const t of tasks) {
    if (t.chunk_id)
      taskIdByChunk.set(t.chunk_id, t.task_id)
  }
  return mergeQueue
    .filter(m => m.status === 'queued')
    .map((m) => {
      const chunk = taskByChunk.get(m.task_id) // task_id 即 chunk 名空间下的任务；先按 task→chunk 反查
      const chunkId = tasks.find(t => t.task_id === m.task_id)?.chunk_id
      const deps = chunkId ? (taskByChunk.get(chunkId)?.depends_on ?? []) : (chunk?.depends_on ?? [])
      const waiting = deps.filter((dep) => {
        const depTask = taskIdByChunk.get(dep)
        return !depTask || !satisfiedTaskIds.has(depTask)
      })
      return { task_id: m.task_id, reason: waiting.length > 0 ? `等待依赖：${waiting.join('、')}` : null }
    })
}
