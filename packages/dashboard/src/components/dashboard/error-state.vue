<script setup lang="ts">
import { AlertTriangleIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  hint?: string
  retryLabel?: string
  loading?: boolean
}>(), {
  title: '加载失败',
  description: '',
  hint: '',
  retryLabel: '重试',
  loading: false,
})

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <Alert variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>{{ props.title }}</AlertTitle>
    <AlertDescription>
      <p v-if="props.description">
        {{ props.description }}
      </p>
      <p v-if="props.hint" class="mt-1 opacity-80">
        {{ props.hint }}
      </p>
      <Button
        variant="outline"
        size="sm"
        class="mt-3"
        :disabled="props.loading"
        @click="emit('retry')"
      >
        {{ props.retryLabel }}
      </Button>
    </AlertDescription>
  </Alert>
</template>
