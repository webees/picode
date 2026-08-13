<script setup lang="ts">
import { AlertTriangleIcon, LoaderCircleIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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
import { useChunks } from '@/services/api/picode.api'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useChunks(props.runId)

const chunks = computed(() => data.value?.chunks ?? [])

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ready: 'default',
  done: 'secondary',
  blocked: 'destructive',
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载 chunks</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="flex items-center justify-center py-16 text-muted-foreground">
    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
    加载中…
  </div>

  <Card v-else class="p-0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>Task</TableHead>
          <TableHead>依赖</TableHead>
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
              {{ chunk.status ?? '-' }}
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
              <EmptyTitle>暂无 chunks</EmptyTitle>
              <EmptyDescription>该 run 尚未分块。</EmptyDescription>
            </EmptyContent>
          </Empty>
        </TableEmpty>
      </TableBody>
    </Table>
  </Card>
</template>
