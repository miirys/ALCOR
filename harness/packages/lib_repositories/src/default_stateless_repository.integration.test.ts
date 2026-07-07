import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeArchive, parse } from '@gitlab-org/test-utils';
import { DefaultStatelessRepository } from './default_stateless_repository';
import { testGit } from './test_utils/test_git';

describe('DefaultStatelessRepository Integration Tests', () => {
  let tempDir: string;
  let repository: DefaultStatelessRepository;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'default-stateless-repo-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Silently skip cleanup errors
    }
  });

  describe('listRemotes', () => {
    it('should return empty array for repository with no remotes', async () => {
      // Create a git repository without remotes
      const git = await testGit(tempDir);
      await git.commit('Initial commit', '--allow-empty');

      repository = new DefaultStatelessRepository(tempDir);

      const remotes = await repository.listRemotes();
      expect(remotes).toEqual([]);
    });

    it('should return single remote for repository with origin', async () => {
      // Create a git repository with origin remote
      const git = await testGit(tempDir);
      await git.addRemote('origin', 'https://gitlab.example.com/test/repo.git');
      await git.commit('Initial commit', '--allow-empty');

      repository = new DefaultStatelessRepository(tempDir);

      const remotes = await repository.listRemotes();
      expect(remotes).toHaveLength(1);
      expect(remotes[0]).toEqual({
        remote: 'origin',
        url: 'https://gitlab.example.com/test/repo.git',
      });
    });

    it('should return multiple remotes for repository with multiple remotes', async () => {
      // Create a git repository with multiple remotes
      const git = await testGit(tempDir);
      await git.addRemote('origin', 'https://gitlab.example.com/test/repo.git');
      await git.addRemote('upstream', 'https://gitlab.example.com/upstream/repo.git');

      repository = new DefaultStatelessRepository(tempDir);

      const remotes = await repository.listRemotes();
      expect(remotes).toHaveLength(2);

      const remoteNames = remotes.map((r) => r.remote).sort();
      expect(remoteNames).toEqual(['origin', 'upstream']);

      const originRemote = remotes.find((r) => r.remote === 'origin');
      const upstreamRemote = remotes.find((r) => r.remote === 'upstream');

      expect(originRemote?.url).toBe('https://gitlab.example.com/test/repo.git');
      expect(upstreamRemote?.url).toBe('https://gitlab.example.com/upstream/repo.git');
    });

    it('should handle remotes with different fetch and push URLs', async () => {
      // Create a git repository with remotes having different fetch/push URLs
      const git = await testGit(tempDir);
      await git.addRemote('origin', 'git@gitlab.example.com:test/repo.git');
      // Set different push URL
      await git.raw([
        'remote',
        'set-url',
        '--push',
        'origin',
        'https://gitlab.example.com/test/repo.git',
      ]);

      repository = new DefaultStatelessRepository(tempDir);

      const remotes = await repository.listRemotes();
      expect(remotes).toHaveLength(1);
      expect(remotes[0].remote).toBe('origin');
      // Should prefer fetch URL over push URL
      expect(remotes[0].url).toBe('git@gitlab.example.com:test/repo.git');
    });

    it('should throw error for non-git directory', async () => {
      // Create a non-git directory
      repository = new DefaultStatelessRepository(tempDir);

      await expect(repository.listRemotes()).rejects.toThrow('Failed to list remotes');
    });
  });

  describe('getCurrentCommit', () => {
    it('should return commit hash for repository with multiple commits', async () => {
      // Create a git repository with multiple commits
      const git = await testGit(tempDir);

      // Create first commit
      const testFile1Path = path.join(tempDir, 'test1.txt');
      await fs.writeFile(testFile1Path, 'test content 1');
      await git.add('test1.txt');
      await git.commit('First commit');

      // Create second commit
      const testFile2Path = path.join(tempDir, 'test2.txt');
      await fs.writeFile(testFile2Path, 'test content 2');
      await git.add('test2.txt');
      const secondCommit = await git.commit('Second commit');

      repository = new DefaultStatelessRepository(tempDir);

      const commit = await repository.getCurrentCommit();

      expect(commit).toMatch(/^[a-f0-9]{40}$/);
      expect(commit).toBe(secondCommit.commit);
    });

    it('should throw error for non-git directory', async () => {
      // Create a non-git directory
      repository = new DefaultStatelessRepository(tempDir);

      await expect(repository.getCurrentCommit()).rejects.toThrow('Failed to get current commit');
    });

    it('should return null for a repository without commits', async () => {
      // Create an empty git repository without any commits
      await testGit(tempDir);

      repository = new DefaultStatelessRepository(tempDir);

      await expect(repository.getCurrentCommit()).resolves.toBeNull();
    });
  });

  describe('checkIgnore', () => {
    beforeEach(async () => {
      await testGit(tempDir);

      await writeArchive(
        tempDir,
        parse(
          `
-- .gitignore --
build/
*.log
temp-*
-- src/index.js --
normal file
-- debug.log --
log content
-- build/output.js --
build file
-- temp-cache.txt --
temp file
`,
        ),
      );
      repository = new DefaultStatelessRepository(tempDir);
    });

    it('should return empty array when none of the passed files are ignored', async () => {
      const nonIgnoredFiles = ['src/index.js', '.gitignore', 'package.json', 'README.md'];

      const result = await repository.checkIgnore(nonIgnoredFiles);

      expect(result).toEqual([]);
    });

    it('handles absolute paths', async () => {
      const file = path.join(tempDir, 'debug.log');

      const result = await repository.checkIgnore([file]);

      expect(result).toEqual([file]);
    });

    it('should return only ignored files from mixed array of ignored and non-ignored files', async () => {
      const mixedFiles = [
        'src/index.js', // Non-ignored
        'debug.log', // Ignored by *.log pattern
        '.gitignore', // Non-ignored
        'build/output.js', // Ignored by build/ pattern
        'temp-cache.txt', // Ignored by temp-* pattern
        'package.json', // Non-ignored
      ];

      const result = await repository.checkIgnore(mixedFiles);

      expect(result.sort()).toEqual(['debug.log', 'build/output.js', 'temp-cache.txt'].sort());
    });
  });

  describe('getFiles', () => {
    beforeEach(async () => {
      const git = await testGit(tempDir);

      await writeArchive(
        tempDir,
        parse(
          `
-- .gitignore --
node_modules/
*.log
ignored-dir/
-- src/main.ts --
main application
-- src/components/Button.ts --
button component
-- tests/test_main.ts --
main tests
-- config/app.ts --
app configuration
-- src/debug.log --
should be ignored
-- ignored-dir/file.ts --
ignored content
`,
        ),
      );

      await git.add(['src/main.ts', 'tests/test_main.ts', '.gitignore']);
      await git.commit('Initial commit');

      repository = new DefaultStatelessRepository(tempDir);
    });

    it('should find all TypeScript files by extension', async () => {
      const files = await repository.getFiles('*.ts');

      expect(files.sort()).toEqual(
        ['src/main.ts', 'src/components/Button.ts', 'tests/test_main.ts', 'config/app.ts'].sort(),
      );
    });

    it('should find files in tests directory', async () => {
      const files = await repository.getFiles('tests/*.ts');

      expect(files).toEqual(['tests/test_main.ts']);
    });

    it('should find files in specific directory', async () => {
      const files = await repository.getFiles('src/*.ts');

      expect(files.sort()).toEqual(['src/main.ts', 'src/components/Button.ts'].sort());
    });

    it('should find all files when no pattern is provided', async () => {
      const files = await repository.getFiles();

      // Should include tracked files and untracked non-ignored files
      expect(files.sort()).toEqual(
        [
          'src/main.ts',
          'src/components/Button.ts',
          'tests/test_main.ts',
          'config/app.ts',
          '.gitignore',
        ].sort(),
      );
    });
  });

  describe('getCurrentBranchName', () => {
    beforeEach(async () => {
      repository = new DefaultStatelessRepository(tempDir);
    });

    it('should return branch name when repository has a current branch', async () => {
      const git = await testGit(tempDir);
      await git.commit('Initial commit', '--allow-empty');
      await git.branch(['-M', 'main']);

      const branchName = await repository.getCurrentBranchName();
      expect(branchName).toBe('main');
    });

    it('should return correct branch name after checkout', async () => {
      const git = await testGit(tempDir);
      await git.commit('Initial commit', '--allow-empty');
      await git.branch(['-M', 'main']);
      await git.checkoutLocalBranch('feature-branch');

      const branchName = await repository.getCurrentBranchName();
      expect(branchName).toBe('feature-branch');
    });

    it('should throw error for non-git directory', async () => {
      await expect(repository.getCurrentBranchName()).rejects.toThrow(
        'Failed to get current branch name',
      );
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      repository = new DefaultStatelessRepository(tempDir);
    });

    it('should return clean status for repository with no changes', async () => {
      const git = await testGit(tempDir);
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content');
      await git.add('file.txt');
      await git.commit('Initial commit');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(true);
      expect(status.files).toEqual([]);
      expect(status.branch).toBe('master');
    });

    it('should detect untracked files', async () => {
      const git = await testGit(tempDir);
      await git.commit('Initial commit', '--allow-empty');
      await fs.writeFile(path.join(tempDir, 'untracked.txt'), 'content');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([{ path: 'untracked.txt', status: 'untracked', staged: false }]);
    });

    it('should detect staged new files', async () => {
      const git = await testGit(tempDir);
      await git.commit('Initial commit', '--allow-empty');
      await fs.writeFile(path.join(tempDir, 'new-file.txt'), 'content');
      await git.add('new-file.txt');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([{ path: 'new-file.txt', status: 'added', staged: true }]);
    });

    it('should detect unstaged modifications', async () => {
      const git = await testGit(tempDir);
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'original');
      await git.add('file.txt');
      await git.commit('Initial commit');
      await fs.writeFile(filePath, 'modified');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([{ path: 'file.txt', status: 'modified', staged: false }]);
    });

    it('should detect staged modifications', async () => {
      const git = await testGit(tempDir);
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'original');
      await git.add('file.txt');
      await git.commit('Initial commit');
      await fs.writeFile(filePath, 'modified');
      await git.add('file.txt');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([{ path: 'file.txt', status: 'modified', staged: true }]);
    });

    it('should detect partially staged files separately', async () => {
      const git = await testGit(tempDir);
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'original');
      await git.add('file.txt');
      await git.commit('Initial commit');

      await fs.writeFile(filePath, 'first modification');
      await git.add('file.txt');
      await fs.writeFile(filePath, 'second modification');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toHaveLength(2);
      expect(status.files).toContainEqual({ path: 'file.txt', status: 'modified', staged: true });
      expect(status.files).toContainEqual({ path: 'file.txt', status: 'modified', staged: false });
    });

    it('should detect deleted files', async () => {
      const git = await testGit(tempDir);
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');
      await git.add('file.txt');
      await git.commit('Initial commit');
      await fs.unlink(filePath);

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([{ path: 'file.txt', status: 'deleted', staged: false }]);
    });

    it('should detect staged deleted files', async () => {
      const git = await testGit(tempDir);
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');
      await git.add('file.txt');
      await git.commit('Initial commit');
      await git.rm('file.txt');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([{ path: 'file.txt', status: 'deleted', staged: true }]);
    });

    it('should detect renamed files with from path', async () => {
      const git = await testGit(tempDir);
      const originalPath = path.join(tempDir, 'original.txt');
      await fs.writeFile(originalPath, 'content');
      await git.add('original.txt');
      await git.commit('Initial commit');
      await git.mv('original.txt', 'renamed.txt');

      const status = await repository.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.files).toEqual([
        { path: 'renamed.txt', status: 'renamed', staged: true, from: 'original.txt' },
      ]);
    });

    it('should include branch tracking information', async () => {
      const git = await testGit(tempDir);
      await git.commit('Initial commit', '--allow-empty');
      await git.branch(['-M', 'main']);

      const status = await repository.getStatus();

      expect(status.branch).toBe('main');
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });

    it('should throw error for non-git directory', async () => {
      await expect(repository.getStatus()).rejects.toThrow('Failed to get git status');
    });
  });
});
