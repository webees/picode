<script setup lang="ts">
import { GitMergeIcon } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useMerge, useChunks, useTasks } from '@/services/api/picode.api'
import { label, MERGE_STATUS } from '@/utils/labels'
import { ErrorState } from '@/components/dashboard'
import type { BadgeVariant } from '@/lib/utils'

import { deriveMergeWaitReasons } from './flow.data'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useMerge(props.runId)
const chunksQuery = useChunks(props.runId)
const tasksQuery = useTasks(props.runId)

const queue = computed(() => data.value?.queue ?? [])
const counts = computed(() => data.value?.counts ?? { queued: 0, merged: 0, failed: 0 })

const waitReasons = computed(() =>
  deriveMergeWaitReasons(
    tasksQuery.data.value?.tasks ?? [],
    chunksQuery.data.value?.chunks ?? [],
    queue.value,
  ),
)

function waitReasonOf(taskId: string): string | null {
  return waitReasons.value.find(w => w.task_id === taskId)?.reason ?? null
}

const statusVariant: Record<string, BadgeVariant> = {
  merged: 'default',
  queued: 'outline',
  failed: 'destructive',
}

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '-'
}
</script>

<template>
  <ErrorState v-if="isError" title="无法加载 merge 列车"
    :description="error instanceof Error ? error.message : String(error)" />

  <div v-else-if="isLoading" class="space-y-4">
    <div class="grid gap-4 md:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>
    <Skeleton class="h-10 w-full" />
    <Skeleton v-for="i in 4" :key="i" class="h-10 w-full" />
  </div>

  <div v-else class="space-y-4">
    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm flex items-center gap-1">
            <GitMergeIcon class="size-3.5" /> 已合并
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ counts.merged }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            排队中
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ counts.queued }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            失败
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ counts.failed }}
        </CardContent>
      </Card>
    </div>

    <Card class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>状态</TableHead>
            <TableHead>任务</TableHead>
            <TableHead>发起</TableHead>
            <TableHead>排队时间</TableHead>
            <TableHead>合并时间</TableHead>
            <TableHead>等待原因 / 错误</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="req in queue" :key="req.id">
            <TableCell>
              <Badge :variant="statusVariant[req.status] ?? 'outline'">
                {{ label(MERGE_STATUS, req.status) }}
              </Badge>
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ req.task_id }}
            </TableCell>
            <TableCell class="text-xs">
              {{ req.from }}
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ formatTime(req.ts) }}
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ formatTime(req.merged_at) }}
            </TableCell>
            <TableCell class="max-w-56 truncate text-xs" :title="req.error ?? undefined">
              <span v-if="req.status === 'queued' && waitReasonOf(req.task_id)" class="text-amber-600 dark:text-amber-400">
                {{ waitReasonOf(req.task_id) }}
              </span>
              <span v-else-if="req.error" class="text-destructive">{{ req.error }}</span>
              <span v-else>-</span>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="queue.length === 0" :colspan="6">
            <Empty>
              <EmptyContent>
                <EmptyMedia variant="icon" />
                <EmptyTitle>暂无合并记录</EmptyTitle>
                <EmptyDescription>
                  合并队列当前为空 — 任务完成验证后会按顺序合并。
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
