<script setup lang="ts">
import {
  AlertTriangleIcon,
  LoaderCircleIcon,
  TargetIcon,
  UsersIcon,
} from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useRun, useSessions, useTasks } from '@/services/api/picode.api'
import { label, RUN_KIND, RUN_SCALE, RUN_STATUS } from '@/utils/labels'

import { derivePersonnel, deriveProgress, deriveRooms } from './views.data'

const props = defineProps<{ runId: string }>()

const run = useRun(props.runId)
const tasks = useTasks(props.runId)
const sessions = useSessions(props.runId)

const isLoading = computed(() => run.isLoading.value || tasks.isLoading.value || sessions.isLoading.value)
const isError = computed(() => run.isError.value || tasks.isError.value || sessions.isError.value)
const error = computed(() => run.error.value ?? tasks.error.value ?? sessions.error.value)

const goal = computed(() => run.data.value?.goal ?? null)
const snapshot = computed(() => run.data.value?.snapshot ?? null)

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

const taskList = computed(() => tasks.data.value?.tasks ?? [])
const sessionList = computed(() => sessions.data.value?.sessions ?? [])

const progress = computed(() => deriveProgress(taskList.value))
const rooms = computed(() => deriveRooms(snapshot.value ?? emptySnapshot(), taskList.value))
const personnel = computed(() => derivePersonnel(taskList.value, sessionList.value))

const alerts = computed(() => {
  const list: Array<{ severity: 'error' | 'warn', text: string }> = []
  const failed = taskList.value.filter(t => t.status === 'failed').length
  const blocked = progress.value.blockedCount
  const errored = snapshot.value?.sessions.errored.length ?? 0
  const mergeFailed = snapshot.value?.merge_queue.failed ?? 0
  if (failed)
    list.push({ severity: 'error', text: `${failed} 个任务失败` })
  if (blocked)
    list.push({ severity: 'warn', text: `${blocked} 个任务受阻` })
  if (errored)
    list.push({ severity: 'error', text: `${errored} 个会话异常` })
  if (mergeFailed)
    list.push({ severity: 'error', text: `${mergeFailed} 次合并失败` })
  return list
})

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
  blocked: 'destructive',
  intake: 'outline',
  draft: 'outline',
  parked: 'secondary', // 审计 P2-13：此前缺失 → "已停放"落默认徽章
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载运行概览</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="flex items-center justify-center py-16 text-muted-foreground">
    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
    加载中…
  </div>

  <div v-else-if="goal" class="space-y-4">
    <Alert v-for="(a, i) in alerts" :key="i" :variant="a.severity === 'error' ? 'destructive' : 'default'" class="text-sm">
      <AlertTriangleIcon />
      <AlertTitle class="text-sm font-medium">
        {{ a.text }}
      </AlertTitle>
      <AlertDescription class="text-xs">
        详见「任务看板 / 会话活跃度」。
      </AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-center gap-2">
          <Badge :variant="statusVariant[goal.status] ?? 'outline'">
            {{ label(RUN_STATUS, goal.status) }}
          </Badge>
          <Badge variant="secondary">
            {{ label(RUN_SCALE, goal.scale) }}
          </Badge>
          <Badge variant="outline">
            {{ label(RUN_KIND, goal.kind) }}
          </Badge>
        </div>
        <CardTitle class="flex items-center gap-1.5 text-lg">
          <TargetIcon class="size-4 text-muted-foreground" />
          {{ goal.title }}
        </CardTitle>
        <CardDescription class="font-mono text-xs">
          {{ goal.id }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4 text-sm">
        <div>
          <div class="mb-1 font-medium">
            目标说明
          </div>
          <p class="text-muted-foreground">
            {{ goal.intent }}
          </p>
        </div>
        <Separator />
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg border p-3">
            <div class="text-xs text-muted-foreground">
              会话总数
            </div>
            <div class="mt-1 text-xl font-semibold">
              {{ snapshot?.sessions.total ?? 0 }}
            </div>
          </div>
          <div class="rounded-lg border p-3">
            <div class="text-xs text-muted-foreground">
              活跃会话
            </div>
            <div class="mt-1 text-xl font-semibold">
              {{ snapshot?.sessions.awake.length ?? 0 }}
            </div>
          </div>
          <div class="rounded-lg border p-3">
            <div class="text-xs text-muted-foreground">
              任务
            </div>
            <div class="mt-1 text-xl font-semibold">
              {{ snapshot?.tasks.length ?? 0 }}
            </div>
          </div>
          <div class="rounded-lg border p-3">
            <div class="text-xs text-muted-foreground">
              已合并任务
            </div>
            <div class="mt-1 text-xl font-semibold">
              {{ snapshot?.merge_queue.merged ?? 0 }}
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <div class="mb-1 font-medium">
            产品验收标准（{{ goal.product_acceptance.length }} 项）
          </div>
          <ul class="list-inside list-disc space-y-1 text-muted-foreground">
            <li v-for="(item, i) in goal.product_acceptance" :key="i">
              {{ item }}
            </li>
          </ul>
        </div>
        <div v-if="goal.open_questions.length">
          <div class="mb-1 font-medium">
            待决问题
          </div>
          <ul class="list-inside list-disc space-y-1 text-muted-foreground">
            <li v-for="(q, i) in goal.open_questions" :key="i">
              {{ q }}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            任务进度
          </CardTitle>
          <CardDescription class="text-xs">
            {{ progress.inFlight }} / {{ progress.total }} 已开工
          </CardDescription>
        </CardHeader>
        <CardContent class="text-2xl font-semibold" :class="progress.blockedCount ? 'text-destructive' : ''">
          {{ progress.blockedCount ? `${progress.blockedCount} 受阻` : `${progress.total - progress.inFlight} 待开工` }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            活跃房间
          </CardTitle>
          <CardDescription class="text-xs">
            平台 + 任务小队房间
          </CardDescription>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ rooms.rooms.length }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1 text-sm">
            <UsersIcon class="size-3.5" /> 在册人员
          </CardTitle>
          <CardDescription class="text-xs">
            平台席 + 小队三角席
          </CardDescription>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ personnel.platformSeats.length }}
        </CardContent>
      </Card>
    </div>
  </div>
</template>
