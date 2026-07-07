import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { RpcMessageSender } from '@gitlab-org/rpc-client';
import { TextEdit } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentService } from '../document_service';
import { LspFileAccessService } from './lsp_file_access_service';

describe('LspFileAccessService', () => {
  let mockLogger: TestLogger;
  let mockSender: RpcMessageSender;
  let mockDocumentService: DocumentService;
  let service: LspFileAccessService;

  const testPath = '/path/to/file.ts';
  const testUri = 'file:///path/to/file.ts';
  const testContent = 'const foo = "bar";';
  const testNewContent = 'const foo = "updated";';

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockSender = createFakePartial<RpcMessageSender>({
      send: jest.fn(),
    });

    mockDocumentService = createFakePartial<DocumentService>({
      getDocument: jest.fn(),
    });

    service = new LspFileAccessService(mockLogger, mockSender, mockDocumentService);
  });

  describe('getText', () => {
    it('returns text content from document service when document exists', async () => {
      const mockDocument = createFakePartial<TextDocument>({
        getText: jest.fn().mockReturnValue(testContent),
      });

      jest.mocked(mockDocumentService.getDocument).mockReturnValue(mockDocument);

      const result = await service.getText(testPath);

      expect(mockDocumentService.getDocument).toHaveBeenCalledWith(testUri);
      expect(mockDocument.getText).toHaveBeenCalled();
      expect(result).toBe(testContent);
    });

    describe('when the path is already a virtual filesystem URI', () => {
      it('passes the URI through as-is without converting to file://', async () => {
        const virtualUri = 'adt://server/sap/bc/adt/packages/zmy_package/myfile.abap';
        const mockDocument = createFakePartial<TextDocument>({
          getText: jest.fn().mockReturnValue(testContent),
        });

        jest.mocked(mockDocumentService.getDocument).mockReturnValue(mockDocument);

        await service.getText(virtualUri);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(virtualUri);
      });

      it('passes semanticfs:// URIs through as-is', async () => {
        const virtualUri = 'semanticfs://host/path/to/file.ts';
        const mockDocument = createFakePartial<TextDocument>({
          getText: jest.fn().mockReturnValue(testContent),
        });

        jest.mocked(mockDocumentService.getDocument).mockReturnValue(mockDocument);

        await service.getText(virtualUri);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(virtualUri);
      });

      it('passes URIs without an authority component through as-is (single slash after scheme)', async () => {
        const virtualUri = 'testfs:/demo/src/math.ts';
        const mockDocument = createFakePartial<TextDocument>({
          getText: jest.fn().mockReturnValue(testContent),
        });

        jest.mocked(mockDocumentService.getDocument).mockReturnValue(mockDocument);

        await service.getText(virtualUri);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(virtualUri);
      });
    });
  });

  describe('updateFile', () => {
    let mockTextEdits: TextEdit[];

    beforeEach(() => {
      mockTextEdits = [
        createFakePartial<TextEdit>({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: testNewContent.length },
          },
          newText: testNewContent,
        }),
      ];
    });

    it('successfully updates file content via LSP workspace edit', async () => {
      const mockResponse = { applied: true };
      jest.mocked(mockSender.send).mockResolvedValue(mockResponse);

      await service.updateFile(testPath, mockTextEdits);

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          methodName: 'workspace/applyEdit',
        }),
        {
          edit: {
            documentChanges: [
              {
                textDocument: { uri: testUri, version: null },
                edits: [
                  {
                    range: {
                      start: { line: 0, character: 0 },
                      end: { line: 0, character: 22 },
                    },
                    newText: testNewContent,
                  },
                ],
              },
            ],
          },
        },
      );
    });

    describe('when the path is already a virtual filesystem URI', () => {
      it('uses the virtual URI directly in the workspace edit request', async () => {
        const virtualUri = 'adt://server/sap/bc/adt/packages/zmy_package/myfile.abap';
        const mockResponse = { applied: true };
        jest.mocked(mockSender.send).mockResolvedValue(mockResponse);

        await service.updateFile(virtualUri, mockTextEdits);

        expect(mockSender.send).toHaveBeenCalledWith(
          expect.objectContaining({
            methodName: 'workspace/applyEdit',
          }),
          expect.objectContaining({
            edit: expect.objectContaining({
              documentChanges: expect.arrayContaining([
                expect.objectContaining({
                  textDocument: { uri: virtualUri, version: null },
                }),
              ]),
            }),
          }),
        );
      });
    });
  });
});
