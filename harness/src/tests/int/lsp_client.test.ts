import { LspClient, GITLAB_TEST_TOKEN } from './lsp_client';

describe('LspClient', () => {
  it('captures language server console output', async () => {
    const lsClient = new LspClient(GITLAB_TEST_TOKEN);

    try {
      const initializeResponse = await lsClient.sendInitialize();
      expect(initializeResponse).not.toBeNull();

      expect(lsClient.childProcessConsole.length).toBeGreaterThan(0);
      expect(lsClient.childProcessConsole).toEqual(
        expect.arrayContaining([
          expect.stringContaining('GitLab Language Server has started'),
          expect.stringContaining('GitLab Language Server is starting'),
        ]),
      );
    } finally {
      lsClient.dispose();
    }
  });
});
