import assert from 'assert';
import { join } from 'path';
import * as fsPromises from 'node:fs/promises';
import { unlinkSync, writeFileSync } from 'fs-extra';
import { URI } from 'vscode-uri';
import { LsFetch } from '@gitlab-org/fetch';
import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial } from '@gitlab-org/test-utils';
import { LsConnection } from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { GitLsFiles } from '@gitlab-org/repositories';
import { NodeGitLsFiles } from '@gitlab-org/repositories/node';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { DocumentService } from '../../../common/document_service';
import { DefaultVirtualFileSystemService } from '../../../common/services/fs/virtual_file_system_service';
import { DefaultRepositoryService } from '../../../common/services/git/repository_service';
import { DesktopDirectoryWalker } from '../../../node/services/fs';
import { DesktopFsClient } from '../../../node/services/fs/fs';
import { GitLabApiClient } from '../../../common';
import {
  TestRepo,
  assertEventually,
  compareRepoFiles,
  createGitRepository,
  testingPaths,
  removeTmpDir,
} from './git_test_utils';

const thirtySecondTimeout = 30000;

jest.setTimeout(thirtySecondTimeout);

const describeIf = process.env.TEST_GIT_INTEGRATION === 'true' ? describe : describe.skip;

describeIf('[GIT] - RepositoryService', () => {
  const workspaceFolder = { uri: URI.file(testingPaths.tmpDir).toString(), name: 'tmp' };

  let desktopDirectoryWalker: DesktopDirectoryWalker;
  let virtualFileSystemService: DefaultVirtualFileSystemService;
  let repositoryService: DefaultRepositoryService;
  let mockConfigService: ConfigService;
  let mockApi: GitLabApiClient;
  let testRepos: TestRepo[];
  let mockLogger: Logger;
  let mockGitLsFiles: GitLsFiles;

  beforeAll(async () => {
    // Create controlled test repositories with specific scenarios
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

    const sibling1Repo: TestRepo = {
      url: 'test://sibling1-repo',
      dir: join(testingPaths.tmpDir, 'sibling1'),
      treeFiles: new Set<string>(),
      gitIgnoreTestFiles: [],
    };

    const sibling2Repo: TestRepo = {
      url: 'test://sibling2-repo',
      dir: join(testingPaths.tmpDir, 'sibling2'),
      treeFiles: new Set<string>(),
      gitIgnoreTestFiles: [],
    };

    // Create parent repo with various file types
    await createGitRepository(parentRepo, [
      { filePath: 'README.md', content: '# Parent Repository' },
      { filePath: 'src/main.ts', content: 'console.log("main");' },
      { filePath: 'src/utils/helper.ts', content: 'export const helper = () => {};' },
      { filePath: 'package.json', content: '{"name": "parent"}' },
      { filePath: '.gitignore', content: 'node_modules/\n*.log\ntemp-*\n' },
      { filePath: 'docs/guide.md', content: '# Guide' },
    ]);

    // Create nested repo (simulates GDK-like structure)
    await createGitRepository(nestedRepo, [
      { filePath: 'README.md', content: '# Nested Repository' },
      { filePath: 'lib/index.js', content: 'module.exports = {};' },
      { filePath: 'test/test.js', content: 'describe("test", () => {});' },
      { filePath: '.gitignore', content: 'coverage/\n' },
    ]);

    // Create sibling repos to test non-nested scenarios
    await createGitRepository(sibling1Repo, [
      { filePath: 'app.py', content: 'print("hello")' },
      { filePath: 'requirements.txt', content: 'flask==2.0.0' },
    ]);

    await createGitRepository(sibling2Repo, [
      { filePath: 'main.go', content: 'package main' },
      { filePath: 'go.mod', content: 'module example' },
    ]);

    testRepos = [parentRepo, nestedRepo, sibling1Repo, sibling2Repo];
  });

  afterAll(async () => {
    await removeTmpDir();
  });

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn().mockReturnValue({
        'client.workspaceFolders': [workspaceFolder],
      }),
      onConfigChange: jest.fn(),
    });
    mockApi = createFakePartial<GitLabApiClient>({
      isInValidState: true,
      onApiReconfigured: jest.fn(),
    });
    desktopDirectoryWalker = new DesktopDirectoryWalker();
    virtualFileSystemService = new DefaultVirtualFileSystemService(
      createFakePartial<LsConnection>({
        client: createFakePartial<LsConnection['client']>({}),
      }),
      desktopDirectoryWalker,
      mockConfigService,
      mockApi,
    );
    const mockLsFetch = createFakePartial<LsFetch>({});
    const mockSecretRedactor = createFakePartial<SecretRedactor>({});
    mockGitLsFiles = new NodeGitLsFiles(
      mockLogger,
      mockConfigService,
      {
        promises: {
          ...fsPromises,
          readFileFirstBytes: jest.fn(),
        },
      },
      mockSecretRedactor,
    );

    const mockDocumentService = createFakePartial<DocumentService>({
      onDocumentChange: jest.fn(),
    });

    repositoryService = new DefaultRepositoryService(
      mockLogger,
      virtualFileSystemService,
      desktopDirectoryWalker,
      new DesktopFsClient(),
      mockLsFetch,
      mockConfigService,
      mockDocumentService,
      mockGitLsFiles,
    );
  });

  describe('repository discovery and file listing', () => {
    it('should discover all repositories including nested ones', async () => {
      await virtualFileSystemService.emitFilesForWorkspace(workspaceFolder);

      await assertEventually({
        assertion: async () => {
          const repositories = await repositoryService.getRepositoriesForWorkspace(
            workspaceFolder.uri,
          );
          assert.strictEqual(
            repositories.length,
            testRepos.length,
            `Expected ${testRepos.length} repositories, but got ${repositories.length}`,
          );

          // Verify all expected repos are discovered
          const discoveredPaths = new Set(repositories.map((r) => r.uri.fsPath));
          for (const testRepo of testRepos) {
            assert(
              discoveredPaths.has(testRepo.dir),
              `Expected to discover repository at ${testRepo.dir}`,
            );
          }
        },
      });
    });

    it('should match git ls-tree output with getCurrentFilesForRepository', async () => {
      await virtualFileSystemService.emitFilesForWorkspace(workspaceFolder);

      await assertEventually({
        assertion: async () => {
          const repositories = await repositoryService.getRepositoriesForWorkspace(
            workspaceFolder.uri,
          );
          assert.strictEqual(repositories.length, testRepos.length);
        },
      });

      const compareRepoTreeWithService = async (
        testRepo: TestRepo,
        expectedMissingSize: number,
        expectedExtraSize: number,
      ) => {
        const failures: string[] = [];
        const serviceFiles = repositoryService.getCurrentFilesForRepository(
          URI.file(testRepo.dir),
          workspaceFolder.uri,
          { excludeGitFolder: true, excludeIgnored: true },
        );
        const submodules = await repositoryService.getSubmodulesForRepository(
          URI.file(testRepo.dir),
          workspaceFolder.uri,
        );

        const comparison = compareRepoFiles(
          testRepo,
          serviceFiles.map((file) => file.uri),
          submodules ?? [],
        );

        if (comparison.missingInService.size !== expectedMissingSize) {
          failures.push(
            `Expected missing in service ${expectedMissingSize}, but got ${comparison.missingInService.size}: ${[...comparison.missingInService].join(', ')}`,
          );
        }
        if (comparison.extraInService.size !== expectedExtraSize) {
          failures.push(
            `Expected extra in service ${expectedExtraSize}, but got ${comparison.extraInService.size}: ${[...comparison.extraInService].join(', ')}`,
          );
        }
        return failures;
      };

      await assertEventually({
        assertion: async () => {
          for (const testRepo of testRepos) {
            // eslint-disable-next-line no-await-in-loop
            const failures = await compareRepoTreeWithService(testRepo, 0, 0);
            assert.strictEqual(
              failures.length,
              0,
              `Failures for ${testRepo.dir}: ${failures.join(', ')}`,
            );
          }
        },
      });
    });
  });

  describe('gitignore handling', () => {
    it('should exclude gitignored files from repository file list', async () => {
      await virtualFileSystemService.emitFilesForWorkspace(workspaceFolder);

      await assertEventually({
        assertion: async () => {
          const repositories = await repositoryService.getRepositoriesForWorkspace(
            workspaceFolder.uri,
          );
          assert.ok(repositories.length > 0);
        },
      });

      // Verify gitignore test files are not included in the file list
      for (const testRepo of testRepos) {
        if (testRepo.gitIgnoreTestFiles.length > 0) {
          const serviceFiles = repositoryService.getCurrentFilesForRepository(
            URI.file(testRepo.dir),
            workspaceFolder.uri,
            { excludeGitFolder: true, excludeIgnored: true },
          );

          const serviceFilePaths = new Set(serviceFiles.map((f) => f.uri.fsPath));

          for (const { testIgnoredFilePath } of testRepo.gitIgnoreTestFiles) {
            assert(
              !serviceFilePaths.has(testIgnoredFilePath),
              `Gitignored file ${testIgnoredFilePath} should not be in file list`,
            );
          }
        }
      }
    });
  });

  describe('file change detection', () => {
    it('should show uncommitted files as extra compared to git ls-tree', async () => {
      await virtualFileSystemService.emitFilesForWorkspace(workspaceFolder);

      await assertEventually({
        assertion: async () => {
          const repositories = await repositoryService.getRepositoriesForWorkspace(
            workspaceFolder.uri,
          );
          assert.strictEqual(repositories.length, testRepos.length);
        },
      });

      // Pick a single test repo for this test
      const testRepo = testRepos[0];

      // Create a new uncommitted file
      const newFilePath = join(testRepo.dir, 'uncommitted-file.txt');
      writeFileSync(newFilePath, 'new content');

      // Re-emit files to pick up the change
      await virtualFileSystemService.emitFilesForWorkspace(workspaceFolder);

      // Wait for the file to be picked up
      await assertEventually({
        assertion: async () => {
          const serviceFiles = repositoryService.getCurrentFilesForRepository(
            URI.file(testRepo.dir),
            workspaceFolder.uri,
            { excludeGitFolder: true, excludeIgnored: true },
          );

          // Should include the uncommitted file
          const hasUncommittedFile = serviceFiles.some((f) => f.uri.fsPath === newFilePath);
          assert(hasUncommittedFile, 'Should detect uncommitted file');
        },
        timeout: 5000,
      });

      // Clean up
      unlinkSync(newFilePath);
    });
  });
});
