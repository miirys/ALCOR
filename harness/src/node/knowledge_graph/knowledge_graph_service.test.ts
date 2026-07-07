import { KnowledgeGraphManager } from '@gitlab-org/knowledge-graph';
import { Logger } from '@gitlab-org/logging';
import { WorkspaceFolder } from 'vscode-languageserver';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { DuoWorkspaceProjectAccessCache, type DuoProject } from '@gitlab-org/legacy-common';
import { DefaultKnowledgeGraphService } from './knowledge_graph_service';

describe('DefaultKnowledgeGraphService', () => {
  let service: DefaultKnowledgeGraphService;
  let configService: ConfigService;
  let logger: Logger;
  let knowledgeGraphManager: KnowledgeGraphManager;
  let duoProjectAccessCache: DuoWorkspaceProjectAccessCache;

  let mockClient: {
    index: jest.Mock;
    updateContextExclusion: jest.Mock;
  };

  let projectCacheUpdateListener: (
    projectsMap: Map<string, DuoProject[]>,
    signal: AbortSignal,
  ) => void;

  beforeEach(() => {
    mockClient = {
      index: jest.fn(),
      updateContextExclusion: jest.fn(),
    };

    knowledgeGraphManager = createFakePartial<KnowledgeGraphManager>({
      startServer: jest.fn(),
      getClient: jest.fn(),
    });

    configService = createFakePartial<ConfigService>({
      onConfigChange: jest.fn(),
    });

    logger = createFakePartial<Logger>({
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    });

    duoProjectAccessCache = createFakePartial<DuoWorkspaceProjectAccessCache>({
      onDuoProjectCacheUpdate: jest.fn((listener) => {
        projectCacheUpdateListener = listener;
        return { dispose: jest.fn() };
      }),
      getProjectsForWorkspaceFolder: jest.fn(),
      getProjectFSPathFromUri: jest.fn((uri: string) => {
        // Convert file:///path/to/project/.git/config to /path/to/project
        const parsedUri = uri.replace('file://', '');
        return parsedUri.replace(/\/\.git\/config$/, '');
      }),
    });

    service = new DefaultKnowledgeGraphService(
      configService,
      logger,
      knowledgeGraphManager,
      duoProjectAccessCache,
    );
  });

  it('should register config change listener', () => {
    expect(configService.onConfigChange).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should register project cache update listener', () => {
    expect(duoProjectAccessCache.onDuoProjectCacheUpdate).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  describe('handleConfigChange', () => {
    const mockConfig: ClientConfig = {
      knowledgeGraph: {},
      workspaceFolders: [
        { uri: 'file:///workspace1', name: 'workspace1' },
        { uri: 'file:///workspace2', name: 'workspace2' },
      ],
    };

    describe('server starts successfully', () => {
      beforeEach(() => {
        (knowledgeGraphManager.startServer as jest.Mock).mockResolvedValue(true);
        (knowledgeGraphManager.getClient as jest.Mock).mockReturnValue(mockClient);
      });

      it('should start server with knowledgeGraph config', async () => {
        await service.handleConfigChange(mockConfig);

        expect(knowledgeGraphManager.startServer).toHaveBeenCalledWith({});
      });

      it('should start server with custom binary path when configured', async () => {
        const configWithBinaryPath = {
          ...mockConfig,
          knowledgeGraph: {
            binaryPath: '/custom/path/gkg',
          },
        };

        await service.handleConfigChange(configWithBinaryPath);

        expect(knowledgeGraphManager.startServer).toHaveBeenCalledWith({
          binaryPath: '/custom/path/gkg',
        });
      });

      it('should handle undefined knowledgeGraph config', async () => {
        const configWithUndefinedKnowledgeGraph = {
          ...mockConfig,
          knowledgeGraph: undefined,
        };

        await service.handleConfigChange(configWithUndefinedKnowledgeGraph);

        expect(knowledgeGraphManager.startServer).toHaveBeenCalledWith(undefined);
      });

      it('should handle workspace folders change after successful server start', async () => {
        await service.handleConfigChange(mockConfig);

        expect(knowledgeGraphManager.getClient).toHaveBeenCalled();
        expect(mockClient.index).toHaveBeenCalledWith('file:///workspace1');
        expect(mockClient.index).toHaveBeenCalledWith('file:///workspace2');
      });

      it('should not index any workspaces if workspace folders are empty', async () => {
        const configWithEmptyFolders = {
          ...mockConfig,
          workspaceFolders: [],
        };

        await service.handleConfigChange(configWithEmptyFolders);

        expect(mockClient.index).not.toHaveBeenCalled();
      });

      it('should not index any workspaces if workspace folders are undefined', async () => {
        const configWithUndefinedFolders = {
          ...mockConfig,
          workspaceFolders: undefined,
        };

        await service.handleConfigChange(configWithUndefinedFolders);

        expect(mockClient.index).not.toHaveBeenCalled();
      });
    });

    describe('server fails to start', () => {
      beforeEach(() => {
        (knowledgeGraphManager.startServer as jest.Mock).mockResolvedValue(false);
      });

      it('should not index any workspaces if server fails to start', async () => {
        await service.handleConfigChange(mockConfig);

        expect(knowledgeGraphManager.getClient).not.toHaveBeenCalled();
        expect(mockClient.index).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleWorkspaceFoldersChange', () => {
    const initialFolders: WorkspaceFolder[] = [
      { uri: 'file:///workspace1', name: 'workspace1' },
      { uri: 'file:///workspace2', name: 'workspace2' },
    ];

    const newFolders: WorkspaceFolder[] = [
      { uri: 'file:///workspace2', name: 'workspace2' },
      { uri: 'file:///workspace3', name: 'workspace3' },
    ];

    beforeEach(() => {
      (knowledgeGraphManager.getClient as jest.Mock).mockReturnValue(mockClient);
    });

    describe('client is available', () => {
      it('should index new workspace folders', async () => {
        await service.handleWorkspaceFoldersChange(initialFolders);

        expect(mockClient.index).toHaveBeenCalledWith('file:///workspace1');
        expect(mockClient.index).toHaveBeenCalledWith('file:///workspace2');
      });

      it('should index new workspace folders', async () => {
        await service.handleWorkspaceFoldersChange(initialFolders);

        jest.clearAllMocks();

        await service.handleWorkspaceFoldersChange(newFolders);

        expect(mockClient.index).toHaveBeenCalledWith('file:///workspace3');
        expect(mockClient.index).not.toHaveBeenCalledWith('file:///workspace2');
      });

      it('should handle identical workspace folders', async () => {
        await service.handleWorkspaceFoldersChange(initialFolders);

        jest.clearAllMocks();

        await service.handleWorkspaceFoldersChange(initialFolders);

        expect(mockClient.index).not.toHaveBeenCalled();
      });
    });

    describe('when client is not available', () => {
      beforeEach(() => {
        (knowledgeGraphManager.getClient as jest.Mock).mockReturnValue(undefined);
      });

      it('should not index any workspaces', async () => {
        await service.handleWorkspaceFoldersChange(newFolders);

        expect(mockClient.index).not.toHaveBeenCalled();
      });
    });
  });

  describe('project cache update handling', () => {
    const createProject = (namespaceWithPath: string, exclusionRules: string[]): DuoProject => ({
      namespaceWithPath,
      exclusionRules,
      uri: `file:///workspace/${namespaceWithPath}/.git/config`,
      enabled: true,
      projectPath: namespaceWithPath.split('/')[1],
      host: 'gitlab.com',
      namespace: namespaceWithPath.split('/')[0],
      remoteName: 'origin',
    });

    beforeEach(() => {
      (knowledgeGraphManager.getClient as jest.Mock).mockReturnValue(mockClient);
    });

    it('should update context exclusion when project exclusion rules change', async () => {
      const projectsMap = new Map<string, DuoProject[]>();
      projectsMap.set('file:///workspace', [
        createProject('gitlab-org/gitlab', ['*.log', 'node_modules/**']),
      ]);

      await projectCacheUpdateListener(projectsMap, new AbortController().signal);

      expect(duoProjectAccessCache.getProjectFSPathFromUri).toHaveBeenCalledWith(
        'file:///workspace/gitlab-org/gitlab/.git/config',
      );
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        ['*.log', 'node_modules/**'],
      );
    });

    it('should update context exclusion for multiple projects', async () => {
      const projectsMap = new Map<string, DuoProject[]>();
      projectsMap.set('file:///workspace', [
        createProject('gitlab-org/gitlab', ['*.log']),
        createProject('gitlab-org/gitaly', ['dist/**']),
        createProject('gitlab-org/runner', ['tmp/**']),
      ]);

      await projectCacheUpdateListener(projectsMap, new AbortController().signal);

      expect(mockClient.updateContextExclusion).toHaveBeenCalledTimes(3);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        ['*.log'],
      );
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitaly',
        ['dist/**'],
      );
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/runner',
        ['tmp/**'],
      );
    });

    it('should not update context exclusion when rules have not changed', async () => {
      const projectsMap = new Map<string, DuoProject[]>();
      const project = createProject('gitlab-org/gitlab', ['*.log']);
      projectsMap.set('file:///workspace', [project]);

      // First update
      await projectCacheUpdateListener(projectsMap, new AbortController().signal);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Second update with same rules
      await projectCacheUpdateListener(projectsMap, new AbortController().signal);
      expect(mockClient.updateContextExclusion).not.toHaveBeenCalled();
    });

    it('should update context exclusion when rules change', async () => {
      const projectsMap1 = new Map<string, DuoProject[]>();
      projectsMap1.set('file:///workspace', [createProject('gitlab-org/gitlab', ['*.log'])]);

      await projectCacheUpdateListener(projectsMap1, new AbortController().signal);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        ['*.log'],
      );

      jest.clearAllMocks();

      const projectsMap2 = new Map<string, DuoProject[]>();
      projectsMap2.set('file:///workspace', [
        createProject('gitlab-org/gitlab', ['*.log', 'dist/**']),
      ]);

      await projectCacheUpdateListener(projectsMap2, new AbortController().signal);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        ['*.log', 'dist/**'],
      );
    });

    it('should handle empty exclusion rules', async () => {
      const projectsMap = new Map<string, DuoProject[]>();
      projectsMap.set('file:///workspace', [createProject('gitlab-org/gitlab', [])]);

      await projectCacheUpdateListener(projectsMap, new AbortController().signal);

      // Empty rules should still trigger an update (sending empty array to clear rules)
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        [],
      );
    });

    it('should update when exclusion rules change from empty to non-empty', async () => {
      const projectsMap1 = new Map<string, DuoProject[]>();
      projectsMap1.set('file:///workspace', [createProject('gitlab-org/gitlab', [])]);

      await projectCacheUpdateListener(projectsMap1, new AbortController().signal);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        [],
      );

      jest.clearAllMocks();

      const projectsMap2 = new Map<string, DuoProject[]>();
      projectsMap2.set('file:///workspace', [createProject('gitlab-org/gitlab', ['*.log'])]);

      await projectCacheUpdateListener(projectsMap2, new AbortController().signal);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        ['*.log'],
      );
    });

    it('should not update context exclusion when client is not available', async () => {
      (knowledgeGraphManager.getClient as jest.Mock).mockReturnValue(undefined);

      const projectsMap = new Map<string, DuoProject[]>();
      projectsMap.set('file:///workspace', [createProject('gitlab-org/gitlab', ['*.log'])]);

      await projectCacheUpdateListener(projectsMap, new AbortController().signal);

      expect(mockClient.updateContextExclusion).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Knowledge Graph client is not available for context exclusion update.',
      );
    });

    it('should handle projects with different order of rules as changed', async () => {
      const projectsMap1 = new Map<string, DuoProject[]>();
      projectsMap1.set('file:///workspace', [
        createProject('gitlab-org/gitlab', ['*.log', 'dist/**']),
      ]);

      await projectCacheUpdateListener(projectsMap1, new AbortController().signal);
      jest.clearAllMocks();

      const projectsMap2 = new Map<string, DuoProject[]>();
      projectsMap2.set('file:///workspace', [
        createProject('gitlab-org/gitlab', ['dist/**', '*.log']),
      ]);

      await projectCacheUpdateListener(projectsMap2, new AbortController().signal);
      expect(mockClient.updateContextExclusion).toHaveBeenCalledWith(
        '/workspace/gitlab-org/gitlab',
        ['dist/**', '*.log'],
      );
    });
  });
});
