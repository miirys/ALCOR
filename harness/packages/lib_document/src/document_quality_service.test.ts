import { type Logger, TestLogger } from '@gitlab-org/logging';
import { type RpcMessageSender } from '@gitlab-org/rpc-client';
import { createFakePartial } from '@gitlab-org/test-utils';
import { type Diagnostic, DiagnosticSeverity, type Range } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { DefaultDocumentQualityService } from './document_quality_service';
import { GetDiagnosticsRequest } from './types';

describe('DefaultDocumentQualityService', () => {
  let mockLogger: Logger;
  let mockSender: RpcMessageSender;
  let service: DefaultDocumentQualityService;

  const testFileUri = URI.file('/path/to/test.ts');
  const testRange: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 10 },
  };
  const testDiagnostic: Diagnostic = {
    range: testRange,
    message: 'Test diagnostic message',
    severity: DiagnosticSeverity.Error,
    source: 'test-linter',
  };

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockSender = createFakePartial<RpcMessageSender>({
      send: jest.fn(),
    });

    service = new DefaultDocumentQualityService(mockLogger, mockSender);
  });

  describe('getDiagnostics', () => {
    it('sends correct request and returns diagnostics', async () => {
      const expectedDiagnostics: Diagnostic[] = [
        testDiagnostic,
        {
          range: {
            start: { line: 1, character: 5 },
            end: { line: 1, character: 15 },
          },
          message: 'Another diagnostic',
          severity: DiagnosticSeverity.Warning,
          source: 'test-linter',
        },
      ];

      jest.mocked(mockSender.send).mockResolvedValue(expectedDiagnostics);

      const result = await service.getDiagnostics(testFileUri);

      expect(mockSender.send).toHaveBeenCalledWith(GetDiagnosticsRequest, {
        fileUri: 'file:///path/to/test.ts',
      });
      expect(result).toEqual(expectedDiagnostics);
    });

    it('returns empty array when no diagnostics are found', async () => {
      jest.mocked(mockSender.send).mockResolvedValue([]);

      const result = await service.getDiagnostics(testFileUri);

      expect(mockSender.send).toHaveBeenCalledWith(GetDiagnosticsRequest, {
        fileUri: 'file:///path/to/test.ts',
      });
      expect(result).toEqual([]);
    });

    it('returns empty array when RPC call fails', async () => {
      const error = new Error('RPC connection failed');
      jest.mocked(mockSender.send).mockRejectedValue(error);

      const result = await service.getDiagnostics(testFileUri);

      expect(result).toEqual([]);
    });
  });
});
