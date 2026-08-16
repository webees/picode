<script setup lang="ts">
import { UsersIcon } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useSessions, useTasks } from '@/services/api/picode.api'
import { label, SESSION_STATE } from '@/utils/labels'
import { ErrorState } from '@/components/dashboard'
import type { BadgeVariant } from '@/lib/utils'

import { derivePersonnel } from './views.data'
import { latchBadge } from './flow.data'

const props = defineProps<{ runId: string }>()

const tasks = useTasks(props.runId)
const sessions = useSessions(props.runId)

const isLoading = computed(() => tasks.isLoading.value || sessions.isLoading.value)
const isError = computed(() => tasks.isError.value || sessions.isError.value)
const error = computed(() => tasks.error.value ?? sessions.error.value)

const view = computed(() =>
  derivePersonnel(tasks.data.value?.tasks ?? [], sessions.data.value?.sessions ?? []),
)

const stateVariant: Record<string, BadgeVariant> = {
  awake: 'default',
  sleeping: 'secondary',
  registered: 'outline',
  terminated: 'destructive',
}

const SEAT_ZH: Record<string, string> = {
  'squad-lead': '队长',
  'engineer': '实现',
  'sdet': '验证',
}

const latchByTask = computed(() => {
  const map = new Map<string, { brief: string | null, staffing: string | null }>()
  for (const t of tasks.data.value?.tasks ?? []) {
    map.set(t.task_id, { brief: t.latch?.brief ?? null, staffing: t.latch?.staffing ?? null })
  }
  return map
})
</script>

<template>
  <ErrorState v-if="isError" title="无法加载人员"
    :description="error instanceof Error ? error.message : String(error)" />

  <div v-else-if="isLoading" class="space-y-4">
    <Skeleton class="h-40 w-full" />
    <Skeleton class="h-40 w-full" />
  </div>

  <div v-else class="space-y-4">
    <Card class="p-0">
      <CardHeader class="border-b p-4 pb-3">
        <CardTitle class="flex items-center gap-1.5 text-sm">
          <UsersIcon class="size-4" /> 平台席
        </CardTitle>
        <CardDescription>每个角色一枚席位，负责各自领域的统筹与把关。</CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>席位</TableHead>
            <TableHead>职责</TableHead>
            <TableHead>说明</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="seat in view.platformSeats.filter(s => s.kind === 'platform')" :key="seat.agent_id">
            <TableCell class="font-mono text-xs">
              {{ seat.agent_id }}
            </TableCell>
            <TableCell class="text-xs font-medium">
              {{ seat.roleLabel }}
            </TableCell>
            <TableCell class="max-w-72 truncate text-xs text-muted-foreground" :title="seat.roleDesc">
              {{ seat.roleDesc }}
            </TableCell>
            <TableCell>
              <Badge :variant="stateVariant[seat.state] ?? 'outline'">
                {{ label(SESSION_STATE, seat.state) }}
              </Badge>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="view.platformSeats.filter(s => s.kind === 'platform').length === 0" :colspan="4">
            <Empty>
              <EmptyContent>
                <EmptyMedia variant="icon" />
                <EmptyTitle>暂无平台席</EmptyTitle>
                <EmptyDescription>该运行尚未注册平台会话。</EmptyDescription>
              </EmptyContent>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
    </Card>

    <Card class="p-0">
      <CardHeader class="border-b p-4 pb-3">
        <CardTitle class="flex items-center gap-1.5 text-sm">
          <UsersIcon class="size-4" /> 任务三角
        </CardTitle>
        <CardDescription>每个任务由队长、实现、验证三人小队承接。</CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>任务</TableHead>
            <TableHead>小队房间</TableHead>
            <TableHead>双门闩</TableHead>
            <TableHead>队长</TableHead>
            <TableHead>实现</TableHead>
            <TableHead>验证</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="t in view.triads" :key="t.task_id">
            <TableCell class="max-w-56 truncate font-mono text-xs" :title="t.task_id">
              {{ t.task_id }}
            </TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">
              {{ t.work_room }}
            </TableCell>
            <TableCell>
              <div v-if="latchByTask.get(t.task_id)" class="flex gap-1">
                <Badge :variant="latchBadge(latchByTask.get(t.task_id)!.brief).variant" class="px-1.5 py-0 text-[10px]">
                  {{ latchBadge(latchByTask.get(t.task_id)!.brief).label }}
                </Badge>
                <Badge :variant="latchBadge(latchByTask.get(t.task_id)!.staffing).variant" class="px-1.5 py-0 text-[10px]">
                  {{ latchBadge(latchByTask.get(t.task_id)!.staffing).label }}
                </Badge>
              </div>
              <span v-else class="text-xs text-muted-foreground">-</span>
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ t.seats.find(s => s.seat === 'squad-lead')?.agent_id ?? '-' }}
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ t.seats.find(s => s.seat === 'engineer')?.agent_id ?? '-' }}
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ t.seats.find(s => s.seat === 'sdet')?.agent_id ?? '-' }}
            </TableCell>
          </TableRow>
          <TableEmpty v-if="view.triads.length === 0" :colspan="6">
            <Empty>
              <EmptyContent>
                <EmptyMedia variant="icon" />
                <EmptyTitle>暂无任务三角</EmptyTitle>
                <EmptyDescription>该运行尚未组建任何小队。</EmptyDescription>
              </EmptyContent>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
    </Card>

    <div v-if="view.platformSeats.some(s => s.kind === 'task')" class="flex flex-wrap gap-1.5">
      <Badge
        v-for="seat in view.platformSeats.filter(s => s.kind === 'task')"
        :key="seat.agent_id"
        variant="outline"
        class="px-2 py-1 font-mono text-[10px]"
        :title="`${seat.roleDesc} · ${seat.task_id}`"
      >
        {{ SEAT_ZH[seat.role_id] ?? seat.role_id }} · {{ seat.task_id }}
      </Badge>
    </div>
  </div>
</template>
