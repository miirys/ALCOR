import { defineStore } from 'pinia';
import { getIDfromGraphqlId } from '../../../common/utils.ts';
import { useRepositoriesStore } from './repositories';
import { useWorkflowStore } from './workflow';

export const useUsageQuotaStore = defineStore('usageQuota', {
  state: () => ({
    usageQuotaExceeded: false,
    usageQuotaExceededMidStream: false,
  }),

  actions: {
    checkUsageQuota() {
      const repositoriesStore = useRepositoriesStore();
      const workflowStore = useWorkflowStore();

      const rootNamespaceId = repositoriesStore.currentRootNamespaceId;

      // Parse GraphQL ID if it's in the format gid://gitlab/Group/123
      const parsedRootNamespaceId = rootNamespaceId ? getIDfromGraphqlId(rootNamespaceId) : null;

      this.sendNotification('checkUsageQuota', {
        rootNamespaceId: parsedRootNamespaceId,
        workflowDefinition: workflowStore.flowDefinition,
      });
    },

    setUsageQuotaExceeded({ exceeded, isMidStream = false }) {
      this.usageQuotaExceeded = exceeded;
      this.usageQuotaExceededMidStream = isMidStream;
    },

    resetUsageQuotaExceededMidStream() {
      this.usageQuotaExceededMidStream = false;
    },
  },

  events: {
    setUsageQuotaExceeded: 'setUsageQuotaExceeded',
  },
});
