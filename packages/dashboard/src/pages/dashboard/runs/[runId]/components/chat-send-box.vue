<script setup lang="ts">
import { ref } from 'vue'
import { SendIcon } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useQueryClient } from '@tanstack/vue-query'
import { postBusMessage } from '@/services/api/picode.api'

import { precheckSend } from './chat.data'

const props = defineProps<{ runId: string; room: string; canChat: boolean }>()

const qc = useQueryClient()
const text = ref('')
const sending = ref(false)
const errorMsg = ref<string | null>(null)

async function send() {
  const pre = precheckSend(text.value, props.canChat, 'leadership、product')
  if (pre) {
    errorMsg.value = pre
    return
  }
  sending.value = true
  errorMsg.value = null
  try {
    await postBusMessage(props.runId, props.room, text.value)
    text.value = ''
    await qc.invalidateQueries({ queryKey: ['picode', 'bus', props.runId] })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    errorMsg.value = err.code ? `${err.code}：${err.message}` : (err.message ?? '发送失败')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <Textarea v-model="text" :disabled="!canChat || sending" placeholder="输入聊天消息…" rows="3" />
    <div class="flex items-center justify-between gap-2">
      <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
      <Button :disabled="!canChat || sending || !text.trim()" @click="send">
        <SendIcon class="h-4 w-4" />
        发送
      </Button>
    </div>
  </div>
</template>
