<script setup lang="ts">
import type { DuoMessage } from '@gitlab-org/graphql';
import { Copy } from 'lucide-vue-next';
import Feedback from '../feedback/Feedback.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { Button } from '@/components/ui/button';

interface Props {
  message: DuoMessage;
}

defineProps<Props>();
const emit = defineEmits<{
  copyMessage: [message: string];
  openUrl: [url: string];
  copyCode: [code: string];
  insertCode: [code: string];
}>();
</script>

<template>
  <div class="w-full min-w-0">
    <div class="wrap-break-word mb-2 flex-1">
      <MarkdownRenderer
        :content="message.content"
        @open-url="emit('openUrl', $event)"
        @copy-code="emit('copyCode', $event)"
        @insert-code="emit('insertCode', $event)"
      />
    </div>

    <div class="flex gap-1 justify-between">
      <Feedback />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy message"
        @click.stop="emit('copyMessage', message.content)"
      >
        <Copy />
      </Button>
    </div>
  </div>
</template>
