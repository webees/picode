<script setup lang="ts">
import { useRoute } from 'vue-router'

import { BasicPage } from '@/components/global-layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import ChunksTable from './components/chunks-table.vue'
import GatesPanel from './components/gates-panel.vue'
import GoalOverview from './components/goal-overview.vue'
import MergeTrain from './components/merge-train.vue'
import SessionsLive from './components/sessions-live.vue'
import TasksBoard from './components/tasks-board.vue'

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
          v-for="tab in tabs"
          :key="tab.value"
          :value="tab.value"
        >
          {{ tab.name }}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" class="space-y-4">
        <GoalOverview :run-id="runId" />
      </TabsContent>
      <TabsContent value="chunks" class="space-y-4">
        <ChunksTable :run-id="runId" />
      </TabsContent>
      <TabsContent value="tasks" class="space-y-4">
        <TasksBoard :run-id="runId" />
      </TabsContent>
      <TabsContent value="sessions" class="space-y-4">
        <SessionsLive :run-id="runId" />
      </TabsContent>
      <TabsContent value="merge" class="space-y-4">
        <MergeTrain :run-id="runId" />
      </TabsContent>
      <TabsContent value="gates" class="space-y-4">
        <GatesPanel :run-id="runId" />
      </TabsContent>
    </Tabs>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
