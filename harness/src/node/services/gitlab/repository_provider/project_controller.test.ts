import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { PersistedProjectController } from './project_controller';
import { SelectedProjectStore } from './project_store';
import { mockProjectInRepository } from './test_utils/fixtures';

describe('PersistedProjectController', () => {
  let controller: PersistedProjectController;
  let mockSelectedProjectStore: SelectedProjectStore;
  let mockLogger: TestLogger;

  beforeEach(() => {
    mockSelectedProjectStore = createFakePartial<SelectedProjectStore>({
      addSelectedProject: jest.fn(),
      clearSelectedProjects: jest.fn(),
      getSelectedProjectSettings: jest.fn(),
      onSelectedProjectsChange: jest.fn(),
    });

    mockLogger = new TestLogger();
    jest.spyOn(mockLogger, 'debug');
    jest.spyOn(mockLogger, 'error');

    controller = new PersistedProjectController(mockSelectedProjectStore, mockLogger);
  });

  describe('selectProject', () => {
    it('should successfully select a project', async () => {
      jest.mocked(mockSelectedProjectStore.addSelectedProject).mockResolvedValue(undefined);

      await controller.selectProject(mockProjectInRepository);

      expect(mockSelectedProjectStore.addSelectedProject).toHaveBeenCalledWith(
        mockProjectInRepository,
      );
    });

    it('should handle errors when selecting a project', async () => {
      const error = new Error('Failed to save project');
      jest.mocked(mockSelectedProjectStore.addSelectedProject).mockRejectedValue(error);

      await expect(controller.selectProject(mockProjectInRepository)).rejects.toThrow(
        'Failed to save project',
      );

      expect(mockSelectedProjectStore.addSelectedProject).toHaveBeenCalledTimes(1);
    });

    it('should log debug messages during project selection', async () => {
      jest.mocked(mockSelectedProjectStore.addSelectedProject).mockResolvedValue(undefined);

      await controller.selectProject(mockProjectInRepository);

      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        1,
        '[ProjectController] Select project test-namespace/test-project for repository requested',
        undefined,
      );
      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        2,
        '[ProjectController] Project test-namespace/test-project selected successfully',
        undefined,
      );
    });

    it('should log errors when project selection fails', async () => {
      const error = new Error('Storage error');
      jest.mocked(mockSelectedProjectStore.addSelectedProject).mockRejectedValue(error);

      await expect(controller.selectProject(mockProjectInRepository)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ProjectController] Failed to select project',
        error,
      );
    });
  });

  describe('clearProject', () => {
    it('should successfully clear projects for a repository', async () => {
      const rootFsPath = '/path/to/repository';
      jest.mocked(mockSelectedProjectStore.clearSelectedProjects).mockResolvedValue(undefined);

      await controller.clearProject({ rootFsPath });

      expect(mockSelectedProjectStore.clearSelectedProjects).toHaveBeenCalledWith(rootFsPath);
    });

    it('should handle errors when clearing projects', async () => {
      const rootFsPath = '/path/to/repository';
      const error = new Error('Failed to clear projects');
      jest.mocked(mockSelectedProjectStore.clearSelectedProjects).mockRejectedValue(error);

      await expect(controller.clearProject({ rootFsPath })).rejects.toThrow(
        'Failed to clear projects',
      );

      expect(mockSelectedProjectStore.clearSelectedProjects).toHaveBeenCalledWith(rootFsPath);
    });

    it('should log debug messages during project clearing', async () => {
      const rootFsPath = '/path/to/repository';
      jest.mocked(mockSelectedProjectStore.clearSelectedProjects).mockResolvedValue(undefined);

      await controller.clearProject({ rootFsPath });

      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        1,
        `[ProjectController] Clear project requested for repository ${rootFsPath}`,
        undefined,
      );
      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        2,
        `[ProjectController] Projects cleared successfully for repository at ${rootFsPath}`,
        undefined,
      );
    });

    it('should log errors when project clearing fails', async () => {
      const rootFsPath = '/path/to/repository';
      const error = new Error('Storage error');
      jest.mocked(mockSelectedProjectStore.clearSelectedProjects).mockRejectedValue(error);

      await expect(controller.clearProject({ rootFsPath })).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ProjectController] Failed to clear projects',
        error,
      );
    });
  });
});
