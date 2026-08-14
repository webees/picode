<script setup lang="ts">
import { useRoute } from 'vue-router'

import { BasicPage } from '@/components/global-layout'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import ChunksTable from './components/chunks-table.vue'
import GatesPanel from './components/gates-panel.vue'
import GoalOverview from './components/goal-overview.vue'
import MergeTrain from './components/merge-train.vue'
import PersonnelView from './components/personnel-view.vue'
import ProgressView from './components/progress-view.vue'
import RoomsView from './components/rooms-view.vue'
import SessionsLive from './components/sessions-live.vue'
import TasksBoard from './components/tasks-board.vue'

const route = useRoute()
// 审计 P1：route.params 每次导航返回新对象，setup 时快照会导致 runId 无响应式
// 依赖（URL 变化页面仍显示旧 run 数据）——必须在 computed 内取值
const runId = computed(() => String((route.params as Record<string, string>).runId ?? ''))

const tabs = [
  { name: '概览', value: 'overview' },
  { name: '进度', value: 'progress' },
  { name: '房间', value: 'rooms' },
  { name: '人员', value: 'personnel' },
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
    description="运行详情 — 目标、进度、房间、人员、分块、任务、会话、合并与门禁全貌"
  >
    <Tabs :default-value="defaultTab" class="w-full">
      <ScrollArea class="w-full">
        <TabsList class="w-max min-w-full">
          <TabsTrigger
            v-for="tab in tabs"
            :key="tab.value"
            :value="tab.value"
          >
            {{ tab.name }}
          </TabsTrigger>
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <TabsContent value="overview" class="space-y-4">
        <GoalOverview :run-id="runId" />
      </TabsContent>
      <TabsContent value="progress" class="space-y-4">
        <ProgressView :run-id="runId" />
      </TabsContent>
      <TabsContent value="rooms" class="space-y-4">
        <RoomsView :run-id="runId" />
      </TabsContent>
      <TabsContent value="personnel" class="space-y-4">
        <PersonnelView :run-id="runId" />
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
