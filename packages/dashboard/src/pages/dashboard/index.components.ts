import type { RunSummary } from '@/services/api/picode.api'

import { label, RUN_KIND, RUN_SCALE, RUN_STATUS } from '@/utils/labels'

/**
 * 运行总览页（/dashboard）展示元数据。
 * 复用 dashboard-server /api/runs 的 RunSummary 契约；文案统一走 @/utils/labels 体系
 * （label 文本），本文件只补充展示细节（badge 样式 / 状态圆点 / 一句话描述 / 时间格式化 / 统计聚合）。
 */

export type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export interface RunStatusMeta {
  label: string
  badge: StatusVariant
  dot: string
  description: string
}

/** run 状态 → 展示细节；label 文本由 @/utils/labels RUN_STATUS 提供。 */
const RUN_STATUS_PRESENTATION: Record<string, Omit<RunStatusMeta, 'label'>> = {
  active: { badge: 'default', dot: 'bg-emerald-500', description: '正在推进' },
  completed: { badge: 'secondary', dot: 'bg-slate-400', description: '目标达成' },
  cancelled: { badge: 'destructive', dot: 'bg-rose-500', description: '提前终止' },
  blocked: { badge: 'destructive', dot: 'bg-amber-500', description: '等待外部条件' },
  intake: { badge: 'outline', dot: 'bg-slate-300', description: '已投喂，未开工' },
  draft: { badge: 'outline', dot: 'bg-slate-300', description: '尚未确认' },
  parked: { badge: 'outline', dot: 'bg-slate-300', description: '已停放' },
}

export function statusMeta(status: string): RunStatusMeta {
  const presentation = RUN_STATUS_PRESENTATION[status] ?? {
    badge: 'outline' as StatusVariant,
    dot: 'bg-slate-300',
    description: '',
  }
  return { label: label(RUN_STATUS, status), ...presentation }
}

export function kindLabel(kind: string): string {
  return label(RUN_KIND, kind)
}

export function scaleLabel(scale: string): string {
  return label(RUN_SCALE, scale)
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

/** 统计条聚合：总数 / 进行中 / 已完成 / 受阻。 */
export function summarizeRuns(runs: RunSummary[]): RunStats {
  return {
    total: runs.length,
    active: runs.filter(r => r.status === 'active').length,
    completed: runs.filter(r => r.status === 'completed').length,
    blocked: runs.filter(r => r.status === 'blocked' || r.status === 'cancelled').length,
  }
}
