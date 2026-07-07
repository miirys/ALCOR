<script setup lang="ts">
import { ref } from 'vue';
import type { FeedbackType } from '@gitlab-org/lib-duo-agent-platform/webview';
import { useFeedback } from '../../composables/useFeedback';
import { useChat } from '../../composables/useChat';
import FeedbackButtons from './FeedbackButtons.vue';
import FeedbackReasonPanel from './FeedbackReasonPanel.vue';

const showFeedbackPanel = ref(false);
const selectedFeedbackType = ref<FeedbackType | null>(null);
const hasSubmitted = ref(false);
const { isSubmitting, submitFeedback } = useFeedback();
const { workflowId, workflowType } = useChat();

const handleFeedbackSelect = (feedbackType: FeedbackType) => {
  selectedFeedbackType.value = feedbackType;
  showFeedbackPanel.value = true;
};

const handleFeedbackSubmit = async (reason: string) => {
  if (!selectedFeedbackType.value) return;
  try {
    if (!workflowId) return;
    submitFeedback({
      workflowId,
      workflowType,
      feedbackType: selectedFeedbackType.value,
      reason,
    });
    showFeedbackPanel.value = false;
    selectedFeedbackType.value = null;
    hasSubmitted.value = true;
  } catch (error) {
    console.error('Failed to submit feedback:', error);
  }
};

const handleCloseFeedbackPanel = () => {
  showFeedbackPanel.value = false;
  selectedFeedbackType.value = null;
};
</script>

<template>
  <div class="w-full min-w-0">
    <div v-if="!showFeedbackPanel" class="flex gap-1 justify-between">
      <FeedbackButtons
        :is-loading="isSubmitting"
        @select-type="handleFeedbackSelect"
        :is-submitted="hasSubmitted"
      />
    </div>

    <FeedbackReasonPanel
      v-else
      :feedback-type="selectedFeedbackType!"
      :is-loading="isSubmitting"
      @submit-feedback="handleFeedbackSubmit"
      @back="showFeedbackPanel = false"
      @close="handleCloseFeedbackPanel"
    />
  </div>
</template>
