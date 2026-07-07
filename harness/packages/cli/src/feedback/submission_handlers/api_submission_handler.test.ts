import { describe, it, expect, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { GitLabApiService } from '@gitlab-org/core';
import type { RuntimeContext } from '../../runtime_context';
import { ApiSubmissionHandler } from './api_submission_handler';

describe('ApiSubmissionHandler', () => {
  const logger = new TestLogger();

  const mockRuntimeContext = createFakePartial<RuntimeContext>({
    cliVersion: '1.0.0',
    envInfo: {
      distribution: 'npm',
      osPlatform: 'darwin',
      osVersion: '23.0.0',
      terminalName: 'iTerm.app',
      isKittyProtocolSupported: false,
      duoCliVersion: '1.0.0',
      environment: 'development',
    },
  });

  const getLogs = () => ({ content: 'test logs', filePath: '/path/to/log' });

  const makeApiService = (overrides?: Partial<GitLabApiService>) => {
    const apiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn() as unknown as GitLabApiService['fetchFromApi'],
      ...overrides,
    });

    // Set default mock behavior if not overridden
    if (!overrides?.fetchFromApi) {
      jest.mocked(apiService.fetchFromApi).mockResolvedValue({
        iid: 123,
        web_url: 'https://gitlab.com/project/-/issues/123',
      });
    }

    return apiService;
  };

  describe('when API request succeeds', () => {
    it('returns SubmissionResult with API method and issue details', async () => {
      const handler = new ApiSubmissionHandler(
        makeApiService(),
        mockRuntimeContext,
        logger,
        getLogs,
        '12345',
      );

      const result = await handler.submit({
        title: 'Test Issue',
        description: 'Test description',
        type: 'bug',
        includeLogs: true,
        labels: ['test'],
      });

      expect(result).toEqual({
        method: 'api',
        issueNumber: 123,
        issueUrl: 'https://gitlab.com/project/-/issues/123',
      });
    });

    it('calls fetchFromApi with the correct path and body', async () => {
      const mockApiService = makeApiService();
      const handler = new ApiSubmissionHandler(
        mockApiService,
        mockRuntimeContext,
        logger,
        getLogs,
        '12345',
      );

      await handler.submit({
        title: 'Test Issue',
        description: 'Test description',
        type: 'feature',
        includeLogs: false,
        labels: ['duo-cli', 'type::feature'],
      });

      expect(mockApiService.fetchFromApi).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/projects/12345/issues',
          body: expect.objectContaining({
            title: 'Test Issue',
            labels: 'duo-cli,type::feature',
          }),
        }),
      );
    });
  });

  describe('when API request fails', () => {
    it('throws an error', async () => {
      const mockApiService = makeApiService();
      jest.mocked(mockApiService.fetchFromApi).mockRejectedValue(new Error('API error'));

      const handler = new ApiSubmissionHandler(
        mockApiService,
        mockRuntimeContext,
        logger,
        getLogs,
        '12345',
      );

      await expect(
        handler.submit({
          title: 'Test Issue',
          description: 'Test description',
          type: 'bug',
          includeLogs: true,
          labels: ['test'],
        }),
      ).rejects.toThrow();
    });
  });
});
