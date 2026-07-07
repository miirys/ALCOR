import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  UserPersistentStorage,
  SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY,
  SelectedAgentPlatformProjects,
} from '@gitlab-org/persistent-storage';
import { DefaultAgentPlatformProjectStore } from './agent_platform_project_store';

describe('DefaultAgentPlatformProjectStore', () => {
  let store: DefaultAgentPlatformProjectStore;
  let mockStorage: UserPersistentStorage;
  let mockLogger: TestLogger;

  const mockRepositoryPath = '/path/to/repository';
  const mockNamespaceWithPath = 'test-namespace/test-project';
  const mockOtherRepositoryPath = '/path/to/other/repository';
  const mockOtherNamespaceWithPath = 'other-namespace/other-project';

  beforeEach(() => {
    mockStorage = createFakePartial<UserPersistentStorage>({
      get: jest.fn(),
      set: jest.fn(),
    });

    mockLogger = new TestLogger();
    jest.spyOn(mockLogger, 'debug');
    jest.spyOn(mockLogger, 'error');

    store = new DefaultAgentPlatformProjectStore(mockStorage, mockLogger);
  });

  describe('getAllSelectedProjects', () => {
    it('should return projects from storage', async () => {
      const mockProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: mockNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);

      const result = await store.getAllSelectedProjects();

      expect(result).toEqual(mockProjects);
      expect(mockStorage.get).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY);
    });

    it('should return empty object when storage returns undefined', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);

      const result = await store.getAllSelectedProjects();

      expect(result).toEqual({});
    });

    it('should handle storage errors and return empty object', async () => {
      const error = new Error('Storage error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      const result = await store.getAllSelectedProjects();

      expect(result).toEqual({});
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentPlatformProjectStore] Failed to get all selected projects',
        error,
      );
    });
  });

  describe('setSelectedProject', () => {
    it('should set a new project when repository does not exist', async () => {
      const existingProjects: SelectedAgentPlatformProjects = {};
      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {
        [mockRepositoryPath]: mockNamespaceWithPath,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[AgentPlatformProjectStore] Set selected project for ${mockRepositoryPath}: ${mockNamespaceWithPath}`,
        undefined,
      );
    });

    it('should update existing project for repository', async () => {
      const existingProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: 'old-namespace/old-project',
      };
      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {
        [mockRepositoryPath]: mockNamespaceWithPath,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[AgentPlatformProjectStore] Set selected project for ${mockRepositoryPath}: ${mockNamespaceWithPath}`,
        undefined,
      );
    });

    it('should preserve other repository projects when setting new project', async () => {
      const existingProjects: SelectedAgentPlatformProjects = {
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
        [mockRepositoryPath]: mockNamespaceWithPath,
      });
    });

    it('should handle storage get errors gracefully', async () => {
      const error = new Error('Storage get error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentPlatformProjectStore] Failed to get all selected projects',
        error,
      );
      // Since getAllSelectedProjects returns {} on error, the project will still be set
      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {
        [mockRepositoryPath]: mockNamespaceWithPath,
      });
    });

    it('should handle storage set errors and rethrow', async () => {
      const error = new Error('Storage set error');
      jest.mocked(mockStorage.get).mockResolvedValue({});
      jest.mocked(mockStorage.set).mockRejectedValue(error);

      await expect(
        store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath),
      ).rejects.toThrow('Storage set error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentPlatformProjectStore] Failed to set selected Agentic Chat project',
        error,
      );
    });
  });

  describe('getSelectedProject', () => {
    it('should return project for existing repository', async () => {
      const mockProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: mockNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);

      const result = await store.getSelectedProject(mockRepositoryPath);

      expect(result).toBe(mockNamespaceWithPath);
    });

    it('should return null for non-existent repository', async () => {
      const mockProjects: SelectedAgentPlatformProjects = {
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);

      const result = await store.getSelectedProject(mockRepositoryPath);

      expect(result).toBeNull();
    });

    it('should return null when storage is empty', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue({});

      const result = await store.getSelectedProject(mockRepositoryPath);

      expect(result).toBeNull();
    });

    it('should handle storage errors and return null', async () => {
      const error = new Error('Storage error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      const result = await store.getSelectedProject(mockRepositoryPath);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentPlatformProjectStore] Failed to get all selected projects',
        error,
      );
    });
  });

  describe('clearSelectedProject', () => {
    it('should remove project for specified repository', async () => {
      const mockProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: mockNamespaceWithPath,
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.clearSelectedProject(mockRepositoryPath);

      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[AgentPlatformProjectStore] Cleared selected project for ${mockRepositoryPath}`,
        undefined,
      );
    });

    it('should handle clearing non-existent repository gracefully', async () => {
      const mockProjects: SelectedAgentPlatformProjects = {
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.clearSelectedProject(mockRepositoryPath);

      // Should still call set even if the key didn't exist
      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {
        [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[AgentPlatformProjectStore] Cleared selected project for ${mockRepositoryPath}`,
        undefined,
      );
    });

    it('should handle storage get errors gracefully', async () => {
      const error = new Error('Storage get error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      await store.clearSelectedProject(mockRepositoryPath);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentPlatformProjectStore] Failed to get all selected projects',
        error,
      );
      // Since getAllSelectedProjects returns {} on error, clearing will still proceed
      expect(mockStorage.set).toHaveBeenCalledWith(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, {});
    });

    it('should handle storage set errors and rethrow', async () => {
      const error = new Error('Storage set error');
      const mockProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: mockNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);
      jest.mocked(mockStorage.set).mockRejectedValue(error);

      await expect(store.clearSelectedProject(mockRepositoryPath)).rejects.toThrow(
        'Storage set error',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentPlatformProjectStore] Failed to clear selected Agentic Chat project',
        error,
      );
    });
  });

  describe('onSelectedProjectChange', () => {
    it('should emit events when project is set', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectChange(listener);

      jest.mocked(mockStorage.get).mockResolvedValue({});
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        { [mockRepositoryPath]: mockNamespaceWithPath },
        expect.anything(),
      );

      disposable.dispose();
    });

    it('should emit events when project is updated', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectChange(listener);

      const existingProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: 'old-namespace/old-project',
      };
      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        { [mockRepositoryPath]: mockNamespaceWithPath },
        expect.anything(),
      );

      disposable.dispose();
    });

    it('should emit events when project is cleared', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectChange(listener);

      const mockProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: mockNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.clearSelectedProject(mockRepositoryPath);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({}, expect.anything());

      disposable.dispose();
    });

    it('should not emit duplicate events for same value', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectChange(listener);

      const mockProjects: SelectedAgentPlatformProjects = {
        [mockRepositoryPath]: mockNamespaceWithPath,
      };
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      // Set the same value twice
      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);
      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      // diffEmitter should prevent duplicate emissions
      expect(listener).toHaveBeenCalledTimes(1);

      disposable.dispose();
    });

    it('should allow multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const disposable1 = store.onSelectedProjectChange(listener1);
      const disposable2 = store.onSelectedProjectChange(listener2);

      jest.mocked(mockStorage.get).mockResolvedValue({});
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith(
        { [mockRepositoryPath]: mockNamespaceWithPath },
        expect.anything(),
      );
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledWith(
        { [mockRepositoryPath]: mockNamespaceWithPath },
        expect.anything(),
      );

      disposable1.dispose();
      disposable2.dispose();
    });

    it('should stop emitting events after disposal', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectChange(listener);

      disposable.dispose();

      jest.mocked(mockStorage.get).mockResolvedValue({});
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should emit events with multiple projects', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectChange(listener);

      jest.mocked(mockStorage.get).mockResolvedValue({});
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.setSelectedProject(mockRepositoryPath, mockNamespaceWithPath);

      jest.mocked(mockStorage.get).mockResolvedValue({
        [mockRepositoryPath]: mockNamespaceWithPath,
      });

      await store.setSelectedProject(mockOtherRepositoryPath, mockOtherNamespaceWithPath);

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(
        1,
        { [mockRepositoryPath]: mockNamespaceWithPath },
        expect.anything(),
      );
      expect(listener).toHaveBeenNthCalledWith(
        2,
        {
          [mockRepositoryPath]: mockNamespaceWithPath,
          [mockOtherRepositoryPath]: mockOtherNamespaceWithPath,
        },
        expect.anything(),
      );

      disposable.dispose();
    });
  });
});
