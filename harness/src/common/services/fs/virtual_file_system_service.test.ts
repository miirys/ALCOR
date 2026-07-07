import { URI } from 'vscode-uri';
import { Connection } from 'vscode-languageserver';
import {
  DidChangeWatchedFilesNotification,
  FileChangeType,
  WorkspaceFolder,
} from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { VirtualFileSystemEvents } from '@gitlab-org/fs';
import { ApiReconfiguredData, EventListener, LsConnection } from '@gitlab-org/core';
import { ClientConfig, ConfigService } from '@gitlab-org/config';
import { GitLabApiClient } from '../../api';
import { log } from '../../log';
import { DirectoryWalker } from './dir';
import { DefaultVirtualFileSystemService } from './virtual_file_system_service';

describe('DefaultVirtualFileSystemService', () => {
  let service: DefaultVirtualFileSystemService;
  let mockDirectoryWalker: jest.Mocked<DirectoryWalker>;
  let mockWorkspaceFolder: WorkspaceFolder;
  let mockLsConnection: jest.Mocked<LsConnection>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockApi: jest.Mocked<GitLabApiClient>;
  let apiReconfiguredListeners: EventListener<ApiReconfiguredData>[] = [];
  let triggerConfigChange: (config: ClientConfig) => Promise<void>;

  beforeEach(() => {
    mockDirectoryWalker = createFakePartial<jest.Mocked<DirectoryWalker>>({
      findFilesForDirectory: jest.fn(),
    });

    mockWorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'Test Workspace',
    };

    mockLsConnection = createFakePartial<jest.Mocked<LsConnection>>({
      client: createFakePartial<Connection['client']>({
        register: jest.fn().mockResolvedValue({ dispose: jest.fn() }),
      }),
      onDidChangeWatchedFiles: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    });

    mockConfigService = createFakePartial<jest.Mocked<ConfigService>>({
      get: jest.fn().mockReturnValue([mockWorkspaceFolder]),
      onConfigChange: jest.fn(),
    });

    mockConfigService.onConfigChange.mockImplementation((configChangeCallback) => {
      triggerConfigChange = configChangeCallback as (config: ClientConfig) => Promise<void>;
      return { dispose: jest.fn() };
    });

    mockApi = createFakePartial<jest.Mocked<GitLabApiClient>>({
      isInValidState: true,
      onApiReconfigured: jest.fn((listener) => {
        apiReconfiguredListeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    service = new DefaultVirtualFileSystemService(
      mockLsConnection,
      mockDirectoryWalker,
      mockConfigService,
      mockApi,
    );
  });

  afterEach(() => {
    apiReconfiguredListeners = [];
  });

  describe('setup', () => {
    describe('filesystem watcher registration', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('should register watchers and set up file change listener', async () => {
        const registerSpy = jest.spyOn(mockLsConnection.client, 'register');
        const onDidChangeWatchedFilesSpy = jest.spyOn(mockLsConnection, 'onDidChangeWatchedFiles');

        await service.setup();
        jest.runAllTimers();

        expect(registerSpy).toHaveBeenCalledWith(
          DidChangeWatchedFilesNotification.type,
          expect.objectContaining({
            watchers: [{ globPattern: '**/*' }],
          }),
        );

        expect(onDidChangeWatchedFilesSpy).toHaveBeenCalled();
      });

      it('should handle file changes and emit events', async () => {
        const listener = jest.fn();
        service.onFileSystemEvent(listener);

        await service.setup();
        jest.runAllTimers();

        const onDidChangeWatchedFilesSpy = jest.spyOn(mockLsConnection, 'onDidChangeWatchedFiles');
        const callback = onDidChangeWatchedFilesSpy.mock.calls[0][0];

        callback({
          changes: [
            { uri: 'file:///workspace/file1.ts', type: FileChangeType.Created },
            { uri: 'file:///workspace/file2.ts', type: FileChangeType.Changed },
          ],
        });

        jest.runAllTimers();

        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenCalledWith(
          VirtualFileSystemEvents.WorkspaceFileEvent,
          expect.objectContaining({
            fileEvent: { uri: 'file:///workspace/file1.ts', type: FileChangeType.Created },
            workspaceFolder: mockWorkspaceFolder,
          }),
        );
        expect(listener).toHaveBeenCalledWith(
          VirtualFileSystemEvents.WorkspaceFileEvent,
          expect.objectContaining({
            fileEvent: { uri: 'file:///workspace/file2.ts', type: FileChangeType.Changed },
            workspaceFolder: mockWorkspaceFolder,
          }),
        );
      });

      it('should handle errors when registering watchers', async () => {
        const logInfoSpy = jest.spyOn(log, 'info').mockImplementation();
        jest
          .mocked(mockLsConnection.client.register)
          .mockRejectedValue(new Error('Registration failed'));

        await service.setup();
        jest.runAllTimers();

        expect(logInfoSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to register watcher for workspaces'),
          expect.any(Error),
        );

        logInfoSpy.mockRestore();
      });
    });

    describe('when the config changes', () => {
      it('should initialize new workspace folders', async () => {
        const workspace1 = { uri: 'file:///workspace1', name: 'Workspace 1' };
        const workspace2 = { uri: 'file:///workspace2', name: 'Workspace 2' };
        const mockConfig = createFakePartial<ClientConfig>({
          workspaceFolders: [workspace1, workspace2],
        });
        const mockFiles = [URI.parse('file:///workspace1/file1.ts')];
        mockDirectoryWalker.findFilesForDirectory.mockResolvedValue(mockFiles);

        const listener = jest.fn();
        service.onFileSystemEvent(listener);

        await service.setup();
        await triggerConfigChange(mockConfig);

        expect(listener).toHaveBeenCalledWith(
          VirtualFileSystemEvents.WorkspaceFilesEvent,
          expect.objectContaining({
            workspaceFolder: workspace1,
            files: mockFiles,
          }),
        );
        expect(listener).toHaveBeenCalledWith(
          VirtualFileSystemEvents.WorkspaceFilesEvent,
          expect.objectContaining({
            workspaceFolder: workspace2,
            files: mockFiles,
          }),
        );
        expect(mockLsConnection.client.register).toHaveBeenCalled();
      });

      it('should not re-initialize already initialized workspaces', async () => {
        const workspace1 = { uri: 'file:///workspace1', name: 'Workspace 1' };
        const mockConfig = createFakePartial<ClientConfig>({
          workspaceFolders: [workspace1],
        });

        await service.setup();
        await triggerConfigChange(mockConfig);
        mockDirectoryWalker.findFilesForDirectory.mockClear();

        await triggerConfigChange(mockConfig);

        expect(mockDirectoryWalker.findFilesForDirectory).not.toHaveBeenCalled();
      });

      it('should emit a WorkspaceFilesEvent with empty files when a workspace folder is removed', async () => {
        const workspace1 = { uri: 'file:///workspace1', name: 'Workspace 1' };
        const workspace2 = { uri: 'file:///workspace2', name: 'Workspace 2' };
        mockDirectoryWalker.findFilesForDirectory.mockResolvedValue([]);

        await service.setup();
        await triggerConfigChange(
          createFakePartial<ClientConfig>({ workspaceFolders: [workspace1, workspace2] }),
        );

        const listener = jest.fn();
        service.onFileSystemEvent(listener);

        await triggerConfigChange(
          createFakePartial<ClientConfig>({ workspaceFolders: [workspace1] }),
        );

        expect(listener).toHaveBeenCalledWith(VirtualFileSystemEvents.WorkspaceFilesEvent, {
          files: [],
          workspaceFolder: { uri: workspace2.uri, name: workspace2.uri },
        });
      });

      it('should clean up removed workspaces from initialization tracking', async () => {
        const workspace1 = { uri: 'file:///workspace1', name: 'Workspace 1' };
        const workspace2 = { uri: 'file:///workspace2', name: 'Workspace 2' };
        let mockConfig = createFakePartial<ClientConfig>({
          workspaceFolders: [workspace1, workspace2],
        });

        await service.setup();
        await triggerConfigChange(mockConfig);

        // Second setup with workspace2 removed
        mockConfig = createFakePartial<ClientConfig>({
          workspaceFolders: [workspace1],
        });
        await triggerConfigChange(mockConfig);

        // Third setup with workspace2 re-added - should re-initialize it
        mockConfig = createFakePartial<ClientConfig>({
          workspaceFolders: [workspace1, workspace2],
        });
        mockDirectoryWalker.findFilesForDirectory.mockClear();
        await triggerConfigChange(mockConfig);

        // Should have initialized workspace2 again
        expect(mockDirectoryWalker.findFilesForDirectory).toHaveBeenCalledWith({
          directoryUri: URI.parse(workspace2.uri),
        });
      });
    });
  });

  describe('emitFilesForWorkspace', () => {
    it('should emit a WorkspaceFilesEvent with the files found', async () => {
      const mockFiles = [
        URI.parse('file:///workspace/file1.ts'),
        URI.parse('file:///workspace/file2.ts'),
      ];
      mockDirectoryWalker.findFilesForDirectory.mockResolvedValue(mockFiles);

      const listener = jest.fn();
      service.onFileSystemEvent(listener);

      await service.emitFilesForWorkspace(mockWorkspaceFolder);

      expect(mockDirectoryWalker.findFilesForDirectory).toHaveBeenCalledWith({
        directoryUri: URI.parse(mockWorkspaceFolder.uri),
      });
      expect(listener).toHaveBeenCalledWith(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        files: mockFiles,
        workspaceFolder: mockWorkspaceFolder,
      });
    });

    describe('when the workspace folder uses a virtual filesystem URI', () => {
      it('skips directory walking for adt:// URIs and emits empty files event', async () => {
        const virtualWorkspaceFolder: WorkspaceFolder = {
          uri: 'adt://server/sap/bc/adt/packages/zmy_package',
          name: 'SAP ABAP Workspace',
        };

        const listener = jest.fn();
        service.onFileSystemEvent(listener);

        await service.emitFilesForWorkspace(virtualWorkspaceFolder);

        expect(mockDirectoryWalker.findFilesForDirectory).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith(VirtualFileSystemEvents.WorkspaceFilesEvent, {
          files: [],
          workspaceFolder: virtualWorkspaceFolder,
        });
      });

      it('skips directory walking for semanticfs:// URIs and emits empty files event', async () => {
        const virtualWorkspaceFolder: WorkspaceFolder = {
          uri: 'semanticfs://host/path/to/workspace',
          name: 'Semantic FS Workspace',
        };

        const listener = jest.fn();
        service.onFileSystemEvent(listener);

        await service.emitFilesForWorkspace(virtualWorkspaceFolder);

        expect(mockDirectoryWalker.findFilesForDirectory).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith(VirtualFileSystemEvents.WorkspaceFilesEvent, {
          files: [],
          workspaceFolder: virtualWorkspaceFolder,
        });
      });
    });
  });

  describe('onFileSystemEvent', () => {
    it('should add a listener and return a disposable', () => {
      const listener = jest.fn();
      const disposable = service.onFileSystemEvent(listener);

      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
    });
  });
});
