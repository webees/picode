<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  count?: number
  columns?: 1 | 2 | 3 | 4
  class?: HTMLAttributes['class']
}>(), {
  count: 6,
  columns: 3,
})

const items = computed(() => Array.from({ length: props.count }, (_, i) => i))

const gridClass = computed(() => ({
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'md:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}[props.columns]))
</script>

<template>
  <div :class="cn('grid gap-4', gridClass, props.class)">
    <Card v-for="i in items" :key="i" class="gap-3 py-4">
      <CardHeader class="px-5">
        <div class="flex items-center justify-between">
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="size-6 rounded-full" />
        </div>
        <Skeleton class="h-5 w-1/2" />
      </CardHeader>
      <CardContent class="px-5">
        <Skeleton class="h-3 w-full" />
        <Skeleton class="mt-2 h-3 w-2/3" />
      </CardContent>
    </Card>
  </div>
</template>
