import { createFakePartial } from '@gitlab-org/test-utils';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { AbstractAIContextProvider } from '@gitlab-org/ai-context';
import { type ApiReconfiguredData, type GitLabApiService } from '@gitlab-org/core';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import type {
  RepositoryAIContextItem,
  RepositoryContextProvider,
  RepositoryMetadata,
} from './repository';
import { DefaultRepositoryContextProvider } from './repository';
import type {
  RepositoryContextItemResult,
  RepositoryContextItemStrategy,
} from './strategies/workspace_repository_context_item_strategy';

jest.mock('../../utils/async_debounce', () => ({
  asyncDebounce: jest.fn((fn) => fn),
}));

describe('RepositoryContextProvider', () => {
  let repositoryProvider: RepositoryContextProvider;
  let mockDuoProjectAccessChecker: DuoProjectAccessChecker;
  let mockRepositoryContextItemStrategy: RepositoryContextItemStrategy;
  let mockGitLabApiService: GitLabApiService;
  let logger: Logger;
  let onApiReconfiguredCallback: (data: ApiReconfiguredData) => void;

  beforeEach(() => {
    logger = new TestLogger();
    mockDuoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatusesByIds: jest.fn(),
    });

    mockRepositoryContextItemStrategy = createFakePartial<RepositoryContextItemStrategy>({
      getInitialRepositories: jest.fn(),
      searchRepositories: jest.fn(),
      isSupported: jest.fn().mockReturnValue(true),
      getMinimumVersion: jest.fn().mockReturnValue(null),
    });

    mockGitLabApiService = createFakePartial<GitLabApiService>({
      onApiReconfigured: jest.fn((callback) => {
        onApiReconfiguredCallback = callback;
        return { dispose: jest.fn() };
      }),
    });

    repositoryProvider = new DefaultRepositoryContextProvider(
      logger,
      mockDuoProjectAccessChecker,
      [mockRepositoryContextItemStrategy],
      mockGitLabApiService,
    );
  });

  describe('constructor', () => {
    it('should select the supported strategy with the highest minimum version', () => {
      const workspaceStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: jest.fn(),
        searchRepositories: jest.fn(),
        isSupported: jest.fn().mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });
      const remoteStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: jest.fn(),
        searchRepositories: jest.fn(),
        isSupported: jest.fn().mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue('18.8.0'),
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [workspaceStrategy, remoteStrategy],
        mockGitLabApiService,
      );

      expect(provider).toBeInstanceOf(DefaultRepositoryContextProvider);
      expect(workspaceStrategy.isSupported).toHaveBeenCalled();
      expect(remoteStrategy.isSupported).toHaveBeenCalled();
    });

    it('should register onApiReconfigured listener', () => {
      expect(mockGitLabApiService.onApiReconfigured).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should fall back to workspace strategy when remote strategy is not supported', () => {
      const workspaceStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: jest.fn(),
        searchRepositories: jest.fn(),
        isSupported: jest.fn().mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });
      const remoteStrategy = createFakePartial<RepositoryContextItemStrategy>({
        isSupported: jest.fn().mockReturnValue(false),
        getMinimumVersion: jest.fn().mockReturnValue('18.8.0'),
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [workspaceStrategy, remoteStrategy],
        mockGitLabApiService,
      );

      expect(provider).toBeInstanceOf(DefaultRepositoryContextProvider);
      expect(workspaceStrategy.isSupported).toHaveBeenCalled();
      expect(remoteStrategy.isSupported).toHaveBeenCalled();
    });

    it('should handle gracefully when no supported strategy is found', () => {
      const unsupportedStrategy = createFakePartial<RepositoryContextItemStrategy>({
        isSupported: jest.fn().mockReturnValue(false),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [unsupportedStrategy],
        mockGitLabApiService,
      );

      expect(provider).toBeInstanceOf(DefaultRepositoryContextProvider);
    });
  });

  describe('dispose', () => {
    it('should dispose the API reconfigured listener', () => {
      const disposeSpy = jest.fn();
      const mockApiService = createFakePartial<GitLabApiService>({
        onApiReconfigured: jest.fn(() => ({ dispose: disposeSpy })),
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [mockRepositoryContextItemStrategy],
        mockApiService,
      );

      provider.dispose();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('should prevent memory leaks when multiple instances are created and disposed', () => {
      const disposeSpies: jest.Mock[] = [];
      const mockApiService = createFakePartial<GitLabApiService>({
        onApiReconfigured: jest.fn(() => {
          const disposeSpy = jest.fn();
          disposeSpies.push(disposeSpy);
          return { dispose: disposeSpy };
        }),
      });

      // Create multiple instances
      const provider1 = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [mockRepositoryContextItemStrategy],
        mockApiService,
      );

      const provider2 = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [mockRepositoryContextItemStrategy],
        mockApiService,
      );

      const provider3 = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [mockRepositoryContextItemStrategy],
        mockApiService,
      );

      // Verify each instance registered a listener
      expect(mockApiService.onApiReconfigured).toHaveBeenCalledTimes(3);

      // Dispose only the first two
      provider1.dispose();
      provider2.dispose();

      // Verify only the first two dispose methods were called
      expect(disposeSpies[0]).toHaveBeenCalledTimes(1);
      expect(disposeSpies[1]).toHaveBeenCalledTimes(1);
      expect(disposeSpies[2]).not.toHaveBeenCalled();

      // Dispose the third
      provider3.dispose();
      expect(disposeSpies[2]).toHaveBeenCalledTimes(1);
    });
  });

  describe('strategy re-evaluation on API reconfiguration', () => {
    it('should re-evaluate strategy when API is reconfigured with valid state', async () => {
      const workspaceStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: jest.fn().mockResolvedValue([]),
        searchRepositories: jest.fn().mockResolvedValue([]),
        isSupported: jest.fn().mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });

      const remoteStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: jest.fn().mockResolvedValue([]),
        searchRepositories: jest.fn().mockResolvedValue([]),
        isSupported: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue('18.8.0'),
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [workspaceStrategy, remoteStrategy],
        mockGitLabApiService,
      );

      // Initially, remote strategy is not supported, so workspace strategy is selected
      expect(remoteStrategy.isSupported).toHaveBeenCalledTimes(1);
      expect(workspaceStrategy.isSupported).toHaveBeenCalledTimes(1);

      // Trigger API reconfiguration
      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      // After reconfiguration, strategies should be re-evaluated
      expect(remoteStrategy.isSupported).toHaveBeenCalledTimes(2);
      expect(workspaceStrategy.isSupported).toHaveBeenCalledTimes(2);

      // Verify the remote strategy is now being used
      jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({});
      await provider.searchContextItems({
        category: 'repository',
        query: 'test',
        workspaceFolders: [],
      });

      expect(remoteStrategy.searchRepositories).toHaveBeenCalled();
      expect(workspaceStrategy.searchRepositories).not.toHaveBeenCalled();
    });

    it('should not re-evaluate strategy when API is reconfigured with invalid state', () => {
      const workspaceStrategy = createFakePartial<RepositoryContextItemStrategy>({
        isSupported: jest.fn().mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });

      const remoteStrategy = createFakePartial<RepositoryContextItemStrategy>({
        isSupported: jest.fn().mockReturnValue(false),
        getMinimumVersion: jest.fn().mockReturnValue('18.8.0'),
      });

      // Construct only for the side effect of registering the onApiReconfigured callback.
      // eslint-disable-next-line no-new
      new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [workspaceStrategy, remoteStrategy],
        mockGitLabApiService,
      );

      // Initial selection
      expect(remoteStrategy.isSupported).toHaveBeenCalledTimes(1);
      expect(workspaceStrategy.isSupported).toHaveBeenCalledTimes(1);

      // Trigger API reconfiguration with invalid state
      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: false,
        }),
      );

      // Strategies should not be re-evaluated
      expect(remoteStrategy.isSupported).toHaveBeenCalledTimes(1);
      expect(workspaceStrategy.isSupported).toHaveBeenCalledTimes(1);
    });

    it('should handle strategy switching from workspace to remote after instance version becomes available', async () => {
      const workspaceGetInitial = jest.fn().mockResolvedValue([
        createFakePartial<RepositoryContextItemResult>({
          id: 'gid://gitlab/Project/1',
          name: 'Workspace Project',
          pathWithNamespace: 'workspace/project',
          webUrl: 'https://gitlab.com/workspace/project',
          description: '',
          numericId: 1,
        }),
      ]);

      const remoteGetInitial = jest.fn().mockResolvedValue([
        createFakePartial<RepositoryContextItemResult>({
          id: 'gid://gitlab/Project/2',
          name: 'Remote Project',
          pathWithNamespace: 'remote/project',
          webUrl: 'https://gitlab.com/remote/project',
          description: '',
          numericId: 2,
        }),
      ]);

      const workspaceStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: workspaceGetInitial,
        searchRepositories: jest.fn().mockResolvedValue([]),
        isSupported: jest.fn().mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });

      const remoteStrategy = createFakePartial<RepositoryContextItemStrategy>({
        getInitialRepositories: remoteGetInitial,
        searchRepositories: jest.fn().mockResolvedValue([]),
        isSupported: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
        getMinimumVersion: jest.fn().mockReturnValue('18.8.0'),
      });

      jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
        1: DuoProjectStatus.DuoEnabled,
        2: DuoProjectStatus.DuoEnabled,
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [workspaceStrategy, remoteStrategy],
        mockGitLabApiService,
      );

      // Before reconfiguration, workspace strategy is used
      const resultsBefore = await provider.searchContextItems({
        category: 'repository',
        query: '',
        workspaceFolders: [],
      });

      expect(workspaceGetInitial).toHaveBeenCalled();
      expect(remoteGetInitial).not.toHaveBeenCalled();
      expect(resultsBefore[0].metadata.name).toBe('Workspace Project');

      // Trigger API reconfiguration (instance version becomes available)
      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      // After reconfiguration, remote strategy should be used
      const resultsAfter = await provider.searchContextItems({
        category: 'repository',
        query: '',
        workspaceFolders: [],
      });

      expect(remoteGetInitial).toHaveBeenCalled();
      expect(resultsAfter[0].metadata.name).toBe('Remote Project');
    });
  });

  describe('instance', () => {
    it('correctly creates a repositoryProvider instance with the `project` type', () => {
      expect(repositoryProvider).toBeInstanceOf(DefaultRepositoryContextProvider);
      expect(repositoryProvider).toBeInstanceOf(AbstractAIContextProvider);
      expect(repositoryProvider.type).toBe('repository');
    });
  });

  describe('when no supported strategy is available', () => {
    let providerWithoutStrategy: RepositoryContextProvider;

    beforeEach(() => {
      const unsupportedStrategy = createFakePartial<RepositoryContextItemStrategy>({
        isSupported: jest.fn().mockReturnValue(false),
        getMinimumVersion: jest.fn().mockReturnValue(null),
      });

      providerWithoutStrategy = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [unsupportedStrategy],
        mockGitLabApiService,
      );
    });

    it('returns empty array for searchContextItems with empty query', async () => {
      const results = await providerWithoutStrategy.searchContextItems({
        category: 'repository',
        query: '',
        workspaceFolders: [],
      });

      expect(results).toEqual([]);
    });

    it('returns empty array for searchContextItems with non-empty query', async () => {
      const results = await providerWithoutStrategy.searchContextItems({
        category: 'repository',
        query: 'test',
        workspaceFolders: [],
      });

      expect(results).toEqual([]);
    });

    it('does not call strategy methods when no strategy is available', async () => {
      const unsupportedStrategy = createFakePartial<RepositoryContextItemStrategy>({
        isSupported: jest.fn().mockReturnValue(false),
        getMinimumVersion: jest.fn().mockReturnValue(null),
        getInitialRepositories: jest.fn(),
        searchRepositories: jest.fn(),
      });

      const provider = new DefaultRepositoryContextProvider(
        logger,
        mockDuoProjectAccessChecker,
        [unsupportedStrategy],
        mockGitLabApiService,
      );

      await provider.searchContextItems({
        category: 'repository',
        query: '',
        workspaceFolders: [],
      });

      await provider.searchContextItems({
        category: 'repository',
        query: 'test',
        workspaceFolders: [],
      });

      expect(unsupportedStrategy.getInitialRepositories).not.toHaveBeenCalled();
      expect(unsupportedStrategy.searchRepositories).not.toHaveBeenCalled();
    });
  });

  describe('searchContextItems', () => {
    describe('when query is empty', () => {
      it('returns results from strategy', async () => {
        const mockRepositoryContextItemResult: RepositoryContextItemResult = {
          id: 'gid://gitlab/Project/123',
          name: 'gitlab',
          pathWithNamespace: 'gitlab-org/gitlab',
          webUrl: 'https://gitlab.com/gitlab-org/gitlab',
          description: '',
          numericId: 123,
        };

        jest
          .mocked(mockRepositoryContextItemStrategy.getInitialRepositories)
          .mockResolvedValue([mockRepositoryContextItemResult]);
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
          123: DuoProjectStatus.DuoEnabled,
        });

        const results = await repositoryProvider.searchContextItems({
          category: 'repository',
          query: '',
          workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
        });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          category: 'repository',
          metadata: {
            enabled: true,
            title: 'gitlab',
            name: 'gitlab',
            pathWithNamespace: 'gitlab-org/gitlab',
            webUrl: 'https://gitlab.com/gitlab-org/gitlab',
            subTypeLabel: 'Repository',
          },
        });
      });
    });

    describe('when query is not empty', () => {
      it('calls searchRepositories with correct parameters', async () => {
        jest.mocked(mockRepositoryContextItemStrategy.searchRepositories).mockResolvedValue([]);
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({});

        await repositoryProvider.searchContextItems({
          category: 'repository',
          query: 'test',
          workspaceFolders: [],
        });

        expect(mockRepositoryContextItemStrategy.searchRepositories).toHaveBeenCalledTimes(1);
        expect(mockRepositoryContextItemStrategy.searchRepositories).toHaveBeenCalledWith({
          category: 'repository',
          query: 'test',
          workspaceFolders: [],
        });
      });

      it.each([
        { duoEnabled: true, expectedEnabled: true, expectedDisabledReasons: [] },
        {
          duoEnabled: false,
          expectedEnabled: false,
          expectedDisabledReasons: ['project disabled'],
        },
      ])(
        'handles DuoProjectStatus correctly (enabled: $duoEnabled)',
        async ({ duoEnabled, expectedEnabled, expectedDisabledReasons }) => {
          const projectId = 1;
          const mockRepositoryContextItemResult: RepositoryContextItemResult = {
            id: 'gid://gitlab/Project/1',
            name: 'Test Project',
            pathWithNamespace: 'group/test-project',
            webUrl: 'https://gitlab.com/group/test-project',
            description: '',
            numericId: 1,
          };

          jest
            .mocked(mockRepositoryContextItemStrategy.searchRepositories)
            .mockResolvedValue([mockRepositoryContextItemResult]);
          jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
            [projectId]: duoEnabled ? DuoProjectStatus.DuoEnabled : DuoProjectStatus.DuoDisabled,
          });

          const results = await repositoryProvider.searchContextItems({
            category: 'repository',
            query: 'test',
            workspaceFolders: [],
          });

          expect(results).toHaveLength(1);
          expect(results[0].metadata.enabled).toBe(expectedEnabled);
          expect(results[0].metadata.disabledReasons).toEqual(expectedDisabledReasons);
        },
      );

      it('maps result to expected context item structure', async () => {
        const projectId = 1;
        const mockRepositoryContextItemResult: RepositoryContextItemResult = {
          id: 'gid://gitlab/Project/1',
          name: 'Test Project',
          pathWithNamespace: 'group/test-project',
          webUrl: 'https://gitlab.com/group/test-project',
          description: 'some description :)',
          numericId: 1,
        };

        jest
          .mocked(mockRepositoryContextItemStrategy.searchRepositories)
          .mockResolvedValue([mockRepositoryContextItemResult]);
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
          [projectId]: DuoProjectStatus.DuoEnabled,
        });

        const results = await repositoryProvider.searchContextItems({
          category: 'repository',
          query: 'test',
          workspaceFolders: [],
        });

        expect(results[0]).toMatchObject({
          id: 'gid://gitlab/Project/1',
          category: 'repository',
          metadata: {
            enabled: true,
            disabledReasons: [],
            subType: 'repository',
            subTypeLabel: 'Repository',
            icon: 'project',
            title: 'Test Project',
            secondaryText: 'group/test-project',
            webUrl: 'https://gitlab.com/group/test-project',
            pathWithNamespace: 'group/test-project',
            description: 'some description :)',
            name: 'Test Project',
          },
        });
      });

      it('limits search results to 25 items', async () => {
        const mockRepositories = Array.from({ length: 30 }, (_, i) =>
          createFakePartial<RepositoryContextItemResult>({
            id: `gid://gitlab/Project/${i + 1}`,
            name: `Test Project ${i + 1}`,
            pathWithNamespace: `group/test-project-${i + 1}`,
            webUrl: `https://gitlab.com/group/test-project-${i + 1}`,
            description: '',
            numericId: i + 1,
          }),
        );

        jest
          .mocked(mockRepositoryContextItemStrategy.searchRepositories)
          .mockResolvedValue(mockRepositories);
        jest
          .mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds)
          .mockResolvedValue(
            Object.fromEntries(
              mockRepositories.map((_, i) => [i + 1, DuoProjectStatus.DuoEnabled]),
            ),
          );

        const results = await repositoryProvider.searchContextItems({
          category: 'repository',
          query: 'test',
          workspaceFolders: [],
        });

        expect(results).toHaveLength(25);
      });

      it('handles search service errors gracefully', async () => {
        jest
          .mocked(mockRepositoryContextItemStrategy.searchRepositories)
          .mockRejectedValue(new Error('Search failed'));

        const results = await repositoryProvider.searchContextItems({
          category: 'repository',
          query: 'test',
          workspaceFolders: [],
        });

        expect(results).toEqual([]);
      });
    });
  });

  describe('retrieveSelectedContextItemsWithContent', () => {
    it('returns the added items unmodified', async () => {
      const item = createFakePartial<RepositoryAIContextItem>({
        id: 'gid://gitlab/Project/1234',
        metadata: createFakePartial<RepositoryMetadata>({
          subType: 'repository',
          pathWithNamespace: 'test-namespace/test-project-1',
          name: 'Test Project 1',
          description: 'A test project',
        }),
        content: '',
      });

      const item2 = createFakePartial<RepositoryAIContextItem>({
        id: 'gid://gitlab/Project/5678',
        metadata: createFakePartial<RepositoryMetadata>({
          subType: 'repository',
          pathWithNamespace: 'test-namespace/test-project-2',
          name: 'Test Project 2',
          description: 'Another test project',
        }),
        content: '',
      });

      await repositoryProvider.addSelectedContextItem(item);
      await repositoryProvider.addSelectedContextItem(item2);

      const result = await repositoryProvider.retrieveContextItemsWithContent();

      const itemWithContent = {
        ...item,
        content:
          `Project Path: "test-namespace/test-project-1"\n` +
          `Project Name: "Test Project 1"\n` +
          `Project Description: "A test project"`,
      };

      const item2WithContent = {
        ...item2,
        content:
          `Project Path: "test-namespace/test-project-2"\n` +
          `Project Name: "Test Project 2"\n` +
          `Project Description: "Another test project"`,
      };

      expect(result).toEqual([itemWithContent, item2WithContent]);
    });
  });

  describe('getItemWithContent', () => {
    const item = createFakePartial<RepositoryAIContextItem>({
      id: 'gid://gitlab/Project/1234',
      category: 'repository',
      metadata: createFakePartial<RepositoryMetadata>({
        subType: 'repository',
        subTypeLabel: 'Repository',
        pathWithNamespace: 'test-namespace/test-project-1',
        name: 'Test Project 1',
        description: 'A test project',
      }),
    });

    it('returns item as-is if content already exists', async () => {
      const itemWithContent = { ...item, content: 'existing content' };

      const result = await repositoryProvider.getItemWithContent(itemWithContent);

      expect(result).toBe(itemWithContent);
    });

    it('returns item with empty string as context if context does not exist', async () => {
      const result = await repositoryProvider.getItemWithContent(item);

      const expectedContent =
        `Project Path: "test-namespace/test-project-1"\n` +
        `Project Name: "Test Project 1"\n` +
        `Project Description: "A test project"`;

      expect(result.content).toBe(expectedContent);
    });
  });
});
