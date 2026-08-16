import { describe, expect, it } from 'vitest'

import type { ChunkItem, MergeRequest, TaskItem } from '@/services/api/picode.api'

import type { ApprovalItem, ChangeOrder } from '@/services/api/flow.api'

import {
  APPROVAL_STATUS_BADGE,
  APPROVAL_STATUS_ZH,
  CHANGE_ORDER_STATUS_BADGE,
  CHANGE_ORDER_STATUS_ZH,
  deriveApprovalSummary,
  deriveChangeOrderTimeline,
  deriveGateStages,
  deriveMergeWaitReasons,
  dualLatchState,
  latchBadge,
} from '../components/flow.data'

/* --------------------------------- fixtures --------------------------------- */

function task(over: Partial<TaskItem> & { task_id: string }): TaskItem {
  return {
    chunk_id: 'c1',
    goal_id: 'g1',
    kind: 'implement',
    status: 'in_progress',
    write_paths: ['a'],
    read_paths: [],
    acceptance: [],
    triad: {},
    work_room: 'room',
    retries: 0,
    max_retries: 3,
    latch: { brief: 'approved', staffing: 'approved' },
    progress: null,
    evidence: null,
    ...over,
  }
}

const approval = (status: ApprovalItem['status'], over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  id: `ap-${status}`,
  kind: 'sandbox_escalation',
  status,
  asked: { at: '2026-08-15T09:00:00Z', from_agent: 'engineer@task-a', task_id: 'task-a', path: 'a.ts', mode: 'workspace-write', reason: '需要写入' },
  decided: status === 'pending' ? null : { at: '2026-08-15T09:05:00Z', by: 'run-lead', decision: status === 'rejected' ? 'rejected' : 'approved' },
  used_at: status === 'used' ? '2026-08-15T09:10:00Z' : null,
  ...over,
})

const changeOrder = (status: ChangeOrder['status']): ChangeOrder => ({
  id: `co-${status}`,
  task_id: 'task-a',
  summary: '变更测试',
  status,
  by: 'run-lead',
  ts: '2026-08-15T08:00:00Z',
  applied_at: status === 'applied' || status === 'closed' ? '2026-08-15T08:30:00Z' : null,
  closed_at: status === 'closed' ? '2026-08-15T09:00:00Z' : null,
})

const mergedReq: MergeRequest = { id: 'm1', ts: '2026-08-15T10:00:00Z', task_id: 'task-a', from: 'release-eng', status: 'merged', merged_at: '2026-08-15T10:00:00Z', error: null }
const queuedReq: MergeRequest = { id: 'm2', ts: '2026-08-15T11:00:00Z', task_id: 'task-b', from: 'release-eng', status: 'queued', merged_at: null, error: null }

const chunkA: ChunkItem = { id: 'c1', write_paths: [], read_paths: [], public_contract: null, depends_on: [], shared_files: [], acceptance: [], status: 'done', task_id: 'task-a' }
const chunkB: ChunkItem = { id: 'c2', write_paths: [], read_paths: [], public_contract: null, depends_on: ['c1'], shared_files: [], acceptance: [], status: 'in_progress', task_id: 'task-b' }

/* ---------------------------------- tests ---------------------------------- */

describe('审批/变更单标签映射', () => {
  it('审批状态中文 + 徽章变体齐全', () => {
    expect(APPROVAL_STATUS_ZH.pending).toBe('待审批')
    expect(APPROVAL_STATUS_ZH.used).toBe('已使用')
    expect(APPROVAL_STATUS_BADGE.rejected).toBe('destructive')
    expect(APPROVAL_STATUS_BADGE.pending).toBe('outline')
  })

  it('变更单状态中文 + 徽章变体齐全', () => {
    expect(CHANGE_ORDER_STATUS_ZH.proposed).toBe('已提议')
    expect(CHANGE_ORDER_STATUS_ZH.closed).toBe('已关闭')
    expect(CHANGE_ORDER_STATUS_BADGE.applied).toBe('default')
    expect(CHANGE_ORDER_STATUS_BADGE.closed).toBe('secondary')
  })

  it('双门闩徽章：齐/不齐/单侧', () => {
    expect(dualLatchState('approved', 'approved').label).toBe('门闩齐')
    expect(dualLatchState('approved', 'pending').label).toBe('审批中')
    expect(latchBadge('approved').label).toBe('已批')
    expect(latchBadge('pending').variant).toBe('outline')
    expect(latchBadge(null).label).toBe('未就绪')
  })
})

describe('deriveApprovalSummary', () => {
  it('按状态计数', () => {
    const approvals = [approval('pending'), approval('approved'), approval('approved'), approval('rejected'), approval('used')]
    const s = deriveApprovalSummary(approvals)
    expect(s).toEqual({ total: 5, pending: 1, approved: 2, rejected: 1, used: 1 })
  })

  it('空数组全零', () => {
    expect(deriveApprovalSummary([])).toEqual({ total: 0, pending: 0, approved: 0, rejected: 0, used: 0 })
  })
})

