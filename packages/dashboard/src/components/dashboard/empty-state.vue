<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: Component
  class?: HTMLAttributes['class']
}>(), {
  title: '暂无数据',
  description: '',
  icon: undefined,
})
</script>

<template>
  <Empty :class="cn('rounded-xl border', props.class)">
    <EmptyContent>
      <EmptyMedia variant="icon">
        <component :is="icon" v-if="icon" class="size-6" />
      </EmptyMedia>
      <EmptyTitle>
        {{ title }}
      </EmptyTitle>
      <EmptyDescription v-if="description">
        {{ description }}
      </EmptyDescription>
      <slot name="actions" />
    </EmptyContent>
  </Empty>
</template>
