import { Disposable } from '@gitlab-org/disposable';
import {
  ApiReconfiguredData,
  EventListener,
  SimpleApiClient,
  CLASSIC_CHAT_NO_LICENSE,
} from '@gitlab-org/core';
import { retry } from '@gitlab-org/resiliency';
import { createFakePartial } from '@gitlab-org/test-utils';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { GitLabApiClient } from '../api';
import { DefaultClassicChatLicenseCheck } from './classic_chat_license_check';

jest.mock('@gitlab-org/resiliency');

describe('ClassicChatLicenseCheck', () => {
  const disposables: Disposable[] = [];

  let mockApi: GitLabApiClient;
  let listeners: EventListener<ApiReconfiguredData>[] = [];

  let check: DefaultClassicChatLicenseCheck;
  let fetchOperation = jest.fn();

  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    fetchOperation = jest.fn();
    jest.mocked(retry).mockImplementation((factory) => factory(new AbortController().signal));
    mockApi = createFakePartial<GitLabApiClient>({
      fetchOperation: jest.fn().mockReturnValue(fetchOperation),
      onApiReconfigured: jest.fn((listener) => {
        listeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    check = new DefaultClassicChatLicenseCheck(mockApi);
    disposables.push(check.onChanged(checkEngagedChangeListener));
  });

  afterEach(() => {
    listeners = [];

    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  const reconfigureApi = async (
    data: ApiReconfiguredData = createFakePartial<ApiReconfiguredData>({ isInValidState: true }),
  ) => {
    listeners.forEach((listener) => listener(data, new AbortController().signal));

    await new Promise(process.nextTick);
  };

  const licenseAvailableResponse = {
    currentUser: {
      duoClassicChatAvailable: true,
    },
  };

  const licenseUnavailableResponse = {
    currentUser: {
      duoClassicChatAvailable: false,
    },
  };

  describe('is updated on config change', () => {
    it('should include minimum query version in the request', async () => {
      fetchOperation.mockResolvedValueOnce(licenseUnavailableResponse);

      await reconfigureApi();

      expect(mockApi.fetchOperation).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.any(String),
        variables: {},
        supportedSinceInstanceVersion: {
          version: '18.10.0',
          resourceName: 'get current user Duo Classic Chat license',
        },
      });
    });

    it('should NOT be engaged when the instance version is under 18.10.0 (fail-open)', async () => {
      jest
        .mocked(fetchOperation)
        .mockRejectedValueOnce(
          new InvalidInstanceVersionError('Instance version is under 18.10.0'),
        );

      await reconfigureApi();

      expect(check.engaged).toBe(false);
    });

    it('should be engaged when classic chat license is NOT available', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseUnavailableResponse);

      await reconfigureApi();

      expect(check.engaged).toBe(true);
    });

    it('should NOT be engaged when classic chat license is available', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseAvailableResponse);

      await reconfigureApi();

      expect(check.engaged).toBe(false);
    });

    it('should be engaged when check for license failed', async () => {
      jest.mocked(fetchOperation).mockRejectedValue(new Error('API Error'));

      await reconfigureApi();

      expect(check.engaged).toBe(true);
    });
  });

  describe('api reconfigured', () => {
    it('emits when api is reconfigured in a valid state', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseUnavailableResponse);
      await reconfigureApi();

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
    });

    it('does not emit when api is reconfigured in an invalid state', async () => {
      await reconfigureApi();
      jest.mocked(checkEngagedChangeListener).mockClear();

      await reconfigureApi({ isInValidState: false, validationMessage: 'error' });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    let simpleClient: SimpleApiClient;

    beforeEach(() => {
      simpleClient = createFakePartial<SimpleApiClient>({
        fetchFromApi: jest.fn(),
      });
      mockApi = createFakePartial<GitLabApiClient>({
        fetchFromApi: jest.fn(),
        onApiReconfigured: jest.fn((listener) => {
          listeners.push(listener);
          return { dispose: () => {} };
        }),
        getSimpleClient: jest.fn().mockReturnValue(simpleClient),
      });

      check = new DefaultClassicChatLicenseCheck(mockApi);
      disposables.push(check.onChanged(checkEngagedChangeListener));
    });

    it('should not be valid if the classic chat license is not available', async () => {
      jest.mocked(simpleClient.fetchFromApi).mockResolvedValueOnce(licenseUnavailableResponse);

      const result = await check.validate({
        baseUrl: 'https://gitlab.com',
        token: 'glpat-1234567',
      });

      expect(result?.checkId).toBe(CLASSIC_CHAT_NO_LICENSE);
      expect(result?.engaged).toBe(true);
    });

    it('should be valid if the classic chat license is available', async () => {
      jest.mocked(simpleClient.fetchFromApi).mockResolvedValueOnce(licenseAvailableResponse);

      const result = await check.validate({
        baseUrl: 'https://gitlab.com',
        token: 'glpat-1234567',
      });

      expect(result).toEqual({
        checkId: CLASSIC_CHAT_NO_LICENSE,
        details: expect.any(String),
        engaged: false,
      });
    });
  });
});
