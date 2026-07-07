import { defineStore } from 'pinia';
import { WorkflowStatusCode } from '@gitlab-lsp/workflow-api';

export const useRequestErrorStore = defineStore('requestError', {
  state: () => ({
    requestError: null,
    statusCode: null,
    pollIntervalId: null,
  }),
  getters: {
    isSocketLocked: (state) => {
      return state.statusCode === WorkflowStatusCode.LOCKED_SOCKET;
    },
    socketError: (state) => {
      return state.statusCode === WorkflowStatusCode.LOCKED_SOCKET ? state.requestError : null;
    },
  },
  actions: {
    setRequestError(error) {
      // Handle both old string format and new object format
      this.requestError = typeof error === 'string' ? error : error?.message;
      this.statusCode = typeof error === 'object' ? error?.statusCode : null;
    },
    resetRequestError() {
      this.requestError = null;
      this.statusCode = null;
    },
  },
  events: {
    workflowError: 'setRequestError',
  },
});
