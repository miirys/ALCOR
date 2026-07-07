import { defineStore } from 'pinia';
import { GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY } from '@gitlab-lsp/workflow-api';
import { useDockerStore } from './docker';
import { useUserStore } from './user';

export const useHealthCheckStore = defineStore('healthCheck', {
  state: () => ({
    healthChecks: null,
    isLoadingHealthCheck: false,
    isValidProject: true,
    isValidNamespace: true,
    isWorkflowEnabledForProject: true,
    // TODO: Check if the workflow enabled for namespace via GraphQL API.
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1315
    isWorkflowEnabledForNamespace: true,
    isDockerConfigured: true,
  }),

  getters: {
    isDuoWorkflowEnabled(state) {
      const user = useUserStore();
      const docker = useDockerStore();
      const isWorkflowEnabled =
        (state.isWorkflowEnabledForProject && state.isValidProject) ||
        (state.isWorkflowEnabledForNamespace && state.isValidNamespace);
      return user.isAuthenticated && isWorkflowEnabled && docker.isReady;
    },
  },

  actions: {
    getHealthChecks(projectPath) {
      this.isLoadingHealthCheck = true;

      this.sendGraphqlRequest({
        eventName: 'setHealthChecks',
        query: GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
        variables: { projectPath },
        supportedSinceInstanceVersion: {
          version: '17.7.0',
          resourceName: 'Get Duo Agent Platform permissions',
        },
      });
    },

    setHealthCheckData(result) {
      this.isLoadingHealthCheck = false;

      const healthCheckData = result?.project?.duoWorkflowStatusCheck;

      if (!healthCheckData) {
        this.setProjectValid(false);
      } else {
        this.healthChecks = healthCheckData.checks;
        this.isWorkflowEnabledForProject = healthCheckData.enabled;
      }
    },

    setProjectValid(isValid) {
      this.isValidProject = isValid;
    },

    setNamespaceValid(isValid) {
      this.isValidNamespace = isValid;
    },
  },
  events: {
    setHealthChecks: 'setHealthCheckData',
  },
});
