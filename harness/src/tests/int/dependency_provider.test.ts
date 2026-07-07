import path from 'path';
import { URI } from 'vscode-uri';
import { WorkspaceFolder } from 'vscode-languageserver';
import { LOG_LEVEL } from '@gitlab-org/logging';
import type { DependencyAIContextItem } from '@gitlab-org/ai-context';
import { GITLAB_TEST_TOKEN, LspClient } from './lsp_client';
import {
  assertEventually,
  createGitRepository,
  removeTmpDir,
  testingPaths,
  TestRepo,
} from './git/git_test_utils';

const fiveMinuteTimeout = 300000;

jest.setTimeout(fiveMinuteTimeout);

const sampleRepos = [
  {
    repo: {
      url: 'http:://localhost/testJSRepo.git',
      dir: path.join(testingPaths.tmpDir, 'testJSRepo'),
      treeFiles: new Set<string>(),
      gitIgnoreTestFiles: [],
    },
    files: [
      {
        filePath: 'package.json',
        content: `
        {
          "dependencies": {
            "react": "^17.0.2",
            "react-dom": "^17.0.2"
          },
          "devDependencies": {
            "typescript": "^4.4.3"
          }
        }
`,
      },
    ],
  },
];

describe('[AIContextManagement] Dependency context provider', () => {
  let lsClient: LspClient;
  let testRepos: TestRepo[];
  let workspaceFolder: WorkspaceFolder;

  async function setupLS(): Promise<LspClient> {
    workspaceFolder = { uri: URI.file(testingPaths.tmpDir).toString(), name: 'tmp' };
    const myLSClient = new LspClient(GITLAB_TEST_TOKEN);
    await myLSClient.sendInitialize();
    await myLSClient.sendDidChangeConfiguration({
      settings: {
        // Advanced context cache logging is debug level, switch to that so that we can verify behaviour
        logLevel: LOG_LEVEL.DEBUG,
        workspaceFolders: [workspaceFolder],
        token: GITLAB_TEST_TOKEN,
        codeCompletion: { enabled: true },
      },
    });
    await myLSClient.sendInitialized();
    return myLSClient;
  }

  beforeEach(async () => {
    await removeTmpDir();
    testRepos = await Promise.all(
      sampleRepos.map(async (repo) => {
        return createGitRepository(repo.repo, repo.files);
      }),
    );
    lsClient = await setupLS();
  });

  afterEach(async () => {
    lsClient.dispose();
    await removeTmpDir();
  });

  describe('when querying dependencies', () => {
    beforeEach(() => lsClient.getAvailableCategories());

    it('should return the list of libraries for each repository', async () => {
      await assertEventually({
        assertion: async () => {
          const contextItems: DependencyAIContextItem[] =
            (await lsClient.searchContextItemsForCategory({
              category: 'dependency',
              query: '',
              workspaceFolders: [workspaceFolder],
            })) as DependencyAIContextItem[];

          expect(contextItems.length).toEqual(testRepos.length);
          expect(contextItems[0].metadata.libs).toEqual([
            { name: 'react', version: '^17.0.2' },
            { name: 'react-dom', version: '^17.0.2' },
            { name: 'typescript', version: '^4.4.3' },
          ]);
        },
      });
    });
  });
});
