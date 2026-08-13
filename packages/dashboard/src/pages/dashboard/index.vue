<script setup lang="ts">
import { RefreshCwIcon } from '@lucide/vue'

import { BasicPage } from '@/components/global-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

// NOTE: scaffold page. C3 will wire tanstack/vue-query useRuns() and render real run cards.
const runs = shallowRef<Array<{ id: string, status: string }>>([])
const loading = shallowRef(false)
</script>

<template>
  <BasicPage
    title="Runs"
    description="Picode 运行实例列表"
  >
    <template #actions>
      <Button variant="outline" size="sm" :disabled="loading" @click="loading = true">
        <RefreshCwIcon class="size-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </template>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card v-if="runs.length === 0 && !loading" class="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>No runs yet</CardTitle>
          <CardDescription>接入 dashboard-server（GET /api/runs）后将在此展示 run 列表。</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyContent>
              <EmptyMedia variant="icon" />
              <EmptyTitle>暂无可展示的 run</EmptyTitle>
              <EmptyDescription>骨架页 — 数据由后续任务接入。</EmptyDescription>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
