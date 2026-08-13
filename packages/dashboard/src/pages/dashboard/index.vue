<script setup lang="ts">
import { AlertTriangleIcon, LoaderCircleIcon, RefreshCwIcon } from '@lucide/vue'
import { useRouter } from 'vue-router'

import { BasicPage } from '@/components/global-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useRuns } from '@/services/api/picode.api'

const router = useRouter()
const { data, isLoading, isError, error, refetch } = useRuns()

const runs = computed(() => data.value?.runs ?? [])

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
  blocked: 'destructive',
  intake: 'outline',
  draft: 'outline',
}

function openRun(runId: string) {
  router.push({ path: `/dashboard/runs/${runId}` })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <BasicPage
    title="Runs"
    description="Picode 运行实例列表 — 数据源 .picode/runs 只读投影"
  >
    <template #actions>
      <Button
        variant="outline"
        size="sm"
        :disabled="isLoading"
        @click="refetch"
      >
        <RefreshCwIcon class="size-4" :class="isLoading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </template>

    <Alert v-if="isError" variant="destructive" class="mb-4">
      <AlertTriangleIcon />
      <AlertTitle>无法连接 dashboard-server</AlertTitle>
      <AlertDescription>
        请先启动后端：npm run dev -w @picode/dashboard-server（默认 127.0.0.1:8788）。
        {{ error instanceof Error ? error.message : String(error) }}
      </AlertDescription>
    </Alert>

    <div v-if="isLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 6" :key="i" class="md:col-span-1">
        <CardHeader>
          <div class="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div class="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </CardHeader>
      </Card>
    </div>

    <div v-else-if="runs.length === 0" class="grid gap-4">
      <Card class="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>No runs yet</CardTitle>
          <CardDescription>当前 repo 下还没有 run 实例。</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyContent>
              <EmptyMedia variant="icon" />
              <EmptyTitle>暂无可展示的 run</EmptyTitle>
              <EmptyDescription>在 --repo 指向的仓库创建 run 后刷新。</EmptyDescription>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card
        v-for="run in runs"
        :key="run.run_id"
        class="cursor-pointer transition-shadow hover:shadow-md"
        @click="openRun(run.run_id)"
      >
        <CardHeader>
          <div class="flex items-start justify-between gap-2">
            <Badge :variant="statusVariant[run.status] ?? 'outline'">
              {{ run.status }}
            </Badge>
            <Badge variant="secondary">
              scale {{ run.scale }}
            </Badge>
          </div>
          <CardTitle class="break-all text-base">
            {{ run.title || run.run_id }}
          </CardTitle>
          <CardDescription class="font-mono text-xs">
            {{ run.run_id }}
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {{ run.kind }}
          </Badge>
          <span>{{ formatDate(run.created_at) }}</span>
          <span>验收 {{ run.acceptance }} · 产品 {{ run.product_acceptance }}</span>
          <span v-if="isLoading" class="ml-auto">
            <LoaderCircleIcon class="size-3 animate-spin" />
          </span>
        </CardContent>
      </Card>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
