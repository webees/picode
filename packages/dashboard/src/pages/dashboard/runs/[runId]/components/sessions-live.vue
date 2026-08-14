<script setup lang="ts">
import {
  ActivityIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from '@lucide/vue'
import { useQueries } from '@tanstack/vue-query'

import type { LiveResult, SessionItem } from '@/services/api/picode.api'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchLiveTokens,
  LIVE_POLL_INTERVAL_MS,
  useSessions,
} from '@/services/api/picode.api'
import { label, SESSION_STATE } from '@/utils/labels'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useSessions(props.runId)

const sessions = computed(() => data.value?.sessions ?? [])
const continuation = computed(() => data.value?.continuation ?? null)

const awakeSessions = computed(() => sessions.value.filter(s => s.state === 'awake'))

const liveQueries = useQueries({
  queries: computed(() => awakeSessions.value.map(s => ({
    queryKey: ['picode', 'live', props.runId, s.agent_id],
    queryFn: () => fetchLiveTokens(props.runId, s.agent_id),
    enabled: !!s.pi_session_id,
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    staleTime: LIVE_POLL_INTERVAL_MS,
    retry: 1,
  }))),
})

const liveByAgent = computed(() => {
  const map = new Map<string, LiveResult | undefined>()
  awakeSessions.value.forEach((s, i) => {
    map.set(s.agent_id, liveQueries.value[i]?.data)
  })
  return map
})

function liveFor(s: SessionItem): LiveResult | undefined {
  return liveByAgent.value.get(s.agent_id)
}

function liveTotal(s: SessionItem): number {
  const r = liveFor(s)
  return r?.ok && r.tokens ? r.tokens.total : 0
}

function liveError(s: SessionItem): string | null {
  const r = liveFor(s)
  if (r && !r.ok) return r.error
  // fetch 抛错（HTTP 5xx / 网络断）时 query data 为 undefined，isError 才可见
  const i = awakeSessions.value.findIndex((x) => x.agent_id === s.agent_id)
  const q = i >= 0 ? liveQueries.value[i] : undefined
  if (q?.isError) {
    return q.error instanceof Error ? q.error.message : String(q.error ?? 'serve 轮询失败')
  }
  return null
}

const stateVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  awake: 'default',
  sleeping: 'secondary',
  registered: 'outline',
  terminated: 'destructive',
}

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString() : '-'
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载会话</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="space-y-4">
    <div class="grid gap-4 md:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>
    <Skeleton class="h-10 w-full" />
    <Skeleton v-for="i in 6" :key="i" class="h-10 w-full" />
  </div>

  <div v-else class="space-y-4">
    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            平台会话
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ sessions.length }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm flex items-center gap-1">
            <ActivityIcon class="size-3.5" /> 工作中
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ awakeSessions.length }}
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm flex items-center gap-1">
            <RefreshCwIcon class="size-3.5" /> 刷新间隔
          </CardTitle>
        </CardHeader>
        <CardContent class="text-2xl font-semibold">
          {{ LIVE_POLL_INTERVAL_MS / 1000 }}s
        </CardContent>
      </Card>
    </div>

    <Card class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>会话名</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>Token 消耗</TableHead>
            <TableHead>续跑 / 上限</TableHead>
            <TableHead>回合中</TableHead>
            <TableHead>上次续跑</TableHead>
            <TableHead>错误</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="s in sessions" :key="s.agent_id">
            <TableCell class="font-mono text-xs">
              {{ s.agent_id }}
            </TableCell>
            <TableCell class="text-xs">
              {{ s.role_id }}
            </TableCell>
            <TableCell>
              <Badge :variant="stateVariant[s.state] ?? 'outline'">
                {{ label(SESSION_STATE, s.state) }}
              </Badge>
            </TableCell>
            <TableCell>
              <template v-if="s.state === 'awake'">
                <span v-if="liveError(s)" class="text-xs text-destructive" :title="liveError(s) ?? undefined">
                  serve 失联
                </span>
                <span v-else-if="liveTotal(s) > 0" class="font-mono tabular-nums text-xs">
                  {{ liveTotal(s).toLocaleString() }}
                </span>
                <span v-else class="text-xs text-muted-foreground">-</span>
              </template>
              <span v-else class="text-xs text-muted-foreground">-</span>
            </TableCell>
            <TableCell class="font-mono text-xs tabular-nums">
              {{ s.budget?.continuations ?? 0 }} / {{ continuation?.max_per_session ?? 0 }}
            </TableCell>
            <TableCell>
              <Badge
                v-if="continuation?.sessions.find(c => c.agent_id === s.agent_id)?.in_flight"
                variant="outline"
              >
                投喂中
              </Badge>
              <span v-else class="text-xs text-muted-foreground">-</span>
            </TableCell>
            <TableCell class="font-mono text-xs">
              {{ formatTime(continuation?.sessions.find(c => c.agent_id === s.agent_id)?.last_continuation_at ?? null) }}
            </TableCell>
            <TableCell class="max-w-40 truncate text-xs" :title="s.error ?? undefined">
              <span v-if="s.error" class="text-destructive">{{ s.error }}</span>
              <span v-else>-</span>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="sessions.length === 0" :colspan="8">
            <Empty>
              <EmptyContent>
                <EmptyMedia variant="icon" />
                <EmptyTitle>暂无会话</EmptyTitle>
                <EmptyDescription>该 run 尚未注册任何会话。</EmptyDescription>
              </EmptyContent>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
    </Card>

    <Alert v-if="awakeSessions.length > 0" class="text-xs">
      <ActivityIcon />
      <AlertTitle>Token 实时活跃度</AlertTitle>
      <AlertDescription>
        仅对工作中且已连接后端的会话轮询（每 {{ LIVE_POLL_INTERVAL_MS / 1000 }} 秒）。
        后端失联/超时返回降级提示，不会白屏。
      </AlertDescription>
    </Alert>
  </div>
</template>
