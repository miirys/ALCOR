import { LOG_LEVEL } from '@gitlab-org/logging';
import { GITLAB_TEST_TOKEN, LspClient } from '../lsp_client';
import { MOCK_FILE_1, MOCK_FILE_2 } from '../test_utils';

describe('Open Tabs LRU Cache', () => {
  let lsClient: LspClient;

  beforeEach(async () => {
    lsClient = new LspClient(GITLAB_TEST_TOKEN);
    await lsClient.sendInitialize();
    await lsClient.sendDidChangeConfiguration({
      settings: {
        // open tabs cache logging is debug level, switch to that so that we can verify behaviour
        logLevel: LOG_LEVEL.DEBUG,
        openTabsContext: true,
      },
    });
    await lsClient.sendInitialized();
  });

  afterEach(() => lsClient.dispose());

  describe('when opening a document', () => {
    it('should add it to the open tabs cache', async () => {
      await lsClient.sendTextDocumentDidOpen(
        MOCK_FILE_1.uri,
        MOCK_FILE_1.languageId,
        MOCK_FILE_1.version,
        MOCK_FILE_1.text,
      );

      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `uri ${MOCK_FILE_1.uri} was updated in the LRU cache`,
      );
    });
  });

  describe('when switching between open documents', () => {
    it('should add it to the open tabs cache', async () => {
      await lsClient.sendTextDocumentDidOpen(
        MOCK_FILE_1.uri,
        MOCK_FILE_1.languageId,
        MOCK_FILE_1.version,
        MOCK_FILE_1.text,
      );
      await lsClient.sendTextDocumentDidOpen(
        MOCK_FILE_2.uri,
        MOCK_FILE_2.languageId,
        MOCK_FILE_2.version,
        MOCK_FILE_2.text,
      );

      // Wait for didOpen events to cause files to be added to cache, then clear console, so we can specifically check for new DidChangeDocumentInActiveEditor updates
      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `uri ${MOCK_FILE_2.uri} was updated in the LRU cache`,
      );
      lsClient.childProcessConsole = [];

      await lsClient.sendDidChangeDocumentInActiveEditor(MOCK_FILE_1.uri);
      await lsClient.sendDidChangeDocumentInActiveEditor(MOCK_FILE_2.uri);

      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `uri ${MOCK_FILE_1.uri} was updated in the LRU cache`,
      );
      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `uri ${MOCK_FILE_2.uri} was updated in the LRU cache`,
      );
    });
  });

  describe('when closing a document', () => {
    it('should remove it from the open tabs cache', async () => {
      await lsClient.sendTextDocumentDidOpen(
        MOCK_FILE_1.uri,
        MOCK_FILE_1.languageId,
        MOCK_FILE_1.version,
        MOCK_FILE_1.text,
      );

      await lsClient.sendTextDocumentDidClose(MOCK_FILE_1.uri);

      await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
        `File ${MOCK_FILE_1.uri} was deleted from the LRU cache`,
      );
    });
  });
});
