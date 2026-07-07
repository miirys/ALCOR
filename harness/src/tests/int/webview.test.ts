import { LspClient, GITLAB_TEST_TOKEN } from './lsp_client';

describe('Webview', () => {
  describe('get webview metadata', () => {
    it('should return metadata', async () => {
      const lsClient = new LspClient(GITLAB_TEST_TOKEN);

      try {
        const initializeResponse = await lsClient.sendInitialize();
        expect(initializeResponse).not.toBeNull();
        await lsClient.sendDidChangeConfiguration();
        await lsClient.sendInitialized();

        const response = await lsClient.getWebviewMetadata();
        expect(response).not.toBeNull();
        expect(Array.isArray(response)).toBe(true);
        expect(response.length).toBeGreaterThan(0);
        response.forEach((item) => {
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('title');
          expect(item).toHaveProperty('uris');
        });
      } finally {
        lsClient.dispose();
      }
    });
  });
});
