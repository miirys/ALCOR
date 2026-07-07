import { URL } from 'url';
import { WebviewMetadata } from '../../common/webview';
import { LspClient, GITLAB_TEST_TOKEN } from './lsp_client';

describe('Webview Endpoints', () => {
  let lspClient: LspClient;

  beforeEach(async () => {
    lspClient = new LspClient(GITLAB_TEST_TOKEN);

    const initializeResponse = await lspClient.sendInitialize();
    expect(initializeResponse).not.toBeNull();
    await lspClient.sendDidChangeConfiguration();
    await lspClient.sendInitialized();
  });

  afterEach(() => {
    if (lspClient) {
      lspClient.dispose();
    }
  });

  const extractServerAddressFromUri = (uri: string): URL => new URL(uri);

  const fetchWebviewContent = async (
    uri: string,
  ): Promise<{ status: number; contentType?: string; body: string }> => {
    const response = await fetch(uri);
    const contentType = response.headers.get('content-type') || undefined;
    const body = await response.text();
    return {
      status: response.status,
      contentType,
      body,
    };
  };

  describe('Webview HTTP endpoints', () => {
    it('should return HTML content for each webview endpoint', async () => {
      const webviews: WebviewMetadata[] = await lspClient.getWebviewMetadata();
      expect(webviews.length).toBeGreaterThan(0);

      for (const webview of webviews) {
        expect(webview.uris.length).toBeGreaterThan(0);

        const uri = webview.uris[0];

        // eslint-disable-next-line no-await-in-loop
        const { status, contentType, body } = await fetchWebviewContent(uri);

        expect(status).toBe(200);
        expect(contentType).toContain('text/html');

        const webviewInfo = {
          'duo-workflow': {
            title: '<title>GitLab Duo Workflow</title>',
          },
          'duo-chat-v2': {
            title: '<title>GitLab Duo Chat</title>',
          },
          'security-vuln-details': {
            title: '<title>GitLab SAST Vulnerability Details</title>',
          },
        } as Record<string, { title: string }>;

        const expectedTitle = webviewInfo[webview.id]?.title;
        if (expectedTitle) {
          expect(body).toContain(expectedTitle);
        } else {
          // Generic check for any webview - there should be a title tag
          expect(body).toContain('<title>');
        }

        expect(body).toContain('<html');
        expect(body).toContain('<body');
      }
    });

    it('should return 404 for non-existent webview', async () => {
      const webviews: WebviewMetadata[] = await lspClient.getWebviewMetadata();
      expect(webviews.length).toBeGreaterThan(0);

      const validUri = webviews[0].uris[0];
      const serverUrl = extractServerAddressFromUri(validUri);

      const nonExistentWebviewUri = `${serverUrl.origin}/webview/non-existent-webview`;

      const { status } = await fetchWebviewContent(nonExistentWebviewUri);

      expect(status).toBe(404);
    });
  });
});
