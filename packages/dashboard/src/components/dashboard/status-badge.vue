<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { StatusTone } from './stat-card.vue'

const props = withDefaults(defineProps<{
  tone?: StatusTone
  dot?: boolean
  class?: HTMLAttributes['class']
}>(), {
  tone: 'neutral',
  dot: true,
})

const toneClass: Record<StatusTone, string> = {
  success: 'bg-status-success/10 text-status-success',
  warning: 'bg-status-warning/10 text-status-warning',
  danger: 'bg-status-danger/10 text-status-danger',
  info: 'bg-status-info/10 text-status-info',
  neutral: 'bg-muted text-muted-foreground',
}

const dotClass: Record<StatusTone, string> = {
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-status-danger',
  info: 'bg-status-info',
  neutral: 'bg-muted-foreground',
}
</script>

<template>
  <Badge
    :class="cn('gap-1.5 rounded-full', toneClass[tone], props.class)"
  >
    <span v-if="dot" class="size-1.5 rounded-full" :class="dotClass[tone]" />
    <slot />
  </Badge>
</template>
