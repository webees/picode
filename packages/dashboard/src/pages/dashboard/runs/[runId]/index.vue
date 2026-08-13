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
  { name: '分块计划', value: 'chunks' },
  { name: '任务看板', value: 'tasks' },
  { name: '会话活跃度', value: 'sessions' },
  { name: '合并队列', value: 'merge' },
  { name: '质量门禁', value: 'gates' },
]

const defaultTab = tabs[0].value
</script>

<template>
  <BasicPage
    :title="runId"
    description="运行详情 — 目标、分块、任务、会话、合并与门禁全貌"
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
