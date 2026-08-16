/**
 * 聊天室派生纯函数（C4）：消息类型中文映射 / 参与者派生 / 发送预检。
 * 与 views.data.ts 同模式：纯函数 + fixture 可断言。
 */
import { label } from '@/utils/labels'

export interface BusMessage {
  ts: string
  id?: string
  from: string
  room: string
  type: string
  body: string
  refs?: string[]
  reply_to?: string | null
  meta?: Record<string, unknown>
}

export interface RoomListEntry {
  room: string
  messages: number
}

/** 消息类型中文映射（D071 语义；33 种缺省回退原 id）。 */
export const BUS_TYPE_ZH: Record<string, string> = {
  chat: '聊天',
  event: '事件',
  notice: '通知',
  alert: '告警',
  command: '指令',
  report: '汇报',
  question: '提问',
  decision: '决策',
  ack: '确认',
  error: '错误',
  cell_done: '任务完成',
  task_ready: '任务就绪',
  task_dissolved: '任务解散',
  progress_report: '进度汇报',
  handoff: '交接',
  evidence: '证据',
  merge: '合并',
  review: '审查',
  approve: '批准',
  reject: '驳回',
  staffing: '用工',
  briefing: '简报',
  scoring: '评分',
  feedback: '反馈',
  research: '调研',
  scheduling: '调度',
  wake: '唤醒',
  sleep: '休眠',
  terminate: '终止',
  dissolve: '解散',
  gate: '门禁',
  checkpoint: '检查点',
  system: '系统',
}

export function messageTypeLabel(type: string | null | undefined): string {
  return label(BUS_TYPE_ZH, type)
}

/** 参与者派生：members 响应（含 access/post_types_allow）→ 可发言名单。 */
export interface MemberView {
  id: string
  access: string
  post_types: string[]
  canChat: boolean
}

export function deriveMembers(members: Array<{ id: string; access?: string; post_types_allow?: string[] }> | null | undefined): MemberView[] {
  return (members ?? []).map((m) => ({
    id: m.id,
    access: m.access ?? 'read',
    post_types: m.post_types_allow ?? [],
    canChat: m.access === 'post' && (m.post_types_allow ?? []).includes('chat'),
  }))
}

/** 发送预检：空文本 / 未授权房 → 返回中文错误；可发返回 null。 */
export function precheckSend(text: string, canChat: boolean, hintRooms: string): string | null {
  if (!text.trim()) return '消息不能为空'
  if (!canChat) return `该房间不可发送（可发送房间：${hintRooms}）`
  return null
}

/** 相对时间（秒级，中文通俗）。 */
export function relativeTime(ts: string, now = Date.now()): string {
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return ts
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return `${Math.floor(s / 86400)} 天前`
}
