<script setup lang="ts">
import { cn } from '@/lib/utils'

import type { LayoutHeaderProps } from './types'

defineProps<LayoutHeaderProps>()
</script>

<template>
  <header
    :class="cn(
      'flex flex-col md:flex-row gap-3 justify-between py-2',
      sticky ? 'sticky top-0 z-40 bg-background/95 backdrop-blur' : '',
    )"
  >
    <main class="min-w-0">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">
        {{ title }}
      </h1>
      <p v-if="description" class="mt-1 text-sm text-muted-foreground">
        {{ description }}
      </p>
    </main>

    <aside class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </aside>
  </header>
</template>
