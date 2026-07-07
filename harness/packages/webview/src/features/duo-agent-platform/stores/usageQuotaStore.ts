import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';

export interface CheckUsageQuotaArgs {
  rootNamespaceId?: string;
  workflowDefinition?: string;
  projectId?: string;
}

export const useUsageQuotaStore = defineStore('usageQuota', () => {
  const usageQuotaExceeded = ref(false);
  const usageQuotaExceededMidStream = ref(false);

  const messageBus: DuoAgentPlatformMessageBus = getDuoAgentPlatformMessageBus();

  messageBus.onNotification('setUsageQuotaExceeded', ({ exceeded, isMidStream = false }) => {
    usageQuotaExceeded.value = exceeded;
    usageQuotaExceededMidStream.value = exceeded && isMidStream;
  });

  function $reset() {
    usageQuotaExceeded.value = false;
    usageQuotaExceededMidStream.value = false;
  }

  function checkUsageQuota(args: CheckUsageQuotaArgs = {}) {
    messageBus.sendNotification('checkUsageQuota', args);
  }

  function resetUsageQuotaExceededMidStream() {
    usageQuotaExceededMidStream.value = false;
  }

  return {
    usageQuotaExceeded,
    usageQuotaExceededMidStream,
    $reset,
    checkUsageQuota,
    resetUsageQuotaExceededMidStream,
  };
});
