import { LspClient, GITLAB_TEST_TOKEN } from './lsp_client';

const THIRTY_SECONDS_MS = 30000;

describe('Code Generation', () => {
  describe('textDocument/completion', () => {
    it(
      'does not report failure to load tree-sitter',
      async () => {
        const lsClient = new LspClient(GITLAB_TEST_TOKEN);

        try {
          const initializeResponse = await lsClient.sendInitialize();
          expect(initializeResponse).not.toBeNull();
          await lsClient.sendDidChangeConfiguration();
          await lsClient.sendInitialized();
          await lsClient.sendTextDocumentDidOpen(
            'file://base/path/generation.js',
            'javascript',
            0,
            '',
          );
          await lsClient.sendTextDocumentDidChangeFull(
            'file://base/path/generation.js',
            1,
            '// Write a function that tells me if a string is a haiku.',
          );
          const resp = await lsClient.sendTextDocumentCompletion(
            'file://base/path/generation.js',
            1,
            0,
          );
          console.log(`Got complete items: ${JSON.stringify(resp)}`);

          // NOTE: We validate this to confirm tree-sitter and at least the JavaScript grammar were successfully loaded.
          expect(lsClient.childProcessConsole).not.toEqual(
            expect.arrayContaining([
              expect.stringContaining(
                'Unable to load tree-sitter parser due to an unexpected error.',
              ),
            ]),
          );

          expect(resp).not.toBeNull();
        } finally {
          await lsClient.dispose();
        }
      },
      THIRTY_SECONDS_MS,
    );
  });
});
