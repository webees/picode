<script setup lang="ts">
import { AlertTriangleIcon, ArrowRightIcon, FolderOpenIcon, RefreshCwIcon } from '@lucide/vue'
import { useRouter } from 'vue-router'

import { BasicPage } from '@/components/global-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useRuns } from '@/services/api/picode.api'

import {
  formatRunDate,
  kindLabel,
  scaleLabel,
  statusMeta,
  summarizeRuns,
} from './index.components'

const router = useRouter()

const { data, isLoading, isError, error, refetch, isFetching } = useRuns()

const runs = computed(() => data.value?.runs ?? [])
const stats = computed(() => summarizeRuns(runs.value))

const statCards = computed(() => [
  { label: '全部运行', value: stats.value.total, accent: '' },
  { label: '进行中', value: stats.value.active, accent: 'text-emerald-600 dark:text-emerald-400' },
  { label: '已完成', value: stats.value.completed, accent: 'text-slate-500 dark:text-slate-400' },
  { label: '受阻', value: stats.value.blocked, accent: 'text-rose-600 dark:text-rose-400' },
])

const runCards = computed(() => runs.value.map(run => ({
  run,
  status: statusMeta(run.status),
  kind: kindLabel(run.kind),
  scale: scaleLabel(run.scale),
  date: formatRunDate(run.created_at),
  meta: `验收 ${run.acceptance} 项 · 产品要求 ${run.product_acceptance} 项`,
})))

function openRun(runId: string) {
  router.push({ path: `/dashboard/runs/${runId}` })
}
</script>

<template>
  <BasicPage
    title="运行总览"
    description="查看当前工作目录下的全部运行，点击任意卡片可进入详情。数据只读，不会改动任何内容。"
  >
    <template #actions>
      <Button
        variant="outline"
        size="sm"
        :disabled="isLoading"
        @click="refetch"
      >
        <RefreshCwIcon class="size-4" :class="isFetching ? 'animate-spin' : ''" />
        刷新
      </Button>
    </template>

    <Alert v-if="isError" variant="destructive" class="mb-6">
      <AlertTriangleIcon />
      <AlertTitle>暂时连不上数据服务</AlertTitle>
      <AlertDescription>
        请先启动数据服务：npm run dev -w @picode/dashboard-server（默认 127.0.0.1:8788），再点「刷新」。
        {{ error instanceof Error ? error.message : String(error) }}
      </AlertDescription>
    </Alert>

    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card
        v-for="s in statCards"
        :key="s.label"
        class="px-4 py-3"
      >
        <div class="text-xs text-muted-foreground">
          {{ s.label }}
        </div>
        <div class="mt-1 text-2xl font-semibold tabular-nums" :class="s.accent">
          {{ s.value }}
        </div>
      </Card>
    </div>

    <div v-if="isLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 6" :key="i">
        <CardHeader>
          <div class="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div class="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
        </CardHeader>
      </Card>
    </div>

    <div v-else-if="runs.length === 0" class="grid gap-4">
      <Card>
        <CardContent class="py-10">
          <Empty>
            <EmptyContent>
              <EmptyMedia variant="icon">
                <FolderOpenIcon class="size-10" />
              </EmptyMedia>
              <EmptyTitle>还没有运行记录</EmptyTitle>
              <EmptyDescription>
                在数据服务指向的仓库里创建运行后，这里会自动出现列表。
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card
        v-for="card in runCards"
        :key="card.run.run_id"
        class="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        @click="openRun(card.run.run_id)"
      >
        <CardHeader>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="size-2 shrink-0 rounded-full" :class="card.status.dot" />
              <Badge :variant="card.status.badge">
                {{ card.status.label }}
              </Badge>
            </div>
            <Badge variant="secondary" class="shrink-0">
              {{ card.scale }}
            </Badge>
          </div>
          <CardTitle class="break-all text-base leading-snug">
            {{ card.run.title || card.run.run_id }}
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3 text-xs text-muted-foreground">
          <p v-if="card.status.description" class="text-muted-foreground/90">
            {{ card.status.description }}
          </p>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{{ card.kind }}</span>
            <span>{{ card.date }}</span>
            <span>{{ card.meta }}</span>
            <span
              class="ml-auto inline-flex items-center gap-1 text-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            >
              查看详情
              <ArrowRightIcon class="size-3.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
