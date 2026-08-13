<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const props = withDefaults(defineProps<{
  title?: string
  value?: string | number
  hint?: string
  icon?: Component
  tone?: StatusTone
  class?: HTMLAttributes['class']
}>(), {
  title: '',
  value: '',
  hint: '',
  icon: undefined,
  tone: 'neutral',
})

const toneClass: Record<StatusTone, string> = {
  success: 'text-status-success',
  warning: 'text-status-warning',
  danger: 'text-status-danger',
  info: 'text-status-info',
  neutral: '',
}
</script>

<template>
  <Card :class="cn('gap-3 py-4', props.class)">
    <CardContent class="flex items-start gap-3">
      <div v-if="icon" class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <component :is="icon" class="size-5" />
      </div>
      <div class="min-w-0">
        <div class="text-sm text-muted-foreground">
          {{ title }}
        </div>
        <div class="mt-0.5 flex items-baseline gap-2">
          <span class="text-2xl font-semibold tracking-tight" :class="toneClass[tone]">
            {{ value }}
          </span>
          <span v-if="hint" class="text-xs text-muted-foreground">
            {{ hint }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
