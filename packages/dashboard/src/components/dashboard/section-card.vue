<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  class?: HTMLAttributes['class']
}>(), {
  title: '',
  description: '',
})
</script>

<template>
  <Card :class="cn('gap-4', props.class)">
    <CardHeader v-if="title || description" class="px-5">
      <CardTitle class="text-base">
        {{ title }}
      </CardTitle>
      <CardDescription v-if="description">
        {{ description }}
      </CardDescription>
    </CardHeader>
    <CardContent class="px-5">
      <slot />
    </CardContent>
  </Card>
</template>
