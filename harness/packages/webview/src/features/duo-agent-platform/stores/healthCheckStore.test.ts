import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import type { HealthCheckData, AgentPlatformRepository } from '@gitlab-lsp/workflow-api';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import {
  AUTHENTICATION_ERROR,
  AGENTIC_FEATURES_DISABLED,
  INVALID_GITLAB_PROJECT,
  PERMISSIONS_ERROR,
  USER_PERMISSIONS_ERROR,
  UNKNOWN_ERROR,
  LOADING,
  READY,
} from '../components/health-check/constants';
import { useHealthCheckStore } from './healthCheckStore';
import { useRepositoriesStore } from './repositoriesStore';

vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
}));

interface MockMessageBus {
  sendRequest: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
}

const PROJECT_PATH = 'group/project';
const ENABLED: HealthCheckData = { enabled: true, checks: [] };
const WORKFLOW_DISABLED_NO_CHECK: HealthCheckData = { enabled: false, checks: [] };
const DEVELOPER_ACCESS_GRANTED: HealthCheckData = {
  enabled: false,
  checks: [
    { name: 'developer_access', value: true, message: '' },
    { name: 'duo_features_enabled', value: false, message: '' },
  ],
};
const DEVELOPER_ACCESS_DENIED: HealthCheckData = {
  enabled: false,
  checks: [{ name: 'developer_access', value: false, message: '' }],
};

