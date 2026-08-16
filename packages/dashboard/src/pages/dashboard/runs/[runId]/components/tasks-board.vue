<script setup lang="ts">
import { LoaderCircleIcon } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useBoard, useTasks } from '@/services/api/picode.api'
import { BOARD_COLUMN_ZH } from '@/utils/labels'
import { ErrorState } from '@/components/dashboard'

import { BOARD_COLUMN_META } from './tasks-board.data'
import { PHASE_PROGRESS } from './role-meta.data'
import { dualLatchState } from './flow.data'

const props = defineProps<{ runId: string }>()

const board = useBoard(props.runId)
const tasks = useTasks(props.runId)

const isLoading = computed(() => board.isLoading.value || tasks.isLoading.value)
const isError = computed(() => board.isError.value || tasks.isError.value)
const error = computed(() => board.error.value ?? tasks.error.value)

const columns = computed(() => board.data.value?.columns ?? [])
const cards = computed(() => board.data.value?.cards ?? [])

const progressByTask = computed(() => {
  const map = new Map<string, { phase: string, blocked: boolean }>()
  for (const t of tasks.data.value?.tasks ?? []) {
    if (t.progress)
      map.set(t.task_id, { phase: t.progress.phase, blocked: t.progress.blocked })
  }
  return map
})

const latchByTask = computed(() => {
  const map = new Map<string, { brief: string | null, staffing: string | null }>()
  for (const t of tasks.data.value?.tasks ?? []) {
    map.set(t.task_id, { brief: t.latch?.brief ?? null, staffing: t.latch?.staffing ?? null })
  }
  return map
})

const KIND_ZH: Record<string, string> = { task: '任务', intake: '立项', chunk: '分块' }

function cardsOf(column: string) {
  return cards.value.filter(c => c.column === column)
}

function cardLatch(card: { id: string }) {
  const latch = latchByTask.value.get(card.id)
  if (!latch)
    return null
  return dualLatchState(latch.brief, latch.staffing)
}

function cardPhase(card: { id: string }) {
  return progressByTask.value.get(card.id)
}

function phaseValue(phase: string | undefined): number {
  if (!phase)
    return 0
  return PHASE_PROGRESS[phase] ?? 0
}

function phaseLabel(phase: string | undefined): string {
  if (!phase)
    return '未开工'
  if (phase === 'handing_over')
    return '交接中'
  if (phase === 'verifying')
    return '验证中'
  return '进行中'
}
</script>

<template>
  <ErrorState v-if="isError" title="无法加载看板"
    :description="error instanceof Error ? error.message : String(error)" />

  <div v-else-if="isLoading" class="flex items-center justify-center py-16 text-muted-foreground">
    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
    加载中…
  </div>

  <div v-else class="grid gap-3 overflow-x-auto md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
    <div
      v-for="col in columns"
      :key="col"
      class="flex min-w-56 flex-col gap-2 rounded-lg border bg-muted/20 p-2"
    >
      <div
        class="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium"
        :class="BOARD_COLUMN_META[col]?.headerClass ?? ''"
      >
        <span class="size-1.5 shrink-0 rounded-full" :class="BOARD_COLUMN_META[col]?.dotClass ?? 'bg-current'" />
        <span class="truncate">{{ BOARD_COLUMN_ZH[col] ?? BOARD_COLUMN_META[col]?.label ?? col }}</span>
        <span class="ml-auto shrink-0 tabular-nums">{{ cardsOf(col).length }}</span>
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-for="card in cardsOf(col)"
          :key="card.id"
          class="rounded-md border bg-card p-2.5 text-xs shadow-sm transition-shadow hover:shadow-md"
          :title="card.detail"
        >
          <div class="flex items-center gap-1.5">
            <Badge variant="outline" class="px-1 py-0 text-[10px]">
              {{ KIND_ZH[card.kind] ?? card.kind }}
            </Badge>
            <Badge
              v-if="card.blocked || cardPhase(card)?.blocked"
              variant="destructive"
              class="px-1 py-0 text-[10px]"
            >
              受阻
            </Badge>
            <Badge
              v-if="cardLatch(card) && cardLatch(card)!.label === '审批中' && card.kind === 'task'"
              variant="outline"
              class="px-1 py-0 text-[10px] text-amber-600 dark:text-amber-400"
            >
              审批中
            </Badge>
          </div>
          <div class="mt-1.5 break-words font-medium leading-snug">
            {{ card.title }}
          </div>
          <div class="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" :title="card.owner">
            {{ card.owner }}
          </div>
          <div v-if="cardPhase(card)" class="mt-1.5 space-y-0.5">
            <div class="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{{ phaseLabel(cardPhase(card)!.phase) }}</span>
            </div>
            <Progress :model-value="phaseValue(cardPhase(card)!.phase)" class="h-1" />
          </div>
          <div class="mt-1 truncate text-[10px] text-muted-foreground" :title="card.detail">
            {{ card.detail }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
