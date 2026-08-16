import { useQuery } from '@tanstack/vue-query'

import { apiFetch } from '@/lib/api-client'

import { LIVE_POLL_INTERVAL_MS } from './picode.api'

/**
 * 流程可视化数据源（chunk-flow-ui）：审批流 + 变更单。
 * 对应 dashboard-server 端点（D113）：
 *   GET /api/runs/:id/approvals      — approvals/pending-*.json 全量（asked/decided 成对）
 *   GET /api/runs/:id/change-orders  — change_orders/*.yaml（proposed→applied→closed）
 * 类型与 packages/core/src/approval.ts / packages/orchestrator/src/memory.ts 一一对应。
 * 与聊天室/运行面 API 分文件（shared_files 约束：picode.api.ts owner=chunk-chat-ui，
 * 本文件独立承载 flow 域 fetchers/hooks）。
 */

/* ---------------------------------- types ---------------------------------- */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'used'

export interface ApprovalAsked {
  at: string
  from_agent: string
  task_id: string
  path: string
  mode: string
  reason: string
}

export interface ApprovalDecided {
  at: string
  by: string
  decision: 'approved' | 'rejected'
  note?: string
}

export interface ApprovalItem {
  id: string
  kind: string
  status: ApprovalStatus
  asked: ApprovalAsked
  decided: ApprovalDecided | null
  used_at: string | null
}

export interface ApprovalsView {
  approvals: ApprovalItem[]
}

export type ChangeOrderStatus = 'proposed' | 'applied' | 'closed'

export interface ChangeOrder {
  id: string
  task_id: string
  summary: string
  status: ChangeOrderStatus
  by: string
  ts: string
  applied_at: string | null
  closed_at: string | null
}

export interface ChangeOrdersView {
  change_orders: ChangeOrder[]
}

/* --------------------------------- fetchers --------------------------------- */

export function fetchApprovals(runId: string): Promise<ApprovalsView> {
  return apiFetch(`/api/runs/${runId}/approvals`)
}

export function fetchChangeOrders(runId: string): Promise<ChangeOrdersView> {
  return apiFetch(`/api/runs/${runId}/change-orders`)
}

/* ---------------------------------- hooks ---------------------------------- */

export function useApprovals(runId: string) {
  return useQuery({
    queryKey: ['picode', 'approvals', runId],
    queryFn: () => fetchApprovals(runId),
    enabled: !!runId,
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: LIVE_POLL_INTERVAL_MS,
  })
}

export function useChangeOrders(runId: string) {
  return useQuery({
    queryKey: ['picode', 'change-orders', runId],
    queryFn: () => fetchChangeOrders(runId),
    enabled: !!runId,
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: LIVE_POLL_INTERVAL_MS,
  })
}
