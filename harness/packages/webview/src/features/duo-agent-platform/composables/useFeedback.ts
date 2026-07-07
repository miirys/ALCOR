import { ref } from 'vue';
import type { FeedbackType, UserFeedbackContext } from '@gitlab-org/lib-duo-agent-platform/webview';
import { getDuoAgentPlatformMessageBus } from '../services/DuoAgentPlatformMessageBus';

type SubmitFeedbackParams = {
  workflowId: string;
  workflowType: 'chat' | 'flows';
  feedbackType: FeedbackType;
  reason: string;
};

export function useFeedback() {
  const messageBus = getDuoAgentPlatformMessageBus();
  const isSubmitting = ref(false);
  const error = ref<string | null>(null);

  const submitFeedback = ({
    workflowId,
    workflowType,
    feedbackType,
    reason,
  }: SubmitFeedbackParams) => {
    isSubmitting.value = true;
    error.value = null;

    try {
      const payload: UserFeedbackContext = {
        workflowType,
        workflowId,
        feedback: {
          feedbackType,
          reason,
        },
      };

      messageBus.sendNotification('submitFeedback', payload);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to submit feedback';
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    submitFeedback,
    isSubmitting,
    error,
  };
}
