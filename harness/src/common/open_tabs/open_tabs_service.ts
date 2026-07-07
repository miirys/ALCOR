import { getByteSize, LsConnection } from '@gitlab-org/core';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { LRUCache } from 'lru-cache';
import type { DocumentUri } from 'vscode-languageserver-protocol';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { isFileSchemeUri, parseURIString } from '@gitlab-org/fs';
import { DocumentService } from '../document_service';
import { DocumentTransformerService } from '../document_transformer_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import { FsClient } from '../services/fs/fs';
import type { IDocContext } from '../document_transformer_service';

const LRU_CACHE_BYTE_SIZE_LIMIT = 24 * 1024 * 1024; // 24MB

export type OpenTab = IDocContext & {
  byteSize: number;
  lastAccessed: number;
  lastModified: number;
};

export interface OpenTabsService extends DefaultOpenTabsService {}

export const OpenTabsService = createInterfaceId<OpenTabsService>('OpenTabsService');

const isVsCode = (config: ClientConfig) =>
  Boolean(config.clientInfo?.name?.match(/Visual Studio Code/));
const isIgnoredFile = (uri: string) => uri.match(/.*package\.json$/);

@Injectable(OpenTabsService, [
  Logger,
  ConfigService,
  LsConnection,
  DocumentService,
  DocumentTransformerService,
  FsClient,
])
export class DefaultOpenTabsService implements OpenTabsService {
  #logger: Logger;

  #configService: ConfigService;

  #documentTransformer: DocumentTransformerService;

  #fsClient: FsClient;

  #cache: LRUCache<DocumentUri, OpenTab>;

  constructor(
    logger: Logger,
    configService: ConfigService,
    connection: LsConnection,
    documentService: DocumentService,
    documentTransformer: DocumentTransformerService,
    fsClient: FsClient,
  ) {
    this.#logger = withPrefix(logger, '[OpenTabsService]');
    this.#configService = configService;
    this.#documentTransformer = documentTransformer;
    this.#fsClient = fsClient;
    this.#cache = new LRUCache<DocumentUri, OpenTab>({
      maxSize: LRU_CACHE_BYTE_SIZE_LIMIT,
      sizeCalculation: this.#getDocumentSize.bind(this),
    });

    const subscription = documentService.onDocumentChange(async ({ document }, handlerType) => {
      try {
        await this.#updateOpenTabs(document, handlerType);
      } catch (error) {
        this.#logger.error(`Failed to update LRU cache for ${document.uri}: ${error}`);
      }
    });
    connection.onShutdown(() => subscription.dispose());
  }

  /**
   * Currently updates the LRU cache with the most recently accessed files in the workspace.
   */
  async #updateOpenTabs(document: TextDocument, handlerType: TextDocumentChangeListenerType) {
    // this is a temporary fix for https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/1983
    // VS Code sends didOpen events for files that don't have open tab (e.g. package.json files)
    if (isVsCode(this.#configService.get()) && isIgnoredFile(document.uri)) {
      this.#logger.debug(
        `Ignoring file ${document.uri} because VS Code sends this file to LS even when it's not open`,
      );
      return;
    }
    // eslint-disable-next-line default-case
    switch (handlerType) {
      case TextDocumentChangeListenerType.onDidClose: {
        // We don't check if the language is supported for `onDidClose` because we want
        // always attempt to delete the file from the cache.
        const fileDeleted = this.#cache.delete(document.uri);
        if (fileDeleted) {
          this.#logger.debug(`File ${document.uri} was deleted from the LRU cache`);
        } else {
          this.#logger.debug(`File ${document.uri} was not found in the LRU cache`);
        }
        break;
      }
      case TextDocumentChangeListenerType.onDidChangeContent:
      case TextDocumentChangeListenerType.onDidSave:
      case TextDocumentChangeListenerType.onDidOpen:
      case TextDocumentChangeListenerType.onDidSetActive: {
        const context = this.#documentTransformer.getContext(
          document.uri,
          { line: 0, character: 0 },
          this.#configService.get().workspaceFolders ?? [],
          undefined,
        );

        if (!context) {
          this.#logger.debug(`document context for ${document.uri} was not found`);
          return;
        }

        this.#cache.set(context.uri, {
          ...context,
          byteSize: this.#getDocumentSize(context),
          lastAccessed: Date.now(),
          lastModified: await this.#getLastModified(context, handlerType),
        });
        this.#logger.debug(`uri ${document.uri} was updated in the LRU cache with ${handlerType}`);

        break;
      }
    }
  }

  #getDocumentSize(value: OpenTab | IDocContext): number {
    if ('byteSize' in value) {
      return value.byteSize;
    }
    const size = getByteSize(`${value.prefix}${value.suffix}`);
    return Math.max(1, size);
  }

  async #getLastModified(documentContext: IDocContext, changeType: TextDocumentChangeListenerType) {
    switch (changeType) {
      case TextDocumentChangeListenerType.onDidChangeContent: {
        const cached = this.#cache.get(documentContext.uri);
        if (!cached) {
          return Date.now();
        }
        // in the case the `documents` from `vscode-languageserver-textdocument` send extra events
        // verify there were actually changes to the document
        const documentText = `${documentContext.prefix}${documentContext.suffix}`;
        const cachedText = `${cached.prefix}${cached.suffix}`;
        return documentText === cachedText ? cached.lastModified : Date.now();
      }
      case TextDocumentChangeListenerType.onDidSave:
        return Date.now();

      case TextDocumentChangeListenerType.onDidOpen:
      case TextDocumentChangeListenerType.onDidSetActive: {
        const cached = this.#cache.get(documentContext.uri);
        if (cached?.lastModified) {
          return cached.lastModified;
        }
        if (!isFileSchemeUri(documentContext.uri)) {
          return Date.now();
        }
        const stats = await this.#fsClient.promises.stat(
          parseURIString(documentContext.uri).fsPath,
        );
        return stats.mtime.getTime();
      }
      default:
        throw new Error(`Unknown change type: ${changeType}`);
    }
  }

  /**
   * Get the most recently accessed files in the workspace
   * @param context - The current document context `IDocContext`
   * @param includeCurrentFile - Include the current file in the list of most recent files, default is `true`
   */
  mostRecentTabs({
    context,
    includeCurrentFile = true,
  }: {
    context?: IDocContext;
    includeCurrentFile?: boolean;
  }): OpenTab[] {
    const files = Array.from(this.#cache.values());

    if (!context) {
      return files;
    }

    return files.filter(
      (file) =>
        context?.workspaceFolder?.uri === file.workspaceFolder?.uri &&
        (includeCurrentFile || file.uri !== context?.uri),
    );
  }

  get openTabsCache() {
    return this.#cache;
  }
}
