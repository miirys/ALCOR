import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import assert from 'assert';
import { URI } from 'vscode-uri';
import { FileChangeType } from 'vscode-languageserver-protocol';
import { LOG_LEVEL } from '@gitlab-org/logging';
import { GITLAB_TEST_TOKEN, LspClient } from './lsp_client';
import { testingPaths, setupTestRepos, TestRepo, assertEventually } from './git/git_test_utils';

const fiveMinutes = 5 * 60 * 1000;
jest.setTimeout(fiveMinutes);

const WORKSPACE_INIT_TIMEOUT = 60_000;
const REPOSITORY_EVENT_TIMEOUT = 10_000;

describe('DidChangeWatchedFiles', () => {
  let lsClient: LspClient;
  let testRepos: TestRepo[];

  const WORKSPACE_FOLDER_URI = URI.file(testingPaths.tmpDir).toString();

  async function setupLS(): Promise<LspClient> {
    const myLSClient = new LspClient(GITLAB_TEST_TOKEN);
    await myLSClient.sendInitialize();
    await myLSClient.sendDidChangeConfiguration({
      settings: {
        logLevel: LOG_LEVEL.DEBUG,
        workspaceFolders: [{ name: 'tmp', uri: WORKSPACE_FOLDER_URI }],
        token: GITLAB_TEST_TOKEN,
        codeCompletion: { enabled: true },
      },
    });
    await myLSClient.sendInitialized();
    return myLSClient;
  }

  beforeAll(async () => {
    const reposToTest = [
      {
        url: 'https://gitlab.com/gitlab-org/gitlab-vscode-extension.git',
        dir: join(testingPaths.tmpDir, 'gitlab-vscode-extension'),
        treeFiles: new Set<string>(),
        gitIgnoreTestFiles: [],
      },
    ];

    testRepos = await setupTestRepos(reposToTest);

    lsClient = await setupLS();

    // File events are processed via a PQueue that is paused during workspace initialization
    // (git ls-files, .gitignore parsing, etc). On slow CI runners this can take several seconds.
    // We wait for workspace init to complete before sending file events, and use a generous
    // polling timeout as a safety net.
    await assertEventually({
      assertion: () => {
        assert(
          lsClient.childProcessConsole.some((line) =>
            line.includes(`Workspace folder initialized: ${WORKSPACE_FOLDER_URI}`),
          ),
        );
      },
      timeout: WORKSPACE_INIT_TIMEOUT,
      interval: 100,
    });
  });

  afterAll(async () => {
    lsClient.dispose();
  });

  describe('File watching capability', () => {
    it('should register the didChangeWatchedFiles capability', async () => {
      // The registration is handled internally by the LspClient
      // We can verify it by checking if the watchedFiles set is not empty
      await assertEventually({
        assertion: () => {
          assert(lsClient.watchedFiles.size > 0);
        },
        timeout: 10000,
        interval: 1000,
      });
    });

    it('should receive file creation events', async () => {
      const testRepo = testRepos[0];
      const newFilePath = join(testRepo.dir, 'new_test_file.txt');
      const newFileUri = URI.file(newFilePath).toString();

      writeFileSync(newFilePath, 'This is a test file');

      await lsClient.sendFakeFileEvent(newFileUri, FileChangeType.Created);

      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `[RepositoryService] File ${newFileUri} added to repository ${URI.file(testRepo.dir).toString()}`,
        REPOSITORY_EVENT_TIMEOUT,
      );

      unlinkSync(newFilePath);
    });

    it('should receive file deletion events', async () => {
      const testRepo = testRepos[0];
      const fileToDeletePath = join(testRepo.dir, 'file_to_delete.txt');
      const fileToDeleteUri = URI.file(fileToDeletePath).toString();

      writeFileSync(fileToDeletePath, 'This file will be deleted');

      await lsClient.sendFakeFileEvent(fileToDeleteUri, FileChangeType.Created);

      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `[RepositoryService] File ${fileToDeleteUri} added to repository ${URI.file(testRepo.dir).toString()}`,
        REPOSITORY_EVENT_TIMEOUT,
      );

      unlinkSync(fileToDeletePath);

      await lsClient.sendFakeFileEvent(fileToDeleteUri, FileChangeType.Deleted);

      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `[RepositoryService] File ${fileToDeleteUri} removed from repository ${URI.file(testRepo.dir).toString()}`,
        REPOSITORY_EVENT_TIMEOUT,
      );
    });
  });
});
