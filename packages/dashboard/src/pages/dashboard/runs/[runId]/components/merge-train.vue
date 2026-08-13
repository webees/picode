<script setup lang="ts">
import { AlertTriangleIcon, GitMergeIcon, LoaderCircleIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useMerge } from '@/services/api/picode.api'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useMerge(props.runId)

const queue = computed(() => data.value?.queue ?? [])
const counts = computed(() => data.value?.counts ?? { queued: 0, merged: 0, failed: 0 })

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  merged: 'default',
  queued: 'outline',
  failed: 'destructive',
}

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '-'
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载 merge 列车</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="flex items-center justify-center py-16 text-muted-foreground">
    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
    加载中…
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
            <TableHead>错误</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="req in queue" :key="req.id">
            <TableCell>
              <Badge :variant="statusVariant[req.status] ?? 'outline'">
                {{ req.status }}
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
              <span v-if="req.error" class="text-destructive">{{ req.error }}</span>
              <span v-else>-</span>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="queue.length === 0" :colspan="6">
            <Empty>
              <EmptyContent>
                <EmptyMedia variant="icon" />
                <EmptyTitle>暂无 merge 记录</EmptyTitle>
                <EmptyDescription>
                  串行 merge 列车（D036）当前为空 — 任务合并后入队。
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
