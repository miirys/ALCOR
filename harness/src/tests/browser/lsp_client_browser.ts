/* eslint-disable no-console */
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-jsonrpc/browser';
import {
  CompletionItem,
  CompletionList,
  CompletionParams,
  createMessageConnection,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  InitializedParams,
  InitializeError,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  MessageConnection,
  NotificationType,
  RequestType,
  RequestType1,
  URI,
} from 'vscode-languageserver/browser';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CustomInitializeParams } from '../../common/core/handlers/initialize_handler';
import { ChangeConfigOptions } from '../../common/core/handlers/did_change_configuration_handler';
import { DidChangeDocumentInActiveEditor } from '../../common';

export const WORKSPACE_FOLDER_URI: URI = 'file://';

export const DEFAULT_INITIALIZE_PARAMS = createFakePartial<CustomInitializeParams>({
  processId: 1234,
  capabilities: {
    textDocument: {
      completion: {
        completionItem: {
          documentationFormat: [MarkupKind.PlainText],
          insertReplaceSupport: false,
        },
        completionItemKind: {
          valueSet: [1], // text
        },
        contextSupport: false,
        insertTextMode: 2, // adjust indentation
      },
    },
  },
  clientInfo: {
    name: 'lsp_client',
    version: '0.0.1',
  },
  workspaceFolders: [
    {
      name: 'test',
      uri: WORKSPACE_FOLDER_URI,
    },
  ],
  initializationOptions: {
    ide: {
      name: 'lsp_client',
      version: '0.0.1',
      vendor: 'gitlab',
    },
  },
});

interface LspClientBrowserConstructionOptions {
  worker: Worker;
  gitlabToken: string;
  gitlabBaseUrl: string;
}

class LspClientBrowser {
  readonly #connection: MessageConnection;

  readonly #gitlabToken: string;

  readonly #gitlabBaseUrl: string;

  constructor({ worker, gitlabToken, gitlabBaseUrl }: LspClientBrowserConstructionOptions) {
    this.#gitlabToken = gitlabToken;
    this.#gitlabBaseUrl = gitlabBaseUrl;
    this.#connection = createMessageConnection(
      new BrowserMessageReader(worker),
      new BrowserMessageWriter(worker),
    );

    this.#connection.listen();
    this.#connection.onNotification(
      'window/logMessage',
      (params: { type: number; message: string }) => {
        console.log(`[LS] ${params.message}`);
      },
    );
    this.#connection.onError((err) => {
      console.error(err);
      expect(err).not.toBeTruthy();
    });
  }

  /**
   * Send the LSP 'initialize' message.
   *
   * @param initializeParams Provide custom values that override defaults. Merged with defaults.
   * @returns InitializeResponse object
   */
  async sendInitialize(initializeParams?: CustomInitializeParams): Promise<InitializeResult> {
    const params = { ...DEFAULT_INITIALIZE_PARAMS, ...initializeParams };
    const request = new RequestType<InitializeParams, InitializeResult, InitializeError>(
      'initialize',
    );

    return await Promise.race([
      this.#connection.sendRequest(request, params),
      // Set timeout on request
      new Promise<InitializeResult>((_, reject) => {
        setTimeout(() => reject(new Error('LSP initialize request timed out')), 1000);
      }),
    ]);
  }

  /**
   * Send the LSP 'initialized' notification
   */
  async sendInitialized(options?: InitializedParams | undefined): Promise<void> {
    const defaults = {};
    const params = { ...defaults, ...options };
    const request = new NotificationType<InitializedParams>('initialized');
    await this.#connection.sendNotification(request, params);
  }

  /**
   * Send the LSP 'workspace/didChangeConfiguration' notification
   */
  async sendDidChangeConfiguration(options?: ChangeConfigOptions | undefined): Promise<void> {
    const defaults = createFakePartial<ChangeConfigOptions>({
      settings: {
        token: this.#gitlabToken,
        baseUrl: this.#gitlabBaseUrl,
        codeCompletion: {
          enableSecretRedaction: true,
        },
        telemetry: {
          enabled: false,
        },
      },
    });

    const params = { ...defaults, ...options };
    const request = new NotificationType<DidChangeConfigurationParams>(
      'workspace/didChangeConfiguration',
    );

    await this.#connection.sendNotification(request, params);
  }

  async sendTextDocumentDidOpen(
    uri: string,
    languageId: string,
    version: number,
    text: string,
  ): Promise<void> {
    const params = {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    };

    const request = new NotificationType<DidOpenTextDocumentParams>('textDocument/didOpen');
    await this.#connection.sendNotification(request, params);
  }

  async sendTextDocumentDidClose(uri: string): Promise<void> {
    const params = {
      textDocument: {
        uri,
      },
    };

    const request = new NotificationType<DidCloseTextDocumentParams>('textDocument/didClose');
    await this.#connection.sendNotification(request, params);
  }

  /**
   * Send LSP 'textDocument/didChange' using Full sync method notification
   *
   * @param uri File URL. Should include the workspace path in the url
   * @param version Change version (incrementing from 0)
   * @param text Full contents of the file
   */
  async sendTextDocumentDidChangeFull(uri: string, version: number, text: string): Promise<void> {
    const params = {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text }],
    };

    const request = new NotificationType<DidChangeTextDocumentParams>('textDocument/didChange');
    await this.#connection.sendNotification(request, params);
  }

  async sendTextDocumentCompletion(
    uri: string,
    line: number,
    character: number,
  ): Promise<CompletionItem[] | CompletionList | null> {
    const params: CompletionParams = {
      textDocument: {
        uri,
      },
      position: {
        line,
        character,
      },
      context: {
        triggerKind: 1, // invoked
      },
    };

    const request = new RequestType1<
      CompletionParams,
      CompletionItem[] | CompletionList | null,
      void
    >('textDocument/completion');
    const result = await this.#connection.sendRequest(request, params);
    return result;
  }

  async sendDidChangeDocumentInActiveEditor(uri: string): Promise<void> {
    await this.#connection.sendNotification(DidChangeDocumentInActiveEditor, uri);
  }

  dispose() {
    this.#connection.end();
  }
}

export const createLspClientBrowser = async ({
  gitlabTestToken,
  gitlabUrl,
}: {
  gitlabTestToken?: string;
  gitlabUrl: string;
}) => {
  if (!gitlabTestToken) {
    throw new Error('Provide a GITLAB_TOKEN variable');
  }

  if (!gitlabUrl) {
    throw new Error('Provide a GITLAB_URL environment variable');
  }

  return new LspClientBrowser({
    worker: new Worker('./main-bundle.js'),
    gitlabToken: gitlabTestToken,
    gitlabBaseUrl: gitlabUrl,
  });
};
