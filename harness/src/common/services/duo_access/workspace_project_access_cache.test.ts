import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { fsPathToUri, VirtualFileSystemEvents, VirtualFileSystemService } from '@gitlab-org/fs';
import { GitLabVersionResponse, ApiRequest } from '@gitlab-org/core';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { GitConfigCommand } from '@gitlab-org/repositories';
import { GitLabApiClient } from '../../api';
import { createMockFsClient } from '../fs/fs.test_utils';
import {
  DefaultDuoWorkspaceProjectAccessCache,
  GqlProjectWithDuoInfo,
} from './workspace_project_access_cache';

jest.mock('../../api');
jest.useFakeTimers();

describe('DefaultDuoWorkspaceProjectAccessCache', () => {
  const virtualFileSystemService = createFakePartial<VirtualFileSystemService>({
    onFileSystemEvent: jest.fn(),
  });
  const configService = createFakePartial<ConfigService>({
    get: jest.fn().mockImplementation((key) => {
      switch (key) {
        case 'baseUrl':
          return 'https://gitlab.com';
        case 'codeCompletion.enabled':
          return true;
        case 'duoChat.enabled':
          return true;
        case 'duo.agentPlatform.enabled':
          return true;
        default:
          return undefined;
      }
    }),
    onConfigChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  });

  const mockFsClient = createMockFsClient();

  const api = createFakePartial<GitLabApiClient>({
    fetchFromApi: jest.fn(),
  });

  // Mock GitConfigCommand - returns URL unchanged (no SSH alias resolution in tests)
  const mockGitConfigCommand = createFakePartial<GitConfigCommand>({
    getRemoteUrl: jest.fn(async (_uri, _name, fallbackUrl) => fallbackUrl),
  });

  const sampleGitConfig =
    '[remote "origin"]\n\turl = https://gitlab.com/gitlab-org/gitlab-development-kit.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';

  const multiRemoteGitConfig =
    '[remote "origin"]\n\turl = https://gitlab.com/org/project-origin.git\n' +
    '[remote upstream]\n\turl = https://gitlab.com/org/project-upstream.git\n' +
    '[remote "my remote"]\n\turl = https://gitlab.com/org/project-spaced.git\n' +
    '[remote "my\\"quoted\\"remote"]\n\turl = https://gitlab.com/org/project-quoted.git\n' +
    '[remote "back\\\\slash"]\n\turl = https://gitlab.com/org/project-backslash.git\n' +
    '[branch "main"]\n\tremote = origin\n';

  describe('VirtualFileSystemService events', () => {
    it('should update the cache with duo projects for each workspace folder and emit event', async () => {
      const workspaceFolder1: WorkspaceFolder = {
        uri: 'file:///path/to/workspace1',
        name: 'Workspace 1',
      };
      const workspaceFolder2: WorkspaceFolder = {
        uri: 'file:///path/to/workspace2',
        name: 'Workspace 2',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: ['test-rule'] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );
      const listener = jest.fn();
      cache.onDuoProjectCacheUpdate(listener);

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder: workspaceFolder1,
        files: [
          fsPathToUri('/path/to/workspace1/project1/.git/config'),
          fsPathToUri('/path/to/workspace1/project2/.git/config'),
        ],
      });
      await jest.runAllTimersAsync();

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder: workspaceFolder2,
        files: [fsPathToUri('/path/to/workspace2/project3/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder1)).toHaveLength(2);
      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder2)).toHaveLength(1);

      const emittedCache = new Map();
      emittedCache.set(workspaceFolder1.uri, cache.getProjectsForWorkspaceFolder(workspaceFolder1));
      emittedCache.set(workspaceFolder2.uri, cache.getProjectsForWorkspaceFolder(workspaceFolder2));
      expect(listener.mock.calls[0][0]).toEqual(emittedCache);
      expect(listener.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    });

    it('should have enabled set to false if the project does not have duo features enabled', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: false,
          duoContextExclusionSettings: { exclusionRules: ['test-rule'] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        enabled: false,
        exclusionRules: ['test-rule'],
        remoteName: 'origin',
      });
    });

    it('should handle multiple remotes from the same git config', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(multiRemoteGitConfig);

      jest.mocked(api.fetchFromApi).mockImplementation(<T>(request: ApiRequest<T>) => {
        if (request.type === 'rest' && request.path === '/api/v4/version') {
          return Promise.resolve({ version: '18.2.0' } as T);
        }

        if (request.type === 'graphql') {
          const { projectPath } = request.variables;

          const disabledProjects = ['org/project-spaced', 'org/project-backslash'];

          return Promise.resolve({
            project: {
              duoFeaturesEnabled: !disabledProjects.includes(projectPath as string),
              duoContextExclusionSettings: { exclusionRules: [] },
            },
          } as T);
        }

        return Promise.resolve(undefined as T);
      });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project/.git/config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);

      expect(projects).toMatchObject([
        {
          namespaceWithPath: 'org/project-origin',
          remoteName: 'origin',
          enabled: true,
        },
        {
          namespaceWithPath: 'org/project-upstream',
          remoteName: 'upstream',
          enabled: true,
        },
        {
          namespaceWithPath: 'org/project-spaced',
          remoteName: 'my remote',
          enabled: false,
        },
        {
          namespaceWithPath: 'org/project-quoted',
          remoteName: 'my\\"quoted\\"remote',
          enabled: true,
        },
        {
          namespaceWithPath: 'org/project-backslash',
          remoteName: 'back\\slash',
          enabled: false,
        },
      ]);
    });

    it('should handle errors and continue updating the cache', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest
        .mocked(mockFsClient.promises.readFile)
        .mockRejectedValueOnce(new Error('Read file error'))
        .mockResolvedValueOnce(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: ['test-rule'] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [
          fsPathToUri('/path/to/workspace/project1/.git/config'),
          fsPathToUri('/path/to/workspace/project2/.git/config'),
        ],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        projectPath: 'gitlab-development-kit',
        enabled: true,
        exclusionRules: ['test-rule'],
        remoteName: 'origin',
      });
    });

    it('works with windows styled paths', async () => {
      if (process.platform !== 'win32') {
        return;
      }

      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///C:/path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: ['test-rule'] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('C:\\path\\to\\workspace\\project1\\.git\\config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        projectPath: 'gitlab-development-kit',
        enabled: true,
        exclusionRules: ['test-rule'],
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        namespaceWithPath: 'gitlab-org/gitlab-development-kit',
        remoteName: 'origin',
      });
    });

    it('should handle projects with different exclusion rules', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: ['rule1', 'rule2', 'rule3'] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        enabled: true,
        exclusionRules: ['rule1', 'rule2', 'rule3'],
        remoteName: 'origin',
      });
    });

    it('should handle projects with null exclusion settings', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: null,
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        enabled: true,
        exclusionRules: [],
        remoteName: 'origin',
      });
    });

    it('should handle errors when fetching exclusion settings and return empty array', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockRejectedValue(new Error('GraphQL error'));

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        enabled: true,
        exclusionRules: [],
        remoteName: 'origin',
      });
    });
  });

  describe('when all Duo features are disabled', () => {
    it('should skip project access cache update when all Duo features are disabled', async () => {
      const disabledConfigService = createFakePartial<ConfigService>({
        get: jest.fn().mockImplementation((key) => {
          switch (key) {
            case 'baseUrl':
              return 'https://gitlab.com';
            case 'codeCompletion.enabled':
              return false;
            case 'duoChat.enabled':
              return false;
            case 'duo.agentPlatform.enabled':
              return false;
            default:
              return undefined;
          }
        }),
        onConfigChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      });

      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        disabledConfigService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      jest.mocked(api.fetchFromApi).mockClear();

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(api.fetchFromApi).not.toHaveBeenCalled();
      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder)).toHaveLength(0);
    });

    it('should still update cache when only agent platform is enabled', async () => {
      const agentPlatformOnlyConfigService = createFakePartial<ConfigService>({
        get: jest.fn().mockImplementation((key) => {
          switch (key) {
            case 'baseUrl':
              return 'https://gitlab.com';
            case 'codeCompletion.enabled':
              return false;
            case 'duoChat.enabled':
              return false;
            case 'duo.agentPlatform.enabled':
              return true;
            default:
              return undefined;
          }
        }),
        onConfigChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      });

      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: [] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        agentPlatformOnlyConfigService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(api.fetchFromApi).toHaveBeenCalled();
      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder)).toHaveLength(1);
    });
  });

  describe('when Duo config changes', () => {
    it('should clear cache when all Duo features become disabled', async () => {
      const realConfigService = new DefaultConfigService();
      realConfigService.set('baseUrl', 'https://gitlab.com');
      realConfigService.set('codeCompletion.enabled', true);
      realConfigService.set('duoChat.enabled', true);
      realConfigService.set('duo.agentPlatform.enabled', true);

      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);
      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: [] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        realConfigService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder)).toHaveLength(1);

      // Disable all features
      realConfigService.set('codeCompletion.enabled', false);
      realConfigService.set('duoChat.enabled', false);
      realConfigService.set('duo.agentPlatform.enabled', false);

      await jest.runAllTimersAsync();

      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder)).toHaveLength(0);
    });

    it('should refresh cache when Duo features become re-enabled', async () => {
      const realConfigService = new DefaultConfigService();
      realConfigService.set('baseUrl', 'https://gitlab.com');
      realConfigService.set('codeCompletion.enabled', false);
      realConfigService.set('duoChat.enabled', false);
      realConfigService.set('duo.agentPlatform.enabled', false);

      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);
      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: [] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        realConfigService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      // Trigger a workspace event while disabled — should skip
      jest.mocked(api.fetchFromApi).mockClear();
      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(api.fetchFromApi).not.toHaveBeenCalled();
      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder)).toHaveLength(0);

      // Re-enable one feature — should refresh
      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: [] },
        },
      } as { project: GqlProjectWithDuoInfo });

      realConfigService.set('codeCompletion.enabled', true);

      await jest.runAllTimersAsync();

      expect(api.fetchFromApi).toHaveBeenCalled();
      expect(cache.getProjectsForWorkspaceFolder(workspaceFolder)).toHaveLength(1);
    });
  });

  describe('version gate functionality', () => {
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///path/to/workspace',
      name: 'Workspace',
    };

    beforeEach(() => {
      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);
    });

    it('should use duoProjectInfoWithContentExclusionQuery for GitLab version 18.2.0 and above', async () => {
      const mockVersionResponse: GitLabVersionResponse = { version: '18.2.0' };
      const mockProjectResponse = {
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: ['test-rule'] },
        },
      } as { project: GqlProjectWithDuoInfo };

      jest
        .mocked(api.fetchFromApi)
        .mockResolvedValueOnce(mockVersionResponse)
        .mockResolvedValueOnce(mockProjectResponse);

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(api.fetchFromApi).toHaveBeenCalledTimes(2);
      expect(api.fetchFromApi).toHaveBeenNthCalledWith(1, {
        type: 'rest',
        method: 'GET',
        path: '/api/v4/version',
      });
      expect(api.fetchFromApi).toHaveBeenNthCalledWith(2, {
        type: 'graphql',
        query: expect.stringContaining('duoContextExclusionSettings'),
        variables: { projectPath: 'gitlab-org/gitlab-development-kit' },
      });

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);
      expect(projects[0]).toMatchObject({
        enabled: true,
        exclusionRules: ['test-rule'],
        remoteName: 'origin',
      });
    });

    it('should use duoProjectInfoQuery for GitLab version below 18.2.0', async () => {
      const mockVersionResponse: GitLabVersionResponse = { version: '18.1.9' };
      const mockProjectResponse = {
        project: {
          duoFeaturesEnabled: true,
        },
      } as { project: Pick<GqlProjectWithDuoInfo, 'duoFeaturesEnabled'> };

      jest
        .mocked(api.fetchFromApi)
        .mockResolvedValueOnce(mockVersionResponse)
        .mockResolvedValueOnce(mockProjectResponse);

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      expect(api.fetchFromApi).toHaveBeenCalledTimes(2);
      expect(api.fetchFromApi).toHaveBeenNthCalledWith(2, {
        type: 'graphql',
        query: expect.not.stringContaining('duoContextExclusionSettings'),
        variables: { projectPath: 'gitlab-org/gitlab-development-kit' },
      });

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);
      expect(projects[0]).toMatchObject({
        enabled: true,
        exclusionRules: [],
        remoteName: 'origin',
      });
    });

    it('should handle version fetch errors and still attempt project info fetch', async () => {
      jest
        .mocked(api.fetchFromApi)
        .mockRejectedValueOnce(new Error('Version fetch failed'))
        .mockResolvedValueOnce({
          project: {
            duoFeaturesEnabled: true,
            duoContextExclusionSettings: null,
          },
        } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [fsPathToUri('/path/to/workspace/project1/.git/config')],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);
      expect(projects[0]).toMatchObject({
        enabled: true,
        exclusionRules: [],
        remoteName: 'origin',
      });
    });
  });

  describe('getProjectFSPathFromUri', () => {
    it('should convert URI to filesystem path and remove .git/config', () => {
      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const result = cache.getProjectFSPathFromUri('file:///path/to/project/.git/config');

      // Should not contain .git or config
      expect(result).not.toContain('.git');
      expect(result).not.toContain('config');
      // Should contain the project path
      expect(result).toContain('project');
    });

    it('should handle URIs with nested paths', () => {
      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const result = cache.getProjectFSPathFromUri(
        'file:///workspace/gitlab-org/gitlab/.git/config',
      );

      // Should not contain .git or config
      expect(result).not.toContain('.git');
      expect(result).not.toContain('config');
      // Should contain the nested path
      expect(result).toContain('gitlab-org');
      expect(result).toContain('gitlab');
    });

    it('should return the path unchanged if it does not end with .git/config', () => {
      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const result = cache.getProjectFSPathFromUri('file:///path/to/project/some-file.txt');

      // Should not modify paths that don't end with .git/config
      expect(result).toContain('some-file.txt');
    });
  });

  describe('virtual workspace projects', () => {
    it('should resolve projects from virtualWorkspaceProjects config for non-file workspaces', async () => {
      const virtualWorkspaceFolder: WorkspaceFolder = {
        uri: 'adt://my-sap-server/sap/bc/adt/packages/zmy_package',
        name: 'SAP ABAP',
      };

      const virtualConfigService = createFakePartial<ConfigService>({
        get: jest.fn().mockImplementation((key) => {
          switch (key) {
            case 'baseUrl':
              return 'https://gitlab.com';
            case 'codeCompletion.enabled':
              return true;
            case 'duoChat.enabled':
              return true;
            case 'duo.agentPlatform.enabled':
              return true;
            case 'virtualWorkspaceProjects':
              return [
                {
                  workspaceFolderUri: 'adt://my-sap-server/sap/bc/adt/packages/zmy_package',
                  projectPath: 'my-group/my-sap-project',
                },
              ];
            default:
              return undefined;
          }
        }),
        onConfigChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      });

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: [] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        virtualConfigService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder: virtualWorkspaceFolder,
        files: [],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(virtualWorkspaceFolder);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        namespaceWithPath: 'my-group/my-sap-project',
        enabled: true,
        remoteName: 'origin',
      });
    });

    it('should return empty projects for non-file workspaces without virtualWorkspaceProjects config', async () => {
      const virtualWorkspaceFolder: WorkspaceFolder = {
        uri: 'gitlab-remote://host/some/project',
        name: 'Remote Project',
      };

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder: virtualWorkspaceFolder,
        files: [],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(virtualWorkspaceFolder);
      expect(projects).toHaveLength(0);
    });

    it('should use custom remoteName from virtualWorkspaceProjects config', async () => {
      const virtualWorkspaceFolder: WorkspaceFolder = {
        uri: 'adt://server/path',
        name: 'Custom Remote',
      };

      const virtualConfigService = createFakePartial<ConfigService>({
        get: jest.fn().mockImplementation((key) => {
          switch (key) {
            case 'baseUrl':
              return 'https://gitlab.com';
            case 'codeCompletion.enabled':
              return true;
            case 'duoChat.enabled':
              return true;
            case 'duo.agentPlatform.enabled':
              return true;
            case 'virtualWorkspaceProjects':
              return [
                {
                  workspaceFolderUri: 'adt://server/path',
                  projectPath: 'my-group/my-project',
                  remoteName: 'upstream',
                },
              ];
            default:
              return undefined;
          }
        }),
        onConfigChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      });

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: [] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        virtualConfigService,
        mockGitConfigCommand,
      );

      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder: virtualWorkspaceFolder,
        files: [],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(virtualWorkspaceFolder);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        remoteName: 'upstream',
      });
    });
  });

  describe('getProjectsForWorkspaceFolder', () => {
    it('should return the projects for the given workspace folder', async () => {
      const workspaceFolder: WorkspaceFolder = {
        uri: 'file:///path/to/workspace',
        name: 'Workspace',
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(sampleGitConfig);

      jest.mocked(api.fetchFromApi).mockResolvedValue({
        project: {
          duoFeaturesEnabled: true,
          duoContextExclusionSettings: { exclusionRules: ['test-rule'] },
        },
      } as { project: GqlProjectWithDuoInfo });

      const cache = new DefaultDuoWorkspaceProjectAccessCache(
        mockFsClient,
        api,
        virtualFileSystemService,
        configService,
        mockGitConfigCommand,
      );

      // Get the event handler that was registered
      const [eventHandler] = jest.mocked(virtualFileSystemService.onFileSystemEvent).mock.calls[0];

      eventHandler(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        workspaceFolder,
        files: [
          fsPathToUri('/path/to/workspace/project1/.git/config'),
          fsPathToUri('/path/to/workspace/project2/.git/config'),
        ],
      });
      await jest.runAllTimersAsync();

      const projects = cache.getProjectsForWorkspaceFolder(workspaceFolder);

      expect(projects).toHaveLength(2);
      expect(projects[0]).toMatchObject({
        projectPath: 'gitlab-development-kit',
        uri: 'file:///path/to/workspace/project1/.git/config',
        enabled: true,
        exclusionRules: ['test-rule'],
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        namespaceWithPath: 'gitlab-org/gitlab-development-kit',
        remoteName: 'origin',
      });
      expect(projects[1]).toMatchObject({
        projectPath: 'gitlab-development-kit',
        uri: 'file:///path/to/workspace/project2/.git/config',
        enabled: true,
        exclusionRules: ['test-rule'],
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        namespaceWithPath: 'gitlab-org/gitlab-development-kit',
        remoteName: 'origin',
      });
    });
  });
});
