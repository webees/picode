import type { BoardColumn } from '@/services/api/picode.api'

/**
 * 看板列语义（C3）：与 packages/orchestrator/src/board.ts BOARD_COLUMNS 的
 * 7 列一一对应，映射展示元数据（徽章变体 / 列头样式 / 文案 / 状态点）。
 */
export interface BoardColumnMeta {
  label: string
  badge: 'default' | 'secondary' | 'destructive' | 'outline'
  headerClass: string
  /** 列头左侧状态点颜色 */
  dotClass: string
  description: string
}

export const BOARD_COLUMN_META: Record<BoardColumn, BoardColumnMeta> = {
  Backlog: {
    label: 'Backlog',
    badge: 'secondary',
    headerClass: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400',
    dotClass: 'bg-slate-400',
    description: '待办需求 / 投喂',
  },
  分块: {
    label: '分块',
    badge: 'secondary',
    headerClass: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400',
    dotClass: 'bg-slate-400',
    description: '已分块，未招人',
  },
  双门闩中: {
    label: '双门闩中',
    badge: 'outline',
    headerClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400',
    dotClass: 'bg-amber-500',
    description: 'brief / staffing 门闩未齐',
  },
  进行中: {
    label: '进行中',
    badge: 'default',
    headerClass: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400',
    dotClass: 'bg-blue-500',
    description: 'squad 在岗',
  },
  验证中: {
    label: '验证中',
    badge: 'default',
    headerClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400',
    dotClass: 'bg-sky-500',
    description: 'sdet 验证',
  },
  交接中: {
    label: '交接中',
    badge: 'outline',
    headerClass: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-400',
    dotClass: 'bg-violet-500',
    description: 'handoff 交接',
  },
  已完成: {
    label: '已完成',
    badge: 'secondary',
    headerClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
    description: '已 merge 入 main',
  },
}
