import { LspClient, GITLAB_TEST_TOKEN } from './lsp_client';
import { shouldValidateCIAndBundle } from './test_utils';

const THIRTY_SECONDS_MS = 30000;

shouldValidateCIAndBundle('bundle', () => {
  describe('ripgrep', () => {
    it(
      'is available in the bundled language server',
      async () => {
        const lsClient = new LspClient(GITLAB_TEST_TOKEN);

        try {
          await lsClient.sendInitialize();
          await lsClient.sendDidChangeConfiguration();
          await lsClient.sendInitialized();

          await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
            '[RipgrepService] rg available: true',
            THIRTY_SECONDS_MS,
          );
        } finally {
          lsClient.dispose();
        }
      },
      THIRTY_SECONDS_MS,
    );
  });
});
