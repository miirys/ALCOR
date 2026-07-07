import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import type { CliUrlOpenerService } from './cli_url_opener_service';

const mockOpen = jest.fn<(target: string, options?: unknown) => Promise<void>>();

// Mock open package using unstable_mockModule for ES modules
jest.unstable_mockModule('open', () => ({
  default: mockOpen,
}));

// Use dynamic import for the module under test
const { CliUrlOpenerService: CliUrlOpenerServiceImpl } = await import('./cli_url_opener_service');

describe('CliUrlOpenerService', () => {
  let service: CliUrlOpenerService;
  let mockLogger: TestLogger;

  beforeEach(() => {
    mockLogger = new TestLogger();
    service = new CliUrlOpenerServiceImpl(mockLogger);
    // eslint-disable-next-line no-restricted-syntax
    mockOpen.mockClear();
    mockOpen.mockResolvedValue(undefined);
  });

  describe('URL validation', () => {
    it.each([
      {
        url: 'https://oauth.example.com/authorize?code=abc123',
        shouldSucceed: true,
        description: 'valid HTTPS URL with OAuth parameters',
      },
      {
        url: 'http://localhost:8080/callback',
        shouldSucceed: true,
        description: 'valid HTTP localhost URL',
      },
      {
        url: 'file:///etc/passwd',
        shouldSucceed: false,
        description: 'file:// scheme (security risk)',
        expectedError: 'Unsupported URL scheme: file:',
      },
      {
        // eslint-disable-next-line no-script-url
        url: 'javascript:alert(1)',
        shouldSucceed: false,
        // eslint-disable-next-line no-script-url
        description: 'javascript: scheme (XSS risk)',
        expectedError: 'Unsupported URL scheme: javascript:',
      },
      {
        url: 'not-a-url',
        shouldSucceed: false,
        description: 'malformed URL',
        expectedError: 'Invalid URL format',
      },
    ])('should handle $description', async ({ url, shouldSucceed, expectedError }) => {
      if (shouldSucceed) {
        await expect(service.openUrl(url)).resolves.toBeUndefined();
        expect(mockOpen).toHaveBeenCalledWith(url, { wait: false });
      } else {
        await expect(service.openUrl(url)).rejects.toThrow(expectedError);
        expect(mockOpen).not.toHaveBeenCalled();
      }
    });
  });

  describe('error handling', () => {
    it('should handle open() failures gracefully', async () => {
      const testUrl = 'https://example.com';
      const testError = new Error('Failed to open URL');

      mockOpen.mockRejectedValueOnce(testError);

      await expect(service.openUrl(testUrl)).rejects.toThrow('Failed to open URL');
    });
  });
});
