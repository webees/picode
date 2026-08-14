<script setup lang="ts">

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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
import { useChunks } from '@/services/api/picode.api'
import { CHUNK_STATUS, label } from '@/utils/labels'
import { ErrorState } from '@/components/dashboard'
import type { BadgeVariant } from '@/lib/utils'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useChunks(props.runId)

const chunks = computed(() => data.value?.chunks ?? [])

const statusVariant: Record<string, BadgeVariant> = {
  ready: 'default',
  in_progress: 'default', // 审计 P2-13：此前缺失 → 显示"实施中"却落 outline 徽章
  done: 'secondary',
  blocked: 'destructive',
}
</script>

<template>
  <ErrorState v-if="isError" title="无法加载分块计划"
    :description="error instanceof Error ? error.message : String(error)" />

  <Card v-else-if="isLoading" class="p-0">
    <div class="space-y-3 p-4">
      <div class="flex items-center gap-3">
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-4 w-16" />
        <Skeleton class="h-4 w-32" />
        <Skeleton class="h-4 w-20" />
      </div>
      <Skeleton v-for="i in 5" :key="i" class="h-10 w-full" />
    </div>
  </Card>

  <Card v-else class="p-0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>编号</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>对应任务</TableHead>
          <TableHead>前置依赖</TableHead>
          <TableHead>写入路径</TableHead>
          <TableHead>验收</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="chunk in chunks" :key="chunk.id">
          <TableCell class="font-mono text-xs">
            {{ chunk.id }}
          </TableCell>
          <TableCell>
            <Badge :variant="statusVariant[chunk.status ?? ''] ?? 'outline'">
              {{ label(CHUNK_STATUS, chunk.status) }}
            </Badge>
          </TableCell>
          <TableCell class="font-mono text-xs">
            {{ chunk.task_id ?? '-' }}
          </TableCell>
          <TableCell class="font-mono text-xs">
            {{ chunk.depends_on.length ? chunk.depends_on.join(', ') : '-' }}
          </TableCell>
          <TableCell class="max-w-72 truncate font-mono text-xs" :title="chunk.write_paths.join(' ')">
            {{ chunk.write_paths.length }} 项
          </TableCell>
          <TableCell class="text-xs">
            {{ chunk.acceptance.length }}
          </TableCell>
        </TableRow>
        <TableEmpty v-if="chunks.length === 0" :colspan="6">
          <Empty>
            <EmptyContent>
              <EmptyMedia variant="icon" />
              <EmptyTitle>暂无分块</EmptyTitle>
              <EmptyDescription>该运行尚未划分分块。</EmptyDescription>
            </EmptyContent>
          </Empty>
        </TableEmpty>
      </TableBody>
    </Table>
  </Card>
</template>
