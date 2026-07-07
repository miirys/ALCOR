import { describe, it, expect, beforeEach, afterEach, vi, assert } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { AgentPlatformRepository } from '@gitlab-lsp/workflow-api';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import { useRepositoriesStore } from './repositoriesStore';

vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
  disposeDuoAgentPlatformMessageBus: vi.fn(),
}));

interface MockMessageBus {
  sendRequest: ReturnType<typeof vi.fn>;
  sendNotification: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
}

const MOCK_PROJECT_1 = {
  id: 'gid://gitlab/Project/1',
  name: 'My Project',
  namespaceWithPath: 'group/my-project',
  remoteName: 'origin',
  duoAgenticChatAvailable: true,
  namespaceId: 'gid://gitlab/Namespace/1',
  rootNamespaceId: 'gid://gitlab/Namespace/1',
};

const MOCK_PROJECT_2 = {
  id: 'gid://gitlab/Project/2',
  name: 'Other Project',
  namespaceWithPath: 'group/other-project',
  remoteName: 'upstream',
  duoAgenticChatAvailable: false,
  namespaceId: 'gid://gitlab/Namespace/2',
  rootNamespaceId: 'gid://gitlab/Namespace/1',
};

const MOCK_REPOSITORY_1: AgentPlatformRepository = {
  type: 'single',
  rootFsPath: '/home/user/project',
  folderName: 'project',
  projects: [MOCK_PROJECT_1],
};

const MOCK_REPOSITORY_2: AgentPlatformRepository = {
  type: 'multiple',
  rootFsPath: '/home/user/other-project',
  folderName: 'other-project',
  projects: [MOCK_PROJECT_2],
};

