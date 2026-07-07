import fs from 'node:fs';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import {
  CompletionItem,
  CompletionList,
  CompletionParams,
  DidCloseTextDocumentParams,
  DidChangeTextDocumentParams,
  DidChangeConfigurationParams,
  DidOpenTextDocumentParams,
  InitializedParams,
  InitializeError,
  InitializeParams,
  InitializeResult,
  RequestType,
  NotificationType,
  RequestType1,
  MessageConnection,
  MarkupKind,
  DidChangeWatchedFilesParams,
  FileChangeType,
  RegistrationParams,
  RegistrationRequest,
  DidChangeWatchedFilesRegistrationOptions,
  Registration,
  createMessageConnection,
} from 'vscode-languageserver';
import { AIContextCategory, AIContextItem, DuoChatAIRequest } from '@gitlab-org/ai-context';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ChangeConfigOptions } from '../../common/core/handlers/did_change_configuration_handler';
import { WebviewMetadata } from '../../common/webview';
import { DidChangeDocumentInActiveEditor } from '../../common';
import { AIContextEndpoints } from '../../common/ai_context_management';
import { log } from '../../common/log';
import { CustomInitializeParams } from '../../common/core/handlers/initialize_handler';
import { WORKSPACE_FOLDER_URI } from './test_utils';

if (process.env.GITLAB_TEST_TOKEN === undefined || process.env.GITLAB_TEST_TOKEN.length < 4) {
  throw new Error('Error, GITLAB_TEST_TOKEN not set to a GitLab PAT.');
}

export const { GITLAB_TEST_TOKEN } = process.env;

export const DEFAULT_INITIALIZE_PARAMS = createFakePartial<CustomInitializeParams>({
  processId: process.pid,
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

/**
 * Low level language server client for integration tests
 */
export class LspClient {
  #childProcess: ChildProcessWithoutNullStreams;

  #connection: MessageConnection;

  #gitlabToken: string;

  #gitlabBaseUrl: string = 'https://gitlab.com';

  childProcessConsole: string[] = [];

  #watchedFiles: Set<string> = new Set();

  /**
   * Spawn language server and create an RPC connection.
   *
   * @param gitlabToken GitLab PAT to use for code suggestions
   */
  constructor(gitlabToken: string) {
    this.#gitlabToken = gitlabToken;

    const command = process.env.LSP_COMMAND ?? 'node';
    const args = process.env.LSP_ARGS?.split(' ') ?? ['./out/main-bundle-node.js', '--stdio'];
    console.log(`Running LSP using command \`${command} ${args.join(' ')}\` `);

    const file = command === 'node' ? args[0] : command;
    expect(file).not.toBe(undefined);
    expect({ file, exists: fs.existsSync(file) }).toEqual({ file, exists: true });

    this.#childProcess = spawn(command, args);
    this.#childProcess.stderr.on('data', (chunk: Buffer | string) => {
      const chunkString = chunk.toString('utf8');
      this.childProcessConsole = this.childProcessConsole.concat(chunkString.split('\n'));
      process.stderr.write(chunk);
    });

    // Use stdin and stdout for communication:
    this.#connection = createMessageConnection(
      new StreamMessageReader(this.#childProcess.stdout),
      new StreamMessageWriter(this.#childProcess.stdin),
    );

    this.#connection.listen();
    this.#connection.onError(function (err) {
      console.error(err);
      expect(err).not.toBeTruthy();
    });

    this.#connection.onRequest(
      RegistrationRequest.method,
      this.#handleRegisterCapability.bind(this),
    );
  }

  /**
   * Make sure to call this method to shutdown the LS rpc connection
   */
  dispose() {
    this.#connection.end();
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
    const response = await this.#connection.sendRequest(request, params);
    return response;
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

  async getWebviewMetadata(): Promise<WebviewMetadata[]> {
    const result = await this.#connection.sendRequest<WebviewMetadata[]>(
      '$/gitlab/webview-metadata',
    );
    return result;
  }

  async getAvailableCategories(): Promise<AIContextCategory[]> {
    const result = await this.#connection.sendRequest<AIContextCategory[]>(
      AIContextEndpoints.GET_PROVIDER_CATEGORIES,
    );
    return result;
  }

  async getSelectedContextItems(): Promise<AIContextItem[]> {
    const result = await this.#connection.sendRequest<AIContextItem[]>(
      AIContextEndpoints.CURRENT_ITEMS,
    );
    return result;
  }

  async retrieveSelectedContextItemsWithContent(): Promise<AIContextItem[]> {
    const result = await this.#connection.sendRequest<AIContextItem[]>(AIContextEndpoints.RETRIEVE);
    return result;
  }

  async searchContextItemsForCategory(searchQuery: DuoChatAIRequest): Promise<AIContextItem[]> {
    const result = await this.#connection.sendRequest<AIContextItem[]>(
      AIContextEndpoints.QUERY,
      searchQuery,
    );
    return result;
  }

  async addSelectedContextItem(item: AIContextItem): Promise<void> {
    await this.#connection.sendRequest(AIContextEndpoints.ADD, item);
  }

  async removeSelectedContextItem(item: AIContextItem): Promise<void> {
    await this.#connection.sendRequest(AIContextEndpoints.REMOVE, item);
  }

  async clearSelectedContextItems(): Promise<void> {
    await this.#connection.sendRequest(AIContextEndpoints.CLEAR);
  }

  async #handleRegisterCapability(params: RegistrationParams): Promise<void> {
    for (const registration of params.registrations) {
      if (registration.method === 'workspace/didChangeWatchedFiles') {
        this.#handleDidChangeWatchedFilesRegistration(registration);
      }
      log.info(`[LspClient] handleRegisterCapability: ${JSON.stringify(registration)}`);
    }
  }

  #handleDidChangeWatchedFilesRegistration(registration: Registration): void {
    const options = registration.registerOptions as DidChangeWatchedFilesRegistrationOptions;
    for (const watcher of options.watchers) {
      // For simplicity, we'll just add the raw globPattern to our watchedFiles set
      // In a real implementation, you'd need to resolve the glob pattern
      this.#watchedFiles.add(watcher.globPattern.toString());
    }
  }

  get watchedFiles(): Set<string> {
    return this.#watchedFiles;
  }

  async sendFakeFileEvent(uri: string, type: FileChangeType): Promise<void> {
    const params: DidChangeWatchedFilesParams = {
      changes: [{ uri, type }],
    };

    const notification = new NotificationType<DidChangeWatchedFilesParams>(
      'workspace/didChangeWatchedFiles',
    );
    await this.#connection.sendNotification(notification, params);
    log.info(`[LspClient] Sent fake file event for ${uri} with type ${type}`);
  }
}
