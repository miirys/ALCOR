import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TestLogger } from '@gitlab-org/logging';
import { writeArchive, parse } from '@gitlab-org/test-utils';
import { StatelessRepositoryDiscoveryService } from './stateless_repository_discovery_service';
import { DefaultStatelessRepository } from './default_stateless_repository';
import { testGit } from './test_utils/test_git';

describe('StatelessRepositoryDiscoveryService Integration Tests', () => {
  let tempDir: string;
  let service: StatelessRepositoryDiscoveryService;
  let logger: TestLogger;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'stateless-repo-test-'));
    logger = new TestLogger();
    service = new StatelessRepositoryDiscoveryService(logger);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Silently skip cleanup errors
    }
  });

  describe('getRepositoriesForWorkspace', () => {
    it('should discover a single git repository', async () => {
      // Create a git repository
      const repoPath = path.join(tempDir, 'test-repo');
      await fs.mkdir(repoPath, { recursive: true });

      const git = await testGit(repoPath);

      // Create a test file and commit
      const testFilePath = path.join(repoPath, 'test.txt');
      await fs.writeFile(testFilePath, 'hello world');
      await git.add('test.txt');
      await git.commit('Initial commit');

      // Test discovery
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(1);
      expect(repositories[0]).toBeInstanceOf(DefaultStatelessRepository);
      expect(repositories[0].fsPath).toBe(repoPath);
    });

    it('should discover multiple git repositories in the same workspace', async () => {
      // Create two git repositories
      const repo1Path = path.join(tempDir, 'repo1');
      const repo2Path = path.join(tempDir, 'repo2');

      const setupPromises = [repo1Path, repo2Path].map(async (repoPath) => {
        await fs.mkdir(repoPath, { recursive: true });
        const git = await testGit(repoPath);

        const testFilePath = path.join(repoPath, 'test.txt');
        await fs.writeFile(testFilePath, 'hello world');
        await git.add('test.txt');
        await git.commit('Initial commit');
      });

      await Promise.all(setupPromises);

      // Test discovery
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(2);
      const repoPaths = repositories.map((r) => r.fsPath).sort();
      expect(repoPaths).toEqual([repo1Path, repo2Path]);
    });

    it('should return repositories sorted by fsPath', async () => {
      // NOTE: This test verifies explicit sorting behavior, however fs.readdir()
      // appears to already return directory entries in alphabetical order (at least on mac)
      // making the explicit sorting potentially redundant.

      // Create repositories with names that would be out of order if not sorted
      const zRepoPath = path.join(tempDir, 'z-repo');
      const aRepoPath = path.join(tempDir, 'a-repo');
      const mRepoPath = path.join(tempDir, 'm-repo');

      const setupPromises = [zRepoPath, aRepoPath, mRepoPath].map(async (repoPath) => {
        await fs.mkdir(repoPath, { recursive: true });
        await testGit(repoPath);
      });

      await Promise.all(setupPromises);

      // Test discovery
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(3);

      // Verify repositories are sorted by fsPath
      const actualPaths = repositories.map((r) => r.fsPath);
      const expectedSortedPaths = [aRepoPath, mRepoPath, zRepoPath];
      expect(actualPaths).toEqual(expectedSortedPaths);
    });

    it('should discover nested git repositories', async () => {
      // Create nested repository structure within depth limit
      const parentRepoPath = path.join(tempDir, 'parent-repo');
      const nestedRepoPath = path.join(parentRepoPath, 'child-repo');

      // Create parent repository
      await fs.mkdir(parentRepoPath, { recursive: true });
      let git = await testGit(parentRepoPath);

      const parentTestFile = path.join(parentRepoPath, 'parent.txt');
      await fs.writeFile(parentTestFile, 'parent content');
      await git.add('parent.txt');
      await git.commit('Parent initial commit');

      // Create nested repository at depth 2
      await fs.mkdir(nestedRepoPath, { recursive: true });
      git = await testGit(nestedRepoPath);

      const nestedTestFile = path.join(nestedRepoPath, 'nested.txt');
      await fs.writeFile(nestedTestFile, 'nested content');
      await git.add('nested.txt');
      await git.commit('Nested initial commit');

      // Test discovery
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(2);
      const repoPaths = repositories.map((r) => r.fsPath);
      expect(repoPaths).toContain(nestedRepoPath);
      expect(repoPaths).toContain(parentRepoPath);
    });

    it('should return empty array when no repositories are present', async () => {
      // Create some non-git directories
      await fs.mkdir(path.join(tempDir, 'not-a-repo'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'also-not-a-repo'), { recursive: true });

      // Create some files
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
      await fs.writeFile(path.join(tempDir, 'not-a-repo', 'file.txt'), 'content');

      // Test discovery
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(0);
    });

    it('should skip ignored directories during scanning', async () => {
      // Create a git repository
      const repoPath = path.join(tempDir, 'main-repo');
      await fs.mkdir(repoPath, { recursive: true });

      const git = await testGit(repoPath);

      const testFilePath = path.join(repoPath, 'test.txt');
      await fs.writeFile(testFilePath, 'hello world');
      await git.add('test.txt');
      await git.commit('Initial commit');

      // Create ignored directories with fake git repositories inside them
      const ignoredDirs = ['node_modules', '.vscode', '.idea', 'dist'];

      const createIgnoredDirPromises = ignoredDirs.map(async (ignoredDir) => {
        const ignoredDirPath = path.join(tempDir, ignoredDir);
        const fakeRepoPath = path.join(ignoredDirPath, 'fake-repo');
        await fs.mkdir(fakeRepoPath, { recursive: true });

        // Create a proper git repository
        const fakeGit = await testGit(fakeRepoPath);

        // Add a file and commit to make it a valid repo
        const fakeFile = path.join(fakeRepoPath, 'fake.txt');
        await fs.writeFile(fakeFile, 'fake content');
        await fakeGit.add('fake.txt');
        await fakeGit.commit('Fake commit');
      });

      await Promise.all(createIgnoredDirPromises);

      // Test discovery - should only find the main repo, not the ones in ignored dirs
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(1);
      expect(repositories[0].fsPath).toBe(repoPath);
    });

    it('should handle workspace with both git repos and non-git directories', async () => {
      // Create a git repository
      const repoPath = path.join(tempDir, 'git-repo');
      await fs.mkdir(repoPath, { recursive: true });

      const git = await testGit(repoPath);

      const testFilePath = path.join(repoPath, 'test.txt');
      await fs.writeFile(testFilePath, 'hello world');
      await git.add('test.txt');
      await git.commit('Initial commit');

      // Create non-git directories
      await fs.mkdir(path.join(tempDir, 'not-git-1'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'not-git-2'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });

      // Test discovery
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(1);
      expect(repositories[0].fsPath).toBe(repoPath);
    });

    it('should exclude folders with .git directory that are not valid repositories', async () => {
      // Create a folder with .git directory that is NOT a valid git repository
      const invalidRepoPath = path.join(tempDir, 'invalid-repo');
      const invalidGitPath = path.join(invalidRepoPath, '.git');
      await fs.mkdir(invalidGitPath, { recursive: true });

      // Create some files that look like git files but are invalid/incomplete
      await fs.writeFile(path.join(invalidGitPath, 'HEAD'), 'invalid head content');
      await fs.writeFile(path.join(invalidGitPath, 'config'), 'invalid config');

      // Add a regular file in the invalid repo folder
      await fs.writeFile(path.join(invalidRepoPath, 'file.txt'), 'some content');

      // Test discovery - should find no repositories
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(0);
    });

    it('should discover git worktrees where .git is a file', async () => {
      // Create main repository
      const mainRepoPath = path.join(tempDir, 'main-repo');
      await fs.mkdir(mainRepoPath, { recursive: true });

      const git = await testGit(mainRepoPath);
      await git.commit('Initial commit', '--allow-empty');

      // Create a worktree
      const worktreePath = path.join(tempDir, 'worktree');
      await git.raw(['worktree', 'add', worktreePath]);

      // Test discovery - should find both main repo and worktree
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(2);
      const repoPaths = repositories.map((r) => r.fsPath).sort();
      expect(repoPaths).toContain(mainRepoPath);
      expect(repoPaths).toContain(worktreePath);
    });

    it('should discover repositories at maximum depth (depth 2: a/b)', async () => {
      // Create nested repository at depth 2 (workspace/sub1/sub2)
      const repoPath = path.join(tempDir, 'sub1', 'sub2');
      await fs.mkdir(repoPath, { recursive: true });

      const git = await testGit(repoPath);
      await git.commit('Initial commit', '--allow-empty');

      // Test discovery - should find the repository at depth 2
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(1);
      expect(repositories[0].fsPath).toBe(repoPath);
    });

    it('should NOT discover repositories beyond maximum depth (depth 3: a/b/c)', async () => {
      // Create nested repository at depth 3 (workspace/sub1/sub2/sub3)
      const tooDeepRepoPath = path.join(tempDir, 'sub1', 'sub2', 'sub3');
      await fs.mkdir(tooDeepRepoPath, { recursive: true });

      const git = await testGit(tooDeepRepoPath);
      await git.commit('Initial commit', '--allow-empty');

      // Test discovery - should NOT find the repository at depth 3
      const repositories = await service.getRepositoriesForWorkspace(tempDir);

      expect(repositories).toHaveLength(0);
    });
  });

  describe('getMatchingRepository', () => {
    it('should find the repository containing a specific file', async () => {
      // Create a git repository
      const repoPath = path.join(tempDir, 'test-repo');
      await fs.mkdir(repoPath, { recursive: true });

      const git = await testGit(repoPath);

      // Create a test file
      const testFilePath = path.join(repoPath, 'src', 'main.js');
      await fs.mkdir(path.join(repoPath, 'src'), { recursive: true });
      await fs.writeFile(testFilePath, 'console.log("hello");');
      await git.add('.');
      await git.commit('Initial commit');

      // Test finding the repository for this file
      const repository = await service.getMatchingRepository(testFilePath, tempDir);

      expect(repository).toBeDefined();
      expect(repository!.fsPath).toBe(repoPath);
    });

    it('should return undefined for files not in any repository', async () => {
      // Create a git repository
      const repoPath = path.join(tempDir, 'test-repo');
      await fs.mkdir(repoPath, { recursive: true });

      const git = await testGit(repoPath);
      await git.commit('Initial commit', '--allow-empty');

      // Create a file outside the repository
      const outsideFilePath = path.join(tempDir, 'outside.txt');
      await fs.writeFile(outsideFilePath, 'outside content');

      // Test finding the repository for this file
      const repository = await service.getMatchingRepository(outsideFilePath, tempDir);

      expect(repository).toBeUndefined();
    });

    it('should find the correct repository when multiple repositories exist', async () => {
      // Create two git repositories
      const repo1Path = path.join(tempDir, 'repo1');
      const repo2Path = path.join(tempDir, 'repo2');

      const setupPromises = [repo1Path, repo2Path].map(async (repoPath) => {
        await fs.mkdir(repoPath, { recursive: true });
        const git = await testGit(repoPath);
        await git.commit('Initial commit', '--allow-empty');
      });

      await Promise.all(setupPromises);

      // Create files in each repository
      const file1Path = path.join(repo1Path, 'file1.txt');
      const file2Path = path.join(repo2Path, 'file2.txt');
      await fs.writeFile(file1Path, 'content 1');
      await fs.writeFile(file2Path, 'content 2');

      // Test finding repository for file in repo1
      const repository1 = await service.getMatchingRepository(file1Path, tempDir);
      expect(repository1).toBeDefined();
      expect(repository1!.fsPath).toBe(repo1Path);

      // Test finding repository for file in repo2
      const repository2 = await service.getMatchingRepository(file2Path, tempDir);
      expect(repository2).toBeDefined();
      expect(repository2!.fsPath).toBe(repo2Path);
    });

    it('should return the most specific (nested) repository when multiple repositories contain the file', async () => {
      // Create nested repository structure using txtar format
      const parentRepoPath = path.join(tempDir, 'parent-repo');

      await writeArchive(
        parentRepoPath,
        parse(`
-- parent.txt --
parent content
-- child-repo/nested.txt --
nested content
`),
      );

      // Initialize parent repository
      await testGit(parentRepoPath);

      // Initialize nested repository
      const nestedRepoPath = path.join(parentRepoPath, 'child-repo');
      await testGit(nestedRepoPath);

      // Test that file in nested repository returns the nested repository (most specific)
      const nestedTestFile = path.join(nestedRepoPath, 'nested.txt');
      const repository = await service.getMatchingRepository(nestedTestFile, tempDir);
      expect(repository).toBeDefined();
      expect(repository!.fsPath).toBe(nestedRepoPath);
    });
  });
});
