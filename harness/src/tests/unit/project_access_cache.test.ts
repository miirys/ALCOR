import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { fsPathToUri, VirtualFileSystemEvents } from '@gitlab-org/fs';
import { createMockFsClient } from '../../common/services/fs/fs.test_utils';
import { GitLabApiClient } from '../../common/api';
import { DefaultDuoWorkspaceProjectAccessCache } from '../../common/services/duo_access/workspace_project_access_cache';
import { VirtualFileSystemService } from '@gitlab-org/fs';
import { ConfigService } from '@gitlab-org/config';
import { GitConfigCommand } from '@gitlab-org/repositories';

jest.mock('../../common/api');
jest.useFakeTimers();
describe('DuoWorkspaceProjectAccessCache Integration', () => {
  let tempDir: string;
  let workspaceFolder1: WorkspaceFolder;
  let workspaceFolder2: WorkspaceFolder;
  let nestedWorkspaceFolder: WorkspaceFolder;
  let workspace1Path: string;
  let workspace2Path: string;
  let nestedWorkspacePath: string;
  const baseUrl = 'https://gitlab.com';

  const mockFsClient = createMockFsClient();

  const api = createFakePartial<GitLabApiClient>({
    fetchFromApi: jest.fn(),
  });

  const mockGitConfigCommand = createFakePartial<GitConfigCommand>({
    getRemoteUrl: jest.fn(async (_uri, _name, fallbackUrl) => fallbackUrl),
  });

  let virtualFileSystemService: VirtualFileSystemService;
  let fileSystemEventCallback: (eventType: string, data: unknown) => Promise<void>;

  const configService = createFakePartial<ConfigService>({
    get: jest.fn().mockImplementation((key) => {
      if (key === 'baseUrl') return baseUrl;
      if (key === 'codeCompletion.enabled') return true;
      if (key === 'duoChat.enabled') return true;
      if (key === 'duo.agentPlatform.enabled') return true;
      return undefined;
    }),
    onConfigChange: jest.fn(),
  });

  beforeEach(() => {
    virtualFileSystemService = createFakePartial<VirtualFileSystemService>({
      onFileSystemEvent: jest.fn().mockImplementation((callback) => {
        fileSystemEventCallback = callback;
        return { dispose: jest.fn() };
      }),
    });
  });

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-project-test-'));

    workspace1Path = path.join(tempDir, 'workspace1');
    workspace2Path = path.join(tempDir, 'workspace2');
    fs.mkdirSync(workspace1Path);
    fs.mkdirSync(workspace2Path);

    nestedWorkspacePath = path.join(workspace1Path, 'nested');
    fs.mkdirSync(nestedWorkspacePath);

    createProjectStructure(workspace1Path, 'project1');
    createProjectStructure(workspace2Path, 'project2');
    createProjectStructure(nestedWorkspacePath, 'nested-project');

    workspaceFolder1 = {
      uri: fsPathToUri(workspace1Path).toString(),
      name: 'Workspace 1',
    };
    workspaceFolder2 = {
      uri: fsPathToUri(workspace2Path).toString(),
      name: 'Workspace 2',
    };
    nestedWorkspaceFolder = {
      uri: fsPathToUri(nestedWorkspacePath).toString(),
      name: 'Nested Workspace',
    };
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should correctly handle multiple workspaces including nested ones', async () => {
    const cache = new DefaultDuoWorkspaceProjectAccessCache(
      mockFsClient,
      api,
      virtualFileSystemService,
      configService,
      mockGitConfigCommand,
    );

    const sampleGitConfigs = {
      workspace1: `[remote "origin"]
    url = https://gitlab.com/gitlab-org/project1.git
    fetch = +refs/heads/*:refs/remotes/origin/*`,
      workspace2: `[remote "origin"]
    url = https://gitlab.com/gitlab-org/project2.git
    fetch = +refs/heads/*:refs/remotes/origin/*`,
      nested: `[remote "origin"]
    url = https://gitlab.com/gitlab-org/nested-project.git
    fetch = +refs/heads/*:refs/remotes/origin/*`,
    };

    jest.mocked(mockFsClient.promises.readFile).mockImplementation(async (filePath) => {
      const pathStr = filePath.toString();
      if (pathStr.includes(path.join('workspace1', 'project1'))) return sampleGitConfigs.workspace1;
      if (pathStr.includes(path.join('workspace2', 'project2'))) return sampleGitConfigs.workspace2;
      if (pathStr.includes(path.join('nested', 'nested-project'))) return sampleGitConfigs.nested;
      throw new Error(`Unexpected path: ${pathStr}`);
    });

    jest
      .mocked(api.fetchFromApi)
      .mockResolvedValueOnce({ version: '18.3.0' }) // version request for workspace1
      .mockResolvedValueOnce({ project: { duoFeaturesEnabled: true } }) // workspace1
      .mockResolvedValueOnce({ version: '18.3.0' }) // version request for workspace2
      .mockResolvedValueOnce({ project: { duoFeaturesEnabled: true } }) // workspace2
      .mockResolvedValueOnce({ version: '18.3.0' }) // version request for nested
      .mockResolvedValueOnce({ project: { duoFeaturesEnabled: true } }); // nested

    const listener = jest.fn();
    cache.onDuoProjectCacheUpdate(listener);

    expect(virtualFileSystemService.onFileSystemEvent).toHaveBeenCalledTimes(1);

    await fileSystemEventCallback(VirtualFileSystemEvents.WorkspaceFilesEvent, {
      workspaceFolder: workspaceFolder1,
      files: [fsPathToUri(path.join(workspace1Path, 'project1', '.git', 'config'))],
    });

    await fileSystemEventCallback(VirtualFileSystemEvents.WorkspaceFilesEvent, {
      workspaceFolder: workspaceFolder2,
      files: [fsPathToUri(path.join(workspace2Path, 'project2', '.git', 'config'))],
    });

    await fileSystemEventCallback(VirtualFileSystemEvents.WorkspaceFilesEvent, {
      workspaceFolder: nestedWorkspaceFolder,
      files: [fsPathToUri(path.join(nestedWorkspacePath, 'nested-project', '.git', 'config'))],
    });

    await jest.runAllTimersAsync();

    const projectsInWorkspace1 = cache.getProjectsForWorkspaceFolder(workspaceFolder1);
    expect(projectsInWorkspace1).toHaveLength(1);
    expect(projectsInWorkspace1[0]).toMatchObject({
      projectPath: 'project1',
      uri: fsPathToUri(path.join(workspace1Path, 'project1', '.git', 'config')).toString(),
      enabled: true,
      host: 'gitlab.com',
      namespace: 'gitlab-org',
      namespaceWithPath: 'gitlab-org/project1',
    });

    const projectsInWorkspace2 = cache.getProjectsForWorkspaceFolder(workspaceFolder2);
    expect(projectsInWorkspace2).toHaveLength(1);
    expect(projectsInWorkspace2[0]).toMatchObject({
      projectPath: 'project2',
      uri: fsPathToUri(path.join(workspace2Path, 'project2', '.git', 'config')).toString(),
      enabled: true,
      host: 'gitlab.com',
      namespace: 'gitlab-org',
      namespaceWithPath: 'gitlab-org/project2',
    });

    const projectsInNestedWorkspace = cache.getProjectsForWorkspaceFolder(nestedWorkspaceFolder);
    expect(projectsInNestedWorkspace).toHaveLength(1);
    expect(projectsInNestedWorkspace[0]).toMatchObject({
      projectPath: 'nested-project',
      uri: fsPathToUri(
        path.join(nestedWorkspacePath, 'nested-project', '.git', 'config'),
      ).toString(),
      enabled: true,
      host: 'gitlab.com',
      namespace: 'gitlab-org',
      namespaceWithPath: 'gitlab-org/nested-project',
    });

    expect(configService.get).toHaveBeenCalledWith('baseUrl');
    expect(configService.get).toHaveBeenCalledWith('codeCompletion.enabled');
    expect(configService.get).toHaveBeenCalledWith('duoChat.enabled');
    expect(configService.get).toHaveBeenCalledWith('duo.agentPlatform.enabled');
    // 1 initial #allDuoFeaturesDisabled() call (3 keys) + 3 workspaces * 4 calls per workspace (baseUrl, codeCompletion.enabled, duoChat.enabled, duo.agentPlatform.enabled)
    expect(configService.get).toHaveBeenCalledTimes(15);

    expect(listener).toHaveBeenCalledTimes(3);

    expect(api.fetchFromApi).toHaveBeenCalledTimes(6);
    expect(mockFsClient.promises.readFile).toHaveBeenCalledTimes(3);
  });
});

function createProjectStructure(workspacePath: string, projectName: string) {
  const projectPath = path.join(workspacePath, projectName);
  const gitConfigPath = path.join(projectPath, '.git', 'config');
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.dirname(gitConfigPath), { recursive: true });
  fs.writeFileSync(gitConfigPath, '');
}
