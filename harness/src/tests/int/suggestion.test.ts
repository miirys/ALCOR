import { join } from 'path';
import { rmSync } from 'fs';
import { URI } from 'vscode-uri';
import { LOG_LEVEL } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CustomInitializeParams } from '../../common/core/handlers/initialize_handler';
import { LspClient, GITLAB_TEST_TOKEN } from './lsp_client';
import { setupTestRepos, testingPaths, TestRepo } from './git/git_test_utils';

// Backend is flaky, sometimes it takes a few
// tries to get back a valid code completion.
jest.retryTimes(10);

// Set a longer timeout for this integration test
const fiveMinutes = 5 * 60 * 1000;
jest.setTimeout(fiveMinutes);

describe('Code Suggestions', () => {
  let lsClient: LspClient;
  const WORKSPACE_FOLDER_URI = URI.file(testingPaths.tmpDir).toString();
  const TEST_REPO_DIR = join(testingPaths.tmpDir, 'gitlab-lsp-suggestion-test');

  async function setupLS(): Promise<LspClient> {
    const myLSClient = new LspClient(GITLAB_TEST_TOKEN);
    const initParams = createFakePartial<CustomInitializeParams>({
      workspaceFolders: [
        {
          name: 'test-workspace',
          uri: WORKSPACE_FOLDER_URI,
        },
      ],
    });
    await myLSClient.sendInitialize(initParams);
    await myLSClient.sendDidChangeConfiguration({
      settings: {
        logLevel: LOG_LEVEL.DEBUG,
        workspaceFolders: [{ name: 'test-workspace', uri: WORKSPACE_FOLDER_URI }],
        token: GITLAB_TEST_TOKEN,
        projectPath: 'gitlab-org/editor-extensions/gitlab-lsp',
        baseUrl: 'https://gitlab.com',
        codeCompletion: {
          enabled: true,
          enableSecretRedaction: true,
        },
        telemetry: {
          enabled: false,
        },
      },
    });
    await myLSClient.sendInitialized();
    return myLSClient;
  }

  beforeAll(async () => {
    // Create a test repository that mirrors a real GitLab project structure
    const reposToTest: TestRepo[] = [
      {
        url: 'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp.git',
        dir: TEST_REPO_DIR,
        treeFiles: new Set<string>(),
        gitIgnoreTestFiles: [],
      },
    ];

    // Setup the test repository with proper Git configuration
    await setupTestRepos(reposToTest);

    lsClient = await setupLS();

    // Wait for repositories to be detected
    await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
      'found 1 projects for workspace folder',
      10000,
    );
  });

  afterAll(async () => {
    lsClient.dispose();
    rmSync(TEST_REPO_DIR, { recursive: true, force: true });
  });

  test('get a code suggestion', async () => {
    try {
      // Use a realistic file path within the test repository
      const testFilePath = URI.file(join(TEST_REPO_DIR, 'test_file.cs')).toString();

      // Create the test file content with meaningful C# code that's likely to get suggestions
      const initialContent = 'namespace TestNamespace {\n\tpublic class TestClass {\n\t}\n}';
      const updatedContent =
        'namespace TestNamespace {\n\tpublic class TestClass {\n\t\tpublic void TestMethod() {\n\t\t\t// TODO: Add implementation\n\t\t\t\n\t\t}\n\t}\n}';

      // Open the document with initial content
      await lsClient.sendTextDocumentDidOpen(testFilePath, 'csharp', 0, initialContent);

      // Update the document with content that has space for completion
      await lsClient.sendTextDocumentDidChangeFull(testFilePath, 1, updatedContent);

      // Request completion at the empty line within the method (after the comment)
      // Position is line 4 (0-indexed), character 4 (after the tabs)
      const resp = await lsClient.sendTextDocumentCompletion(testFilePath, 4, 4);

      expect(resp).not.toBeNull();

      // The response should contain at least one suggestion
      if (Array.isArray(resp)) {
        expect(resp.length).toBeGreaterThanOrEqual(1);
        if (resp.length > 0) {
          expect(resp[0].insertText).toBeDefined();
        }
      } else if (resp) {
        // Handle CompletionList format
        expect(resp.items.length).toBeGreaterThanOrEqual(1);
        if (resp.items.length > 0) {
          expect(resp.items[0].insertText).toBeDefined();
        }
      } else {
        throw new Error('Completion response is not an array or has unexpected format');
      }
    } catch (error) {
      // Log additional context for debugging
      console.error('Test failed with error:', error);
      console.log('LSP Client console output:', lsClient.childProcessConsole.slice(-20));
      throw error;
    }
  });
});
