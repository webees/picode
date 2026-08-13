/** 界面中文映射：把 run/任务/会话/合并的内部英文值翻译成通俗中文。 */
export const RUN_STATUS: Record<string, string> = {
  intake: '待立项',
  draft: '草稿',
  active: '进行中',
  blocked: '已阻塞',
  completed: '已完成',
  cancelled: '已取消',
  parked: '已停放',
}

export const RUN_KIND: Record<string, string> = {
  self_evolve: '自我优化',
  delivery: '功能交付',
}

export const RUN_SCALE: Record<string, string> = {
  S: '小任务',
  M: '中任务',
  L: '大任务',
}

export const TASK_STATUS: Record<string, string> = {
  queued: '排队中',
  assigned: '已分配',
  in_progress: '实施中',
  ready: '待验证',
  merged: '已合并',
  dissolved: '已归档',
  failed: '失败',
  cancelled: '已取消',
}

export const SESSION_STATE: Record<string, string> = {
  registered: '已注册',
  sleeping: '休眠中',
  awake: '工作中',
  terminated: '已终止',
  errored: '异常',
}

export const MERGE_STATUS: Record<string, string> = {
  queued: '排队中',
  merged: '已合并',
  failed: '失败',
}

export const CHUNK_STATUS: Record<string, string> = {
  ready: '就绪',
  in_progress: '实施中',
  done: '已完成',
  blocked: '已阻塞',
}

export const BOARD_COLUMN_ZH: Record<string, string> = {
  Backlog: '待办池',
  分块: '分块',
  双门闩中: '审批中',
  进行中: '进行中',
  验证中: '验证中',
  交接中: '交接中',
  已完成: '已完成',
}

export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (value == null || value === '')
    return '未知'
  return map[value] ?? value
}
