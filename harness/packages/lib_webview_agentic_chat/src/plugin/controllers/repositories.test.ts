import {
  AgentPlatformProjectService,
  type AgentPlatformRepositories,
} from '@gitlab-lsp/workflow-api/node';
import { TestLogger } from '@gitlab-org/logging';
import { MessageBus } from '@gitlab-org/message-bus';
import { createFakePartial } from '@gitlab-org/test-utils';
import { initRepositoriesController } from './repositories';
import { NO_REPLY } from './constants';

describe('initRepositoriesController', () => {
  let mockAgentPlatformProjectService: AgentPlatformProjectService;
  let mockLogger: TestLogger;
  let mockMessageBus: MessageBus;
  let repositoriesController: ReturnType<typeof initRepositoriesController>;

  beforeEach(() => {
    mockAgentPlatformProjectService = createFakePartial<AgentPlatformProjectService>({
      getRepositories: jest.fn(),
      getSelectedProject: jest.fn(),
      setSelectedProject: jest.fn(),
      onRepositoriesChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    });

    mockLogger = new TestLogger();
    mockMessageBus = createFakePartial<MessageBus>({
      sendNotification: jest.fn(),
    });

    repositoriesController = initRepositoriesController(
      mockAgentPlatformProjectService,
      mockLogger,
      mockMessageBus,
    );
  });

  describe('getRepositories', () => {
    it('calls AgentPlatformProjectService.getRepositories and returns success response', async () => {
      const mockRepositories = createFakePartial<AgentPlatformRepositories>({
        repositories: [
          {
            rootFsPath: '/path/to/repo',
            projects: [{ namespaceWithPath: 'namespace/test-project' }],
          },
        ],
      });

      jest
        .mocked(mockAgentPlatformProjectService.getRepositories)
        .mockResolvedValue(mockRepositories);
      jest.mocked(mockAgentPlatformProjectService.getSelectedProject).mockResolvedValue(null);

      const result = await repositoriesController.getRepositories();

      expect(mockAgentPlatformProjectService.getRepositories).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].eventName).toBe('setRepositories');
      expect(result[1].eventName).toBe('setRepoToProjectPathMap');
    });

    it('returns repositories with DAP availability flags', async () => {
      const mockRepositories = createFakePartial<AgentPlatformRepositories>({
        repositories: [
          {
            type: 'multiple',
            projects: [
              {
                id: '123',
                namespaceWithPath: 'namespace/project-1',
                duoAgenticChatAvailable: true,
              },
              {
                id: null,
                namespaceWithPath: 'namespace/project-2',
                duoAgenticChatAvailable: false,
              },
            ],
          },
        ],
      });

      jest
        .mocked(mockAgentPlatformProjectService.getRepositories)
        .mockResolvedValue(mockRepositories);
      jest.mocked(mockAgentPlatformProjectService.getSelectedProject).mockResolvedValue(null);

      const result = await repositoriesController.getRepositories();

      const repositoriesData = result[0].data as AgentPlatformRepositories;
      const repo = repositoriesData.repositories[0];
      expect(repo.type).toBe('multiple');
      expect(repo.projects[0].duoAgenticChatAvailable).toBe(true);
      expect(repo.projects[0].id).toBe('123');
      expect(repo.projects[1].duoAgenticChatAvailable).toBe(false);
      expect(repo.projects[1].id).toBeNull();
    });

    it('includes selected projects in response', async () => {
      const mockRepositories = createFakePartial<AgentPlatformRepositories>({
        repositories: [
          {
            rootFsPath: '/path/to/repo1',
            projects: [{ namespaceWithPath: 'namespace/project-1' }],
          },
          {
            rootFsPath: '/path/to/repo2',
            projects: [{ namespaceWithPath: 'namespace/project-2' }],
          },
        ],
      });

      jest
        .mocked(mockAgentPlatformProjectService.getRepositories)
        .mockResolvedValue(mockRepositories);
      jest
        .mocked(mockAgentPlatformProjectService.getSelectedProject)
        .mockResolvedValueOnce('namespace/project-1')
        .mockResolvedValueOnce('namespace/project-2');

      const result = await repositoriesController.getRepositories();

      expect(mockAgentPlatformProjectService.getSelectedProject).toHaveBeenCalledWith(
        '/path/to/repo1',
      );
      expect(mockAgentPlatformProjectService.getSelectedProject).toHaveBeenCalledWith(
        '/path/to/repo2',
      );

      const selectedProjectsData = result[1].data as Record<string, string>;
      expect(selectedProjectsData).toEqual({
        '/path/to/repo1': 'namespace/project-1',
        '/path/to/repo2': 'namespace/project-2',
      });
    });

    it('logs error and returns empty array when service call fails', async () => {
      const error = new Error('Failed to fetch projects');
      jest.mocked(mockAgentPlatformProjectService.getRepositories).mockRejectedValue(error);

      const result = await repositoriesController.getRepositories();

      expect(mockLogger.errorLogs).toContainEqual({
        message: '[RepositoriesController] Failed to get workspace repositories',
        error,
      });
      expect(result).toEqual([]);
    });

    it('registers onRepositoriesChange listener', async () => {
      const mockRepositories = createFakePartial<AgentPlatformRepositories>({
        repositories: [
          {
            rootFsPath: '/path/to/repo',
            projects: [{ namespaceWithPath: 'namespace/test-project' }],
          },
        ],
      });

      jest
        .mocked(mockAgentPlatformProjectService.getRepositories)
        .mockResolvedValue(mockRepositories);
      jest.mocked(mockAgentPlatformProjectService.getSelectedProject).mockResolvedValue(null);

      await repositoriesController.getRepositories();

      expect(mockAgentPlatformProjectService.onRepositoriesChange).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe('onRepositoriesChange', () => {
    it('sets up listener and sends notifications when repositories change', async () => {
      const mockRepositories = createFakePartial<AgentPlatformRepositories>({
        repositories: [
          {
            rootFsPath: '/path/to/repo',
            projects: [{ namespaceWithPath: 'namespace/test-project' }],
          },
        ],
      });

      jest
        .mocked(mockAgentPlatformProjectService.getRepositories)
        .mockResolvedValue(mockRepositories);
      jest.mocked(mockAgentPlatformProjectService.getSelectedProject).mockResolvedValue(null);

      // Call getRepositories to set up the listener
      await repositoriesController.getRepositories();

      // Get the listener callback that was registered
      const listenerCallback = jest.mocked(mockAgentPlatformProjectService.onRepositoriesChange)
        .mock.calls[0][0];

      // Simulate repositories change
      await listenerCallback(mockRepositories, new AbortController().signal);

      // Verify notifications were sent
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'setRepositories',
        expect.objectContaining({
          repositories: expect.any(Array),
        }),
      );
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'setRepoToProjectPathMap',
        expect.any(Object),
      );
    });

    it('logs error when handler fails', async () => {
      const mockRepositories = createFakePartial<AgentPlatformRepositories>({
        repositories: [
          {
            rootFsPath: '/path/to/repo',
            projects: [{ namespaceWithPath: 'namespace/test-project' }],
          },
        ],
      });

      jest
        .mocked(mockAgentPlatformProjectService.getRepositories)
        .mockResolvedValue(mockRepositories);
      jest.mocked(mockAgentPlatformProjectService.getSelectedProject).mockResolvedValue(null);

      // Call getRepositories to set up the listener
      await repositoriesController.getRepositories();

      // Get the listener callback that was registered
      const listenerCallback = jest.mocked(mockAgentPlatformProjectService.onRepositoriesChange)
        .mock.calls[0][0];

      // Now mock getSelectedProject to fail for the listener call
      jest
        .mocked(mockAgentPlatformProjectService.getSelectedProject)
        .mockRejectedValue(new Error('Failed to get selected project'));

      // Simulate repositories change
      await listenerCallback(mockRepositories, new AbortController().signal);

      // Verify error was logged
      expect(mockLogger.errorLogs).toContainEqual({
        message: '[RepositoriesController] Failed to handle repositories change',
        error: expect.any(Error),
      });
    });
  });

  describe('selectProjectForWorkflow', () => {
    it('calls setSelectedProject and returns NO_REPLY', async () => {
      const repositoryPath = '/path/to/repo';
      const projectPath = 'namespace/test-project';

      const result = await repositoriesController.selectProjectForWorkflow({
        repositoryPath,
        projectPath,
      });

      expect(mockAgentPlatformProjectService.setSelectedProject).toHaveBeenCalledWith(
        repositoryPath,
        projectPath,
      );
      expect(mockLogger.debugLogs).toContainEqual({
        message: `[RepositoriesController] Selecting project ${projectPath} for repository ${repositoryPath}`,
      });
      expect(result).toBe(NO_REPLY);
    });

    it('logs error and returns NO_REPLY when setSelectedProject fails', async () => {
      const repositoryPath = '/path/to/repo';
      const projectPath = 'namespace/test-project';
      const error = new Error('Failed to persist selection');

      jest.mocked(mockAgentPlatformProjectService.setSelectedProject).mockRejectedValue(error);

      const result = await repositoriesController.selectProjectForWorkflow({
        repositoryPath,
        projectPath,
      });

      expect(mockLogger.errorLogs).toContainEqual({
        message: '[RepositoriesController] Failed to select project',
        error,
      });
      expect(result).toBe(NO_REPLY);
    });
  });
});