describe('healthCheckStore', () => {
  let mockMessageBus: MockMessageBus;
  let store: ReturnType<typeof useHealthCheckStore>;
  let notificationHandlers: Record<string, (payload: never) => void>;

  // Settles the repositories store the health check folds into its state machine:
  // clears its initial loading flag and seeds the workspace with a project carrying
  // the given Duo toggle.
  function settleRepositories(duoFeaturesEnabled = true) {
    const repositories = useRepositoriesStore();
    repositories.isLoading = false;
    repositories.repositories = [
      {
        rootFsPath: '/workspace',
        projects: [{ namespaceWithPath: PROJECT_PATH, duoFeaturesEnabled }],
      },
    ] as unknown as AgentPlatformRepository[];
  }

  // Mirrors the runtime cascade: selecting a project drives the store's health check
  // through its watcher. Awaits the in-flight request so the result settles.
  async function selectProject(projectPath: string | null = PROJECT_PATH) {
    useRepositoriesStore().selectedProjectPath = projectPath;
    await flushPromises();
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    notificationHandlers = {};

    mockMessageBus = {
      sendRequest: vi.fn(),
      onNotification: vi.fn((name: string, handler: (payload: never) => void) => {
        notificationHandlers[name] = handler;
      }),
    };
    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    store = useHealthCheckStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('stays in the loading state until the startup signals settle', () => {
      expect(store.currentState).toBe(LOADING);
      expect(store.isHealthLoading).toBe(true);
      expect(store.showHealthCheckError).toBe(false);
      expect(store.healthChecks).toBeNull();
    });

    it('is ready once a healthy project is selected after startup settles', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(ENABLED);

      await selectProject();

      expect(store.currentState).toBe(READY);
      expect(store.isHealthLoading).toBe(false);
      expect(store.showHealthCheckError).toBe(false);
    });
  });

  describe('loading', () => {
    it('holds the loading state across the gap between settling and a resolved check', async () => {
      settleRepositories();
      let resolveRequest!: (data: HealthCheckData) => void;
      mockMessageBus.sendRequest.mockReturnValue(
        new Promise<HealthCheckData>((resolve) => {
          resolveRequest = resolve;
        }),
      );

      await selectProject();
      expect(store.currentState).toBe(LOADING);

      resolveRequest(ENABLED);
      await flushPromises();
      expect(store.currentState).toBe(READY);
    });
  });

  describe('authentication', () => {
    it('registers a setAuthenticationStatus handler', () => {
      expect(notificationHandlers.setAuthenticationStatus).toBeDefined();
    });

    it('surfaces an authentication error when unauthenticated, even if the project is healthy', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(ENABLED);
      await selectProject();
      expect(store.currentState).toBe(READY);

      notificationHandlers.setAuthenticationStatus?.(false as never);

      expect(store.currentState).toBe(AUTHENTICATION_ERROR);
      expect(store.showHealthCheckError).toBe(true);
    });

    it('recovers when authentication is restored', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(ENABLED);
      await selectProject();
      notificationHandlers.setAuthenticationStatus?.(false as never);

      notificationHandlers.setAuthenticationStatus?.(true as never);

      expect(store.currentState).toBe(READY);
      expect(store.showHealthCheckError).toBe(false);
    });
  });

  describe('currentState', () => {
    beforeEach(() => {
      mockMessageBus.sendRequest.mockResolvedValue(ENABLED);
    });

    it('reports the disabled workspace toggle ahead of project checks', () => {
      settleRepositories(false);

      expect(store.currentState).toBe(AGENTIC_FEATURES_DISABLED);
      expect(store.showHealthCheckError).toBe(true);
    });

    it('reports an invalid project once startup settles with no project selected', () => {
      settleRepositories();

      expect(store.currentState).toBe(INVALID_GITLAB_PROJECT);
      expect(mockMessageBus.sendRequest).not.toHaveBeenCalled();
    });

    it('reports an invalid project when the request fails', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockRejectedValueOnce(new Error('boom'));

      await selectProject();

      expect(store.currentState).toBe(INVALID_GITLAB_PROJECT);
      expect(store.showHealthCheckError).toBe(true);
    });

    it('reports a project permissions error when developer access is granted', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(DEVELOPER_ACCESS_GRANTED);

      await selectProject();

      expect(store.currentState).toBe(PERMISSIONS_ERROR);
      expect(store.healthChecks).toEqual(DEVELOPER_ACCESS_GRANTED.checks);
    });

    it('reports a user permissions error when developer access is denied', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(DEVELOPER_ACCESS_DENIED);

      await selectProject();

      expect(store.currentState).toBe(USER_PERMISSIONS_ERROR);
    });

    it('falls back to the unknown error when the workflow is disabled with no developer check', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(WORKFLOW_DISABLED_NO_CHECK);

      await selectProject();

      expect(store.currentState).toBe(UNKNOWN_ERROR);
      expect(store.showHealthCheckError).toBe(true);
    });

    it('is ready on the healthy path', async () => {
      settleRepositories();

      await selectProject();

      expect(store.currentState).toBe(READY);
      expect(store.isHealthLoading).toBe(false);
      expect(store.showHealthCheckError).toBe(false);
    });

    it('recovers validity when reselecting after a failure', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockRejectedValueOnce(new Error('boom'));
      await selectProject();
      expect(store.currentState).toBe(INVALID_GITLAB_PROJECT);

      mockMessageBus.sendRequest.mockResolvedValueOnce(ENABLED);
      await selectProject(null);
      await selectProject();

      expect(store.currentState).toBe(READY);
    });
  });

  describe('checkHealth', () => {
    it('sends a checkHealth request with the selected project path', async () => {
      settleRepositories();
      mockMessageBus.sendRequest.mockResolvedValue(ENABLED);

      await selectProject();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('checkHealth', {
        projectPath: PROJECT_PATH,
      });
    });

    it('ignores a stale response when the selection changed mid-request', async () => {
      settleRepositories(true);
      const repositories = useRepositoriesStore();
      repositories.repositories = [
        {
          rootFsPath: '/workspace',
          projects: [
            { namespaceWithPath: PROJECT_PATH, duoFeaturesEnabled: true },
            { namespaceWithPath: 'group/other', duoFeaturesEnabled: true },
          ],
        },
      ] as unknown as AgentPlatformRepository[];

      let resolveStale!: (data: HealthCheckData) => void;
      mockMessageBus.sendRequest
        .mockReturnValueOnce(
          new Promise<HealthCheckData>((resolve) => {
            resolveStale = resolve;
          }),
        )
        .mockResolvedValueOnce(ENABLED);

      await selectProject(PROJECT_PATH);
      await selectProject('group/other');
      expect(store.currentState).toBe(READY);

      resolveStale(DEVELOPER_ACCESS_DENIED);
      await flushPromises();

      expect(store.currentState).toBe(READY);
    });
  });
});
