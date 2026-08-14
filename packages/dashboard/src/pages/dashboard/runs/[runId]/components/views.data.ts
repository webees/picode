/**
 * 三视图派生纯函数（D71-4）：进度/房间/人员全部由既有 9 端点响应派生，
 * 不新增端点、不改 API 契约。纯函数便于 __tests__/views.test.ts fixture 断言。
 */
import type { SessionItem, StatusSnapshot, TaskItem } from '@/services/api/picode.api'

import { PHASE_META, platformRoomMembers, ROLE_META, roomLabel, SQUAD_ROOM_PREFIX } from './role-meta.data'

/* ------------------------------ 类型定义 ------------------------------ */

export interface PersonnelSeat {
  agent_id: string
  role_id: string
  state: string
  roleLabel: string
  roleDesc: string
  /** 平台席（agent_id 无 @task- 前缀）还是任务三角席 */
  kind: 'platform' | 'task'
  /** 任务三角归属（task 席时有效） */
  task_id?: string
}

export interface TaskTriad {
  task_id: string
  work_room: string
  status: string
  seats: Array<{ seat: string, agent_id: string }>
}

export interface PersonnelView {
  platformSeats: PersonnelSeat[]
  triads: TaskTriad[]
}

export interface RoomMember {
  id: string
  kind: 'platform' | 'task'
  roleLabel: string
}

export interface RoomCard {
  room: string
  label: string
  messages: number
  kind: 'platform' | 'squad'
  members: RoomMember[]
}

export interface RoomsView {
  rooms: RoomCard[]
}

export interface ProgressRow {
  task_id: string
  status: string
  phase: string | null
  phaseLabel: string
  blocked: boolean
  summary: string
  updated_at: string | null
}

export interface ProgressView {
  rows: ProgressRow[]
  total: number
  inFlight: number
  blockedCount: number
}

/* ---------------------------- 派生纯函数 ---------------------------- */

const TASK_SEAT_PREFIX = '@task-'

function isTaskSeat(agentId: string): boolean {
  return agentId.includes(TASK_SEAT_PREFIX)
}

/** 人员视图：平台席（sessions）+ 任务三角（tasks.triad）。 */
export function derivePersonnel(tasks: TaskItem[], sessions: SessionItem[]): PersonnelView {
  const platformSeats: PersonnelSeat[] = sessions
    .filter(s => !isTaskSeat(s.agent_id))
    .map((s) => {
      const meta = ROLE_META[s.role_id]
      return {
        agent_id: s.agent_id,
        role_id: s.role_id,
        state: s.state,
        roleLabel: meta?.label ?? s.role_id,
        roleDesc: meta?.desc ?? '—',
        kind: 'platform',
      }
    })

  const triads: TaskTriad[] = tasks
    .filter(t => t.triad && Object.keys(t.triad).length > 0)
    .map(t => ({
      task_id: t.task_id,
      work_room: t.work_room,
      status: t.status,
      seats: Object.entries(t.triad).map(([seat, agentId]) => ({ seat, agent_id: agentId })),
    }))

  const taskSeats: PersonnelSeat[] = triads.flatMap(t =>
    t.seats.map((s) => {
      const role = s.seat
      const meta = ROLE_META[role]
      return {
        agent_id: s.agent_id,
        role_id: role,
        state: '—',
        roleLabel: meta?.label ?? role,
        roleDesc: meta?.desc ?? '—',
        kind: 'task',
        task_id: t.task_id,
      }
    }),
  )

  return { platformSeats: [...platformSeats, ...taskSeats], triads }
}

/** 房间视图：snapshot.rooms（房间+消息数）+ tasks work_room/triad（squad 房成员）+ ROLE→ROOM 约定（平台房成员）。 */
export function deriveRooms(snapshot: StatusSnapshot, tasks: TaskItem[]): RoomsView {
  const messageByRoom = new Map(snapshot.rooms.map(r => [r.room, r.messages]))

  const squadRooms = new Map<string, RoomMember[]>()
  for (const t of tasks) {
    if (!t.work_room)
      continue
    const members = squadRooms.get(t.work_room) ?? []
    for (const [seat, agentId] of Object.entries(t.triad ?? {})) {
      members.push({
        id: agentId,
        kind: 'task',
        roleLabel: ROLE_META[seat]?.label ?? seat,
      })
    }
    squadRooms.set(t.work_room, members)
  }

  const rooms: RoomCard[] = [
    ...Array.from(squadRooms.entries()).map(([room, members]) => ({
      room,
      label: roomLabel(room),
      messages: messageByRoom.get(room) ?? 0,
      kind: 'squad' as const,
      members,
    })),
    // 平台房：从 snapshot.rooms 里排除 squad 房，其余按 ROLE→ROOM 约定派生成员
    ...snapshot.rooms
      .filter(r => !squadRooms.has(r.room) && !r.room.startsWith(SQUAD_ROOM_PREFIX))
      .map(r => ({
        room: r.room,
        label: roomLabel(r.room),
        messages: r.messages,
        kind: 'platform' as const,
        members: platformRoomMembers(r.room).map(id => ({
          id,
          kind: 'platform' as const,
          roleLabel: ROLE_META[id]?.label ?? id,
        })),
      })),
  ]

  rooms.sort((a, b) => b.messages - a.messages)

  return { rooms }
}

/** 进度视图：逐任务 phase/blocked/summary/updated_at（来自 /tasks.progress）。 */
export function deriveProgress(tasks: TaskItem[]): ProgressView {
  const rows: ProgressRow[] = tasks.map(t => ({
    task_id: t.task_id,
    status: t.status,
    phase: t.progress?.phase ?? null,
    phaseLabel: t.progress ? (PHASE_META[t.progress.phase] ?? t.progress.phase) : '未开始',
    blocked: t.progress?.blocked ?? false,
    summary: t.progress?.summary ?? '—',
    updated_at: t.progress?.updated_at ?? null,
  }))

  return {
    rows,
    total: rows.length,
    inFlight: rows.filter(r => r.phase !== null).length,
    blockedCount: rows.filter(r => r.blocked).length,
  }
}
