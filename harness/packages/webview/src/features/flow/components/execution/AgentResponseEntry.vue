<script setup lang="ts">
import { ref, computed } from 'vue';
import { Bot, ChevronDown, ChevronUp } from 'lucide-vue-next';
import type { ChatLogMessage } from '../../types/execution';
import { formatTimestamp } from '../../utils/checkpoint';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  message: ChatLogMessage;
}>();

const isExpanded = ref(false);
const isLongContent = computed(() => props.message.content.length > 500);
const displayContent = computed(() => {
  if (isExpanded.value || !isLongContent.value) {
    return props.message.content;
  }
  return `${props.message.content.slice(0, 500)}...`;
});
</script>

<template>
  <div class="bg-muted/40 border border-border rounded-lg p-4">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-3">
      <div class="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
        <Bot class="h-3.5 w-3.5 text-primary" />
      </div>
      <span class="text-sm font-medium text-foreground">Agent Response</span>
      <span class="text-xs text-muted-foreground ml-auto">
        {{ formatTimestamp(message.timestamp) }}
      </span>
    </div>

    <!-- Content -->
    <div class="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
      {{ displayContent }}
    </div>

    <!-- Expand/Collapse -->
    <Button
      v-if="isLongContent"
      variant="ghost"
      size="sm"
      class="mt-2 h-7 text-xs text-muted-foreground"
      @click="isExpanded = !isExpanded"
    >
      <component :is="isExpanded ? ChevronUp : ChevronDown" class="h-3.5 w-3.5 mr-1" />
      {{ isExpanded ? 'Show less' : 'Show more' }}
    </Button>
  </div>
</template>
