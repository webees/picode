<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  rows?: number
  columns?: number
  class?: HTMLAttributes['class']
}>(), {
  rows: 6,
  columns: 4,
})

const rowIndexes = computed(() => Array.from({ length: props.rows }, (_, i) => i))
const colIndexes = computed(() => Array.from({ length: props.columns }, (_, i) => i))
</script>

<template>
  <div :class="cn('overflow-x-auto', props.class)">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead v-for="c in colIndexes" :key="c" class="h-11">
            <Skeleton class="h-3 w-24 max-w-full" />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="r in rowIndexes" :key="r">
          <TableCell v-for="c in colIndexes" :key="c">
            <Skeleton class="h-3 w-full" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
