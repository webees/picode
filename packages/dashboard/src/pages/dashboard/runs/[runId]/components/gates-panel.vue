<script setup lang="ts">
import { CheckCircle2Icon, ClipboardListIcon, FileTextIcon, GitPullRequestIcon, ShieldCheckIcon, XCircleIcon } from '@lucide/vue'

import type { GateEvidence } from '@/services/api/picode.api'
import type { ApprovalItem, ChangeOrder } from '@/services/api/flow.api'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useGates, useTasks, useMerge } from '@/services/api/picode.api'
import { useApprovals, useChangeOrders } from '@/services/api/flow.api'
import { ErrorState } from '@/components/dashboard'

import {
  APPROVAL_STATUS_BADGE,
  APPROVAL_STATUS_ZH,
  CHANGE_ORDER_STATUS_BADGE,
  CHANGE_ORDER_STATUS_ZH,
  deriveApprovalSummary,
  deriveChangeOrderTimeline,
  deriveGateStages,
  GATE_STAGE_BADGE,
  SANDBOX_MODE_ZH,
} from './flow.data'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useGates(props.runId)
const approvalsQuery = useApprovals(props.runId)
const changeOrdersQuery = useChangeOrders(props.runId)
const tasksQuery = useTasks(props.runId)
const mergeQuery = useMerge(props.runId)

const isLoadingAll = computed(() =>
  isLoading.value || approvalsQuery.isLoading.value || changeOrdersQuery.isLoading.value
  || tasksQuery.isLoading.value || mergeQuery.isLoading.value,
)
const isErrorAll = computed(() =>
  isError.value || approvalsQuery.isError.value || changeOrdersQuery.isError.value
  || tasksQuery.isError.value || mergeQuery.isError.value,
)
const errorAll = computed(() =>
  error.value ?? approvalsQuery.error.value ?? changeOrdersQuery.error.value
  ?? tasksQuery.error.value ?? mergeQuery.error.value,
)

const gates = computed(() => data.value?.gates ?? [])
const evidence = computed(() => data.value?.evidence ?? [])
const approvals = computed(() => approvalsQuery.data.value?.approvals ?? [])
const changeOrders = computed(() => changeOrdersQuery.data.value?.change_orders ?? [])

const gateRows = computed(() =>
  deriveGateStages(tasksQuery.data.value?.tasks ?? [], mergeQuery.data.value?.queue ?? []),
)

const approvalSummary = computed(() => deriveApprovalSummary(approvals.value))
const activeChangeOrders = computed(() => changeOrders.value.filter(c => c.status !== 'closed').length)

function evidenceResult(ev: GateEvidence): string {
  const v = ev.evidence
  return typeof v === 'object' && v && 'result' in v ? String((v as { result: unknown }).result) : 'unknown'
}

function evidenceCommands(ev: GateEvidence): Array<{ cmd?: string, exit_code?: unknown }> {
  const v = ev.evidence
  if (typeof v === 'object' && v && 'commands' in v) {
    const cmds = (v as { commands: unknown }).commands
    return Array.isArray(cmds) ? cmds as Array<{ cmd?: string, exit_code?: unknown }> : []
  }
  return []
}

function resultBadge(result: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (result === 'pass')
    return 'default'
  if (result === 'fail')
    return 'destructive'
  return 'outline'
}

function resultLabel(result: string): string {
  if (result === 'pass')
    return '通过'
  if (result === 'fail')
    return '失败'
  if (result === 'pass_with_finding')
    return '通过（有发现）'
  return result
}

