<script setup lang="ts">
import { ListChecksIcon } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
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
import { useTasks } from '@/services/api/picode.api'
import { label, TASK_STATUS } from '@/utils/labels'
import { ErrorState } from '@/components/dashboard'

import { deriveProgress } from './views.data'
import { PHASE_PROGRESS } from './role-meta.data'

function phaseValue(phase: string | null | undefined): number {
  if (phase === null || phase === undefined)
    return 0
  return PHASE_PROGRESS[phase] ?? 0
}


const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useTasks(props.runId)

const view = computed(() => deriveProgress(data.value?.tasks ?? []))

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  in_progress: 'default',
  ready: 'secondary',
  merged: 'secondary',
  failed: 'destructive',
  dissolved: 'outline',
  cancelled: 'outline',
}

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '—'
}
</script>

<template>
  <ErrorState v-if="isError" title="无法加载任务进度"
    :description="error instanceof Error ? error.message : String(error)" />

  <div v-else-if="isLoading" class="space-y-4">
    <div class="grid gap-4 md:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>
    <Skeleton class="h-10 w-full" />
    <Skeleton v-for="i in 5" :key="i" class="h-10 w-full" />
  </div>

  <div v-else class="space-y-4">
    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1 text-sm">
            <ListChecksIcon class="size-3.5" /> 任务总数
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ view.total }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            已开工
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ view.inFlight }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            已阻塞
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold" :class="view.blockedCount ? 'text-destructive' : ''">
          {{ view.blockedCount }}
        </CardContent>
      </Card>
    </div>

    <Card class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>任务</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>阶段</TableHead>
            <TableHead>进度</TableHead>
            <TableHead>阻塞</TableHead>
            <TableHead>摘要</TableHead>
            <TableHead>更新时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in view.rows" :key="row.task_id">
            <TableCell class="max-w-56 truncate font-mono text-xs" :title="row.task_id">
              {{ row.task_id }}
            </TableCell>
            <TableCell>
              <Badge :variant="statusVariant[row.status] ?? 'outline'">
                {{ label(TASK_STATUS, row.status) }}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {{ row.phaseLabel }}
              </Badge>
            </TableCell>
            <TableCell class="min-w-32">
              <Progress
                :model-value="phaseValue(row.phase)"
                class="h-1.5"
              />
            </TableCell>
            <TableCell>
              <Badge v-if="row.blocked" variant="destructive">
                受阻
              </Badge>
              <span v-else class="text-xs text-muted-foreground">-</span>
            </TableCell>
            <TableCell class="max-w-72 truncate text-xs" :title="row.summary">
              {{ row.summary }}
            </TableCell>
            <TableCell class="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {{ formatTime(row.updated_at) }}
            </TableCell>
          </TableRow>
          <TableEmpty v-if="view.rows.length === 0" :colspan="7">
            <Empty>
              <EmptyContent>
                <EmptyMedia variant="icon" />
                <EmptyTitle>暂无任务</EmptyTitle>
                <EmptyDescription>该运行尚未创建任务。</EmptyDescription>
              </EmptyContent>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
