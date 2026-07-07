/* eslint-disable no-unused-expressions */
import { join } from 'path';
import { expect } from 'chai';
import { createFakePartial } from '@gitlab-org/test-utils';
import { LOG_LEVEL } from '@gitlab-org/logging';
import { URI } from 'vscode-uri';
import { CustomInitializeParams } from '../../common/core/handlers/initialize_handler';
import { createLspClientBrowser, WORKSPACE_FOLDER_URI } from './lsp_client_browser';

describe('Code Suggestions (Browser)', () => {
  it('get a code suggestion', async () => {
    const projectPath =
      process.env.GITLAB_PROJECT_PATH || 'gitlab-org/editor-extensions/gitlab-lsp';
    const gitlabTestToken = process.env.GITLAB_TEST_TOKEN;
    const gitlabUrl = process.env.GITLAB_URL || 'https://gitlab.com';

    const lspClient = await createLspClientBrowser({ gitlabTestToken, gitlabUrl });
    const initParams = createFakePartial<CustomInitializeParams>({
      workspaceFolders: [
        {
          name: 'test-workspace',
          uri: WORKSPACE_FOLDER_URI,
        },
      ],
    });

    expect(await lspClient.sendInitialize(initParams)).not.to.be.an('error');

    await lspClient.sendDidChangeConfiguration({
      settings: {
        logLevel: LOG_LEVEL.DEBUG,
        workspaceFolders: [{ name: 'test-workspace', uri: WORKSPACE_FOLDER_URI }],
        token: gitlabTestToken,
        baseUrl: gitlabUrl,
        codeCompletion: {
          enabled: true,
          enableSecretRedaction: true,
        },
        baseAssetsUrl: window.location.origin,
        telemetry: {
          enabled: false,
        },
        webIdeCurrentRef: 'main',
        webIdeProjectPath: projectPath,
      },
    });

    await lspClient.sendInitialized();

    // Use a realistic file path within the test repository
    const testFilePath = URI.file(join('test_file.cs')).toString();

    // Create the test file content with meaningful C# code that's likely to get suggestions
    const initialContent = 'namespace TestNamespace {\n\tpublic class TestClass {\n\t}\n}';
    const updatedContent =
      'namespace TestNamespace {\n\tpublic class TestClass {\n\t\tpublic void TestMethod() {\n\t\t\t// TODO: Add implementation\n\t\t\t\n\t\t}\n\t}\n}';

    // Open the document with initial content
    await lspClient.sendTextDocumentDidOpen(testFilePath, 'csharp', 0, initialContent);

    // Update the document with content that has space for completion
    await lspClient.sendTextDocumentDidChangeFull(testFilePath, 1, updatedContent);

    // Request completion at the empty line within the method (after the comment)
    // Position is line 4 (0-indexed), character 4 (after the tabs)
    const resp = await lspClient.sendTextDocumentCompletion(testFilePath, 4, 4);

    expect(resp).to.not.be.null;

    // The response should contain at least one suggestion
    if (Array.isArray(resp)) {
      expect(resp.length).to.be.at.least(1);
      if (resp.length > 0) {
        expect(resp[0].insertText).to.not.be.undefined;
      }
    } else if (resp) {
      // Handle CompletionList format
      expect(resp.items.length).to.be.at.least(1);
      if (resp.items.length > 0) {
        expect(resp.items[0].insertText).to.not.be.undefined;
      }
    } else {
      throw new Error('Completion response is not an array or has unexpected format');
    }
  });
});
