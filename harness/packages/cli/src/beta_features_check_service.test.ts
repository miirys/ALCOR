import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import {
  DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
  DUO_NO_NAMESPACE_DETECTED_MESSAGE,
  RESTError,
  type GitLabApiService,
} from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { BetaFeaturesCheckService } from './beta_features_check_service';

const makeRestError = (status: number, body?: string) =>
  new RESTError(
    createFakePartial<ConstructorParameters<typeof RESTError>[0]>({ type: 'rest' }),
    createFakePartial<Response>({ status, url: 'https://gitlab.example/api/v4/groups/my-group' }),
    'group details',
    body,
  );

describe('BetaFeaturesCheckService', () => {
  let service: BetaFeaturesCheckService;
  let mockLogger: TestLogger;
  let mockApiService: GitLabApiService;
  let mockFetchFromApi: jest.Mock<() => Promise<unknown>>;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFetchFromApi = jest.fn<() => Promise<unknown>>();

    mockApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: mockFetchFromApi as GitLabApiService['fetchFromApi'],
    });

    service = new BetaFeaturesCheckService(mockApiService, mockLogger);
  });

  describe('check', () => {
    describe('when experiment_features_enabled is true', () => {
      beforeEach(() => {
        mockFetchFromApi.mockResolvedValue({ experiment_features_enabled: true });
      });

      it('resolves with enabled', async () => {
        await expect(service.check('my-group')).resolves.toEqual({ status: 'enabled' });
      });
    });

    describe('when experiment_features_enabled is false', () => {
      beforeEach(() => {
        mockFetchFromApi.mockResolvedValue({ experiment_features_enabled: false });
      });

      it('resolves with error mentioning group settings', async () => {
        const result = await service.check('my-group');

        expect(result.status).toBe('error');
        expect(result).toHaveProperty('message', expect.stringContaining('Settings > GitLab Duo'));
      });
    });

    describe('when experiment_features_enabled is missing (pre-18.1 instance)', () => {
      beforeEach(() => {
        mockFetchFromApi.mockResolvedValue({});
      });

      it('resolves with error mentioning version requirement', async () => {
        const result = await service.check('my-group');

        expect(result.status).toBe('error');
        expect(result).toHaveProperty('message', expect.stringContaining('18.11 or later'));
      });
    });

    describe('when the API call fails', () => {
      beforeEach(() => {
        mockFetchFromApi.mockRejectedValue(new Error('Network error'));
      });

      it('resolves with error mentioning the group name', async () => {
        const result = await service.check('my-group');

        expect(result.status).toBe('error');
        expect(result).toHaveProperty('message', expect.stringContaining('"my-group"'));
      });
    });

    describe('when the API call fails with a 403', () => {
      beforeEach(() => {
        mockFetchFromApi.mockRejectedValue(makeRestError(403));
      });

      it('resolves with the not-entitled message', async () => {
        await expect(service.check('my-group')).resolves.toEqual({
          status: 'error',
          message: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
        });
      });
    });

    describe('when the API call fails with a 404', () => {
      beforeEach(() => {
        mockFetchFromApi.mockRejectedValue(makeRestError(404));
      });

      it('resolves with the not-entitled message', async () => {
        await expect(service.check('my-group')).resolves.toEqual({
          status: 'error',
          message: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
        });
      });
    });

    describe('when the API call fails with a missing_default_duo_group body', () => {
      beforeEach(() => {
        mockFetchFromApi.mockRejectedValue(
          makeRestError(403, JSON.stringify({ error: 'missing_default_duo_group' })),
        );
      });

      it('resolves with the no-namespace message', async () => {
        await expect(service.check('my-group')).resolves.toEqual({
          status: 'error',
          message: DUO_NO_NAMESPACE_DETECTED_MESSAGE,
        });
      });
    });

    describe('when the namespace contains slashes', () => {
      beforeEach(() => {
        mockFetchFromApi.mockResolvedValue({ experiment_features_enabled: true });
      });

      it('URL-encodes the namespace in the API request path', async () => {
        await service.check('group/subgroup');

        expect(mockFetchFromApi).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v4/groups/group%2Fsubgroup?with_projects=false',
          }),
        );
      });
    });
  });
});
