<script setup lang="ts">
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@lucide/vue'

import type { GateEvidence } from '@/services/api/picode.api'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useGates } from '@/services/api/picode.api'

const props = defineProps<{ runId: string }>()

const { data, isLoading, isError, error } = useGates(props.runId)

const gates = computed(() => data.value?.gates ?? [])
const evidence = computed(() => data.value?.evidence ?? [])

function evidenceResult(ev: GateEvidence): string {
  const v = ev.evidence
  return typeof v === 'object' && v && 'result' in v ? String((v as { result: unknown }).result) : 'unknown'
}

function evidenceCommands(ev: GateEvidence): Array<{ cmd?: string, exit_code?: unknown }> {
  const v = ev.evidence
  if (typeof v === 'object' && v && 'commands' in v) {
    const cmds = (v as { commands: unknown }).commands
    return Array.isArray(cmds) ? cmds as Array<{ cmd?: string, exit_code?: unknown }> : []
  }
  return []
}

function resultBadge(result: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (result === 'pass')
    return 'default'
  if (result === 'fail')
    return 'destructive'
  return 'outline'
}

function resultLabel(result: string): string {
  if (result === 'pass')
    return '通过'
  if (result === 'fail')
    return '失败'
  if (result === 'pass_with_finding')
    return '通过（有发现）'
  return result
}
</script>

<template>
  <Alert v-if="isError" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>无法加载门禁</AlertTitle>
    <AlertDescription>
      {{ error instanceof Error ? error.message : String(error) }}
    </AlertDescription>
  </Alert>

  <div v-else-if="isLoading" class="space-y-4">
    <Skeleton class="h-8 w-48" />
    <div class="grid gap-3 md:grid-cols-2">
      <Skeleton v-for="i in 4" :key="i" class="h-40 w-full" />
    </div>
  </div>

  <div v-else class="space-y-4">
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <ShieldCheckIcon class="size-4" /> 合并前门禁
        </CardTitle>
        <CardDescription>run 级门禁文件（合并前自动验证命令、归档记录等）。</CardDescription>
      </CardHeader>
      <CardContent v-if="gates.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无门禁记录</EmptyTitle>
            <EmptyDescription>当前运行尚未产生门禁记录。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="grid gap-3 md:grid-cols-2">
        <Card v-for="g in gates" :key="g.file" class="gap-2 p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <FileTextIcon class="size-4 text-muted-foreground" />
            <span class="break-all font-mono text-xs">{{ g.file }}</span>
          </div>
          <ScrollArea class="h-32 w-full rounded border bg-muted/50">
            <pre class="p-2 text-[10px] leading-relaxed text-muted-foreground">{{ JSON.stringify(g.data, null, 2) }}</pre>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Card>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-1 text-sm">
          <CheckCircle2Icon class="size-4" /> 任务验收证据
        </CardTitle>
        <CardDescription>各任务的验证记录（验收命令、退出码与结果）。</CardDescription>
      </CardHeader>
      <CardContent v-if="evidence.length === 0">
        <Empty>
          <EmptyContent>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无验收证据</EmptyTitle>
            <EmptyDescription>尚无任务产出验收记录。</EmptyDescription>
          </EmptyContent>
        </Empty>
      </CardContent>
      <CardContent v-else class="grid gap-3 md:grid-cols-2">
        <Card v-for="ev in evidence" :key="ev.task_id" class="gap-2 p-4">
          <div class="flex items-center justify-between gap-2">
            <span class="break-all font-mono text-xs font-medium">{{ ev.task_id }}</span>
            <Badge :variant="resultBadge(evidenceResult(ev))">
              {{ resultLabel(evidenceResult(ev)) }}
            </Badge>
          </div>
          <ul class="space-y-1">
            <li
              v-for="(cmd, i) in evidenceCommands(ev)"
              :key="i"
              class="flex items-start gap-1.5 text-[10px] text-muted-foreground"
            >
              <span
                v-if="cmd.exit_code === 0"
                class="mt-0.5"
              >
                <CheckCircle2Icon class="size-3 text-emerald-500" />
              </span>
              <span v-else class="mt-0.5">
                <XCircleIcon class="size-3 text-destructive" />
              </span>
              <span class="break-all">{{ cmd.cmd }}</span>
            </li>
          </ul>
        </Card>
      </CardContent>
    </Card>
  </div>
</template>
