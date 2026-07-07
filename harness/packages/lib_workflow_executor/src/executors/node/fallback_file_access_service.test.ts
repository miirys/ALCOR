/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { DefaultFallbackFileAccessService } from './fallback_file_access_service';

describe('DefaultFallbackFileAccessService', () => {
  let mockLogger: TestLogger;
  let fallbackService: DefaultFallbackFileAccessService;
  let firstService: FileAccessService;
  let secondService: FileAccessService;

  const testUri = '/path/to/file.ts';
  const testContent = 'file content';
  const testNewContent = 'new file content';

  beforeEach(() => {
    mockLogger = new TestLogger();

    firstService = createFakePartial<FileAccessService>({
      getText: jest.fn(),
      updateFile: jest.fn(),
      writeFile: jest.fn(),
      realPath: jest.fn(),
      priority: 2,
    });

    secondService = createFakePartial<FileAccessService>({
      getText: jest.fn(),
      updateFile: jest.fn(),
      writeFile: jest.fn(),
      realPath: jest.fn(),
      priority: 1,
    });

    fallbackService = new DefaultFallbackFileAccessService(mockLogger, [
      firstService,
      secondService,
    ]);
  });

  // Table-driven tests for all three methods
  describe.each([
    {
      methodName: 'getText' as const,
      args: [testUri],
      returns: testContent,
    },
    {
      methodName: 'updateFile' as const,
      args: [testUri, testNewContent],
      returns: undefined,
    },
    {
      methodName: 'writeFile' as const,
      args: [testUri, testNewContent],
      returns: undefined,
    },
    { methodName: 'realPath', args: [testUri], returns: testUri },
  ])('$methodName', ({ methodName, args, returns }) => {
    const callMethod = (service: FileAccessService | DefaultFallbackFileAccessService) => {
      return ((service as any)[methodName] as any)(...args);
    };

    it('uses the first service when it succeeds', async () => {
      jest.mocked((firstService as any)[methodName]).mockResolvedValue(returns as never);

      const result = await callMethod(fallbackService);

      expect((firstService as any)[methodName]).toHaveBeenCalledWith(...args);
      expect((secondService as any)[methodName]).not.toHaveBeenCalled();

      // For getText we expect a specific result, for others undefined
      if (methodName === 'getText') {
        expect(result).toBe(testContent);
      }
    });

    it('falls back to the second service when the first one fails', async () => {
      const error = new Error(`Service 1 ${methodName} failed`);
      jest.mocked((firstService as any)[methodName]).mockRejectedValue(error);

      jest.mocked((secondService as any)[methodName]).mockResolvedValue(returns as never);

      const result = await callMethod(fallbackService);

      expect((firstService as any)[methodName]).toHaveBeenCalledWith(...args);
      expect((secondService as any)[methodName]).toHaveBeenCalledWith(...args);

      // For getText we expect a specific result, for others undefined
      if (methodName === 'getText') {
        expect(result).toBe(testContent);
      }
    });

    it('throws an error when all services fail', async () => {
      const error1 = new Error(`Service 1 ${methodName} failed`);
      const error2 = new Error(`Service 2 ${methodName} failed`);

      jest.mocked((firstService as any)[methodName]).mockRejectedValue(error1);
      jest.mocked((secondService as any)[methodName]).mockRejectedValue(error2);

      await expect(callMethod(fallbackService)).rejects.toThrow(error2);

      expect((firstService as any)[methodName]).toHaveBeenCalledWith(...args);
      expect((secondService as any)[methodName]).toHaveBeenCalledWith(...args);
    });
  });
});
