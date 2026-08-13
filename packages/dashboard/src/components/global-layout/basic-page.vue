<script setup lang="ts">
import type { LayoutHeaderProps } from './types'

import BasicHeader from './basic-header.vue'

defineProps<LayoutHeaderProps>()
</script>

<template>
  <main class="min-w-0">
    <BasicHeader
      :title="title"
      :description="description"
      :sticky="sticky"
    >
      <template #actions>
        <slot name="actions" />
      </template>
    </BasicHeader>

    <main class="py-4">
      <slot />
    </main>
  </main>
</template>
