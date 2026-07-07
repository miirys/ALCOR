import { defineStore } from 'pinia';
import {
  DELETE_DUO_WORKFLOWS_WORKFLOW,
  GET_USER_WORKFLOWS,
  AI_CATALOG_VERSION_ID_FRAGMENT,
} from '@gitlab-lsp/workflow-api';
import { processPreCreatedWorkflows } from '../utils/pre_created_workflows';
import { useHealthCheckStore } from './health_check';
import { useMainStore } from './main';

export const useHistoryStore = defineStore('history', {
  state: () => ({
    areWorkflowsLoading: false,
    isLoadingRecentWorkflows: false,
    unformattedRecentWorkflows: [],
    unformattedWorkflows: [],
    workflowsPageInfo: {},
    removeError: '',
  }),
  getters: {
    workflowErrors: (state) => state.removeError,
    workflows: (state) => processPreCreatedWorkflows(state.unformattedWorkflows),
    recentWorkflows: (state) => processPreCreatedWorkflows(state.unformattedRecentWorkflows),
  },
  actions: {
    getUserWorkflows({ before = null, after = null } = {}) {
      this.setWorkflowsLoading(true);

      const count = { first: null, last: null };

      if (before) {
        count.last = 20;
      } else {
        count.first = 20;
      }

      const mainStore = useMainStore();

      this.sendGraphqlRequest({
        query: GET_USER_WORKFLOWS,
        fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        variables: {
          type: mainStore.workflowFilter,
          before,
          after,
          first: count.first,
          last: count.last,
        },
        eventName: 'updateWorkflows',
      });
    },
    getRecentWorkflows() {
      const mainStore = useMainStore();

      this.setRecentWorkflowsLoading(true);

      this.sendGraphqlRequest({
        query: GET_USER_WORKFLOWS,
        fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        variables: { type: mainStore.workflowFilter, first: 5 },
        eventName: 'setRecentWorkflows',
      });
    },
    setRecentWorkflows(data) {
      this.setRecentWorkflowsLoading(false);

      const workflows = data?.duoWorkflowWorkflows?.edges?.map((edge) => edge.node) || [];
      this.unformattedRecentWorkflows = workflows;

      this.validateWorkflows(workflows);
    },
    setWorkflowsLoading(isLoading) {
      this.areWorkflowsLoading = isLoading;
    },
    setRecentWorkflowsLoading(isLoading) {
      this.isLoadingRecentWorkflows = isLoading;
    },
    updateWorkflows(data) {
      this.setWorkflowsLoading(false);
      this.workflowsPageInfo = data?.duoWorkflowWorkflows?.pageInfo || {};
      this.unformattedWorkflows = data?.duoWorkflowWorkflows?.edges?.map((edge) => edge.node) || [];
    },
    validateWorkflows(workflows) {
      if (!workflows || workflows.length === 0) {
        const healthStore = useHealthCheckStore();
        const mainStore = useMainStore();

        if (mainStore.projectPath) {
          healthStore.getHealthChecks(mainStore.projectPath);
        }
      }
    },
    onRemoveWorkflowResult(data) {
      if (data?.deleteDuoWorkflowsWorkflow?.success) {
        // Refresh the workflows list to reflect the removal
        this.getUserWorkflows();
        this.getRecentWorkflows();
      } else {
        // Handle errors from the mutation
        const errors = data?.deleteDuoWorkflowsWorkflow?.errors || [];
        if (errors.length > 0) {
          this.removeError = errors.join('; ');
        }
      }
    },
    clearRemoveError() {
      this.removeError = '';
    },
    removeWorkflow(workflowId) {
      if (!workflowId) return;
      try {
        this.sendGraphqlRequest({
          query: DELETE_DUO_WORKFLOWS_WORKFLOW,
          variables: {
            input: {
              workflowId,
            },
          },
          eventName: 'removeWorkflowResult',
        });
      } catch (e) {
        this.removeError = e.message;
      }
    },
  },
  events: {
    setRecentWorkflows: 'setRecentWorkflows',
    updateWorkflows: 'updateWorkflows',
    removeWorkflowResult: 'onRemoveWorkflowResult',
  },
});
