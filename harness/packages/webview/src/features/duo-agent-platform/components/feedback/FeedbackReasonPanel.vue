<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, Undo2, Pencil } from 'lucide-vue-next';
import {
  FeedbackType,
  PredefinedReason,
  ThumbsDownReasons,
  ThumbsUpReasons,
} from '@gitlab-org/lib-duo-agent-platform/webview';
import { Button } from '@/components/ui/button';

interface Props {
  feedbackType: FeedbackType;
  isLoading?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  submitFeedback: [reason: string];
  close: [];
}>();

const customFeedback = ref('');
const openCustomFeedback = ref(false);

const predefinedReasons = computed<PredefinedReason[]>(() => {
  return props.feedbackType === 'thumbs_up' ? ThumbsUpReasons : ThumbsDownReasons;
});

const remainingChars = computed(() => 140 - customFeedback.value.length);

const handleSubmit = (reason: string) => {
  emit('submitFeedback', reason);
};

const handleClickReason = (reason: PredefinedReason) => {
  if (reason.isCustom) {
    openCustomFeedback.value = true;
  } else {
    handleSubmit(reason.key);
  }
};

const handleBack = () => {
  openCustomFeedback.value = false;
  customFeedback.value = '';
};
</script>

<template>
  <div class="flex flex-col gap-4 p-4 bg-background rounded-lg border">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">
        {{
          feedbackType === 'thumbs_up'
            ? 'What made this helpful?'
            : 'What would have been more helpful?'
        }}
      </h3>
      <div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          v-if="openCustomFeedback"
          @click="handleBack"
        >
          <Undo2 class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close" @click="$emit('close')">
          <X class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Predefined Reasons -->
    <div class="flex flex-col gap-2" v-if="!openCustomFeedback">
      <Button
        v-for="reason in predefinedReasons"
        :key="reason.key"
        class="text-left px-3 py-2 rounded-md border transition-colors flex gap-1 items-center"
        @click="handleClickReason(reason)"
      >
        <Pencil class="w-4 h-4" v-if="reason.isCustom" />
        {{ reason.label }}
      </Button>
    </div>

    <!-- Custom Reason -->
    <div class="flex flex-col gap-2" v-else-if="openCustomFeedback">
      <label for="custom-feedback" class="text-xs font-medium text-muted-foreground">
        ({{ remainingChars }} characters remaining)
      </label>
      <textarea
        v-model="customFeedback"
        maxlength="140"
        placeholder="Tell us more..."
        class="w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        rows="3"
      />
      <Button
        size="sm"
        @click="handleSubmit(customFeedback)"
        :disabled="isLoading || customFeedback.length === 0"
      >
        {{ isLoading ? 'Submitting...' : 'Submit' }}
      </Button>
    </div>
  </div>
</template>
