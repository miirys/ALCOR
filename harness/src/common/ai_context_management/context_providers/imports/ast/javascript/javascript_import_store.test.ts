import path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { FileChangeType } from 'vscode-languageserver';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RepositoryService } from '@gitlab-org/repositories';
import { fsPathToUri } from '@gitlab-org/fs';
import { Repository } from '../../../../../services/git/repository';
import { DefaultJavascriptImportStore } from './javascript_import_store';

jest.mock('../../../../../services/git/repository_service');
jest.mock('@gitlab-org/config');

describe('JavascriptImportStore', () => {
  let store: DefaultJavascriptImportStore;
  let mockRepositoryService: RepositoryService;
  let mockWorkspaceFolder: WorkspaceFolder;
  let mockRepository: Repository;
  let fileChangeCallback: (event: {
    fileEvent: { type: FileChangeType; uri: string };
    workspaceFolder: WorkspaceFolder;
  }) => void;

  const WORKSPACE_PATH = '/workspace';
  const ANOTHER_WORKSPACE_PATH = '/another-workspace';

  beforeEach(() => {
    mockWorkspaceFolder = {
      uri: fsPathToUri(WORKSPACE_PATH).toString(),
      name: 'workspace',
    };

    mockRepository = createFakePartial<Repository>({
      getFiles: jest.fn().mockReturnValue([]),
    });

    mockRepositoryService = createFakePartial<RepositoryService>({
      onFileChange: jest.fn((cb) => {
        fileChangeCallback = cb;
        return { dispose: jest.fn() };
      }),
      onWorkspaceRepositoriesStart: jest.fn((cb) => {
        cb(mockWorkspaceFolder);
        return { dispose: jest.fn() };
      }),
      onWorkspaceRepositoriesFinished: jest.fn((cb) => {
        cb(mockWorkspaceFolder);
        return { dispose: jest.fn() };
      }),
      getRepositoriesForWorkspace: jest.fn().mockResolvedValue([mockRepository]),
    });

    store = new DefaultJavascriptImportStore(mockRepositoryService);
  });

  const createFileEvent = (fileName: string, type: FileChangeType = FileChangeType.Created) => ({
    fileEvent: {
      type,
      uri: fsPathToUri(path.join(WORKSPACE_PATH, fileName)).toString(),
    },
    workspaceFolder: mockWorkspaceFolder,
  });

  describe('initialization', () => {
    it('should set up file system listeners', () => {
      expect(mockRepositoryService.onFileChange).toHaveBeenCalled();
      expect(mockRepositoryService.onWorkspaceRepositoriesStart).toHaveBeenCalled();
      expect(mockRepositoryService.onWorkspaceRepositoriesFinished).toHaveBeenCalled();
    });
  });

  describe('file change handling', () => {
    let onFileChange: jest.Mock;

    beforeEach(() => {
      onFileChange = jest.mocked(mockRepositoryService.onFileChange);
      const [[callback]] = onFileChange.mock.calls;
      fileChangeCallback = callback;

      const onWorkspaceRepositoriesSet = jest.mocked(
        mockRepositoryService.onWorkspaceRepositoriesFinished,
      );
      const [repoCallback] = onWorkspaceRepositoriesSet.mock.calls[0];
      repoCallback(mockWorkspaceFolder);
    });

    it('should handle file creation events', () => {
      fileChangeCallback(createFileEvent('newfile.ts'));

      expect(store.getFile(path.join(WORKSPACE_PATH, 'newfile'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'newfile.ts'),
      );
      expect(store.getFile(path.join(WORKSPACE_PATH, 'newfile.ts'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'newfile.ts'),
      );
    });

    it('should handle file deletion events', () => {
      fileChangeCallback(createFileEvent('newfile.ts'));

      fileChangeCallback(createFileEvent('newfile.ts', FileChangeType.Deleted));

      expect(store.getFile(path.join(WORKSPACE_PATH, 'newfile'), mockWorkspaceFolder)).toBeNull();
      expect(
        store.getFile(path.join(WORKSPACE_PATH, 'newfile.ts'), mockWorkspaceFolder),
      ).toBeNull();
    });

    it('should handle file change events', () => {
      fileChangeCallback(createFileEvent('changedfile.ts', FileChangeType.Changed));

      expect(store.getFile(path.join(WORKSPACE_PATH, 'changedfile'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'changedfile.ts'),
      );
      expect(store.getFile(path.join(WORKSPACE_PATH, 'changedfile.ts'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'changedfile.ts'),
      );
    });

    it('should ignore untracked file extensions', () => {
      fileChangeCallback(createFileEvent('file.txt'));

      expect(store.getFile(path.join(WORKSPACE_PATH, 'file.txt'), mockWorkspaceFolder)).toBeNull();
    });
  });

  describe('getFile', () => {
    beforeEach(() => {
      fileChangeCallback(createFileEvent('file.ts'));
      fileChangeCallback(createFileEvent('file.js'));
      fileChangeCallback(createFileEvent('file.vue'));
    });

    it('should return file path for TypeScript/JavaScript files with or without extension', () => {
      expect(store.getFile(path.join(WORKSPACE_PATH, 'file'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'file.js'),
      );
      expect(store.getFile(path.join(WORKSPACE_PATH, 'file.ts'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'file.ts'),
      );
      expect(store.getFile(path.join(WORKSPACE_PATH, 'file.js'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'file.js'),
      );
    });

    it('should return file path for non-strippable extensions only with extension', () => {
      expect(store.getFile(path.join(WORKSPACE_PATH, 'file.vue'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'file.vue'),
      );
      expect(store.getFile(path.join(WORKSPACE_PATH, 'file'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'file.js'),
      );
    });

    it('should return null for non-existent files', () => {
      expect(
        store.getFile(path.join(WORKSPACE_PATH, 'nonexistent.ts'), mockWorkspaceFolder),
      ).toBeNull();
    });

    it('should handle different workspaces separately', () => {
      const anotherWorkspace: WorkspaceFolder = {
        uri: fsPathToUri(ANOTHER_WORKSPACE_PATH).toString(),
        name: 'another-workspace',
      };

      const onFileChange = jest.mocked(mockRepositoryService.onFileChange);
      onFileChange.mock.calls[0][0](createFileEvent('file.ts'));

      const onWorkspaceRepositoriesSet = jest.mocked(
        mockRepositoryService.onWorkspaceRepositoriesFinished,
      );
      onWorkspaceRepositoriesSet.mock.calls[0][0](anotherWorkspace);

      expect(store.getFile(path.join(WORKSPACE_PATH, 'file.ts'), mockWorkspaceFolder)).toBe(
        path.join(WORKSPACE_PATH, 'file.ts'),
      );
      expect(store.getFile(path.join(WORKSPACE_PATH, 'file.ts'), anotherWorkspace)).toBeNull();
    });
  });

  describe('module resolution cache', () => {
    const importPath = '@scope/package';
    const moduleUri = fsPathToUri(
      path.join(WORKSPACE_PATH, 'node_modules', '@scope/package/index.js'),
    );

    it('should return null for uncached module paths', () => {
      expect(store.getResolvedModule(mockWorkspaceFolder.uri, importPath)).toBeNull();
    });

    it('should cache and retrieve resolved module paths', () => {
      store.setResolvedModule(mockWorkspaceFolder.uri, importPath, moduleUri);
      expect(store.getResolvedModule(mockWorkspaceFolder.uri, importPath)).toBe(moduleUri);
    });

    it('should handle different workspaces separately', () => {
      const anotherWorkspace: WorkspaceFolder = {
        uri: fsPathToUri(ANOTHER_WORKSPACE_PATH).toString(),
        name: 'another-workspace',
      };

      store.setResolvedModule(mockWorkspaceFolder.uri, importPath, moduleUri);
      expect(store.getResolvedModule(anotherWorkspace.uri, importPath)).toBeNull();
    });

    it('should clear module cache when workspace repositories start', () => {
      store.setResolvedModule(mockWorkspaceFolder.uri, importPath, moduleUri);

      const onWorkspaceRepositoriesStart = jest.mocked(
        mockRepositoryService.onWorkspaceRepositoriesStart,
      );
      const [callback] = onWorkspaceRepositoriesStart.mock.calls[0];
      callback(mockWorkspaceFolder);

      expect(store.getResolvedModule(mockWorkspaceFolder.uri, importPath)).toBeNull();
    });

    it('should remove cached module when its file is deleted', () => {
      store.setResolvedModule(mockWorkspaceFolder.uri, importPath, moduleUri);

      fileChangeCallback({
        fileEvent: {
          type: FileChangeType.Deleted,
          uri: moduleUri.toString(),
        },
        workspaceFolder: mockWorkspaceFolder,
      });

      expect(store.getResolvedModule(mockWorkspaceFolder.uri, importPath)).toBeNull();
    });
  });
});
