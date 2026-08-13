<script setup lang="ts">
import { AlertTriangleIcon, MessageSquareIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useRun, useTasks } from '@/services/api/picode.api'

import { deriveRooms } from './views.data'

const props = defineProps<{ runId: string }>()

const run = useRun(props.runId)
const tasks = useTasks(props.runId)

const isLoading = computed(() => run.isLoading.value || tasks.isLoading.value)
const isError = computed(() => run.isError.value || tasks.isError.value)
const error = computed(() => run.error.value ?? tasks.error.value)

function emptySnapshot() {
  return {
    run_id: props.runId,
    goal: { status: '', scale: '', product_acceptance: 0, acceptance: 0 },
    sessions: { total: 0, awake: [], sleeping: 0, terminated: 0, errored: [] },
    rooms: [],
    tasks: [],
    merge_queue: { queued: 0, merged: 0, failed: 0 },
    continuation: { max_per_session: 0, idle_sec: 0, sessions: [] },
  }
}

const view = computed(() =>
  deriveRooms(run.data.value?.snapshot ?? emptySnapshot(), tasks.data.value?.tasks ?? []),
)
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载房间</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <Skeleton v-for="i in 6" :key="i" class="h-28 w-full" />
  </div>

  <div v-else-if="view.rooms.length === 0" class="rounded-lg border p-6">
    <Empty>
      <EmptyContent>
        <EmptyMedia variant="icon" />
        <EmptyTitle>暂无房间</EmptyTitle>
        <EmptyDescription>该运行尚未产生任何房间消息。</EmptyDescription>
      </EmptyContent>
    </Empty>
  </div>

  <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <Card v-for="room in view.rooms" :key="room.room" class="gap-2 p-4">
      <CardHeader class="gap-1 p-0">
        <div class="flex items-center justify-between gap-2">
          <CardTitle class="text-sm font-semibold">
            {{ room.label }}
          </CardTitle>
          <Badge variant="outline" class="shrink-0">
            {{ room.kind === 'squad' ? '任务小组' : '平台房' }}
          </Badge>
        </div>
        <CardDescription class="flex items-center gap-1 font-mono text-[10px]">
          <MessageSquareIcon class="size-3" /> {{ room.messages }} 条消息
        </CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="room.members.length" class="flex flex-wrap gap-1.5">
          <Badge
            v-for="m in room.members"
            :key="m.id"
            variant="secondary"
            class="max-w-56 px-1.5 py-0.5 text-[10px]"
            :title="m.id"
          >
            <span class="truncate">{{ m.roleLabel }}</span>
          </Badge>
        </div>
        <div v-else class="text-xs text-muted-foreground">
          暂无成员
        </div>
      </CardContent>
    </Card>
  </div>
</template>
