import { GitLabApiService, ApiReconfiguredData, EventListener } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { ConfigService } from '@gitlab-org/config';
import { SECOND, MINUTE } from '../constants';
import {
  DefaultDirectConnectionDetailsService,
  IDirectConnectionDetails,
} from './direct_connection_details_service';

describe('DirectConnectionDetailsService', () => {
  let reconfigurationListener: EventListener<ApiReconfiguredData>;
  let directConnectionDetailsService: DefaultDirectConnectionDetailsService;
  let api: GitLabApiService;
  let directConnectionDetails: IDirectConnectionDetails;
  let abortController: AbortController;

  const projectPath = 'gitlab/gitlab-lsp';
  const logger = createMockLogger();
  const configService = createFakePartial<ConfigService>({
    get: jest.fn().mockReturnValue(projectPath),
  });
  const mockFetchOperation = jest.fn();

  beforeEach(() => {
    abortController = new AbortController();
    directConnectionDetails = createFakePartial<IDirectConnectionDetails>({
      token: 'abc',
      expires_at: Date.now() / SECOND + MINUTE,
      headers: {
        'X-Gitlab-Host-Name': 'gitlab.example.com',
        'X-Gitlab-Instance-Id': 'instance-id',
      },
    });

    api = createFakePartial<GitLabApiService>({
      fetchOperation: jest.fn().mockReturnValue(mockFetchOperation),
      onApiReconfigured: (l) => {
        reconfigurationListener = l;
        return { dispose: () => {} };
      },
    });
    directConnectionDetailsService = new DefaultDirectConnectionDetailsService(
      api,
      configService,
      logger,
    );

    jest.mocked(mockFetchOperation).mockResolvedValue(directConnectionDetails);
  });

  describe('onApiReconfigured', () => {
    it('it clears out the connection details', async () => {
      await directConnectionDetailsService.refresh(abortController.signal);
      // Fetches from API
      expect(directConnectionDetailsService.details).toMatchObject(directConnectionDetails);

      reconfigurationListener(createFakePartial<ApiReconfiguredData>({}), abortController.signal);

      // Cleared by reconfiguration
      expect(directConnectionDetailsService.details).toBeUndefined();
    });
  });

  describe('expired', () => {
    it('returns true when details are undefined', () => {
      expect(directConnectionDetailsService.details).toBeUndefined();
      expect(directConnectionDetailsService.expired()).toBeTruthy();
    });

    it('returns true when details are defined and expires_at is past considering threshold', async () => {
      await directConnectionDetailsService.refresh(abortController.signal);
      directConnectionDetails.expires_at = Date.now() / SECOND - MINUTE;

      expect(directConnectionDetailsService.details).toEqual(directConnectionDetails);
      expect(directConnectionDetailsService.expired()).toBeTruthy();
    });

    it('returns false when details are defined and expires_at is in the future considering threshold', async () => {
      await directConnectionDetailsService.refresh(abortController.signal);
      directConnectionDetails.expires_at = Date.now() / SECOND + 35 * SECOND;

      expect(directConnectionDetailsService.details).toEqual(directConnectionDetails);
      expect(directConnectionDetailsService.expired()).toBeFalsy();
    });
  });

  describe('refresh', () => {
    describe('when connection fails', () => {
      it('does not connect when aborted', async () => {
        abortController.abort();

        await directConnectionDetailsService.refresh(abortController.signal);

        expect(api.fetchOperation).not.toHaveBeenCalled();
        expect(directConnectionDetailsService.details).toBeUndefined();
      });

      it('does not retry on generic error', async () => {
        jest.mocked(mockFetchOperation).mockRejectedValueOnce(new Error('API error'));

        await directConnectionDetailsService.refresh(abortController.signal);

        expect(api.fetchOperation).toHaveBeenCalledTimes(1);
        expect(directConnectionDetailsService.details).toBeUndefined();
      });
    });

    describe('when connection succeeds', () => {
      it('saves the returned details', async () => {
        await directConnectionDetailsService.refresh(abortController.signal);

        expect(directConnectionDetailsService.details).toMatchObject(directConnectionDetails);
      });
    });
  });

  describe('refreshIfNeeded', () => {
    beforeEach(async () => {
      // Prime connection details
      await directConnectionDetailsService.refresh(abortController.signal);
    });

    describe('when connection details are still valid', () => {
      it('does not refresh them', async () => {
        await directConnectionDetailsService.refreshIfNeeded(abortController.signal);

        // Called only once on the first request
        expect(api.fetchOperation).toHaveBeenCalledTimes(1);
      });
    });

    describe('when connection details are not valid anymore', () => {
      it('refreshes them', async () => {
        directConnectionDetails.expires_at = Date.now() / SECOND - 100; // Make expired

        await directConnectionDetailsService.refreshIfNeeded(abortController.signal);

        // Called once on the first request and again on `refreshIfNeeded`
        expect(api.fetchOperation).toHaveBeenCalledTimes(2);
      });
    });
  });
});
