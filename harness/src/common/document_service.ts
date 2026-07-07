import EventEmitter from 'events';
import { Disposable, TextDocumentChangeEvent, TextDocuments } from 'vscode-languageserver';
import { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';
import { createInterfaceId } from '@gitlab/needle';
import { TextDocumentChangeListenerType } from './text_document_change_listener_type';
import { HandlesNotification } from './handler';
import { DidChangeDocumentInActiveEditorParams } from './notifications';
import { log } from './log';

export interface TextDocumentChangeListener {
  (event: TextDocumentChangeEvent<TextDocument>, handlerType: TextDocumentChangeListenerType): void;
}

export interface DocumentService {
  onDocumentChange(listener: TextDocumentChangeListener): Disposable;
  notificationHandler(params: DidChangeDocumentInActiveEditorParams): void;
  getDocument(uri: string): TextDocument | undefined;
}

export const DocumentService = createInterfaceId<DocumentService>('DocumentsWrapper');

const DOCUMENT_CHANGE_EVENT_NAME = 'documentChange';

export class DefaultDocumentService
  implements DocumentService, HandlesNotification<DidChangeDocumentInActiveEditorParams>
{
  #subscriptions: Disposable[] = [];

  #emitter = new EventEmitter();

  #documents: TextDocuments<TextDocument>;

  #documentsLanguageMap = new Map<string, string>();

  constructor(documents: TextDocuments<TextDocument>) {
    this.#documents = documents;

    this.#subscriptions.push(
      documents.onDidOpen((params: TextDocumentChangeEvent<TextDocument>) => {
        this.#createMediatorListener(TextDocumentChangeListenerType.onDidOpen)(params);

        this.#handleDocumentLanguageChange(params);
      }),
      documents.onDidChangeContent(
        this.#createMediatorListener(TextDocumentChangeListenerType.onDidChangeContent),
      ),
      documents.onDidClose(this.#createMediatorListener(TextDocumentChangeListenerType.onDidClose)),
      documents.onDidSave(this.#createMediatorListener(TextDocumentChangeListenerType.onDidSave)),
    );
  }

  notificationHandler = (param: DidChangeDocumentInActiveEditorParams) => {
    const document = DefaultDocumentService.isTextDocument(param)
      ? param
      : this.#documents.get(param);

    if (!document) {
      log.debug(`Active editor document cannot be retrieved by URL: ${param}`);
      return;
    }

    const event: TextDocumentChangeEvent<TextDocument> = { document };
    this.#emitter.emit(
      DOCUMENT_CHANGE_EVENT_NAME,
      event,
      TextDocumentChangeListenerType.onDidSetActive,
    );
  };

  #createMediatorListener =
    (type: TextDocumentChangeListenerType) => (event: TextDocumentChangeEvent<TextDocument>) => {
      this.#emitter.emit(DOCUMENT_CHANGE_EVENT_NAME, event, type);
    };

  onDocumentChange(listener: TextDocumentChangeListener) {
    this.#emitter.on(DOCUMENT_CHANGE_EVENT_NAME, listener);
    return {
      dispose: () => this.#emitter.removeListener(DOCUMENT_CHANGE_EVENT_NAME, listener),
    };
  }

  /**
   *
   * when the document language is changed in VSCode - e.g. js => c++
   * `textDocument/didClose` will be called for the document: {uri: 'file.js', languageId: 'javascript}
   * then `textDocument/didOpen` for the the document: {uri: 'file.js', languageId: 'cpp}
   * so we keep a map of the uri-to-languageId to detect if the document language was changed
   * and notify the interested parties: currently supported language check needs to run on language change
   */
  #handleDocumentLanguageChange(params: TextDocumentChangeEvent<TextDocument>) {
    const { uri, languageId } = params.document;

    if (this.#documentsLanguageMap.has(uri)) {
      log.debug(`Possible language change: ${uri}`);
      this.#createMediatorListener(TextDocumentChangeListenerType.onDocumentLanguageChange)(params);
    } else {
      this.#documentsLanguageMap.delete(uri);
    }

    this.#documentsLanguageMap.set(uri, languageId);
  }

  getDocument(uri: string) {
    return this.#documents.get(uri);
  }

  static isTextDocument(param: TextDocument | DocumentUri): param is TextDocument {
    return Boolean((param as TextDocument)?.uri);
  }
}
