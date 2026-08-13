import { describe, expect, it } from 'vitest'

import type { SessionItem, StatusSnapshot, TaskItem } from '@/services/api/picode.api'

import { derivePersonnel, deriveProgress, deriveRooms } from '../components/views.data'

const tasks: TaskItem[] = [
  {
    task_id: 'task-alpha',
    chunk_id: 'c1',
    goal_id: 'g1',
    kind: 'implement',
    status: 'in_progress',
    write_paths: ['a'],
    read_paths: [],
    acceptance: [],
    triad: { 'squad-lead': 'squad-lead@task-alpha', 'engineer': 'engineer@task-alpha', 'sdet': 'sdet@task-alpha' },
    work_room: 'squad-task-alpha',
    retries: 0,
    max_retries: 3,
    latch: { brief: 'approved', staffing: 'approved' },
    progress: { task_id: 'task-alpha', phase: 'running', blocked: false, summary: 'on track', updated_at: '2026-08-13T10:00:00Z' },
    evidence: null,
  },
  {
    task_id: 'task-beta',
    chunk_id: 'c2',
    goal_id: 'g1',
    kind: 'implement',
    status: 'ready',
    write_paths: ['b'],
    read_paths: [],
    acceptance: [],
    triad: { 'squad-lead': 'squad-lead@task-beta', 'engineer': 'engineer@task-beta', 'sdet': 'sdet@task-beta' },
    work_room: 'squad-task-beta',
    retries: 0,
    max_retries: 3,
    latch: { brief: 'approved', staffing: 'approved' },
    progress: null,
    evidence: null,
  },
]

const sessions: SessionItem[] = [
  {
    schema_version: '1',
    agent_id: 'run-lead',
    role_id: 'run-lead',
    state: 'awake',
    pi_session_id: 'oc-1',
    last_wake_at: null,
    last_sleep_at: null,
    wake_reason: null,
    persona_path: null,
    error: null,
    budget: { turns: 0, continuations: 0 },
  },
  {
    schema_version: '1',
    agent_id: 'engineer@task-alpha',
    role_id: 'engineer',
    state: 'awake',
    pi_session_id: 'oc-2',
    last_wake_at: null,
    last_sleep_at: null,
    wake_reason: null,
    persona_path: null,
    error: null,
    budget: { turns: 0, continuations: 0 },
  },
]

const snapshot: StatusSnapshot = {
  run_id: 'g1',
  goal: { status: 'active', scale: 'L', product_acceptance: 1, acceptance: 0 },
  sessions: { total: 2, awake: ['run-lead'], sleeping: 0, terminated: 0, errored: [] },
  rooms: [
    { room: 'leadership', messages: 3 },
    { room: 'architecture', messages: 2 },
    { room: 'squad-task-alpha', messages: 5 },
  ],
  tasks: [],
  merge_queue: { queued: 0, merged: 0, failed: 0 },
  continuation: { max_per_session: 5, idle_sec: 0, sessions: [] },
}

describe('derivePersonnel', () => {
  it('分组平台席与任务三角席', () => {
    const v = derivePersonnel(tasks, sessions)
    expect(v.platformSeats.filter(s => s.kind === 'platform').map(s => s.agent_id)).toEqual(['run-lead'])
    expect(v.platformSeats.filter(s => s.kind === 'task')).toHaveLength(6)
    expect(v.triads).toHaveLength(2)
    expect(v.triads[0]).toMatchObject({ task_id: 'task-alpha', work_room: 'squad-task-alpha' })
  })

  it('平台席携带角色通俗描述', () => {
    const v = derivePersonnel(tasks, sessions)
    const seat = v.platformSeats.find(s => s.agent_id === 'run-lead')!
    expect(seat.roleLabel).toBe('统筹规划')
    expect(seat.roleDesc).not.toBe('—')
  })
})

describe('deriveRooms', () => {
  it('squad 房成员由 triad 派生', () => {
    const v = deriveRooms(snapshot, tasks)
    const alpha = v.rooms.find(r => r.room === 'squad-task-alpha')!
    expect(alpha.kind).toBe('squad')
    expect(alpha.members).toHaveLength(3)
    expect(alpha.messages).toBe(5)
  })

  it('平台房成员由 ROLE→ROOM 约定派生且带消息数', () => {
    const v = deriveRooms(snapshot, tasks)
    const leadership = v.rooms.find(r => r.room === 'leadership')!
    expect(leadership.kind).toBe('platform')
    expect(leadership.messages).toBe(3)
    expect(leadership.members.map(m => m.id)).toContain('run-lead')
  })

  it('squad 房不含在平台房集合且按消息数降序', () => {
    const v = deriveRooms(snapshot, tasks)
    expect(v.rooms.filter(r => r.kind === 'platform').map(r => r.room)).not.toContain('squad-task-alpha')
    const sorted = v.rooms.map(r => r.messages)
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a))
  })
})

describe('deriveProgress', () => {
  it('映射 phase 中文并标记阻塞', () => {
    const v = deriveProgress(tasks)
    const alpha = v.rows.find(r => r.task_id === 'task-alpha')!
    expect(alpha.phaseLabel).toBe('进行中')
    expect(alpha.blocked).toBe(false)
  })

  it('无 progress 的任务显示未开始', () => {
    const v = deriveProgress(tasks)
    const beta = v.rows.find(r => r.task_id === 'task-beta')!
    expect(beta.phase).toBeNull()
    expect(beta.phaseLabel).toBe('未开始')
  })

  it('聚合计数', () => {
    const v = deriveProgress(tasks)
    expect(v.total).toBe(2)
    expect(v.inFlight).toBe(1)
    expect(v.blockedCount).toBe(0)
  })
})