function formatTime(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function decidedLabel(a: ApprovalItem): string {
  if (!a.decided)
    return '等待审批'
  return a.decided.decision === 'approved' ? `批准人：${a.decided.by}` : `拒绝人：${a.decided.by}`
}

function timeline(co: ChangeOrder) {
  return deriveChangeOrderTimeline(co)
}
</script>

<template>
  <ErrorState v-if="isErrorAll" title="无法加载门禁"
    :description="errorAll instanceof Error ? errorAll.message : String(errorAll)" />

  <div v-else-if="isLoadingAll" class="space-y-4">
    <Skeleton class="h-8 w-48" />
    <div class="grid gap-3 md:grid-cols-2">
      <Skeleton v-for="i in 4" :key="i" class="h-40 w-full" />
    </div>
  </div>

  <div v-else class="space-y-4">
    <div class="grid gap-3 md:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1 text-sm">
            <ClipboardListIcon class="size-3.5" /> 待审批
          </CardTitle>
          <CardDescription class="text-xs">双门闩 / 沙箱升级审批</CardDescription>
        </CardHeader>
        <CardContent class="text-2xl font-semibold" :class="approvalSummary.pending ? 'text-amber-600 dark:text-amber-400' : ''">
          {{ approvalSummary.pending }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1 text-sm">
            <GitPullRequestIcon class="size-3.5" /> 已批准
          </CardTitle>
          <CardDescription class="text-xs">approved / used 合计</CardDescription>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ approvalSummary.approved + approvalSummary.used }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1 text-sm">
            <GitPullRequestIcon class="size-3.5" /> 变更单活跃
          </CardTitle>
          <CardDescription class="text-xs">proposed / applied 进行中</CardDescription>
        </CardHeader>
        <CardContent class="text-2xl font-semibold" :class="activeChangeOrders ? 'text-amber-600 dark:text-amber-400' : ''">
          {{ activeChangeOrders }}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <ShieldCheckIcon class="size-4" /> 任务门禁流水
        </CardTitle>
        <CardDescription>每任务状态机：双门闩 → 进行中 → 验证 → 交接 → 合并（证据门 / 合并门）。</CardDescription>
      </CardHeader>
      <CardContent v-if="gateRows.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无任务</EmptyTitle>
            <EmptyDescription>该运行尚未创建任务，无门禁流水。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="grid gap-2 md:grid-cols-2">
        <Card v-for="row in gateRows" :key="row.task_id" class="gap-1.5 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="break-all font-mono text-[10px] font-medium">{{ row.task_id }}</span>
            <Badge :variant="GATE_STAGE_BADGE[row.stage] ?? 'outline'">
              {{ row.stage }}
            </Badge>
            <Badge v-if="row.evidence === 'pass'" variant="default" class="px-1.5 py-0 text-[10px]">
              证据通过
            </Badge>
            <Badge v-else-if="row.evidence === 'fail'" variant="destructive" class="px-1.5 py-0 text-[10px]">
              证据失败
            </Badge>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>双门闩：</span>
            <Badge :variant="row.latched ? 'default' : 'outline'" class="px-1.5 py-0 text-[10px]">
              {{ row.latched ? '已齐' : '未齐' }}
            </Badge>
            <span v-if="row.phase" class="font-mono">{{ row.phase }}</span>
            <span v-if="row.merged" class="text-emerald-600 dark:text-emerald-400">已入合并列车</span>
          </div>
        </Card>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <ShieldCheckIcon class="size-4" /> 合并前门禁
        </CardTitle>
        <CardDescription>run 级门禁文件（合并前自动验证命令、归档记录等）。</CardDescription>
      </CardHeader>
      <CardContent v-if="gates.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无门禁记录</EmptyTitle>
            <EmptyDescription>当前运行尚未产生门禁记录。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="grid gap-3 md:grid-cols-2">
        <Card v-for="g in gates" :key="g.file" class="gap-2 p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <FileTextIcon class="size-4 text-muted-foreground" />
            <span class="break-all font-mono text-xs">{{ g.file }}</span>
          </div>
          <ScrollArea class="h-32 w-full rounded border bg-muted/50">
            <pre class="p-2 text-[10px] leading-relaxed text-muted-foreground">{{ JSON.stringify(g.data, null, 2) }}</pre>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Card>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <CheckCircle2Icon class="size-4" /> 任务验收证据
        </CardTitle>
        <CardDescription>各任务的验证记录（验收命令、退出码与结果）。</CardDescription>
      </CardHeader>
      <CardContent v-if="evidence.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无验收证据</EmptyTitle>
            <EmptyDescription>尚无任务产出验收记录。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="grid gap-3 md:grid-cols-2">
        <Card v-for="ev in evidence" :key="ev.task_id" class="gap-2 p-4">
          <div class="flex items-center justify-between gap-2">
            <span class="break-all font-mono text-xs font-medium">{{ ev.task_id }}</span>
            <Badge :variant="resultBadge(evidenceResult(ev))">
              {{ resultLabel(evidenceResult(ev)) }}
            </Badge>
          </div>
          <ul class="space-y-1">
            <li
              v-for="(cmd, i) in evidenceCommands(ev)"
              :key="i"
              class="flex items-start gap-1.5 text-[10px] text-muted-foreground"
            >
              <span
                v-if="cmd.exit_code === 0"
                class="mt-0.5"
              >
                <CheckCircle2Icon class="size-3 text-emerald-500" />
              </span>
              <span v-else class="mt-0.5">
                <XCircleIcon class="size-3 text-destructive" />
              </span>
              <span class="break-all">{{ cmd.cmd }}</span>
            </li>
          </ul>
        </Card>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <ClipboardListIcon class="size-4" /> 审批流
        </CardTitle>
        <CardDescription>沙箱升级 / 双门闩审批记录（asked/decided 成对审计）。</CardDescription>
      </CardHeader>
      <CardContent v-if="approvals.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无审批记录</EmptyTitle>
            <EmptyDescription>当前运行尚未产生审批请求。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="space-y-2">
        <Card v-for="a in approvals" :key="a.id" class="gap-1.5 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="break-all font-mono text-[10px] font-medium">{{ a.id }}</span>
            <Badge :variant="APPROVAL_STATUS_BADGE[a.status] ?? 'outline'">
              {{ APPROVAL_STATUS_ZH[a.status] ?? a.status }}
            </Badge>
            <span v-if="a.status === 'pending'" class="text-[10px] text-amber-600 dark:text-amber-400">
              待审批
            </span>
            <span class="ml-auto text-[10px] text-muted-foreground">{{ formatTime(a.asked.at) }}</span>
          </div>
          <div class="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            <div class="flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{{ a.asked.from_agent }}</span>
              <span class="font-mono">{{ a.asked.task_id }}</span>
              <span class="font-mono">{{ a.asked.path }}</span>
              <Badge variant="outline" class="px-1 py-0 text-[10px]">
                {{ SANDBOX_MODE_ZH[a.asked.mode] ?? a.asked.mode }}
              </Badge>
            </div>
            <div class="break-words">{{ a.asked.reason }}</div>
            <div v-if="a.decided" class="flex flex-wrap items-center gap-x-2 pt-0.5">
              <span :class="a.decided.decision === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'">
                {{ a.decided.decision === 'approved' ? '已批准' : '已拒绝' }}
              </span>
              <span>{{ decidedLabel(a) }}</span>
              <span>{{ formatTime(a.decided.at) }}</span>
              <span v-if="a.decided.note" class="break-words">{{ a.decided.note }}</span>
            </div>
          </div>
        </Card>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <GitPullRequestIcon class="size-4" /> 变更单
        </CardTitle>
        <CardDescription>run-lead 变更指令（proposed → applied → closed 状态机时间线）。</CardDescription>
      </CardHeader>
      <CardContent v-if="changeOrders.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无变更单</EmptyTitle>
            <EmptyDescription>当前运行尚未下发变更指令。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="space-y-2">
        <Card v-for="co in changeOrders" :key="co.id" class="gap-1.5 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="break-all font-mono text-[10px] font-medium">{{ co.id }}</span>
            <Badge :variant="CHANGE_ORDER_STATUS_BADGE[co.status] ?? 'outline'">
              {{ CHANGE_ORDER_STATUS_ZH[co.status] ?? co.status }}
            </Badge>
            <span class="font-mono text-[10px]">{{ co.task_id }}</span>
            <span class="ml-auto text-[10px] text-muted-foreground">{{ co.by }}</span>
          </div>
          <div class="mt-1 break-words text-xs">{{ co.summary }}</div>
          <ol class="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <li
              v-for="(ev, i) in timeline(co)"
              :key="i"
              class="flex items-center gap-1"
            >
              <span v-if="i > 0" class="text-muted-foreground/50">→</span>
              <span class="font-medium">{{ ev.text }}</span>
              <span class="font-mono">{{ formatTime(ev.at) }}</span>
            </li>
          </ol>
        </Card>
      </CardContent>
    </Card>
  </div>
</template>