describe('deriveChangeOrderTimeline', () => {
  it('proposed → 单事件', () => {
    const events = deriveChangeOrderTimeline(changeOrder('proposed'))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'proposed', text: '提议' })
  })

  it('applied → 双事件', () => {
    const events = deriveChangeOrderTimeline(changeOrder('applied'))
    expect(events.map(e => e.kind)).toEqual(['proposed', 'applied'])
  })

  it('closed → 三事件（状态机完整链路）', () => {
    const events = deriveChangeOrderTimeline(changeOrder('closed'))
    expect(events.map(e => e.kind)).toEqual(['proposed', 'applied', 'closed'])
    expect(events[2].at).toBe('2026-08-15T09:00:00Z')
  })
})

describe('deriveGateStages（门禁状态机）', () => {
  it('已合并任务 → 已合并', () => {
    const rows = deriveGateStages([task({ task_id: 'task-a', status: 'merged' })], [mergedReq])
    expect(rows[0].stage).toBe('已合并')
    expect(rows[0].merged).toBe(true)
  })

  it('交接中 phase → 交接中；验证中 phase → 验证中', () => {
    const handing = deriveGateStages([task({ task_id: 'task-h', progress: { task_id: 'task-h', phase: 'handing_over', blocked: false, summary: '', updated_at: '' } })], [])
    expect(handing[0].stage).toBe('交接中')
    const verifying = deriveGateStages([task({ task_id: 'task-v', progress: { task_id: 'task-v', phase: 'verifying', blocked: false, summary: '', updated_at: '' } })], [])
    expect(verifying[0].stage).toBe('验证中')
  })

  it('running phase → 进行中', () => {
    const rows = deriveGateStages([task({ task_id: 'task-r', progress: { task_id: 'task-r', phase: 'running', blocked: false, summary: '', updated_at: '' } })], [])
    expect(rows[0].stage).toBe('进行中')
  })

  it('门闩未齐且未开工 → 双门闩中', () => {
    const rows = deriveGateStages([task({ task_id: 'task-p', latch: { brief: 'approved', staffing: 'pending' } })], [])
    expect(rows[0].stage).toBe('双门闩中')
    expect(rows[0].latched).toBe(false)
  })

  it('门闩齐且未开工 → 待分块', () => {
    const rows = deriveGateStages([task({ task_id: 'task-i' })], [])
    expect(rows[0].stage).toBe('待分块')
    expect(rows[0].latched).toBe(true)
  })

  it('验收证据结果：pass/fail/pending', () => {
    const pass = deriveGateStages([task({ task_id: 't1', evidence: { result: 'pass' } })], [])
    expect(pass[0].evidence).toBe('pass')
    const fail = deriveGateStages([task({ task_id: 't2', evidence: { result: 'fail' } })], [])
    expect(fail[0].evidence).toBe('fail')
    const none = deriveGateStages([task({ task_id: 't3' })], [])
    expect(none[0].evidence).toBe('pending')
  })

  it('终态：failed → 失败；dissolved → 已解散', () => {
    const failed = deriveGateStages([task({ task_id: 'task-f', status: 'failed' })], [])
    expect(failed[0].stage).toBe('失败')
    const dissolved = deriveGateStages([task({ task_id: 'task-d', status: 'dissolved' })], [])
    expect(dissolved[0].stage).toBe('已解散')
  })
})

describe('deriveMergeWaitReasons（拓扑依赖）', () => {
  const tasks = [
    task({ task_id: 'task-a', chunk_id: 'c1' }),
    task({ task_id: 'task-b', chunk_id: 'c2' }),
  ]

  it('依赖 chunk 未合并 → 等待原因', () => {
    // 队列里只有 task-b queued：task-a（c1）尚未合并 → task-b 等待 c1
    const waits = deriveMergeWaitReasons(tasks, [chunkA, chunkB], [queuedReq])
    expect(waits).toHaveLength(1)
    expect(waits[0]).toMatchObject({ task_id: 'task-b', reason: '等待依赖：c1' })
  })

  it('依赖已合并 → 就绪（无等待原因）', () => {
    // task-a（c1）已 merged → task-b 无等待原因，等待列表为空
    const allMerged: MergeRequest[] = [
      mergedReq,
      { ...queuedReq, status: 'merged' as const, merged_at: '2026-08-15T11:00:00Z' },
    ]
    const waits = deriveMergeWaitReasons(tasks, [chunkA, chunkB], allMerged)
    expect(waits).toHaveLength(0)
  })

  it('依赖失败也视为已满足（D045 语义，对齐服务器 depSatisfied）', () => {
    // task-a（c1）failed → 不阻塞 task-b 合并
    const failedUpstream: MergeRequest[] = [
      { ...mergedReq, status: 'failed' as const, error: 'boom' },
      queuedReq,
    ]
    const waits = deriveMergeWaitReasons(tasks, [chunkA, chunkB], failedUpstream)
    expect(waits).toHaveLength(1)
    expect(waits[0].reason).toBeNull()
  })

  it('无依赖 chunk → 就绪', () => {
    const waits = deriveMergeWaitReasons([task({ task_id: 'task-a', chunk_id: 'c1' })], [chunkA], [queuedReq])
    expect(waits).toHaveLength(1)
    expect(waits[0].reason).toBeNull()
  })
})
