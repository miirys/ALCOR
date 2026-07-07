import { EventEmitter } from 'events';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { DISABLED_LANGUAGE, UNSUPPORTED_LANGUAGE } from '@gitlab-org/core';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { DocumentService } from '../document_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import { SupportedLanguagesService } from '../suggestion/supported_languages_service';

export interface CodeSuggestionsSupportedLanguageCheck
  extends StateCheck<typeof DISABLED_LANGUAGE | typeof UNSUPPORTED_LANGUAGE> {}

export const CodeSuggestionsSupportedLanguageCheck =
  createInterfaceId<CodeSuggestionsSupportedLanguageCheck>('CodeSuggestionsSupportedLanguageCheck');

@Injectable(CodeSuggestionsSupportedLanguageCheck, [DocumentService, SupportedLanguagesService])
export class DefaultCodeSuggestionsSupportedLanguageCheck
  implements CodeSuggestionsSupportedLanguageCheck
{
  #documentService: DocumentService;

  #isLanguageEnabled = false;

  #isLanguageSupported = false;

  #supportedLanguagesService: SupportedLanguagesService;

  #currentDocument?: TextDocument;

  #stateEmitter = new EventEmitter();

  constructor(
    documentService: DocumentService,
    supportedLanguagesService: SupportedLanguagesService,
  ) {
    this.#documentService = documentService;
    this.#supportedLanguagesService = supportedLanguagesService;
    this.#documentService.onDocumentChange((event, handlerType) => {
      if (
        handlerType === TextDocumentChangeListenerType.onDidSetActive ||
        handlerType === TextDocumentChangeListenerType.onDidOpen ||
        handlerType === TextDocumentChangeListenerType.onDocumentLanguageChange
      ) {
        this.#updateWithDocument(event.document);
      }
    });

    this.#supportedLanguagesService.onLanguageChange(() => this.#update());
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  #updateWithDocument(document: TextDocument) {
    this.#currentDocument = document;
    this.#update();
  }

  get engaged() {
    return !this.#isLanguageEnabled;
  }

  get id() {
    return this.#isLanguageSupported && !this.#isLanguageEnabled
      ? DISABLED_LANGUAGE
      : UNSUPPORTED_LANGUAGE;
  }

  details = 'Code suggestions are not supported for this language';

  #update() {
    this.#checkLanguage();

    this.#stateEmitter.emit('change', this);
  }

  #checkLanguage() {
    if (!this.#currentDocument) {
      this.#isLanguageEnabled = false;
      this.#isLanguageSupported = false;
      return;
    }

    const { languageId } = this.#currentDocument;

    this.#isLanguageEnabled = this.#supportedLanguagesService.isLanguageEnabled(languageId);
    this.#isLanguageSupported = this.#supportedLanguagesService.isLanguageSupported(languageId);
  }
}
