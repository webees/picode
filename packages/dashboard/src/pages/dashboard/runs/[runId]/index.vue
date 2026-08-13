<script setup lang="ts">
import { useRoute } from 'vue-router'

import { BasicPage } from '@/components/global-layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const route = useRoute()
const params = route.params as Record<string, string>
const runId = computed(() => params.runId ?? '')

const tabs = [
  { name: '概览', value: 'overview' },
  { name: 'Chunks', value: 'chunks' },
  { name: '任务看板', value: 'tasks' },
  { name: '会话 & Tokens', value: 'sessions' },
  { name: 'Merge 列车', value: 'merge' },
  { name: '门禁 Evidence', value: 'gates' },
]

const defaultTab = tabs[0].value
</script>

<template>
  <BasicPage
    :title="runId"
    :description="`Run ${runId}`"
  >
    <Tabs :default-value="defaultTab" class="w-full">
      <TabsList>
        <TabsTrigger
          v-for="tab in tabs" :key="tab.value"
          :value="tab.value"
        >
          {{ tab.name }}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" class="space-y-4">
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Goal 概览面板（C3 接入 GET /api/runs/:runId）
        </div>
      </TabsContent>
      <TabsContent value="chunks" class="space-y-4">
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Chunks 表格面板（C3 接入 GET /api/runs/:runId/chunks）
        </div>
      </TabsContent>
      <TabsContent value="tasks" class="space-y-4">
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          任务看板面板（C3 接入 GET /api/runs/:runId/board）
        </div>
      </TabsContent>
      <TabsContent value="sessions" class="space-y-4">
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          会话与实时 Tokens 面板（C3 接入 GET /api/runs/:runId/sessions + /api/live/:runId/:agent）
        </div>
      </TabsContent>
      <TabsContent value="merge" class="space-y-4">
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Merge 列车面板（C3 接入 GET /api/runs/:runId/merge）
        </div>
      </TabsContent>
      <TabsContent value="gates" class="space-y-4">
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          门禁 Evidence 面板（C3 接入 GET /api/runs/:runId/gates）
        </div>
      </TabsContent>
    </Tabs>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