describe('repositoriesStore', () => {
  let mockMessageBus: MockMessageBus;
  let store: ReturnType<typeof useRepositoriesStore>;
  let notificationHandlers: Record<string, (payload: unknown) => void>;
  let initialStateHandler: (payload: unknown) => void;
  let setRepositoriesHandler: (payload: unknown) => void;

  beforeEach(() => {
    setActivePinia(createPinia());
    notificationHandlers = {};

    mockMessageBus = {
      sendRequest: vi.fn(),
      sendNotification: vi.fn(),
      onNotification: vi.fn((name: string, handler: (payload: unknown) => void) => {
        notificationHandlers[name] = handler;
      }),
    };

    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    store = useRepositoriesStore();
    store.initialize();

    assert(notificationHandlers.initialState !== undefined);
    assert(notificationHandlers.setRepositories !== undefined);
    initialStateHandler = notificationHandlers.initialState;
    setRepositoriesHandler = notificationHandlers.setRepositories;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('uses the injected message bus when provided', () => {
      const freshStore = useRepositoriesStore();
      freshStore.dispose();

      const customBus = {
        sendRequest: vi.fn(),
        sendNotification: vi.fn(),
        onNotification: vi.fn(),
      };
      freshStore.initialize(customBus as never);

      expect(customBus.sendNotification).toHaveBeenCalledWith('appReady', undefined);
    });

    it('does not reinitialize if already initialized', () => {
      store.initialize();

      expect(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).toHaveBeenCalledOnce();
    });

    it('sends appReady notification during initialization', () => {
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('appReady', undefined);
    });

    it('registers initialState and setRepositories notification handlers', () => {
      expect(initialStateHandler).toBeDefined();
      expect(setRepositoriesHandler).toBeDefined();
    });
  });

  describe('initial state', () => {
    it('is loading before initialization so the UI shows a spinner on first paint', () => {
      setActivePinia(createPinia());
      const freshStore = useRepositoriesStore();

      expect(freshStore.isLoading).toBe(true);
    });

    it('starts with empty repositories and is loading while awaiting appReady response', () => {
      expect(store.repositories).toEqual([]);
      expect(store.isLoading).toBe(true);
      expect(store.error).toBeNull();
      expect(store.selectedProjectPath).toBeNull();
      expect(store.selectedRootFsPath).toBeNull();
    });
  });

  describe('computed properties', () => {
    it('allProjects flattens projects from all repositories', () => {
      store.repositories = [MOCK_REPOSITORY_1, MOCK_REPOSITORY_2];

      expect(store.allProjects).toEqual([MOCK_PROJECT_1, MOCK_PROJECT_2]);
    });

    it('allProjects returns empty array when no repositories', () => {
      expect(store.allProjects).toEqual([]);
    });
  });

  describe('isDuoEnabledForWorkspaceProjects', () => {
    const repoWithToggle = (duoFeaturesEnabled?: boolean): AgentPlatformRepository => ({
      ...MOCK_REPOSITORY_1,
      projects: [{ ...MOCK_PROJECT_1, duoFeaturesEnabled }],
    });

    it('stays available when there is no project (no git repo / no GitLab remote)', () => {
      expect(store.isDuoEnabledForWorkspaceProjects).toBe(true);
    });

    it('stays available when no project sets the toggle', () => {
      store.repositories = [MOCK_REPOSITORY_1, MOCK_REPOSITORY_2];

      expect(store.isDuoEnabledForWorkspaceProjects).toBe(true);
    });

    it('is blocked when a project has Duo features off and none have it on', () => {
      store.repositories = [repoWithToggle(false)];

      expect(store.isDuoEnabledForWorkspaceProjects).toBe(false);
    });

    it('an enabled project wins over a disabled one', () => {
      store.repositories = [
        { ...MOCK_REPOSITORY_1, projects: [{ ...MOCK_PROJECT_1, duoFeaturesEnabled: true }] },
        { ...MOCK_REPOSITORY_2, projects: [{ ...MOCK_PROJECT_2, duoFeaturesEnabled: false }] },
      ];

      expect(store.isDuoEnabledForWorkspaceProjects).toBe(true);
    });
  });

  describe('selectProject', () => {
    it('sets selectedProjectPath', () => {
      store.selectProject(MOCK_PROJECT_1.namespaceWithPath);

      expect(store.selectedProjectPath).toBe(MOCK_PROJECT_1.namespaceWithPath);
    });

    it('sends selectProjectForWorkflow notification with repository path', () => {
      store.repositories = [MOCK_REPOSITORY_1];

      store.selectProject(MOCK_PROJECT_1.namespaceWithPath);

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('selectProjectForWorkflow', {
        repositoryPath: MOCK_REPOSITORY_1.rootFsPath,
        projectPath: MOCK_PROJECT_1.namespaceWithPath,
      });
    });

    it('sets selectedRootFsPath from the matched repository', () => {
      store.repositories = [MOCK_REPOSITORY_1];

      store.selectProject(MOCK_PROJECT_1.namespaceWithPath);

      expect(store.selectedRootFsPath).toBe(MOCK_REPOSITORY_1.rootFsPath);
    });

    it('leaves selectedRootFsPath null when no repository matches', () => {
      store.selectProject('nonexistent/project');

      expect(store.selectedRootFsPath).toBeNull();
    });

    it('clears a previously selected selectedRootFsPath when no repository matches', () => {
      store.repositories = [MOCK_REPOSITORY_1];
      store.selectProject(MOCK_PROJECT_1.namespaceWithPath);
      expect(store.selectedRootFsPath).toBe(MOCK_REPOSITORY_1.rootFsPath);

      store.selectProject('nonexistent/project');

      expect(store.selectedRootFsPath).toBeNull();
    });

    it('does not send selectProjectForWorkflow notification if repository is not found', () => {
      store.selectProject('nonexistent/project');

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith('selectProjectForWorkflow');
    });
  });

  describe('$reset', () => {
    it('resets all state to initial values', async () => {
      mockMessageBus.sendRequest.mockResolvedValueOnce([MOCK_REPOSITORY_1]);
      store.repositories = [MOCK_REPOSITORY_1];
      store.selectProject(MOCK_PROJECT_1.namespaceWithPath);

      store.$reset();

      expect(store.repositories).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.selectedProjectPath).toBeNull();
      expect(store.selectedRootFsPath).toBeNull();
    });
  });

  describe('initialState notification', () => {
    it('sets repositories and clears loading when received', () => {
      expect(store.isLoading).toBe(true);

      initialStateHandler({ repositories: [MOCK_REPOSITORY_1] });

      expect(store.repositories).toEqual([MOCK_REPOSITORY_1]);
      expect(store.isLoading).toBe(false);
    });

    it('auto-selects the first DAP-enabled project', () => {
      initialStateHandler({ repositories: [MOCK_REPOSITORY_1] });

      expect(store.selectedProjectPath).toBe(MOCK_PROJECT_1.namespaceWithPath);
    });

    it('does not auto-select a project without DAP access', () => {
      initialStateHandler({ repositories: [MOCK_REPOSITORY_2] });

      expect(store.selectedProjectPath).toBeNull();
    });

    it('keeps an existing selection when repositories arrive', () => {
      store.selectProject(MOCK_PROJECT_2.namespaceWithPath);

      initialStateHandler({ repositories: [MOCK_REPOSITORY_1] });

      expect(store.selectedProjectPath).toBe(MOCK_PROJECT_2.namespaceWithPath);
    });
  });

  describe('setRepositories notification', () => {
    it('updates repositories when received', () => {
      setRepositoriesHandler({ repositories: [MOCK_REPOSITORY_2] });

      expect(store.repositories).toEqual([MOCK_REPOSITORY_2]);
    });

    it('replaces previous repositories', () => {
      setRepositoriesHandler({ repositories: [MOCK_REPOSITORY_1] });
      setRepositoriesHandler({ repositories: [MOCK_REPOSITORY_2] });

      expect(store.repositories).toEqual([MOCK_REPOSITORY_2]);
    });

    it('auto-selects the first DAP-enabled project', () => {
      setRepositoriesHandler({ repositories: [MOCK_REPOSITORY_1] });

      expect(store.selectedProjectPath).toBe(MOCK_PROJECT_1.namespaceWithPath);
    });
  });

  describe('dispose', () => {
    it('calls disposeDuoAgentPlatformMessageBus', () => {
      store.dispose();

      expect(DuoAgentPlatformMessageBusModule.disposeDuoAgentPlatformMessageBus).toHaveBeenCalled();
    });

    it('allows reinitialization after dispose', () => {
      store.dispose();

      const freshBus = {
        sendRequest: vi.fn(),
        sendNotification: vi.fn(),
        onNotification: vi.fn(),
      };
      store.initialize(freshBus as never);

      expect(freshBus.sendNotification).toHaveBeenCalledWith('appReady', undefined);
    });
  });
});
