import * as path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import * as isomorphicGit from 'isomorphic-git';
import { LsFetch } from '@gitlab-org/fetch';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLsFiles } from '@gitlab-org/repositories';
import { FsClient } from '../fs/fs';
import { createMockFsClient } from '../fs/fs.test_utils';
import { getRemoteRepositoryInfo } from './git_remote_repository_info';
import { Repository } from './repository';

jest.mock('./git_remote_repository_info');
jest.mock('isomorphic-git');
jest.mock('@gitlab-org/repositories');
jest.useFakeTimers();

describe('Repository', () => {
  let repository: Repository;
  let workspaceFolder: WorkspaceFolder;
  let repoUri: URI;
  let configFileUri: URI;
  let mockFsClient: FsClient;
  let mockLsFetch: LsFetch;
  let mockGitLsFiles: GitLsFiles;
  let unsupportedDircacheError: Error & { code: string };

  beforeEach(() => {
    unsupportedDircacheError = new Error('Unsupported dircache version: 3') as Error & {
      code: string;
    };
    unsupportedDircacheError.code = 'InternalError';

    mockFsClient = createMockFsClient();
    mockLsFetch = createFakePartial<LsFetch>({});
    mockGitLsFiles = createFakePartial<GitLsFiles>({
      execute: jest.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
    });
    workspaceFolder = { uri: 'file:///workspace', name: 'workspace' };
    repoUri = URI.parse('file:///workspace/project/');
    configFileUri = URI.parse('file:///workspace/project/.git/config');

    repository = new Repository({
      workspaceFolder,
      uri: repoUri,
      configFileUri,
      fsClient: mockFsClient,
      lsFetch: mockLsFetch,
      gitLsFiles: mockGitLsFiles,
    });

    jest.mocked(isomorphicGit.listFiles).mockResolvedValue([]);
    jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(repository.workspaceFolder).toBe(workspaceFolder);
      expect(repository.uri).toBe(repoUri);
      expect(repository.configFileUri).toBe(configFileUri);
      expect(repository.gitDirUri.toString()).toBe('file:///workspace/project/.git');
    });
  });

  describe('isFileIgnored', () => {
    it('should return false when no GitIgnoreManager is set', () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      expect(repository.isFileIgnored(fileUri)).toBe(false);
    });

    it('should use GitIgnoreManager when set', async () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('*.txt');

      await repository.setupGitForRepository([gitIgnoreUri, fileUri]);

      expect(repository.isFileIgnored(fileUri)).toBe(true);
    });
    it('should return false for tracked files', async () => {
      const trackedFile = URI.parse('file:///workspace/project/src/index.ts');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('*.ts');
      jest.mocked(isomorphicGit.listFiles).mockResolvedValue(['src/index.ts']);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest.mocked(mockGitLsFiles.execute).mockResolvedValue(['src/index.ts']);

      await repository.setupGitForRepository([gitIgnoreUri, trackedFile]);

      expect(repository.isFileIgnored(trackedFile)).toBe(false);
    });

    it('should return true for ignored files that are not tracked', async () => {
      const ignoredFile = URI.parse('file:///workspace/project/ignored.ts');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('*.ts');
      jest.mocked(isomorphicGit.listFiles).mockResolvedValue([]);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest.mocked(mockGitLsFiles.execute).mockResolvedValue([]);

      await repository.setupGitForRepository([gitIgnoreUri, ignoredFile]);

      expect(repository.isFileIgnored(ignoredFile)).toBe(true);
    });
  });

  describe('dirUri', () => {
    it('should return the directory URI for a file URI', () => {
      const fileUri = URI.parse('file:///workspace/project/src/index.ts');
      const directoryUri = Repository.dirUri(fileUri);
      expect(directoryUri.toString()).toBe('file:///workspace/project/src');
    });
  });

  describe('setFile', () => {
    it('should add non-ignored file', () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      repository.setFile(fileUri);
      const file = repository.getFile(fileUri);
      expect(file).toBeDefined();
      expect(file?.isIgnored).toBe(false);
    });

    it('should add ignored file', async () => {
      const fileUri = URI.parse('file:///workspace/project/ignored.txt');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('ignored.txt');

      await repository.setupGitForRepository([gitIgnoreUri, fileUri]);
      repository.setFile(fileUri);

      const file = repository.getFile(fileUri);
      expect(file).toBeDefined();
      expect(file?.isIgnored).toBe(true);
    });
  });

  describe('setDirectory', () => {
    it('should add directory', () => {
      const directoryUri = URI.parse('file:///workspace/project/src');
      repository.setDirectory(directoryUri);
      const directory = repository.getDirectory(directoryUri);
      expect(directory).toBeDefined();
    });

    it('should add directory with ignored files', () => {
      const directoryUri = URI.parse('file:///workspace/project/src');
      repository.setDirectory(directoryUri);
      const directory = repository.getDirectory(directoryUri);
      expect(directory).toBeDefined();
    });
  });

  describe('getFile', () => {
    it('should return undefined for non-existent file', () => {
      expect(repository.getFile(URI.parse('file:///non-existent.txt'))).toBeUndefined();
    });

    it('should return file data for existing file', () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      repository.setFile(fileUri);
      const file = repository.getFile(fileUri);
      expect(file).toBeDefined();
      expect(file?.uri).toBe(fileUri);
    });

    it('should return file when no options are specified', () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      repository.setFile(fileUri);
      const file = repository.getFile(fileUri);
      expect(file).toBeDefined();
      expect(file?.uri).toBe(fileUri);
    });

    it('should not return ignored file when excludeIgnored is true', async () => {
      const fileUri = URI.parse('file:///workspace/project/ignored.txt');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('ignored.txt');

      await repository.setupGitForRepository([gitIgnoreUri, fileUri]);
      repository.setFile(fileUri);

      const file = repository.getFile(fileUri, { excludeIgnored: true });
      expect(file).toBeUndefined();
    });

    it('should not return file in .git folder when excludeGitFolder is true', () => {
      const fileUri = URI.parse('file:///workspace/project/.git/config');
      repository.setFile(fileUri);
      const file = repository.getFile(fileUri, { excludeGitFolder: true });
      expect(file).toBeUndefined();
    });
  });

  describe('removeFile', () => {
    it('should remove existing file', () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      repository.setFile(fileUri);
      repository.removeFile(fileUri);
      expect(repository.getFile(fileUri)).toBeUndefined();
    });
  });

  describe('getFiles', () => {
    it('should return all files', () => {
      const file1 = URI.parse('file:///workspace/project/file1.txt');
      const file2 = URI.parse('file:///workspace/project/file2.txt');
      repository.setFile(file1);
      repository.setFile(file2);
      const files = repository.getCurrentTreeFiles();
      expect(files.length).toBe(2);
      expect(files.some((f) => f.uri === file1)).toBe(true);
      expect(files.some((f) => f.uri === file2)).toBe(true);
    });

    it('should return all files when no options are specified', () => {
      const file1 = URI.parse('file:///workspace/project/file1.txt');
      const file2 = URI.parse('file:///workspace/project/file2.txt');
      repository.setFile(file1);
      repository.setFile(file2);
      const files = repository.getCurrentTreeFiles();
      expect(files.length).toBe(2);
      expect(files.some((f) => f.uri === file1)).toBe(true);
      expect(files.some((f) => f.uri === file2)).toBe(true);
    });

    it('should not return ignored files when excludeIgnored is true', async () => {
      const file1 = URI.parse('file:///workspace/project/file.txt');
      const file2 = URI.parse('file:///workspace/project/ignored.txt');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('ignored.txt');

      await repository.setupGitForRepository([gitIgnoreUri, file1, file2]);
      repository.setFile(file1);
      repository.setFile(file2);

      const files = repository.getCurrentTreeFiles({ excludeIgnored: true });
      expect(files.length).toBe(1);
      expect(files[0].uri).toBe(file1);
    });

    it('should not return files in .git folder when excludeGitFolder is true', () => {
      const file1 = URI.parse('file:///workspace/project/file.txt');
      const file2 = URI.parse('file:///workspace/project/.git/config');
      repository.setFile(file1);
      repository.setFile(file2);
      const files = repository.getCurrentTreeFiles({ excludeGitFolder: true });
      expect(files.length).toBe(1);
      expect(files[0].uri).toBe(file1);
    });

    it('should apply both excludeIgnored and excludeGitFolder options', async () => {
      const file1 = URI.parse('file:///workspace/project/file.txt');
      const file2 = URI.parse('file:///workspace/project/ignored.txt');
      const file3 = URI.parse('file:///workspace/project/.git/config');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('ignored.txt');

      await repository.setupGitForRepository([gitIgnoreUri, file1, file2, file3]);
      repository.setFile(file1);
      repository.setFile(file2);
      repository.setFile(file3);

      const files = repository.getCurrentTreeFiles({
        excludeIgnored: true,
        excludeGitFolder: true,
      });
      expect(files.length).toBe(1);
      expect(files[0].uri).toBe(file1);
    });

    it('should return all files that match a given glob', () => {
      const file1 = URI.parse('file:///workspace/project/tests/file1.test.ts');
      const file2 = URI.parse('file:///workspace/project/file2.txt');
      repository.setFile(file1);
      repository.setFile(file2);
      const files = repository.getCurrentTreeFiles({ glob: '**/*.ts' });
      expect(files.length).toBe(1);
      expect(files.some((f) => f.uri === file1)).toBe(true);
      expect(files.some((f) => f.uri === file2)).toBe(false);
    });
  });

  describe('getMainBranch', () => {
    it('should return branch name from ref file when available', async () => {
      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'origin', url: 'https://gitlab.com/foo/bar.git' }]);
      (mockFsClient.promises.readFile as jest.Mock).mockResolvedValue(
        Buffer.from('ref: refs/remotes/origin/main'),
      );

      const result = await repository.getMainBranch();
      expect(result).toBe('main');
      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(
        path.join(repository.uri.fsPath, '.git', 'refs', 'remotes', 'origin', 'HEAD'),
      );
    });

    it('should fallback to remote repository info when ref file is not available', async () => {
      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'origin', url: 'https://gitlab.com/foo/bar.git' }]);
      (mockFsClient.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      jest
        .mocked(getRemoteRepositoryInfo)
        .mockResolvedValue({ HEAD: 'refs/head/main', refs: {}, capabilities: [] });

      const result = await repository.getMainBranch();
      expect(result).toBe('main');
    });

    it('should use first remote if origin is not available', async () => {
      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'upstream', url: 'https://gitlab.com/foo/bar.git' }]);
      (mockFsClient.promises.readFile as jest.Mock).mockResolvedValue(
        Buffer.from('ref: refs/remotes/upstream/trunk'),
      );

      const result = await repository.getMainBranch();
      expect(result).toBe('trunk');
    });

    it('should fallback to local branches check when remote info fails', async () => {
      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'origin', url: 'https://gitlab.com/foo/bar.git' }]);
      (mockFsClient.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      jest.mocked(getRemoteRepositoryInfo).mockRejectedValue(new Error('Network error'));
      jest.mocked(isomorphicGit.listBranches).mockResolvedValue(['main', 'feature/foo']);

      const result = await repository.getMainBranch();
      expect(result).toBe('main');
    });

    it('should try alternative main branch names in order', async () => {
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest
        .mocked(isomorphicGit.listBranches)
        .mockResolvedValue(['develop', 'master', 'feature/test']);

      const result = await repository.getMainBranch();
      expect(result).toBe('master');
    });

    it('should return "main" as default when all methods fail', async () => {
      jest.mocked(isomorphicGit.listRemotes).mockRejectedValue(new Error('Git error'));
      jest.mocked(isomorphicGit.listBranches).mockRejectedValue(new Error('Git error'));

      const result = await repository.getMainBranch();
      expect(result).toBe('main');
    });

    it('should handle empty remotes list', async () => {
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest.mocked(isomorphicGit.listBranches).mockResolvedValue(['master', 'feature/foo']);

      const result = await repository.getMainBranch();
      expect(result).toBe('master');
    });

    it('should prefer "main" over "master" in local branches check', async () => {
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest.mocked(isomorphicGit.listBranches).mockResolvedValue(['main', 'master', 'feature/foo']);

      const result = await repository.getMainBranch();
      expect(result).toBe('main');
    });

    it('should handle remote info returning undefined HEAD', async () => {
      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'origin', url: 'https://gitlab.com/foo/bar.git' }]);
      (mockFsClient.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      jest
        .mocked(getRemoteRepositoryInfo)
        .mockResolvedValue({ HEAD: undefined, refs: {}, capabilities: [] });
      jest.mocked(isomorphicGit.listBranches).mockResolvedValue(['master', 'feature/foo']);

      const result = await repository.getMainBranch();
      expect(result).toBe('master');
    });
  });

  describe('dispose', () => {
    it('should clear files', async () => {
      const fileUri = URI.parse('file:///workspace/project/file.txt');
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');

      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('');

      await repository.setupGitForRepository([gitIgnoreUri, fileUri]);
      repository.setFile(fileUri);

      repository.dispose();
      expect(repository.getCurrentTreeFiles().length).toBe(0);
    });
  });

  describe('static methods', () => {
    describe('repoUriRootFolder', () => {
      it('should return the root folder of the repository', () => {
        const testUri = URI.parse('file:///workspace/project/.git');
        const rootFolder = Repository.getRepoRootFromGitConfig(testUri);
        expect(rootFolder.toString()).toBe('file:///workspace');
      });
    });

    describe('repoFolderToUri', () => {
      it('should return the config file URI', () => {
        const testUri = URI.parse('file:///workspace/project/');
        const configUri = Repository.getRepoGitConfigFile(testUri);
        expect(configUri.toString()).toBe('file:///workspace/project/.git/config');
      });
    });

    describe('getGitConfigFiles', () => {
      it('should filter git config files', () => {
        const files = [
          URI.parse('file:///workspace/project/.git/config'),
          URI.parse('file:///workspace/project/file.txt'),
          URI.parse('file:///workspace/other/.git/config'),
        ];
        const configFiles = Repository.getGitConfigFiles(files);
        expect(configFiles.length).toBe(2);
        expect(configFiles[0].toString()).toBe('file:///workspace/project/.git/config');
        expect(configFiles[1].toString()).toBe('file:///workspace/other/.git/config');
      });
    });

    describe('isGitIgnoreFile', () => {
      it('should identify .gitignore files', () => {
        expect(Repository.isGitIgnoreFile(URI.parse('file:///workspace/.gitignore'))).toBe(true);
        expect(Repository.isGitIgnoreFile(URI.parse('file:///workspace/file.txt'))).toBe(false);
      });
    });

    describe('isGitConfigFile', () => {
      it('should identify git config files', () => {
        expect(Repository.isGitConfigFile(URI.parse('file:///workspace/.git/config'))).toBe(true);
        expect(Repository.isGitConfigFile(URI.parse('file:///workspace/config'))).toBe(false);
      });
    });

    describe('isInGitFolder', () => {
      it('should identify files in .git folder', () => {
        expect(Repository.isInGitFolder(URI.parse('file:///workspace/.git/objects/abc'))).toBe(
          true,
        );
        expect(Repository.isInGitFolder(URI.parse('file:///workspace/project/file.txt'))).toBe(
          false,
        );
      });
    });

    describe('isGitExcludeFile', () => {
      it('should identify git exclude files', () => {
        expect(Repository.isGitExcludeFile(URI.parse('file:///workspace/.git/info/exclude'))).toBe(
          true,
        );
        expect(Repository.isGitExcludeFile(URI.parse('file:///workspace/.gitignore'))).toBe(false);
      });
    });
  });

  describe('setupGitForRepository', () => {
    it('should set up GitIgnoreManager and tracked files', async () => {
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');
      const gitExcludeUri = URI.parse('file:///workspace/project/.git/info/exclude');
      const trackedFile1 = URI.parse('file:///workspace/project/src/index.ts');
      const trackedFile2 = URI.parse('file:///workspace/project/package.json');
      const files = [gitIgnoreUri, gitExcludeUri, trackedFile1, trackedFile2];

      jest.mocked(mockFsClient.promises.readFile).mockImplementation((filePath) => {
        if (filePath === gitIgnoreUri.fsPath) {
          return Promise.resolve('*.log');
        }
        if (filePath === gitExcludeUri.fsPath) {
          return Promise.resolve('*.tmp');
        }
        return Promise.resolve('');
      });

      jest.mocked(isomorphicGit.listFiles).mockResolvedValue(['src/index.ts', 'package.json']);
      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest.mocked(mockGitLsFiles.execute).mockResolvedValue(['src/index.ts', 'package.json']);

      const result = await repository.setupGitForRepository(files);

      expect(result).not.toBeInstanceOf(Error);
      if (!(result instanceof Error)) {
        expect(result.ignoreFiles.size).toBe(1);
        expect(result.ignoreFiles.get(gitIgnoreUri)).toBe('*.log');
        expect(result.excludeFile).toBe(gitExcludeUri);
        expect(result.trackedFiles.size).toBe(2);
        expect(result.trackedFiles.has(trackedFile1.toString())).toBe(true);
        expect(result.trackedFiles.has(trackedFile2.toString())).toBe(true);
      }

      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(gitIgnoreUri.fsPath);
      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(gitExcludeUri.fsPath);
      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        repository.uri.fsPath,
        repository.uri.toString(),
        '',
        repository.gitDirUri.fsPath,
      );
    });

    it('should handle errors from git ls-files', async () => {
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');
      const files = [gitIgnoreUri];

      jest.mocked(mockFsClient.promises.readFile).mockImplementation((filePath) => {
        if (filePath === gitIgnoreUri.fsPath) {
          return Promise.resolve('*.log');
        }
        return Promise.resolve('');
      });

      jest.mocked(mockGitLsFiles.execute).mockRejectedValue(new Error('Git command failed'));

      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'origin', url: 'https://gitlab.com/foo/bar.git' }]);

      const result = await repository.setupGitForRepository(files);

      expect(result).not.toBeInstanceOf(Error);
      if (!(result instanceof Error)) {
        expect(result.trackedFiles.size).toBe(0);
      }

      expect(mockGitLsFiles.execute).toHaveBeenCalled();
    });

    it('should return empty tracked files when git ls-files returns no files', async () => {
      const gitIgnoreUri = URI.parse('file:///workspace/project/.gitignore');
      const files = [gitIgnoreUri];

      jest.mocked(mockFsClient.promises.readFile).mockImplementation((filePath) => {
        if (filePath === gitIgnoreUri.fsPath) {
          return Promise.resolve('*.log');
        }
        return Promise.resolve('');
      });

      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);
      jest.mocked(mockGitLsFiles.execute).mockResolvedValue([]);

      const result = await repository.setupGitForRepository(files);

      expect(result).not.toBeInstanceOf(Error);
      if (!(result instanceof Error)) {
        expect(result.trackedFiles.size).toBe(0);
      }

      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        repository.uri.fsPath,
        repository.uri.toString(),
        '',
        repository.gitDirUri.fsPath,
      );
    });
  });

  describe('refreshTrackedFiles', () => {
    it('should update tracked files', async () => {
      const file1 = URI.parse('file:///workspace/project/src/index.ts');
      const file2 = URI.parse('file:///workspace/project/package.json');

      jest.mocked(mockGitLsFiles.execute).mockResolvedValue(['src/index.ts', 'package.json']);

      const refreshPromise = repository.refreshTrackedFiles();

      await jest.runAllTimersAsync();

      await refreshPromise;

      expect(repository.getCurrentTrackedFiles()).toEqual([file1.toString(), file2.toString()]);
    });

    it('should use remote URL when available', async () => {
      const file1 = URI.parse('file:///workspace/project/src/index.ts');
      const file2 = URI.parse('file:///workspace/project/package.json');

      jest.mocked(mockGitLsFiles.execute).mockResolvedValue(['src/index.ts', 'package.json']);

      jest
        .mocked(isomorphicGit.listRemotes)
        .mockResolvedValue([{ remote: 'origin', url: 'https://gitlab.com/foo/bar.git' }]);

      const refreshPromise = repository.refreshTrackedFiles();

      await jest.runAllTimersAsync();

      await refreshPromise;

      expect(repository.getCurrentTrackedFiles()).toEqual([file1.toString(), file2.toString()]);
      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        repository.uri.fsPath,
        'https://gitlab.com/foo/bar.git',
        '',
        repository.gitDirUri.fsPath,
      );
    });

    it('should handle fallback to repository URI when no remotes are available', async () => {
      const file1 = URI.parse('file:///workspace/project/src/index.ts');

      // Override the mock to simulate success
      jest.mocked(mockGitLsFiles.execute).mockResolvedValue(['src/index.ts']);

      jest.mocked(isomorphicGit.listRemotes).mockResolvedValue([]);

      const refreshPromise = repository.refreshTrackedFiles();

      await jest.runAllTimersAsync();

      await refreshPromise;

      expect(repository.getCurrentTrackedFiles()).toEqual([file1.toString()]);
      expect(mockGitLsFiles.execute).toHaveBeenCalledWith(
        repository.uri.fsPath,
        repository.uri.toString(),
        '',
        repository.gitDirUri.fsPath,
      );
    });
  });

  describe('removeFilesUnderDirectory', () => {
    it('should remove files under the specified directory', () => {
      const dirUri = URI.parse('file:///workspace/project/src/');
      const file1 = URI.parse('file:///workspace/project/src/file1.ts');
      const file2 = URI.parse('file:///workspace/project/src/nested/file2.ts');
      const file3 = URI.parse('file:///workspace/project/other/file3.ts');

      repository.setFile(file1);
      repository.setFile(file2);
      repository.setFile(file3);

      const removedFiles = repository.removeFilesUnderDirectory(dirUri);

      expect(removedFiles.length).toBe(2);
      expect(removedFiles.some((f) => f.uri.toString() === file1.toString())).toBe(true);
      expect(removedFiles.some((f) => f.uri.toString() === file2.toString())).toBe(true);

      expect(repository.getFile(file1)).toBeUndefined();
      expect(repository.getFile(file2)).toBeUndefined();
      expect(repository.getFile(file3)).toBeDefined();
      expect(repository.getDirectory(dirUri)).toBeUndefined();
    });

    it('should not remove files outside the specified directory', () => {
      const dirUri = URI.parse('file:///workspace/project/src/');
      const file1 = URI.parse('file:///workspace/project/src/file1.ts');
      const file2 = URI.parse('file:///workspace/project/other/file2.ts');

      repository.setFile(file1);
      repository.setFile(file2);

      const removedFiles = repository.removeFilesUnderDirectory(dirUri);

      expect(removedFiles.length).toBe(1);
      expect(removedFiles[0].uri.toString()).toBe(file1.toString());

      expect(repository.getFile(file1)).toBeUndefined();
      expect(repository.getFile(file2)).toBeDefined();
    });

    it('should return an empty array if no files are removed', () => {
      const dirUri = URI.parse('file:///workspace/project/src/');
      const file1 = URI.parse('file:///workspace/project/other/file1.ts');

      repository.setFile(file1);

      const removedFiles = repository.removeFilesUnderDirectory(dirUri);

      expect(removedFiles.length).toBe(0);
      expect(repository.getFile(file1)).toBeDefined();
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name when available', async () => {
      jest.mocked(isomorphicGit.currentBranch).mockResolvedValue('feature/test');

      const result = await repository.getCurrentBranch();
      expect(result).toBe('feature/test');
    });

    it('should fallback to main branch when current branch is not available', async () => {
      jest.mocked(isomorphicGit.currentBranch).mockResolvedValue(undefined);
      jest.spyOn(repository, 'getMainBranch').mockResolvedValue('main');

      const result = await repository.getCurrentBranch();
      expect(result).toBe('main');
    });
  });

  describe('getTrackingBranchName', () => {
    it('should return tracking branch name when available', async () => {
      jest.mocked(isomorphicGit.currentBranch).mockResolvedValue('feature/test');
      jest.mocked(isomorphicGit.getConfig).mockResolvedValue('refs/heads/remote-branch');

      const result = await repository.getTrackingBranchName();

      expect(result).toBe('remote-branch');
    });

    it('should return current branch when no tracking branch is configured', async () => {
      jest.mocked(isomorphicGit.currentBranch).mockResolvedValue('feature/test');
      jest.mocked(isomorphicGit.getConfig).mockRejectedValue(new Error('Config not found'));

      const result = await repository.getTrackingBranchName();

      expect(result).toBe('feature/test');
    });

    it('should handle empty getConfig response', async () => {
      jest.mocked(isomorphicGit.currentBranch).mockResolvedValue('feature/test');
      jest.mocked(isomorphicGit.getConfig).mockResolvedValue(undefined);

      const result = await repository.getTrackingBranchName();

      expect(result).toBe('feature/test');
    });

    it('should return undefined when no current branch is available', async () => {
      jest.mocked(isomorphicGit.currentBranch).mockResolvedValue(undefined);

      const result = await repository.getTrackingBranchName();

      expect(result).toBeUndefined();
    });
  });

  describe('getHeadRef', () => {
    it('should return HEAD reference', async () => {
      jest.mocked(isomorphicGit.resolveRef).mockResolvedValue('abc123');

      const result = await repository.getHeadRef();
      expect(result).toBe('abc123');
      expect(isomorphicGit.resolveRef).toHaveBeenCalledWith({
        fs: mockFsClient,
        dir: repository.uri.fsPath,
        gitdir: repository.gitDirUri.fsPath,
        ref: 'HEAD',
      });
    });
  });

  describe('listBranches', () => {
    it('should return list of branches', async () => {
      jest
        .mocked(isomorphicGit.listBranches)
        .mockResolvedValue(['main', 'develop', 'feature/test']);

      const result = await repository.listBranches();
      expect(result).toEqual(['main', 'develop', 'feature/test']);
      expect(isomorphicGit.listBranches).toHaveBeenCalledWith({
        fs: mockFsClient,
        dir: repository.uri.fsPath,
        gitdir: repository.gitDirUri.fsPath,
      });
    });
  });
});
