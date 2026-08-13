<script setup lang="ts">
import { AlertTriangleIcon, LoaderCircleIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useRun } from '@/services/api/picode.api'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useRun(props.runId)

const goal = computed(() => data.value?.goal ?? null)
const snapshot = computed(() => data.value?.snapshot ?? null)

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
  blocked: 'destructive',
  intake: 'outline',
  draft: 'outline',
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载 run 概览</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="flex items-center justify-center py-16 text-muted-foreground">
    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
    加载中…
  </div>

  <div v-else-if="goal" class="space-y-4">
    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-center gap-2">
          <Badge :variant="statusVariant[goal.status] ?? 'outline'">
            {{ goal.status }}
          </Badge>
          <Badge variant="secondary">
            scale {{ goal.scale }}
          </Badge>
          <Badge variant="outline">
            {{ goal.kind }}
          </Badge>
        </div>
        <CardTitle class="text-lg">
          {{ goal.title }}
        </CardTitle>
        <CardDescription class="font-mono text-xs">
          {{ goal.id }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4 text-sm">
        <div>
          <div class="mb-1 font-medium">
            Intent
          </div>
          <p class="text-muted-foreground">
            {{ goal.intent }}
          </p>
        </div>
        <Separator />
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg border p-3">
            <div class="text-xs text-muted-foreground">
              会话（snapshot）
            </div>
            <div class="mt-1 text-xl font-semibold">
              {{ snapshot?.sessions.total ?? 0 }}
            </div>
          </div>
          <div class="rounded-lg border p-3">
            <div class="text-xs text-muted-foreground">
              Awake
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
              Merge 完成
            </div>
            <div class="mt-1 text-xl font-semibold">
              {{ snapshot?.merge_queue.merged ?? 0 }}
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <div class="mb-1 font-medium">
            Product Acceptance（{{ goal.product_acceptance.length }}）
          </div>
          <ul class="list-inside list-disc space-y-1 text-muted-foreground">
            <li v-for="(item, i) in goal.product_acceptance" :key="i">
              {{ item }}
            </li>
          </ul>
        </div>
        <div v-if="goal.open_questions.length">
          <div class="mb-1 font-medium">
            Open Questions
          </div>
          <ul class="list-inside list-disc space-y-1 text-muted-foreground">
            <li v-for="(q, i) in goal.open_questions" :key="i">
              {{ q }}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
