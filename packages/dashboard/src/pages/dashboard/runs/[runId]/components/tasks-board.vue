<script setup lang="ts">
import { AlertTriangleIcon, LoaderCircleIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useBoard } from '@/services/api/picode.api'
import { BOARD_COLUMN_ZH } from '@/utils/labels'

import { BOARD_COLUMN_META } from './tasks-board.data'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useBoard(props.runId)

const columns = computed(() => data.value?.columns ?? [])
const cards = computed(() => data.value?.cards ?? [])

const KIND_ZH: Record<string, string> = { task: '任务', intake: '立项', chunk: '分块' }

function cardsOf(column: string) {
  return cards.value.filter(c => c.column === column)
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载看板</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="flex items-center justify-center py-16 text-muted-foreground">
    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
    加载中…
  </div>

  <div v-else class="grid gap-3 overflow-x-auto md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
    <div
      v-for="col in columns"
      :key="col"
      class="flex min-w-44 flex-col gap-2 rounded-lg border p-2"
    >
      <div
        class="rounded-md border px-2 py-1.5 text-xs font-medium"
        :class="BOARD_COLUMN_META[col]?.headerClass ?? ''"
      >
        <div class="flex items-center justify-between">
          <span>{{ BOARD_COLUMN_ZH[col] ?? BOARD_COLUMN_META[col]?.label ?? col }}</span>
          <span class="tabular-nums">{{ cardsOf(col).length }}</span>
        </div>
        <div class="mt-0.5 text-[10px] font-normal opacity-70">
          {{ BOARD_COLUMN_META[col]?.description ?? '' }}
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-for="card in cardsOf(col)"
          :key="card.id"
          class="rounded-md border bg-card p-2 text-xs shadow-sm"
          :title="card.detail"
        >
          <div class="flex items-center gap-1.5">
            <Badge variant="outline" class="px-1 py-0 text-[10px]">
              {{ KIND_ZH[card.kind] ?? card.kind }}
            </Badge>
            <Badge
              v-if="card.blocked"
              variant="destructive"
              class="px-1 py-0 text-[10px]"
            >
              受阻
            </Badge>
          </div>
          <div class="mt-1.5 break-all font-medium">
            {{ card.title }}
          </div>
          <div class="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" :title="card.owner">
            {{ card.owner }}
          </div>
          <div class="mt-1 truncate text-[10px] text-muted-foreground" :title="card.detail">
            {{ card.detail }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
