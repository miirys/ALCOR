import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from './service';

describe('DefaultGraphQLService', () => {
  const mockFetchFromApi = jest.fn();
  let mockApi: GitLabApiService;
  const logger = createFakePartial<Logger>({ debug: jest.fn() });
  const mockOnApiReconfigured = jest.fn();
  const query = 'query Echo { echo }';

  const subject = ({ instanceVersion }: { instanceVersion: string }): GraphQLService => {
    mockApi = createFakePartial<GitLabApiService>({
      instanceInfo: { instanceVersion },
      fetchFromApi: mockFetchFromApi,
      onApiReconfigured: mockOnApiReconfigured,
    });
    return new DefaultGraphQLService(mockApi, logger);
  };

  describe('execute', () => {
    it('allows fallback function to raise errors', async () => {
      const originalError = new Error('hello hello');
      mockFetchFromApi.mockRejectedValueOnce(originalError);
      const expectedError = new Error('goodbye goodbye');
      const fallback = jest.fn().mockRejectedValueOnce(expectedError);

      await expect(
        subject({ instanceVersion: '15.0.0' }).execute(
          {
            fallback,
            supportedSinceInstanceVersion: '15.0.0',
            query,
          },
          {},
        ),
      ).rejects.toThrow(expectedError);
    });

    it('calls fallback to null response for earlier instance', async () => {
      const expected = { echo: 'fallback' };
      const fallback = jest.fn().mockReturnValueOnce(expected);
      await expect(
        subject({ instanceVersion: '17.0.0' }).execute(
          {
            fallback,
            supportedSinceInstanceVersion: '18.0.0',
            query,
          },
          {},
        ),
      ).resolves.toEqual(expected);

      expect(mockFetchFromApi).toHaveBeenCalledTimes(0);
      expect(fallback).toHaveBeenCalledWith(
        expect.objectContaining({ unsupported: 'future_field' }),
      );
    });

    it('calls fallback in case of an error', async () => {
      const expected = { echo: 'fallback' };

      const originalError = new Error('hello hello');
      mockFetchFromApi.mockRejectedValueOnce(originalError);
      const fallback = jest.fn().mockReturnValueOnce(expected);

      await expect(
        subject({ instanceVersion: '15.0.0' }).execute(
          {
            fallback,
            supportedSinceInstanceVersion: '15.0.0',
            query,
          },
          {},
        ),
      ).resolves.toEqual(expected);
      expect(fallback).toHaveBeenCalledWith(
        expect.objectContaining({
          err: originalError,
        }),
      );
    });

    it('resolves expected response', async () => {
      const expected = { echo: 'success' };
      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '15.0.0' }).execute(
          {
            fallback: () => {
              throw new Error('should not be called');
            },
            supportedSinceInstanceVersion: '15.0.0',
            query,
          },
          {},
        ),
      ).resolves.toEqual(expected);
    });

    describe('when a signal is provided', () => {
      it('passes the signal through to fetchFromApi', async () => {
        const abortController = new AbortController();
        mockFetchFromApi.mockResolvedValueOnce({ echo: 'ok' });

        await subject({ instanceVersion: '15.0.0' }).execute(
          {
            fallback: () => {
              throw new Error('should not be called');
            },
            supportedSinceInstanceVersion: '15.0.0',
            query,
          },
          {},
          abortController.signal,
        );

        expect(mockFetchFromApi).toHaveBeenCalledWith(
          expect.objectContaining({ signal: abortController.signal }),
        );
      });
    });

    it('respects API reconfiguration', async () => {
      const expected = { echo: 'success' };
      const service = subject({ instanceVersion: '18.0.0' });
      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        service.execute(
          {
            fallback: ({ err }) => ({ echo: err ? 'error' : 'unsupported' }),
            supportedSinceInstanceVersion: '15.0.0',
            query,
          },
          {},
        ),
      ).resolves.toEqual(expected);

      mockOnApiReconfigured({
        isInValidState: true,
        instanceInfo: { instanceVersion: '18.5.0' },
      });
    });
  });
});
