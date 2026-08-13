import type { RunSummary } from '@/services/api/picode.api'

/**
 * 运行总览页（/dashboard）展示元数据。
 * 复用 dashboard-server /api/runs 的 RunSummary 契约，把机器值翻译成
 * 人话（中文状态 / 规模 / 类型），并给卡片/统计条提供格式化工具。
 */

export type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export interface RunStatusMeta {
  label: string
  badge: StatusVariant
  dot: string
  description: string
}

/** run 状态 → 展示元数据（覆盖 goal.yaml status 的全部取值）。 */
export const RUN_STATUS_META: Record<string, RunStatusMeta> = {
  active: {
    label: '进行中',
    badge: 'default',
    dot: 'bg-emerald-500',
    description: '正在推进',
  },
  completed: {
    label: '已完成',
    badge: 'secondary',
    dot: 'bg-slate-400',
    description: '目标达成',
  },
  cancelled: {
    label: '已取消',
    badge: 'destructive',
    dot: 'bg-rose-500',
    description: '提前终止',
  },
  blocked: {
    label: '阻塞',
    badge: 'destructive',
    dot: 'bg-amber-500',
    description: '等待外部条件',
  },
  intake: {
    label: '待启动',
    badge: 'outline',
    dot: 'bg-slate-300',
    description: '已投喂，未开工',
  },
  draft: {
    label: '草稿',
    badge: 'outline',
    dot: 'bg-slate-300',
    description: '尚未确认',
  },
}

/** run 类型 → 中文标签（未识别时回落原值）。 */
export const RUN_KIND_LABELS: Record<string, string> = {
  delivery: '交付',
  self_evolve: '自演进',
}

/** run 规模 → 中文标签（未识别时回落原值）。 */
export const RUN_SCALE_LABELS: Record<string, string> = {
  S: '小型',
  M: '中型',
  L: '大型',
  XL: '超大型',
}

export function statusMeta(status: string): RunStatusMeta {
  return RUN_STATUS_META[status] ?? {
    label: status,
    badge: 'outline',
    dot: 'bg-slate-300',
    description: '',
  }
}

export function kindLabel(kind: string): string {
  return RUN_KIND_LABELS[kind] ?? kind
}

export function scaleLabel(scale: string): string {
  return RUN_SCALE_LABELS[scale] ?? scale
}

/** 友好时间：今天/昨天显示相对时间，否则显示 月-日 时:分。 */
export function formatRunDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return iso
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (days === 0)
    return `今天 ${hm}`
  if (days === 1)
    return `昨天 ${hm}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

export interface RunStats {
  total: number
  active: number
  completed: number
  blocked: number
}

/** 统计条聚合：总数 / 进行中 / 已完成 / 阻塞。 */
export function summarizeRuns(runs: RunSummary[]): RunStats {
  return {
    total: runs.length,
    active: runs.filter(r => r.status === 'active').length,
    completed: runs.filter(r => r.status === 'completed').length,
    blocked: runs.filter(r => r.status === 'blocked' || r.status === 'cancelled').length,
  }
}
