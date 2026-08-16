<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessageSquareIcon, UsersIcon } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/dashboard'
import { useBusMembers, useBusMessages } from '@/services/api/picode.api'

import { deriveMembers, messageTypeLabel, relativeTime, type BusMessage } from './chat.data'
import ChatSendBox from './chat-send-box.vue'

const props = defineProps<{ runId: string; room: string }>()

const messages = useBusMessages(props.runId, props.room, 50)
const members = useBusMembers(props.runId, props.room)

const list = computed(() => [...(messages.data.value?.messages ?? [])].reverse())
const memberView = computed(() => deriveMembers(members.data.value?.members))

function expandable(m: BusMessage): boolean {
  return !!m.body || !!m.refs?.length || !!m.meta
}
const open = ref<Record<string, boolean>>({})
function toggle(id: string) {
  open.value[id] = !open.value[id]
}
watch(() => props.room, () => { open.value = {} })
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1fr_260px]">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <MessageSquareIcon class="h-4 w-4" />
          {{ room }}
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <ErrorState v-if="messages.isError.value" title="无法加载消息流" />
        <Skeleton v-else-if="messages.isLoading.value" class="h-8 w-full" />
        <Empty v-else-if="!list.length">
          <EmptyContent>
            <EmptyTitle>暂无消息</EmptyTitle>
            <EmptyDescription>该房间还没有聊天记录</EmptyDescription>
          </EmptyContent>
        </Empty>
        <div v-else class="space-y-2">
          <div v-for="m in list" :key="m.id ?? m.ts + m.from" class="rounded-lg border p-3">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="font-medium">{{ m.from }}</span>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{{ messageTypeLabel(m.type) }}</Badge>
                <span>{{ relativeTime(m.ts) }}</span>
              </div>
            </div>
            <p class="mt-1 whitespace-pre-wrap text-sm">{{ m.body || '（无正文）' }}</p>
            <button v-if="expandable(m)" class="mt-1 text-xs text-muted-foreground underline" @click="toggle(m.id ?? m.ts)">
              {{ open[m.id ?? m.ts] ? '收起详情' : '展开详情' }}
            </button>
            <pre v-if="open[m.id ?? m.ts]" class="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{{ JSON.stringify({ refs: m.refs, meta: m.meta }, null, 2) }}</pre>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <UsersIcon class="h-4 w-4" />
          参与者
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <Empty v-if="!memberView.length">
          <EmptyContent><EmptyTitle>无参与者</EmptyTitle></EmptyContent>
        </Empty>
        <div v-for="mv in memberView" :key="mv.id" class="flex items-center justify-between text-sm">
          <span>{{ mv.id }}</span>
          <Badge :variant="mv.canChat ? 'default' : 'outline'">{{ mv.canChat ? '可发言' : mv.access }}</Badge>
        </div>
      </CardContent>
    </Card>

    <ChatSendBox :run-id="runId" :room="room" :can-chat="memberView.some((m) => m.id === 'sponsor' && m.canChat)" />
  </div>
</template>
