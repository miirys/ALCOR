import { setActivePinia, createPinia } from 'pinia';
import { GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY } from '@gitlab-lsp/workflow-api';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useHealthCheckStore } from './health_check';
import { useUserStore } from './user';
import { useDockerStore, DOCKER_STATES } from './docker';

describe('useHealthCheckStore', () => {
  let store;
  let userStore;
  let dockerStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    store = useHealthCheckStore();
    userStore = useUserStore();
    dockerStore = useDockerStore();
  });

  it('initializes with default state', () => {
    expect(store.healthChecks).toBeNull();
    expect(store.isDuoWorkflowEnabled).toBe(true);
    expect(store.isLoadingHealthCheck).toBe(false);
  });

  describe('getHealthChecks', () => {
    it('sends a request and sets isLoadingHealthCheck to true', () => {
      const projectPath = 'test/project';
      store.getHealthChecks(projectPath);

      expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
        eventName: 'setHealthChecks',
        query: GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
        variables: { projectPath },
        supportedSinceInstanceVersion: {
          resourceName: 'Get Duo Agent Platform permissions',
          version: '17.7.0',
        },
      });
      expect(store.isLoadingHealthCheck).toBe(true);
    });
  });

  describe('setHealthCheckData', () => {
    it('updates the store with health check data', () => {
      const healthCheckData = {
        project: {
          duoWorkflowStatusCheck: {
            checks: [
              { name: 'check1', value: true, message: 'Check 1 passed' },
              { name: 'check2', value: false, message: 'Check 2 failed' },
            ],
            enabled: false,
          },
        },
      };

      store.setHealthCheckData(healthCheckData);

      expect(store.healthChecks).toEqual(healthCheckData.project.duoWorkflowStatusCheck.checks);
      expect(store.isWorkflowEnabledForProject).toBe(false);
      expect(store.isLoadingHealthCheck).toBe(false);
    });
  });

  describe('setProjectValid', () => {
    it('sets the project validity', () => {
      store.setProjectValid(false);
      expect(store.isValidProject).toBe(false);
    });
  });

  describe('isDuoWorkflowEnabled getter', () => {
    beforeEach(() => {
      userStore.isAuthenticated = true;
      dockerStore.status = DOCKER_STATES.IMAGE_PULLED;
      store.isValidProject = true;
      store.isWorkflowEnabledForProject = true;
      store.isValidNamespace = true;
      store.isWorkflowEnabledForNamespace = true;
    });

    describe('when all conditions are met', () => {
      it('returns true', () => {
        expect(store.isDuoWorkflowEnabled).toBe(true);
      });
    });

    describe('when user is not authenticated', () => {
      beforeEach(() => {
        userStore.isAuthenticated = false;
      });

      it('returns false', () => {
        expect(store.isDuoWorkflowEnabled).toBe(false);
      });
    });

    describe('when docker is not ready', () => {
      beforeEach(() => {
        dockerStore.status = DOCKER_STATES.NO_IMAGE;
      });

      it('returns false', () => {
        expect(store.isDuoWorkflowEnabled).toBe(false);
      });
    });

    describe('when project is invalid', () => {
      beforeEach(() => {
        store.isValidProject = false;
      });

      it('returns false when workflow not enabled for namespace', () => {
        store.isValidNamespace = false;

        expect(store.isDuoWorkflowEnabled).toBe(false);
      });

      it('returns true when workflow enabled for namespace', () => {
        store.isValidNamespace = true;
        store.isWorkflowEnabledForNamespace = true;

        expect(store.isDuoWorkflowEnabled).toBe(true);
      });
    });

    describe('when workflow is not enabled for project or namespace', () => {
      beforeEach(() => {
        store.isWorkflowEnabledForProject = false;
        store.isWorkflowEnabledForNamespace = false;
      });

      it('returns false', () => {
        expect(store.isDuoWorkflowEnabled).toBe(false);
      });
    });
  });
});
