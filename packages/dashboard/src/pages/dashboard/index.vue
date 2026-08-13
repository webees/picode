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

function openRun(runId: string) {
  router.push({ path: `/dashboard/runs/${runId}` })
}
</script>

<template>
  <BasicPage
    title="运行总览"
    description="查看本次工作目录下的所有运行（run），点击卡片进入详情。数据只读，来自 .picode/runs。"
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
      <AlertTitle>暂时连不上后端服务</AlertTitle>
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
                在数据服务指向的仓库里创建 run 后，这里会自动出现运行列表。
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card
        v-for="run in runs"
        :key="run.run_id"
        class="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        @click="openRun(run.run_id)"
      >
        <CardHeader>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="size-2 shrink-0 rounded-full" :class="statusMeta(run.status).dot" />
              <Badge :variant="statusMeta(run.status).badge">
                {{ statusMeta(run.status).label }}
              </Badge>
            </div>
            <Badge variant="secondary" class="shrink-0">
              {{ scaleLabel(run.scale) }}
            </Badge>
          </div>
          <CardTitle class="break-all text-base leading-snug">
            {{ run.title || run.run_id }}
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3 text-xs text-muted-foreground">
          <p v-if="statusMeta(run.status).description" class="text-muted-foreground/90">
            {{ statusMeta(run.status).description }}
          </p>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{{ kindLabel(run.kind) }}</span>
            <span>{{ formatRunDate(run.created_at) }}</span>
            <span>{{ run.acceptance + run.product_acceptance }} 项验收</span>
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
