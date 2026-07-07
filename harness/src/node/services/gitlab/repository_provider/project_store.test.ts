import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  UserPersistentStorage,
  SelectedProjectSetting,
  SELECTED_PROJECT_IN_REPOSITORY_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import { DefaultSelectedProjectStore, convertProjectToSetting } from './project_store';
import { mockProjectInRepository, mockNewProjectInRepository } from './test_utils/fixtures';

describe('DefaultSelectedProjectStore', () => {
  let store: DefaultSelectedProjectStore;
  let mockStorage: UserPersistentStorage;
  let mockLogger: TestLogger;

  const mockSelectedProjectSetting = createFakePartial<SelectedProjectSetting>({
    accountId: 'gid://gitlab/User/42',
    namespaceWithPath: 'test-namespace/test-project',
    remoteName: 'origin',
    remoteUrl: 'https://gitlab.com/test-namespace/test-project.git',
    repositoryRootPath: '/path/to/repository',
  });

  beforeEach(() => {
    mockStorage = createFakePartial<UserPersistentStorage>({
      get: jest.fn(),
      set: jest.fn(),
    });

    mockLogger = new TestLogger();
    jest.spyOn(mockLogger, 'debug');
    jest.spyOn(mockLogger, 'error');

    store = new DefaultSelectedProjectStore(mockStorage, mockLogger);
  });

  describe('convertProjectToSetting', () => {
    it('should convert ProjectInRepository to SelectedProjectSetting', () => {
      const result = convertProjectToSetting(mockProjectInRepository);

      expect(result).toEqual({
        accountId: 'gid://gitlab/User/42',
        namespaceWithPath: 'test-namespace/test-project',
        remoteName: 'origin',
        remoteUrl: 'https://gitlab.com/test-namespace/test-project.git',
        repositoryRootPath: '/path/to/repository',
      });
    });
  });

  describe('getSelectedProjectSettings', () => {
    it('should return projects from storage', async () => {
      const mockProjects = [mockSelectedProjectSetting];
      jest.mocked(mockStorage.get).mockResolvedValue(mockProjects);

      const result = await store.getSelectedProjectSettings();

      expect(result).toEqual(mockProjects);
      expect(mockStorage.get).toHaveBeenCalledWith(SELECTED_PROJECT_IN_REPOSITORY_STORAGE_KEY);
    });

    it('should return empty array when storage returns undefined', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);

      const result = await store.getSelectedProjectSettings();

      expect(result).toEqual([]);
    });

    it('should handle storage errors and return empty array', async () => {
      const error = new Error('Storage error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      const result = await store.getSelectedProjectSettings();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SelectedProjectStore] Failed to get selected projects',
        error,
      );
    });
  });

  describe('addSelectedProject', () => {
    it('should add a new project when it does not exist', async () => {
      const existingProjects: SelectedProjectSetting[] = [];
      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.addSelectedProject(mockProjectInRepository);

      expect(mockStorage.set).toHaveBeenCalledWith('selectedProjectInRepository', [
        mockSelectedProjectSetting,
      ]);
      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        1,
        '[SelectedProjectStore] Added selected project test-namespace/test-project',
        undefined,
      );
    });

    it('should not add a project when it already exists (same repository and remote)', async () => {
      const existingProjects = [mockSelectedProjectSetting];
      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);

      await store.addSelectedProject(mockProjectInRepository);

      expect(mockStorage.set).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should add a project with different remote URL for same repository', async () => {
      const existingProject = { ...mockSelectedProjectSetting };
      const expectedNewSetting = {
        ...mockSelectedProjectSetting,
        remoteUrl: 'https://gitlab.com/test-namespace/test-project-fork.git',
        remoteName: 'fork',
      };

      jest.mocked(mockStorage.get).mockResolvedValue([existingProject]);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.addSelectedProject(mockNewProjectInRepository);

      expect(mockStorage.set).toHaveBeenCalledWith('selectedProjectInRepository', [
        existingProject,
        expectedNewSetting,
      ]);
    });

    it('should handle storage get errors gracefully', async () => {
      const error = new Error('Storage error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      await store.addSelectedProject(mockProjectInRepository);

      // The error comes from getSelectedProjectSettings, not from addSelectedProject directly
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SelectedProjectStore] Failed to get selected projects',
        error,
      );
      // Since getSelectedProjectSettings returns [] on error, the project will still be added
      expect(mockStorage.set).toHaveBeenCalledWith('selectedProjectInRepository', [
        mockSelectedProjectSetting,
      ]);
    });

    it('should handle storage set errors and rethrow', async () => {
      const error = new Error('Storage set error');
      jest.mocked(mockStorage.get).mockResolvedValue([mockSelectedProjectSetting]);
      jest.mocked(mockStorage.set).mockRejectedValue(error);
      await expect(store.addSelectedProject(mockNewProjectInRepository)).rejects.toThrow(
        'Storage set error',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SelectedProjectStore] Failed to add selected project',
        error,
      );
    });
  });

  describe('clearSelectedProjects', () => {
    it('should remove projects for the specified repository path', async () => {
      const project1 = mockSelectedProjectSetting;
      const project2 = {
        ...mockSelectedProjectSetting,
        repositoryRootPath: '/path/to/other/repository',
        namespaceWithPath: 'other/project',
      };
      const existingProjects = [project1, project2];

      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.clearSelectedProjects('/path/to/repository');

      expect(mockStorage.set).toHaveBeenCalledWith('selectedProjectInRepository', [project2]);
      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        1,
        '[SelectedProjectStore] Cleared selected projects for repository /path/to/repository',
        undefined,
      );
    });

    it('should not update storage when no projects match the repository path', async () => {
      const project1 = {
        ...mockSelectedProjectSetting,
        repositoryRootPath: '/path/to/other/repository',
      };
      const existingProjects = [project1];

      jest.mocked(mockStorage.get).mockResolvedValue(existingProjects);

      await store.clearSelectedProjects('/path/to/nonexistent/repository');

      expect(mockStorage.set).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle storage get errors and not throw', async () => {
      const error = new Error('Storage get error');
      jest.mocked(mockStorage.get).mockRejectedValue(error);

      // Should not throw because getSelectedProjectSettings catches errors
      await expect(store.clearSelectedProjects('/path/to/repository')).resolves.not.toThrow();

      // But should log the error from getSelectedProjectSettings
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SelectedProjectStore] Failed to get selected projects',
        error,
      );
    });

    it('should handle storage set errors and rethrow', async () => {
      const error = new Error('Storage set error');
      jest.mocked(mockStorage.get).mockResolvedValue([mockSelectedProjectSetting]);
      jest.mocked(mockStorage.set).mockRejectedValue(error);

      await expect(store.clearSelectedProjects('/path/to/repository')).rejects.toThrow(
        'Storage set error',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SelectedProjectStore] Failed to clear selected projects',
        error,
      );
    });
  });

  describe('onSelectedProjectsChange', () => {
    it('should emit events when projects are added', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectsChange(listener);

      jest.mocked(mockStorage.get).mockResolvedValue([]);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.addSelectedProject(mockProjectInRepository);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([mockSelectedProjectSetting], expect.anything());

      disposable.dispose();
    });

    it('should emit events when projects are cleared', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectsChange(listener);

      jest.mocked(mockStorage.get).mockResolvedValue([mockSelectedProjectSetting]);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.clearSelectedProjects('/path/to/repository');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([], expect.anything());

      disposable.dispose();
    });

    it('should not emit events when no changes are made', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectsChange(listener);

      // Try to add existing project
      jest.mocked(mockStorage.get).mockResolvedValue([mockSelectedProjectSetting]);
      await store.addSelectedProject(mockProjectInRepository);

      // Try to clear non-existent repository
      await store.clearSelectedProjects('/path/to/nonexistent');

      expect(listener).not.toHaveBeenCalled();

      disposable.dispose();
    });

    it('should allow multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const disposable1 = store.onSelectedProjectsChange(listener1);
      const disposable2 = store.onSelectedProjectsChange(listener2);

      jest.mocked(mockStorage.get).mockResolvedValue([]);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.addSelectedProject(mockProjectInRepository);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith([mockSelectedProjectSetting], expect.anything());
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledWith([mockSelectedProjectSetting], expect.anything());

      disposable1.dispose();
      disposable2.dispose();
    });

    it('should stop emitting events after disposal', async () => {
      const listener = jest.fn();
      const disposable = store.onSelectedProjectsChange(listener);

      disposable.dispose();

      jest.mocked(mockStorage.get).mockResolvedValue([]);
      jest.mocked(mockStorage.set).mockResolvedValue(undefined);

      await store.addSelectedProject(mockProjectInRepository);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
