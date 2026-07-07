import assert from 'assert';
import { join } from 'path';
import { URI } from 'vscode-uri';
import { TestLogger } from '@gitlab-org/logging';
import {
  StatelessRepositoryDiscoveryService,
  DefaultStatelessRepository,
} from '@gitlab-org/repositories/node';
import {
  TestRepo,
  assertEventually,
  createGitRepository,
  testingPaths,
  removeTmpDir,
} from './git_test_utils';

const thirtySecondTimeout = 30000;

jest.setTimeout(thirtySecondTimeout);

const describeIf = process.env.TEST_GIT_INTEGRATION === 'true' ? describe : describe.skip;

describeIf('[GIT] - StatelessRepositoryDiscoveryService', () => {
  const workspaceFolder = { uri: URI.file(testingPaths.tmpDir).toString(), name: 'tmp' };

  let service: StatelessRepositoryDiscoveryService;
  let testRepos: TestRepo[];
  let logger: TestLogger;

  beforeAll(async () => {
    // Create controlled test repositories with nested structure
    const parentRepo: TestRepo = {
      url: 'test://parent-repo',
      dir: join(testingPaths.tmpDir, 'parent-repo'),
      treeFiles: new Set<string>(),
      gitIgnoreTestFiles: [],
    };

    const nestedRepo: TestRepo = {
      url: 'test://nested-repo',
      dir: join(testingPaths.tmpDir, 'parent-repo', 'nested'),
      treeFiles: new Set<string>(),
      gitIgnoreTestFiles: [],
    };

    const siblingRepo: TestRepo = {
      url: 'test://sibling-repo',
      dir: join(testingPaths.tmpDir, 'sibling'),
      treeFiles: new Set<string>(),
      gitIgnoreTestFiles: [],
    };

    // Create parent repo
    await createGitRepository(parentRepo, [
      { filePath: 'README.md', content: '# Parent' },
      { filePath: 'src/index.ts', content: 'export {};' },
    ]);

    // Create nested repo (like gitlab inside GDK)
    await createGitRepository(nestedRepo, [
      { filePath: 'README.md', content: '# Nested' },
      { filePath: 'app.js', content: 'console.log("nested");' },
    ]);

    // Create sibling repo
    await createGitRepository(siblingRepo, [{ filePath: 'main.py', content: 'print("sibling")' }]);

    testRepos = [parentRepo, nestedRepo, siblingRepo];
  });

  afterAll(async () => {
    await removeTmpDir();
  });

  beforeEach(() => {
    logger = new TestLogger();
    service = new StatelessRepositoryDiscoveryService(logger);
  });

  it('should discover all repositories including nested ones', async () => {
    await assertEventually({
      assertion: async () => {
        const repositories = await service.getRepositoriesForWorkspace(
          URI.parse(workspaceFolder.uri).fsPath,
        );

        assert.strictEqual(
          repositories.length,
          testRepos.length,
          `Expected ${testRepos.length} repositories, but got ${repositories.length}`,
        );

        // Verify all repositories are discovered
        const discoveredPaths = new Set(repositories.map((repo) => repo.fsPath));
        const expectedPaths = new Set(testRepos.map((repo) => repo.dir));

        for (const expectedPath of expectedPaths) {
          assert(
            discoveredPaths.has(expectedPath),
            `Expected to discover repository at ${expectedPath}`,
          );
        }

        // Verify all discovered repositories are DefaultStatelessRepository instances
        for (const repo of repositories) {
          assert(
            repo instanceof DefaultStatelessRepository,
            `Expected repository at ${repo.fsPath} to be an instance of DefaultStatelessRepository`,
          );
        }
      },
    });
  });

  it('should verify precise repository count with nested structures', async () => {
    await assertEventually({
      assertion: async () => {
        const repositories = await service.getRepositoriesForWorkspace(
          URI.parse(workspaceFolder.uri).fsPath,
        );

        // Verify exact count matches expected repositories
        assert.strictEqual(
          repositories.length,
          testRepos.length,
          `Repository count mismatch: expected ${testRepos.length}, discovered ${repositories.length}. ` +
            `Discovered paths: ${repositories.map((r) => r.fsPath).join(', ')}`,
        );

        // Verify no duplicates in discovery
        const uniquePaths = new Set(repositories.map((repo) => repo.fsPath));
        assert.strictEqual(
          uniquePaths.size,
          repositories.length,
          'Discovered repositories contain duplicates',
        );
      },
    });
  });

  it('should handle nested repository structures', async () => {
    await assertEventually({
      assertion: async () => {
        const repositories = await service.getRepositoriesForWorkspace(
          URI.parse(workspaceFolder.uri).fsPath,
        );

        // Find the parent and nested repositories
        const parentRepo = repositories.find((repo) => repo.fsPath.endsWith(join('parent-repo')));
        const nestedRepo = repositories.find((repo) =>
          repo.fsPath.endsWith(join('parent-repo', 'nested')),
        );

        assert(parentRepo, 'Should discover the parent repository');
        assert(nestedRepo, 'Should discover the nested repository');

        // Verify all are discovered as separate repositories
        assert.notStrictEqual(
          parentRepo.fsPath,
          nestedRepo.fsPath,
          'Parent and nested repositories should be distinct',
        );

        // Verify the nested relationship
        assert(
          nestedRepo.fsPath.startsWith(parentRepo.fsPath),
          `Nested repo (${nestedRepo.fsPath}) should be inside parent repo (${parentRepo.fsPath})`,
        );
      },
    });
  });

  it('should discover sibling repositories independently', async () => {
    await assertEventually({
      assertion: async () => {
        const repositories = await service.getRepositoriesForWorkspace(
          URI.parse(workspaceFolder.uri).fsPath,
        );

        const parentRepo = repositories.find((repo) => repo.fsPath.endsWith(join('parent-repo')));
        const siblingRepo = repositories.find((repo) => repo.fsPath.endsWith('sibling'));

        assert(parentRepo, 'Should discover parent repository');
        assert(siblingRepo, 'Should discover sibling repository');

        // Verify they are independent (neither is nested in the other)
        assert(
          !parentRepo.fsPath.startsWith(siblingRepo.fsPath),
          'Parent should not be nested in sibling',
        );
        assert(
          !siblingRepo.fsPath.startsWith(parentRepo.fsPath),
          'Sibling should not be nested in parent',
        );
      },
    });
  });
});
