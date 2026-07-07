import { Disposable } from '@gitlab-org/disposable';
import { TestLogger } from '@gitlab-org/logging';
import { TextDocumentChangeEvent } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DISABLED_LANGUAGE, UNSUPPORTED_LANGUAGE } from '@gitlab-org/core';
import { DefaultConfigService } from '@gitlab-org/config';
import {
  BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES,
  DefaultSupportedLanguagesService,
} from '../suggestion/supported_languages_service';
import { DocumentService, TextDocumentChangeListener } from '../document_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import {
  CodeSuggestionsSupportedLanguageCheck,
  DefaultCodeSuggestionsSupportedLanguageCheck,
} from './supported_language_check';

const mockUnsupportedLanguage = 'unsupportedlang';

describe('SupportedLanguageCheck', () => {
  const disposables: Disposable[] = [];
  let check: CodeSuggestionsSupportedLanguageCheck;
  const onDocumentChange = jest.fn();
  const listener = jest.fn();
  let documentEventListener: TextDocumentChangeListener;

  const documents = createFakePartial<DocumentService>({
    onDocumentChange,
  });

  const configService = new DefaultConfigService();
  const supportedLanguagesService = new DefaultSupportedLanguagesService(
    configService,
    new TestLogger(),
  );

  function triggerDocumentEvent(
    languageId: string,
    handlerType: TextDocumentChangeListenerType = TextDocumentChangeListenerType.onDidSetActive,
  ) {
    const document = createFakePartial<TextDocument>({ languageId });
    const event = createFakePartial<TextDocumentChangeEvent<TextDocument>>({ document });
    documentEventListener(event, handlerType);
  }

  beforeEach(async () => {
    onDocumentChange.mockImplementation((_listener) => {
      documentEventListener = _listener;
    });
    configService.set('codeCompletion.disabledSupportedLanguages', []);
    configService.set('codeCompletion.additionalLanguages', []);
    listener.mockReset();
    check = new DefaultCodeSuggestionsSupportedLanguageCheck(documents, supportedLanguagesService);
    disposables.push(check.onChanged(listener));
  });

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  describe.each([
    TextDocumentChangeListenerType.onDidSetActive,
    TextDocumentChangeListenerType.onDidOpen,
    TextDocumentChangeListenerType.onDocumentLanguageChange,
  ])('is updated on "%s" document event', (eventType) => {
    it('should NOT be engaged when document language is supported', () => {
      BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES.forEach((languageId: string) => {
        triggerDocumentEvent(languageId, eventType);

        expect(check.engaged).toBe(false);
        expect(check.id).toEqual(expect.any(String));
      });
    });

    it('should NOT be engaged when document language is enabled but not supported', () => {
      configService.set('codeCompletion.additionalLanguages', [mockUnsupportedLanguage]);
      triggerDocumentEvent(mockUnsupportedLanguage, eventType);

      expect(check.engaged).toBe(false);
      expect(check.id).toEqual(expect.any(String));
    });

    it('should be engaged when document language is disabled', () => {
      const languageId = 'python';
      configService.set('codeCompletion.disabledSupportedLanguages', [languageId]);
      triggerDocumentEvent(languageId, eventType);

      expect(check.engaged).toBe(true);
      expect(check.id).toBe(DISABLED_LANGUAGE);
    });

    it('should be engaged when document language is NOT supported', () => {
      triggerDocumentEvent(mockUnsupportedLanguage, eventType);

      expect(check.engaged).toBe(true);
      expect(check.id).toBe(UNSUPPORTED_LANGUAGE);
    });
  });

  describe('change event', () => {
    let initialEngaged: boolean;
    let initialId: string;

    beforeEach(() => {
      initialEngaged = check.engaged;
      initialId = check.id;
    });

    it('emits after check is updated', () => {
      listener.mockImplementation(() => {
        expect(check.engaged).toBe(!initialEngaged);
      });

      triggerDocumentEvent('python');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits when only engaged property changes', () => {
      triggerDocumentEvent('python');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(check.engaged).toBe(!initialEngaged);
      expect(check.id).toBe(initialId);
    });
  });
});
