<script setup lang="ts">
import { ThumbsUp, ThumbsDown } from 'lucide-vue-next';
import type { FeedbackType } from '@gitlab-org/lib-duo-agent-platform/webview';
import { Button } from '@/components/ui/button';

interface Props {
  isLoading?: boolean;
  isSubmitted?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  selectType: [feedbackType: FeedbackType];
}>();

const handleFeedbackType = (type: FeedbackType) => {
  emit('selectType', type);
};
</script>

<template>
  <div class="flex items-center gap-2">
    <div v-if="!props.isSubmitted" class="flex gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Helpful"
        @click="handleFeedbackType('thumbs_up')"
        class="text-foreground hover:text-green-500"
      >
        <ThumbsUp class="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Not helpful"
        @click="handleFeedbackType('thumbs_down')"
        class="text-foreground hover:text-red-500"
      >
        <ThumbsDown class="w-4 h-4" />
      </Button>
    </div>

    <div v-else class="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Thanks for the feedback!</span>
    </div>
  </div>
</template>
