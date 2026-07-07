import path from 'path';
import type { PathLike } from 'node:fs';
import { LsFetch } from '@gitlab-org/fetch';
import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { FileChangeType, WorkspaceFolder } from 'vscode-languageserver-protocol';
import * as isomorphicGit from 'isomorphic-git';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLsFiles } from '@gitlab-org/repositories';
import {
  FileSystemEventListener,
  VirtualFileSystemEvents,
  VirtualFileSystemService,
  WorkspaceFilesUpdate,
  WorkspaceFileUpdate,
} from '@gitlab-org/fs';
import { ConfigService } from '@gitlab-org/config';
import { DocumentService, TextDocumentChangeListener } from '../../document_service';
import { TextDocumentChangeListenerType } from '../../text_document_change_listener_type';
import { DefaultDirectoryWalker } from '../fs';
import { FsClient } from '../fs/fs';
import { createMockFsClient } from '../fs/fs.test_utils';
import { DefaultRepositoryService } from './repository_service';
import { GitIgnoreManager } from './git_ignore_manager';
import { Repository } from './repository';

jest.mock('../fs/virtual_file_system_service');
jest.mock('./git_ignore_manager');
jest.mock('isomorphic-git');

describe('DefaultRepositoryService', () => {
  let repositoryService: DefaultRepositoryService;
  let mockVirtualFileSystemService: VirtualFileSystemService;
  let mockDirectoryWalker: DefaultDirectoryWalker;
  let fileSystemEventListener: FileSystemEventListener;
  let mockGitIgnoreManager: GitIgnoreManager;
  let mockFsClient: FsClient;
  let mockLsFetch: LsFetch;
  let mockGitLsFiles: GitLsFiles;
  let mockConfigService: ConfigService;
  let mockDocumentService: DocumentService;
  let documentChangeListener: TextDocumentChangeListener;
  let mockLogger: Logger;

  const emitFileSystemEvent = async (
    eventType: VirtualFileSystemEvents,
    data: WorkspaceFilesUpdate | WorkspaceFileUpdate,
  ) => {
    await fileSystemEventListener(eventType, data as WorkspaceFilesUpdate & WorkspaceFileUpdate);
    await jest.runAllTimersAsync();
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.useFakeTimers();
    mockVirtualFileSystemService = createFakePartial<VirtualFileSystemService>({
      onFileSystemEvent: jest.fn().mockImplementation((listener) => {
        fileSystemEventListener = listener;
        return { dispose: jest.fn() };
      }),
    });

    mockDirectoryWalker = createFakePartial<DefaultDirectoryWalker>({
      findFilesForDirectory: jest.fn(),
    });

    mockGitIgnoreManager = createFakePartial<GitIgnoreManager>({
      addGitignore: jest.fn(),
      addExcludeFile: jest.fn(),
      isIgnored: jest.fn().mockReturnValue(false),
      dispose: jest.fn(),
    });

    mockFsClient = createMockFsClient();

    mockLsFetch = createFakePartial<LsFetch>({});

    mockGitLsFiles = createFakePartial<GitLsFiles>({
      execute: jest.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn().mockReturnValue([]),
    });
    mockDocumentService = createFakePartial<DocumentService>({
      onDocumentChange: jest.fn().mockImplementation((listener) => {
        documentChangeListener = listener;
        return { dispose: jest.fn() };
      }),
    });

    (GitIgnoreManager as jest.MockedClass<typeof GitIgnoreManager>).mockImplementation(
      () => mockGitIgnoreManager,
    );

    repositoryService = new DefaultRepositoryService(
      mockLogger,
      mockVirtualFileSystemService,
      mockDirectoryWalker,
      mockFsClient,
      mockLsFetch,
      mockConfigService,
      mockDocumentService,
      mockGitLsFiles,
    );

    jest.mocked(isomorphicGit.listFiles).mockResolvedValue([]);
    jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
  });

  describe('#setWorkspaceRepositories', () => {
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'workspace',
    };

    const gitConfigUri = URI.parse('file:///workspace/.git/config');
    const gitIgnoreUri = URI.parse('file:///workspace/.gitignore');

    beforeEach(() => {
      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('');
    });

    it('notifies listeners on the `workspaceRepositoriesStart` event', async () => {
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          gitConfigUri,
          gitIgnoreUri,
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/package.json'),
        ],
      };
      let counter = 0;

      repositoryService.onWorkspaceRepositoriesStart((folder) => {
        expect(folder).toEqual(workspaceFolder);
        counter++;
      });

      // We should not run the listener before the event is emitted
      expect(counter).toBe(0);

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      expect(counter).toBe(1);
    });

    it('notifies listeners on the `workspaceRepositoriesFinished` event', async () => {
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          gitConfigUri,
          gitIgnoreUri,
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/package.json'),
        ],
      };

      jest.mocked(isomorphicGit.listFiles).mockResolvedValue(['src/index.ts', 'package.json']);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      mockGitLsFiles.execute = jest.fn().mockResolvedValue(['src/index.ts', 'package.json']);
      let counter = 0;

      const listener = repositoryService.onWorkspaceRepositoriesFinished((folder) => {
        expect(folder).toEqual(workspaceFolder);
        counter++;
      });

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      expect(counter).toBe(1);

      // We should not run the listener after it got disposed
      listener.dispose();
      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      expect(counter).toBe(1);
    });

    it('should create a new repository when .git/config is found', async () => {
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          gitConfigUri,
          gitIgnoreUri,
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/package.json'),
        ],
      };

      jest.mocked(isomorphicGit.listFiles).mockResolvedValue(['src/index.ts', 'package.json']);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      mockGitLsFiles.execute = jest.fn().mockResolvedValue(['src/index.ts', 'package.json']);

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(gitIgnoreUri.fsPath);

      const repositories = repositoryService.getRepositoriesForWorkspaceSync(workspaceFolder.uri);
      expect(repositories.size).toBe(1);

      const repository = repositories.values().next().value as Repository;
      expect(repository).toBeInstanceOf(Repository);
      expect(repository.configFileUri).toEqual(gitConfigUri);
      expect(repository.workspaceFolder).toEqual(workspaceFolder);

      const files = repository.getCurrentTreeFiles();
      expect(files.length).toBe(4); // .git/config, .gitignore, src/index.ts, package.json
      expect(files.some((f) => f.uri.toString() === gitIgnoreUri.toString())).toBe(true);
      expect(files.some((f) => f.uri.toString() === 'file:///workspace/src/index.ts')).toBe(true);
      expect(files.some((f) => f.uri.toString() === 'file:///workspace/package.json')).toBe(true);

      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        URI.parse(workspaceFolder.uri).fsPath,
        URI.parse(workspaceFolder.uri).toString(),
        '',
        path.join(URI.parse(workspaceFolder.uri).fsPath, '.git'),
      );
      expect(repository.getCurrentTrackedFiles()).toEqual([
        URI.parse('file:///workspace/src/index.ts').toString(),
        URI.parse('file:///workspace/package.json').toString(),
      ]);
    });

    it('detects a repository when .git is a worktree pointer file', async () => {
      const dotGitUri = URI.parse('file:///workspace/.git');
      const gitDirPath = '/real/repo/.git/worktrees/worktree-1';
      const gitConfigFromPointer = URI.parse('file:///real/repo/.git/config');
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [dotGitUri, URI.parse('file:///workspace/src/index.ts')],
      };

      jest
        .mocked(mockFsClient.promises.readFile)
        .mockResolvedValueOnce(`gitdir: ${gitDirPath}`)
        .mockResolvedValueOnce('../..')
        .mockResolvedValue('');

      const accessMock = jest.mocked(
        mockFsClient.promises.access ?? (mockFsClient.promises.access = jest.fn()),
      );
      accessMock.mockImplementation(async (filePath: PathLike) => {
        let filePathString = '';
        if (typeof filePath === 'string') {
          filePathString = filePath;
        } else if (filePath instanceof URL) {
          filePathString = filePath.pathname;
        } else if (Buffer.isBuffer(filePath)) {
          filePathString = filePath.toString();
        } else {
          filePathString = filePath.toString();
        }

        if (filePathString === path.join(gitDirPath, 'config')) {
          throw new Error('Missing worktree config');
        }
        return undefined;
      });

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      await jest.runAllTimersAsync();

      const repositories = repositoryService.getRepositoriesForWorkspaceSync(workspaceFolder.uri);

      expect(repositories.size).toBe(1);
      const repository = repositories.values().next().value as Repository;
      expect(repository.uri.toString()).toBe('file:///workspace');
      expect(repository.configFileUri.toString()).toBe(gitConfigFromPointer.toString());
      expect(repository.gitDirUri.toString()).toBe(`file://${gitDirPath}`);
    });

    it('should not create a repository when .git/config is not found', async () => {
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/package.json'),
        ],
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      await jest.runAllTimersAsync();

      const repositories = repositoryService.getRepositoriesForWorkspaceSync(workspaceFolder.uri);
      expect(repositories.size).toBe(0);
    });

    it('should handle multiple workspaces with multiple repositories, both nested and not nested, with nested gitignores', async () => {
      jest.mocked(isomorphicGit.listFiles).mockImplementation((params) => {
        if (params.dir?.includes('workspace1') && params.dir?.includes('nested-repo')) {
          return Promise.resolve(['.git/config', 'src/app.ts']);
        }
        if (params.dir?.includes('workspace1')) {
          return Promise.resolve(['src/index.ts', 'package.json']);
        }
        if (params.dir?.includes('workspace2')) {
          return Promise.resolve(['lib/utils.ts']);
        }
        return Promise.resolve([]);
      });
      jest.mocked(mockGitLsFiles.execute).mockImplementation((basePath) => {
        if (basePath.includes('workspace1') && basePath.includes('nested-repo')) {
          return Promise.resolve(['.git/config', 'src/app.ts']);
        }
        if (basePath.includes('workspace1')) {
          return Promise.resolve(['src/index.ts', 'package.json']);
        }
        if (basePath.includes('workspace2')) {
          return Promise.resolve(['lib/utils.ts']);
        }
        return Promise.resolve([]);
      });
      const workspace1: WorkspaceFolder = {
        uri: 'file:///workspace1',
        name: 'workspace1',
      };
      const workspace2: WorkspaceFolder = {
        uri: 'file:///workspace2',
        name: 'workspace2',
      };

      const filesUpdate1: WorkspaceFilesUpdate = {
        workspaceFolder: workspace1,
        files: [
          URI.parse('file:///workspace1/.git/config'),
          URI.parse('file:///workspace1/.gitignore'),
          URI.parse('file:///workspace1/src/index.ts'),
          URI.parse('file:///workspace1/package.json'),
          URI.parse('file:///workspace1/nested-repo/.git/config'),
          URI.parse('file:///workspace1/nested-repo/.gitignore'),
          URI.parse('file:///workspace1/nested-repo/src/app.ts'),
        ],
      };

      const filesUpdate2: WorkspaceFilesUpdate = {
        workspaceFolder: workspace2,
        files: [
          URI.parse('file:///workspace2/.git/config'),
          URI.parse('file:///workspace2/.gitignore'),
          URI.parse('file:///workspace2/lib/utils.ts'),
        ],
      };

      jest.mocked(mockFsClient.promises.readFile).mockImplementation((filePath) => {
        if (filePath.toString().endsWith('.gitignore')) {
          return Promise.resolve('node_modules\n*.log');
        }
        return Promise.resolve('');
      });

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate1);
      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate2);

      await jest.runAllTimersAsync();

      const repositories1 = repositoryService.getRepositoriesForWorkspaceSync(workspace1.uri);
      expect(repositories1.size).toBe(2);

      const rootRepo = await repositoryService.getMatchingRepository(
        URI.parse('file:///workspace1/src/index.ts'),
        workspace1.uri,
      );
      expect(rootRepo).toBeDefined();
      expect(rootRepo?.uri.toString()).toBe('file:///workspace1');
      expect(rootRepo?.getCurrentTreeFiles().length).toBe(4); // .git/config, .gitignore, src/index.ts, package.json

      const nestedRepo = await repositoryService.getMatchingRepository(
        URI.parse('file:///workspace1/nested-repo/src/app.ts'),
        workspace1.uri,
      );
      expect(nestedRepo).toBeDefined();
      expect(nestedRepo?.uri.toString()).toBe('file:///workspace1/nested-repo');
      expect(nestedRepo?.getCurrentTreeFiles().length).toBe(3); // .git/config, .gitignore, src/app.ts

      const repositories2 = repositoryService.getRepositoriesForWorkspaceSync(workspace2.uri);
      expect(repositories2.size).toBe(1);

      const repo2 = Array.from(repositories2.values())[0];
      expect(repo2).toBeDefined();
      expect(repo2.uri.toString()).toBe('file:///workspace2');
      expect(repo2.getCurrentTreeFiles().length).toBe(3); // .git/config, .gitignore, lib/utils.ts

      expect(mockGitIgnoreManager.addGitignore).toHaveBeenCalledTimes(3);
      expect(mockGitLsFiles.execute).toHaveBeenCalledTimes(3);
      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        URI.parse(workspace1.uri).fsPath,
        URI.parse(workspace1.uri).toString(),
        '',
        path.join(URI.parse(workspace1.uri).fsPath, '.git'),
      );
      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        URI.parse(workspace2.uri).fsPath,
        URI.parse(workspace2.uri).toString(),
        '',
        path.join(URI.parse(workspace2.uri).fsPath, '.git'),
      );
      expect(rootRepo?.getCurrentTrackedFiles()).toEqual([
        URI.parse('file:///workspace1/src/index.ts').toString(),
        URI.parse('file:///workspace1/package.json').toString(),
      ]);
      expect(nestedRepo?.getCurrentTrackedFiles()).toEqual([
        URI.parse('file:///workspace1/nested-repo/.git/config').toString(),
        URI.parse('file:///workspace1/nested-repo/src/app.ts').toString(),
      ]);
      expect(repo2?.getCurrentTrackedFiles()).toEqual([
        URI.parse('file:///workspace2/lib/utils.ts').toString(),
      ]);
    });

    it('assigns files to the containing repository, not the longest prefix sibling', async () => {
      const rootConfigUri = URI.parse('file:///workspace/.git/config');
      const nestedConfigUri = URI.parse('file:///workspace/gitlab/.git/config');
      const siblingFileUri = URI.parse('file:///workspace/gitlab-openldap/.gitignore');
      const nestedFileUri = URI.parse('file:///workspace/gitlab/README.md');

      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [rootConfigUri, nestedConfigUri, siblingFileUri, nestedFileUri],
      };

      jest.mocked(isomorphicGit.listFiles).mockResolvedValue([]);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      mockGitLsFiles.execute = jest.fn().mockResolvedValue([]);
      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('');

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      const repositories = repositoryService.getRepositoriesForWorkspaceSync(workspaceFolder.uri);
      const rootRepo = repositories.get('file:///workspace');
      const nestedRepo = repositories.get('file:///workspace/gitlab');

      expect(rootRepo).toBeDefined();
      expect(nestedRepo).toBeDefined();

      const rootFiles = rootRepo?.getCurrentTreeFiles({ excludeIgnored: false }) ?? [];
      const nestedFiles = nestedRepo?.getCurrentTreeFiles({ excludeIgnored: false }) ?? [];

      expect(rootFiles.some((file) => file.uri.toString() === siblingFileUri.toString())).toBe(
        true,
      );
      expect(nestedFiles.some((file) => file.uri.toString() === siblingFileUri.toString())).toBe(
        false,
      );
      expect(nestedFiles.some((file) => file.uri.toString() === nestedFileUri.toString())).toBe(
        true,
      );
    });

    it('should handle differences in tracked files vs current tree files', async () => {
      jest
        .mocked(isomorphicGit.listFiles)
        .mockResolvedValue(['src/index.ts', 'package.json', 'node_modules/package/dont-ignore.js']);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      mockGitLsFiles.execute = jest
        .fn()
        .mockResolvedValue(['src/index.ts', 'package.json', 'node_modules/package/dont-ignore.js']);
      jest.mocked(mockFsClient.promises.readFile).mockImplementation((filePath) => {
        if (filePath.toString().endsWith('.gitignore')) {
          return Promise.resolve('node_modules');
        }
        return Promise.resolve('');
      });
      jest.mocked(mockGitIgnoreManager.isIgnored).mockImplementation((uri) => {
        return uri.toString().includes('node_modules');
      });
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          gitConfigUri,
          gitIgnoreUri,
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/package.json'),
          // This file is not tracked by git
          URI.parse('file:///workspace/src/untracked.txt'),
          // This file is not tracked by git, but is ignored by .gitignore
          URI.parse('file:///workspace/node_modules/package/index.js'),
          // This file is tracked by git, but is ignored by .gitignore
          URI.parse('file:///workspace/node_modules/package/dont-ignore.js'),
        ],
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);
      await jest.runAllTimersAsync();

      const repository = await repositoryService.getMatchingRepository(
        URI.parse('file:///workspace/src/index.ts'),
        workspaceFolder.uri,
      );
      expect(repository?.getCurrentTrackedFiles()).toEqual([
        URI.parse('file:///workspace/src/index.ts').toString(),
        URI.parse('file:///workspace/package.json').toString(),
        URI.parse('file:///workspace/node_modules/package/dont-ignore.js').toString(),
      ]);

      const treeFiles = repository?.getCurrentTreeFiles({
        excludeGitFolder: true,
        excludeIgnored: true,
      });

      // Check if the untracked file is in the tree files
      expect(treeFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: expect.objectContaining({
              path: '/workspace/src/untracked.txt',
              scheme: 'file',
            }),
            isIgnored: false,
            repositoryUri: repository?.uri,
            workspaceFolder,
          }),
        ]),
      );

      // Check if the ignored file is in the tree files
      expect(treeFiles).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({
            uri: expect.objectContaining({
              path: '/workspace/node_modules/package/index.js',
              scheme: 'file',
            }),
            isIgnored: true,
          }),
        ]),
      );

      // check if tracked file that is ignored by .gitignore is in the tree files
      expect(treeFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: expect.objectContaining({
              path: '/workspace/node_modules/package/dont-ignore.js',
              scheme: 'file',
            }),
            isIgnored: false,
          }),
        ]),
      );
      expect(treeFiles?.length).toBe(5);
    });
  });

  describe('#handleWorkspaceFileUpdate', () => {
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'workspace',
    };

    const repositoryUri = URI.parse('file:///workspace/.git/config');

    beforeEach(async () => {
      // Set up a repository
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          repositoryUri,
          URI.parse('file:///workspace/.gitignore'),
          URI.parse('file:///workspace/src/index.ts'),
        ],
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);
      await jest.runAllTimersAsync();
    });

    it('should add a new file to the repository', async () => {
      const newFileUri = URI.parse('file:///workspace/src/newFile.ts');
      const directoryUri = URI.parse('file:///workspace/src');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: newFileUri.toString(),
          type: FileChangeType.Created,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      const repository = await repositoryService.getMatchingRepository(
        newFileUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getFile(newFileUri)).toBeDefined();
      expect(repository?.getDirectory(directoryUri)).toBeDefined();
    });

    it('should add new files to the repository when a directory is created', async () => {
      const newDirUri = URI.parse('file:///workspace/src');
      const newFileUri = URI.parse('file:///workspace/src/index.ts');
      const newFile2Uri = URI.parse('file:///workspace/src/utils/helper.ts');
      const directoryUri = URI.parse('file:///workspace/src');
      const nestedDirectoryUri = URI.parse('file:///workspace/src/utils');
      const mockLstat = jest.mocked(mockFsClient.promises.lstat as jest.Mock);
      mockLstat.mockResolvedValueOnce({ isDirectory: () => true });
      mockLstat.mockResolvedValue({ isDirectory: () => false });
      jest
        .mocked(mockDirectoryWalker.findFilesForDirectory)
        .mockResolvedValue([newFileUri, newFile2Uri]);
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: newDirUri.toString(),
          type: FileChangeType.Created,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);
      await jest.runAllTimersAsync();

      const repository = await repositoryService.getMatchingRepository(
        newDirUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getFile(newFileUri)).toBeDefined();
      expect(repository?.getFile(newFile2Uri)).toBeDefined();
      expect(repository?.getDirectory(directoryUri)).toBeDefined();
      expect(repository?.getDirectory(nestedDirectoryUri)).toBeDefined();
    });

    it('should handle new directory addition when a directory is created', async () => {
      const newDirUri = URI.parse('file:///workspace/src/utils');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: newDirUri.toString(),
          type: FileChangeType.Created,
        },
        workspaceFolder,
      };

      const mockLstat = jest.mocked(mockFsClient.promises.lstat as jest.Mock);
      mockLstat.mockResolvedValueOnce({ isDirectory: () => true });
      jest.mocked(mockDirectoryWalker.findFilesForDirectory).mockResolvedValue([]);

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);
      await jest.runAllTimersAsync();

      const repository = await repositoryService.getMatchingRepository(
        newDirUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getDirectory(newDirUri)).toBeDefined();
    });

    it('should update an existing file in the repository', async () => {
      const existingFileUri = URI.parse('file:///workspace/src/index.ts');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: existingFileUri.toString(),
          type: FileChangeType.Changed,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);
      await jest.runAllTimersAsync();

      const repository = await repositoryService.getMatchingRepository(
        existingFileUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getFile(existingFileUri)).toBeDefined();
    });

    it('should remove a file from the repository', async () => {
      jest
        .mocked(mockDirectoryWalker.findFilesForDirectory)
        .mockResolvedValue([URI.parse('file:///workspace/src/index.ts')]);
      const fileToRemoveUri = URI.parse('file:///workspace/src/index.ts');
      const directoryUri = URI.parse('file:///workspace/src');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: fileToRemoveUri.toString(),
          type: FileChangeType.Deleted,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);
      await jest.runAllTimersAsync();

      const repository = await repositoryService.getMatchingRepository(
        fileToRemoveUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getFile(fileToRemoveUri)).toBeUndefined();
      expect(repository?.getDirectory(directoryUri)).toBeDefined();
    });

    it('should remove files from the repository when a directory is deleted', async () => {
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          URI.parse('file:///workspace/.git/config'),
          URI.parse('file:///workspace/.gitignore'),
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/src/utils/helper.ts'),
          URI.parse('file:///workspace/src/utils/nested/index.ts'),
          URI.parse('file:///workspace/package.json'),
        ],
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      let repository = await repositoryService.getMatchingRepository(
        URI.parse('file:///workspace/src'),
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getFile(URI.parse('file:///workspace/src/index.ts'))).toBeDefined();
      expect(repository?.getFile(URI.parse('file:///workspace/src/utils/helper.ts'))).toBeDefined();

      jest.mocked(mockDirectoryWalker.findFilesForDirectory).mockResolvedValueOnce([]);

      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: 'file:///workspace/src',
          type: FileChangeType.Deleted,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      repository = await repositoryService.getMatchingRepository(
        URI.parse('file:///workspace/package.json'),
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();

      expect(repository?.getFile(URI.parse('file:///workspace/src/index.ts'))).toBeUndefined();
      expect(
        repository?.getFile(URI.parse('file:///workspace/src/utils/helper.ts')),
      ).toBeUndefined();

      expect(repository?.getFile(URI.parse('file:///workspace/package.json'))).toBeDefined();
      expect(
        repository?.getFile(URI.parse('file:///workspace/src/utils/nested/index.ts')),
      ).toBeUndefined();
    });

    it('should ignore files that are in the .gitignore', async () => {
      jest.mocked(mockGitIgnoreManager.isIgnored).mockReturnValue(true);

      const ignoredFileUri = URI.parse('file:///workspace/node_modules/package/index.js');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: ignoredFileUri.toString(),
          type: FileChangeType.Created,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      const repository = await repositoryService.getMatchingRepository(
        ignoredFileUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getFile(ignoredFileUri)).toBeUndefined();
    });

    it('should trigger a full workspace update when a .gitignore file is changed', async () => {
      const gitignoreUri = URI.parse('file:///workspace/.gitignore');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: gitignoreUri.toString(),
          type: FileChangeType.Changed,
        },
        workspaceFolder,
      };

      jest
        .mocked(mockDirectoryWalker.findFilesForDirectory)
        .mockResolvedValueOnce([
          repositoryUri,
          gitignoreUri,
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/newFile.ts'),
        ]);

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      expect(mockDirectoryWalker.findFilesForDirectory).toHaveBeenCalledWith({
        directoryUri: URI.parse(workspaceFolder.uri),
      });

      const repository = await repositoryService.getMatchingRepository(
        gitignoreUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getCurrentTreeFiles().length).toBe(4);
    });

    it('should trigger a full workspace update when a .git/config file is changed', async () => {
      const gitConfigUri = URI.parse('file:///workspace/.git/config');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: gitConfigUri.toString(),
          type: FileChangeType.Changed,
        },
        workspaceFolder,
      };

      jest
        .mocked(mockDirectoryWalker.findFilesForDirectory)
        .mockResolvedValueOnce([
          gitConfigUri,
          URI.parse('file:///workspace/.gitignore'),
          URI.parse('file:///workspace/src/index.ts'),
          URI.parse('file:///workspace/newFile.ts'),
        ]);

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      expect(mockDirectoryWalker.findFilesForDirectory).toHaveBeenCalledWith({
        directoryUri: URI.parse(workspaceFolder.uri),
      });

      const repository = await repositoryService.getMatchingRepository(
        gitConfigUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getCurrentTreeFiles().length).toBe(4);
    });

    it('should trigger a full workspace update when the repository root is changed', async () => {
      const newRepoUri = URI.parse('file:///workspace');
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: newRepoUri.toString(),
          type: FileChangeType.Changed,
        },
        workspaceFolder,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      expect(mockDirectoryWalker.findFilesForDirectory).toHaveBeenCalledWith({
        directoryUri: URI.parse(workspaceFolder.uri),
      });

      const repository = await repositoryService.getMatchingRepository(
        newRepoUri,
        workspaceFolder.uri,
      );
      expect(repository).toBeDefined();
      expect(repository?.getCurrentTreeFiles().length).toBe(3);
    });
  });

  describe('getFilesForWorkspace', () => {
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'workspace',
    };

    const repositoryUri = URI.parse('file:///workspace/.git/config');
    const gitIgnoreUri = URI.parse('file:///workspace/.gitignore');
    const srcIndexUri = URI.parse('file:///workspace/src/index.ts');
    const packageJsonUri = URI.parse('file:///workspace/package.json');
    const gitFolderFileUri = URI.parse('file:///workspace/.git/HEAD');
    const ignoredFileUri = URI.parse('file:///workspace/node_modules/package/index.js');

    beforeEach(async () => {
      // Set up a repository
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files: [
          repositoryUri,
          gitIgnoreUri,
          srcIndexUri,
          packageJsonUri,
          gitFolderFileUri,
          ignoredFileUri,
        ],
      };

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('node_modules\n*.log');
      jest.mocked(mockGitIgnoreManager.isIgnored).mockImplementation((uri) => {
        return uri.toString().includes('node_modules');
      });

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);
    });

    it('should return all files in the workspace', () => {
      const files = repositoryService.getCurrentFilesForWorkspace(workspaceFolder.uri);
      expect(files.length).toBe(6);
      expect(files.some((file) => file.uri.toString() === repositoryUri.toString())).toBeTruthy();
      expect(files.some((file) => file.uri.toString() === gitIgnoreUri.toString())).toBeTruthy();
      expect(files.some((file) => file.uri.toString() === srcIndexUri.toString())).toBeTruthy();
      expect(files.some((file) => file.uri.toString() === packageJsonUri.toString())).toBeTruthy();
      expect(
        files.some((file) => file.uri.toString() === gitFolderFileUri.toString()),
      ).toBeTruthy();
      expect(files.some((file) => file.uri.toString() === ignoredFileUri.toString())).toBeTruthy();
    });

    it('should exclude git folder files when option is set', () => {
      const files = repositoryService.getCurrentFilesForWorkspace(workspaceFolder.uri, {
        excludeGitFolder: true,
        excludeIgnored: false,
      });

      expect(files.length).toBe(4);
      expect(files.some((file) => file.uri.toString() === gitFolderFileUri.toString())).toBeFalsy();
    });

    it('should exclude ignored files when option is set', () => {
      const files = repositoryService.getCurrentFilesForWorkspace(workspaceFolder.uri, {
        excludeIgnored: true,
      });

      expect(files.length).toBe(5);
      expect(files.some((file) => file.uri.toString() === ignoredFileUri.toString())).toBeFalsy();
    });

    it('should return an empty array for a non-existent workspace', () => {
      const nonExistentWorkspace: WorkspaceFolder = {
        uri: 'file:///non-existent',
        name: 'non-existent',
      };

      const files = repositoryService.getCurrentFilesForWorkspace(nonExistentWorkspace.uri);

      expect(files).toEqual([]);
    });
  });

  describe('getRepositoriesForWorkspace', () => {
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'workspace',
    };

    it('should return repositories sorted by URI', async () => {
      // Create multiple repositories with names that would be out of order if not sorted
      const repoConfigs = [
        { name: 'z-repo', uri: 'file:///workspace/z-repo/.git/config' },
        { name: 'a-repo', uri: 'file:///workspace/a-repo/.git/config' },
        { name: 'm-repo', uri: 'file:///workspace/m-repo/.git/config' },
      ];

      const files = repoConfigs.map((repo) => URI.parse(repo.uri));

      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder,
        files,
      };

      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);

      const repositories = await repositoryService.getRepositoriesForWorkspace(workspaceFolder.uri);

      expect(repositories).toHaveLength(3);

      // Verify repositories are sorted by URI
      const actualUris = repositories.map((r) => r.uri.toString());
      const expectedSortedUris = [
        'file:///workspace/a-repo',
        'file:///workspace/m-repo',
        'file:///workspace/z-repo',
      ];
      expect(actualUris).toEqual(expectedSortedUris);
    });
  });

  describe('getMatchingRepository', () => {
    const mockFileUri = URI.parse('file:///workspace/src/index.ts');
    let mockWorkspaceFolder: WorkspaceFolder;

    beforeEach(() => {
      mockWorkspaceFolder = {
        uri: 'file:///workspace',
        name: 'workspace',
      };
      const filesUpdate: WorkspaceFilesUpdate = {
        workspaceFolder: mockWorkspaceFolder,
        files: [
          URI.parse('file:///workspace/.git/config'),
          URI.parse('file:///workspace/.gitignore'),
          URI.parse('file:///workspace/package.json'),
          mockFileUri,
        ],
      };

      return emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);
    });

    it('caches matched repositories for faster subsequent lookups', async () => {
      // Spy that determines if repo was grabbed from cached or looked up again
      const getRepositoriesForWorkspaceSpy = jest.spyOn(
        repositoryService,
        'getRepositoriesForWorkspaceSync',
      );

      await repositoryService.getMatchingRepository(mockFileUri, mockWorkspaceFolder.uri);

      getRepositoriesForWorkspaceSpy.mockClear();

      await repositoryService.getMatchingRepository(mockFileUri, mockWorkspaceFolder.uri);

      // Spy not called, so repo was grabbed from cache
      expect(getRepositoriesForWorkspaceSpy).not.toHaveBeenCalled();
      getRepositoriesForWorkspaceSpy.mockClear();

      // Ensure cache is invalidated after file event
      const fileUpdate: WorkspaceFileUpdate = {
        fileEvent: {
          uri: mockFileUri.toString(),
          type: FileChangeType.Changed,
        },
        workspaceFolder: mockWorkspaceFolder,
      };
      await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, fileUpdate);

      await repositoryService.getMatchingRepository(mockFileUri, mockWorkspaceFolder.uri);

      // Spy called, so cache must have been correctly invalidated
      expect(getRepositoriesForWorkspaceSpy).toHaveBeenCalled();
    });
  });

  describe('getRepositoryForActiveDocument', () => {
    const workspace1: WorkspaceFolder = {
      uri: 'file:///workspace1',
      name: 'workspace1',
    };
    const workspace2: WorkspaceFolder = {
      uri: 'file:///workspace2',
      name: 'workspace2',
    };

    beforeEach(() => {
      mockConfigService.get = jest.fn().mockReturnValue([workspace1, workspace2]);
    });

    describe('when no repository is configured', () => {
      it('returns undefined when no active document', () => {
        const repository = repositoryService.getRepositoryForActiveDocument();
        expect(repository).toBeUndefined();
      });

      it('returns undefined when no workspace folders configured', () => {
        // Set active document but no workspace folders
        documentChangeListener(
          { document: createFakePartial<TextDocument>({ uri: 'file:///workspace1/src/file.ts' }) },
          TextDocumentChangeListenerType.onDidSetActive,
        );

        mockConfigService.get = jest.fn().mockReturnValue([]);

        const repository = repositoryService.getRepositoryForActiveDocument();
        expect(repository).toBeUndefined();
      });
    });

    describe('with configured repositories', () => {
      beforeEach(async () => {
        const filesUpdate: WorkspaceFilesUpdate = {
          workspaceFolder: workspace1,
          files: [
            URI.parse('file:///workspace1/.git/config'),
            URI.parse('file:///workspace1/src/file.ts'),
          ],
        };

        await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);
      });

      it('returns matching repository for active document in workspace', () => {
        // Set active document
        documentChangeListener(
          { document: createFakePartial<TextDocument>({ uri: 'file:///workspace1/src/file.ts' }) },
          TextDocumentChangeListenerType.onDidSetActive,
        );

        const repository = repositoryService.getRepositoryForActiveDocument();
        expect(repository).toBeDefined();
        expect(repository?.uri.toString()).toBe('file:///workspace1');
      });

      it('returns undefined when active document not in any repository', () => {
        // Set active document to a file not in any repository
        documentChangeListener(
          {
            document: createFakePartial<TextDocument>({ uri: 'file:///workspace2/other/file.ts' }),
          },
          TextDocumentChangeListenerType.onDidSetActive,
        );

        const repository = repositoryService.getRepositoryForActiveDocument();
        expect(repository).toBeUndefined();
      });
    });

    describe('with nested workspaces', () => {
      const nestedWorkspace: WorkspaceFolder = {
        uri: 'file:///workspace1/nested',
        name: 'nested',
      };
      const deeperNestedWorkspace: WorkspaceFolder = {
        uri: 'file:///workspace1/nested/evendeeper',
        name: 'evendeeper',
      };

      beforeEach(async () => {
        mockConfigService.get = jest
          .fn()
          .mockReturnValue([workspace1, nestedWorkspace, deeperNestedWorkspace]);

        const rootFilesUpdate: WorkspaceFilesUpdate = {
          workspaceFolder: workspace1,
          files: [
            URI.parse('file:///workspace1/.git/config'),
            URI.parse('file:///workspace1/src/file.ts'),
          ],
        };

        const nestedFilesUpdate: WorkspaceFilesUpdate = {
          workspaceFolder: nestedWorkspace,
          files: [
            URI.parse('file:///workspace1/nested/.git/config'),
            URI.parse('file:///workspace1/nested/src/file.ts'),
          ],
        };

        const deeperNestedFilesUpdate: WorkspaceFilesUpdate = {
          workspaceFolder: deeperNestedWorkspace,
          files: [
            URI.parse('file:///workspace1/nested/evendeeper/.git/config'),
            URI.parse('file:///workspace1/nested/evendeeper/src/file.ts'),
          ],
        };

        await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, rootFilesUpdate);
        await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, nestedFilesUpdate);
        await emitFileSystemEvent(
          VirtualFileSystemEvents.WorkspaceFilesEvent,
          deeperNestedFilesUpdate,
        );
      });

      it('returns repository from nested workspace when active file matches multiple workspaces', () => {
        documentChangeListener(
          {
            document: createFakePartial<TextDocument>({
              uri: 'file:///workspace1/nested/evendeeper/src/file.ts',
            }),
          },
          TextDocumentChangeListenerType.onDidSetActive,
        );

        const repository = repositoryService.getRepositoryForActiveDocument();
        expect(repository).toBeDefined();
        expect(repository?.uri.toString()).toBe('file:///workspace1/nested/evendeeper');

        documentChangeListener(
          {
            document: createFakePartial<TextDocument>({
              uri: 'file:///workspace1/nested/src/file.ts',
            }),
          },
          TextDocumentChangeListenerType.onDidSetActive,
        );

        const middleRepository = repositoryService.getRepositoryForActiveDocument();
        expect(middleRepository).toBeDefined();
        expect(middleRepository?.uri.toString()).toBe('file:///workspace1/nested');
      });
    });

    describe('document event handling', () => {
      beforeEach(async () => {
        const filesUpdate: WorkspaceFilesUpdate = {
          workspaceFolder: workspace1,
          files: [
            URI.parse('file:///workspace1/.git/config'),
            URI.parse('file:///workspace1/src/file.ts'),
          ],
        };

        await emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, filesUpdate);
      });

      it('only considers changes from onDidSetActive document events', () => {
        documentChangeListener(
          { document: createFakePartial<TextDocument>({ uri: 'file:///workspace1/src/file.ts' }) },
          TextDocumentChangeListenerType.onDidOpen,
        );

        const repository = repositoryService.getRepositoryForActiveDocument();
        expect(repository).toBeUndefined();
      });
    });
  });
});
