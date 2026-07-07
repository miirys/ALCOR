import { join } from 'path';
import { URI } from 'vscode-uri';
import { LOG_LEVEL } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { OpenTabAIContextItem } from '@gitlab-org/ai-context';
import { CustomInitializeParams } from '../../common/core/handlers/initialize_handler';
import { _test as _testContextProvider } from '../../common/ai_context_management/context_providers';
import { _test as _testPreProcessor } from '../../common/suggestion_client/pre_processors';
import { DISABLED_REASONS } from '../../common/ai_context_management/context_providers/constants';
import { setupTestRepos, testingPaths } from './git/git_test_utils';
import { GITLAB_TEST_TOKEN, LspClient } from './lsp_client';
import { MOCK_FILE_1, MOCK_FILE_2 } from './test_utils';

const fiveMinutes = 5 * 60 * 1000;
jest.setTimeout(fiveMinutes);

const project = 'gitlab-org/editor-extensions/experiments/duo-project-access-test';
describe('Duo Project Access', () => {
  let lsClient: LspClient;

  const WORKSPACE_FOLDER_URI = URI.file(testingPaths.tmpDir).toString();
  const TEST_REPO_DIR = join(testingPaths.tmpDir, 'duo-project-access-test');

  async function setupLS(featureFlags: Record<string, boolean> = {}): Promise<LspClient> {
    const myLSClient = new LspClient(GITLAB_TEST_TOKEN);
    const initParams = createFakePartial<CustomInitializeParams>({
      initializationOptions: { featureFlagOverrides: featureFlags },
    });
    await myLSClient.sendInitialize(initParams);
    await myLSClient.sendDidChangeConfiguration({
      settings: {
        featureFlagOverrides: featureFlags,
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
        url: `https://gitlab.com/${project}.git`,
        dir: TEST_REPO_DIR,
        treeFiles: new Set<string>(),
        gitIgnoreTestFiles: [],
      },
    ];

    await setupTestRepos(reposToTest);

    lsClient = await setupLS({
      advanced_context_resolver: true,
      code_suggestions_context: true,
    });
  });

  afterAll(async () => {
    lsClient.dispose();
  });

  /**
   * Note, this test uses the following project:
   * https://gitlab.com/gitlab-org/editor-extensions/experiments/duo-project-access-test
   * Which has `duoFeaturesEnabled` set to false.
   */
  describe('Duo Project Access Cache', () => {
    it('Should filter out code suggestion completions for disabled projects', async () => {
      const completionUri = URI.file(join(TEST_REPO_DIR, 'app', 'models', 'dogs.rb')).toString();

      await lsClient.sendTextDocumentDidOpen(
        completionUri,
        'ruby',
        MOCK_FILE_1.version,
        'puts "Never gonna give you up!"',
      );

      const openTabUri = URI.file(join(TEST_REPO_DIR, 'app', 'models', 'user.rb')).toString();

      await lsClient.sendTextDocumentDidOpen(
        openTabUri,
        'ruby',
        MOCK_FILE_2.version,
        'puts "Never gonna let you down!"',
      );
      // Wait for the project to be found and GraphQL query to be made
      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        'found 1 projects for workspace folder',
        15000,
      );
      // Now we can test the completion and ensure that the context is not enabled
      // for the disabled project
      await lsClient.sendTextDocumentCompletion(completionUri, 0, 0);
      const openTabContextItem: OpenTabAIContextItem = {
        id: completionUri,
        category: 'file',
        metadata: createFakePartial<OpenTabAIContextItem['metadata']>({
          disabledReasons: [DISABLED_REASONS.DUO_PROJECT_DISABLED],
          project,
          subType: 'open_tab',
        }),
      };
      await Promise.all([
        expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
          _testContextProvider.duoNotEnabledLog(openTabUri),
          5000,
        ),
        expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
          _testPreProcessor.disabledItemLog(openTabContextItem),
          5000,
        ),
      ]);
    });
  });
});
