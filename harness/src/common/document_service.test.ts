import { TextDocumentChangeEvent, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultDocumentService } from './document_service';
import { TextDocumentChangeListenerType } from './text_document_change_listener_type';

describe('DocumentService', () => {
  const mockDocuments = createFakePartial<TextDocuments<TextDocument>>({
    onDidOpen: jest.fn(),
    onDidChangeContent: jest.fn(),
    onDidSave: jest.fn(),
    onDidClose: jest.fn(),
    get: jest.fn(),
  });

  it('registers document change listeners', () => {
    // eslint-disable-next-line no-new
    new DefaultDocumentService(mockDocuments);

    expect(mockDocuments.onDidOpen).toHaveBeenCalled();
    expect(mockDocuments.onDidChangeContent).toHaveBeenCalled();
    expect(mockDocuments.onDidClose).toHaveBeenCalled();
    expect(mockDocuments.onDidSave).toHaveBeenCalled();
  });

  it.each`
    eventName               | mockMethod                          | listenerType
    ${'onDidOpen'}          | ${mockDocuments.onDidOpen}          | ${TextDocumentChangeListenerType.onDidOpen}
    ${'onDidChangeContent'} | ${mockDocuments.onDidChangeContent} | ${TextDocumentChangeListenerType.onDidChangeContent}
    ${'onDidClose'}         | ${mockDocuments.onDidClose}         | ${TextDocumentChangeListenerType.onDidClose}
    ${'onDidSave'}          | ${mockDocuments.onDidSave}          | ${TextDocumentChangeListenerType.onDidSave}
  `('invokes onDocumentChange with correct type for $eventName', ({ mockMethod, listenerType }) => {
    const mockListener = jest.fn();
    const service = new DefaultDocumentService(mockDocuments);
    service.onDocumentChange(mockListener);

    const mockEvent: TextDocumentChangeEvent<TextDocument> = {
      document: {} as TextDocument,
    };

    // Simulate the event by calling the listener passed to the mock method
    const registeredListener = jest.mocked(mockMethod).mock.calls[0][0];
    registeredListener(mockEvent);

    expect(mockListener).toHaveBeenCalledWith(mockEvent, listenerType);
  });

  describe('notificationHandler', () => {
    const mockListener = jest.fn();
    let service: DefaultDocumentService;
    const mockUri = 'test-uri';

    beforeEach(() => {
      service = new DefaultDocumentService(mockDocuments);
      service.onDocumentChange(mockListener);
    });

    it('should emit event when param is a TextDocument', () => {
      const mockDocument = { uri: mockUri } as TextDocument;

      service.notificationHandler(mockDocument);

      expect(mockListener).toHaveBeenCalledWith(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidSetActive,
      );
    });

    it('should emit event when param is a DocumentUri and document exists', () => {
      const mockDocument = { uri: mockUri } as TextDocument;
      jest.mocked(mockDocuments.get).mockReturnValue(mockDocument);

      service.notificationHandler(mockUri);

      expect(mockDocuments.get).toHaveBeenCalledWith(mockUri);
      expect(mockListener).toHaveBeenCalledWith(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidSetActive,
      );
    });

    it('should not emit event when param is a DocumentUri and document does not exist', () => {
      jest.mocked(mockDocuments.get).mockReturnValue(undefined);

      service.notificationHandler(mockUri);

      expect(mockDocuments.get).toHaveBeenCalledWith(mockUri);
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('documentLanguageChange', () => {
    it('should emit event when document language is changed', () => {
      const uri = 'untitled1';
      const mockListener = jest.fn();
      const service = new DefaultDocumentService(mockDocuments);
      service.onDocumentChange(mockListener);

      const mockEvent: TextDocumentChangeEvent<TextDocument> = {
        document: createFakePartial<TextDocument>({ uri, languageId: 'javascript' }),
      };

      const registeredListener = jest.mocked(mockDocuments.onDidOpen).mock.calls[0][0];
      registeredListener(mockEvent);

      expect(mockListener).toHaveBeenCalledWith(
        mockEvent,
        TextDocumentChangeListenerType.onDidOpen,
      );

      const mockEventWithChangedDocumentLanguage: TextDocumentChangeEvent<TextDocument> = {
        document: createFakePartial<TextDocument>({ uri, languageId: 'cpp' }),
      };

      registeredListener(mockEventWithChangedDocumentLanguage);

      expect(mockListener).toHaveBeenCalledWith(
        mockEventWithChangedDocumentLanguage,
        TextDocumentChangeListenerType.onDidOpen,
      );
      expect(mockListener).toHaveBeenCalledWith(
        mockEventWithChangedDocumentLanguage,
        TextDocumentChangeListenerType.onDocumentLanguageChange,
      );
    });
  });
});
