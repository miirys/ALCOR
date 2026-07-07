import { GitLabApiService, ApiReconfiguredData, EventListener } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { AbortError } from '@gitlab-org/resiliency';
import { createQuotaExceededError } from './test_utils';
import { DefaultUsageQuotaService } from './default_usage_quota_service';

describe('UsageQuotaService', () => {
  let reconfigurationListener: EventListener<ApiReconfiguredData>;
  let usageQuotaService: DefaultUsageQuotaService;
  let api: GitLabApiService;
  let abortController: AbortController;

  const logger = createMockLogger();
  const mockFetchOperation = jest.fn();

  beforeEach(() => {
    abortController = new AbortController();

    api = createFakePartial<GitLabApiService>({
      fetchOperation: jest.fn().mockReturnValue(mockFetchOperation),
      onApiReconfigured: (l) => {
        reconfigurationListener = l;
        return { dispose: () => {} };
      },
    });
    usageQuotaService = new DefaultUsageQuotaService(api, logger);
  });

  describe('onApiReconfigured', () => {
    it('registers a reconfiguration listener', () => {
      // Verify that the reconfiguration listener was registered
      expect(reconfigurationListener).toBeDefined();
    });
  });

  describe('checkUsageCreditsExceeded', () => {
    describe('request body parameters', () => {
      beforeEach(() => {
        jest.mocked(mockFetchOperation).mockResolvedValue(undefined);
      });

      it('passes root_namespace_id in request body when provided', async () => {
        await usageQuotaService.checkUsageCreditsExceeded(
          abortController.signal,
          'gid://gitlab/Group/123',
        );

        expect(api.fetchOperation).toHaveBeenCalledWith({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/ai/duo_workflows/direct_access',
          body: { root_namespace_id: 'gid://gitlab/Group/123' },
          supportedSinceInstanceVersion: {
            resourceName: 'get workflow direct access',
            version: '18.1.0',
          },
        });
      });

      it('passes workflow_definition in request body when provided', async () => {
        await usageQuotaService.checkUsageCreditsExceeded(
          abortController.signal,
          undefined,
          'chat',
        );

        expect(api.fetchOperation).toHaveBeenCalledWith({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/ai/duo_workflows/direct_access',
          body: { workflow_definition: 'chat' },
          supportedSinceInstanceVersion: {
            resourceName: 'get workflow direct access',
            version: '18.1.0',
          },
        });
      });

      it('passes both root_namespace_id and workflow_definition when both provided', async () => {
        await usageQuotaService.checkUsageCreditsExceeded(
          abortController.signal,
          'gid://gitlab/Group/123',
          'software_development',
        );

        expect(api.fetchOperation).toHaveBeenCalledWith({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/ai/duo_workflows/direct_access',
          body: {
            root_namespace_id: 'gid://gitlab/Group/123',
            workflow_definition: 'software_development',
          },
          supportedSinceInstanceVersion: {
            resourceName: 'get workflow direct access',
            version: '18.1.0',
          },
        });
      });

      it('sends empty body when neither root_namespace_id nor workflow_definition is provided', async () => {
        await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(api.fetchOperation).toHaveBeenCalledWith({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/ai/duo_workflows/direct_access',
          body: {},
          supportedSinceInstanceVersion: {
            resourceName: 'get workflow direct access',
            version: '18.1.0',
          },
        });
      });
    });

    describe('when quota check fails', () => {
      it('returns false when aborted', async () => {
        abortController.abort();

        const result = await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(api.fetchOperation).not.toHaveBeenCalled();
        expect(result).toBe(false);
      });

      it('returns false on abort error', async () => {
        jest.mocked(mockFetchOperation).mockRejectedValueOnce(new AbortError());

        const result = await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(result).toBe(false);
      });

      it('returns false on invalid instance version error', async () => {
        jest
          .mocked(mockFetchOperation)
          .mockRejectedValueOnce(
            new InvalidInstanceVersionError('Instance version is under 18.1.0'),
          );

        const result = await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
          '[UsageQuotaService] GitLab instance does not support usage quota checking.',
          undefined,
        );
      });

      it('returns true when USAGE_QUOTA_EXCEEDED error occurs', async () => {
        const error = createQuotaExceededError();

        jest.mocked(mockFetchOperation).mockRejectedValueOnce(error);

        const result = await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(result).toBe(true);
        expect(usageQuotaService.usageQuotaExceeded).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          '[UsageQuotaService] Usage quota exceeded for duo workflows',
          undefined,
        );
      });

      it('returns false on generic error', async () => {
        jest.mocked(mockFetchOperation).mockRejectedValueOnce(new Error('API error'));

        const result = await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
          '[UsageQuotaService] Failed to check usage quota',
          expect.any(Error),
        );
      });
    });

    describe('when quota check succeeds', () => {
      it('returns false', async () => {
        jest.mocked(mockFetchOperation).mockResolvedValue(undefined);

        const result = await usageQuotaService.checkUsageCreditsExceeded(abortController.signal);

        expect(result).toBe(false);
      });
    });
  });
});
