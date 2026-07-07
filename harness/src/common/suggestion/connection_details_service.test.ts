import { GitLabApiService, ApiReconfiguredData, EventListener } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { DefaultConnectionDetailsService, IConnectionDetails } from './connection_details_service';

describe('ConnectionDetailsService', () => {
  let reconfigurationListener: EventListener<ApiReconfiguredData>;
  let connectionDetailsService: DefaultConnectionDetailsService;
  let api: GitLabApiService;
  let connectionDetails: IConnectionDetails;

  const logger = createMockLogger();
  const mockFetchOperation = jest.fn();

  beforeEach(() => {
    connectionDetails = createFakePartial<IConnectionDetails>({
      instance_id: 'foo',
      global_user_id: 'bar',
      host_name: 'instance.gitlab.com',
      saas_duo_pro_namespace_ids: [100, 200],
      feature_enablement_type: 'duo_enterprise',
    });
    api = createFakePartial<GitLabApiService>({
      fetchOperation: jest.fn().mockReturnValue(mockFetchOperation),
      onApiReconfigured: (l) => {
        reconfigurationListener = l;
        return { dispose: () => {} };
      },
    });
    connectionDetailsService = new DefaultConnectionDetailsService(api, logger);

    jest.mocked(mockFetchOperation).mockResolvedValue(connectionDetails);
  });

  describe('onApiReconfigured', () => {
    it('it clears out the connection details', async () => {
      // Prime connection details
      await connectionDetailsService.fetch();

      // Fetches from API
      expect(connectionDetailsService.details).toMatchObject(connectionDetails);

      reconfigurationListener(
        createFakePartial<ApiReconfiguredData>({}),
        new AbortController().signal,
      );

      // Cleared by reconfiguration
      expect(connectionDetailsService.details).toBeUndefined();
    });
  });

  describe('fetch', () => {
    describe('when connection fails', () => {
      it('does not retry on generic error', async () => {
        jest.mocked(mockFetchOperation).mockRejectedValueOnce(new Error('API error'));

        await connectionDetailsService.fetch();

        expect(api.fetchOperation).toHaveBeenCalledTimes(1);
        expect(connectionDetailsService.details).toBeUndefined();
      });
    });

    describe('when connection succeeds', () => {
      it('saves the returned details', async () => {
        await connectionDetailsService.fetch();

        expect(connectionDetailsService.details).toMatchObject(connectionDetails);
      });
    });
  });
});
