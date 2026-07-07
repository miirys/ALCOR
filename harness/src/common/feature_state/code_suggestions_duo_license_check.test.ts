import { Disposable } from '@gitlab-org/disposable';
import { ApiReconfiguredData, EventListener, SimpleApiClient } from '@gitlab-org/core';
import { retry } from '@gitlab-org/resiliency';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiClient } from '../api';
import { DefaultCodeSuggestionsDuoLicenseCheck } from './code_suggestions_duo_license_check';

jest.mock('@gitlab-org/resiliency');

describe('DefaultCodeSuggestionsDuoLicenseCheck', () => {
  const disposables: Disposable[] = [];

  let listeners: EventListener<ApiReconfiguredData>[] = [];

  let check: DefaultCodeSuggestionsDuoLicenseCheck;
  let mockApi: GitLabApiClient;
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

    check = new DefaultCodeSuggestionsDuoLicenseCheck(mockApi);
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
      duoCodeSuggestionsAvailable: true,
    },
  };

  const licenseUnavailableResponse = {
    currentUser: {
      duoCodeSuggestionsAvailable: false,
    },
  };

  describe('is updated on config change"', () => {
    it('should be engaged when license is NOT available', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseUnavailableResponse);

      await reconfigureApi();

      expect(check.engaged).toBe(true);
    });

    it('should NOT be engaged when license is available', async () => {
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
    it('emits api is reconfigured in a valid state', async () => {
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseAvailableResponse);
      await reconfigureApi();

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
    });

    it('does not emit when api is reconfigured in an invalid state', async () => {
      await reconfigureApi();
      jest.mocked(checkEngagedChangeListener).mockClear();

      await reconfigureApi({ isInValidState: false, validationMessage: 'error' });

      await new Promise(process.nextTick);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('onChanged is not called when license state is the same ', async () => {
      // mimic the change of license state once

      // license is available
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseAvailableResponse);
      await reconfigureApi();

      // license is available again
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseAvailableResponse);
      await reconfigureApi();

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
    });

    it('onChanged is called when license state changed ', async () => {
      // mimic the change of license state twice

      // license is available
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseAvailableResponse);
      await reconfigureApi();

      // license is not available
      jest.mocked(fetchOperation).mockResolvedValueOnce(licenseUnavailableResponse);
      await reconfigureApi();

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(2);
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

      check = new DefaultCodeSuggestionsDuoLicenseCheck(mockApi);
      disposables.push(check.onChanged(checkEngagedChangeListener));
    });

    it('should have no engaged checks when license is available', async () => {
      jest.mocked(simpleClient.fetchFromApi).mockResolvedValueOnce(licenseAvailableResponse);

      const result = await check.validate({});

      expect(result).toEqual({
        checkId: expect.any(String),
        details: expect.any(String),
        engaged: false,
      });
    });

    it('should have an engaged check when license is not available', async () => {
      jest.mocked(simpleClient.fetchFromApi).mockResolvedValueOnce(licenseUnavailableResponse);

      const result = await check.validate({});

      expect(result).toEqual({
        checkId: 'code-suggestions-no-license',
        details:
          'A GitLab Duo license is required to use this feature. Contact your GitLab administrator to request access.',
        engaged: true,
      });
    });
  });
});
