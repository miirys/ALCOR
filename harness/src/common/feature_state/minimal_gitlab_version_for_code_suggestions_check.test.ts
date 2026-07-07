import {
  SimpleApiClient,
  ApiReconfiguredData,
  EventListener,
  UNSUPPORTED_GITLAB_VERSION,
  versionRequest,
} from '@gitlab-org/core';
import { Disposable } from '@gitlab-org/disposable';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiClient } from '../api';
import { DefaultCodeSuggestionsInstanceVersionCheck } from './minimal_gitlab_version_for_code_suggestions_check';

describe('DefaultCodeSuggestionsInstanceVersionCheck', () => {
  const disposables: Disposable[] = [];

  let check: DefaultCodeSuggestionsInstanceVersionCheck;
  let mockApi: GitLabApiClient;
  let listeners: EventListener<ApiReconfiguredData>[] = [];
  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    mockApi = createFakePartial<GitLabApiClient>({
      fetchFromApi: jest.fn(),
      getSimpleClient: jest.fn(),
      onApiReconfigured: jest.fn((listener) => {
        listeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    check = new DefaultCodeSuggestionsInstanceVersionCheck(mockApi);
    disposables.push(check.onChanged(checkEngagedChangeListener));
  });

  afterEach(() => {
    listeners = [];

    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  const triggerApiReconfigured = async (event: ApiReconfiguredData) => {
    listeners.forEach((listener) => listener(event, new AbortController().signal));
    await new Promise(process.nextTick);
  };

  describe('is updated on API reconfiguration', () => {
    it.each`
      version
      ${'16.8.0'}
      ${'16.9.3'}
      ${'16.9.0-pre'}
      ${'16.9.0-pre-1'}
      ${'16.12.4'}
      ${'20.0.0'}
    `('is not engaged when version is $version', async ({ version }) => {
      await triggerApiReconfigured({
        isInValidState: true,
        instanceInfo: {
          instanceVersion: version,
          instanceUrl: new URL(`http://test-${version}.com`),
        },
        tokenInfo: { scopes: ['api'], type: 'pat', token: 'glpat-123' },
      });

      expect(check.engaged).toBe(false);
    });

    it(`is engaged and sets correct message when version is below 16.8`, async () => {
      await triggerApiReconfigured({
        isInValidState: true,
        instanceInfo: { instanceVersion: '16.7.1', instanceUrl: new URL('http://test.com') },
        tokenInfo: { scopes: ['api'], type: 'pat', token: 'glpat-123' },
      });

      expect(check.engaged).toBe(true);
      expect(check.details).toBe(
        `GitLab Duo Code Suggestions requires GitLab version 16.8 or later. GitLab instance located at: http://test.com/ is currently using 16.7.1`,
      );
    });

    it('is not engaged when API is in invalid state', async () => {
      await triggerApiReconfigured({
        isInValidState: false,
        validationMessage: 'Token is invalid',
      });

      expect(check.engaged).toBe(false);
    });
  });

  describe('change event', () => {
    it('emits when API is reconfigured with valid state', async () => {
      jest.mocked(checkEngagedChangeListener).mockClear();

      await triggerApiReconfigured({
        isInValidState: true,
        instanceInfo: { instanceVersion: '16.8.3', instanceUrl: new URL('http://test.com') },
        tokenInfo: { scopes: ['api'], type: 'pat', token: 'glpat-123' },
      });

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
    });

    it('emits when API is reconfigured with different version', async () => {
      await triggerApiReconfigured({
        isInValidState: true,
        instanceInfo: { instanceVersion: '16.8.3', instanceUrl: new URL('http://test.com') },
        tokenInfo: { scopes: ['api'], type: 'pat', token: 'glpat-123' },
      });

      jest.mocked(checkEngagedChangeListener).mockClear();

      await triggerApiReconfigured({
        isInValidState: true,
        instanceInfo: { instanceVersion: '16.7.0', instanceUrl: new URL('http://test.com') },
        tokenInfo: { scopes: ['api'], type: 'pat', token: 'glpat-123' },
      });

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
    });

    it('does not emit when API is in invalid state', async () => {
      jest.mocked(checkEngagedChangeListener).mockClear();

      await triggerApiReconfigured({
        isInValidState: false,
        validationMessage: 'Token is invalid',
      });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    let simpleClient: SimpleApiClient;

    beforeEach(() => {
      simpleClient = createFakePartial<SimpleApiClient>({
        fetchFromApi: jest.fn(),
      });

      jest.mocked(mockApi.getSimpleClient).mockReturnValue(simpleClient);
    });

    it('should have no engaged checks when version supports code suggestions', async () => {
      const mockResponse = { version: '16.8.0' };
      jest.mocked(simpleClient.fetchFromApi).mockResolvedValueOnce(mockResponse);

      const result = await check.validate({ baseUrl: 'http://test.com', token: 'glpat-123' });

      expect(simpleClient.fetchFromApi).toHaveBeenCalledWith(versionRequest);
      expect(mockApi.getSimpleClient).toHaveBeenCalledWith('http://test.com', 'glpat-123');
      expect(result).toEqual({
        checkId: UNSUPPORTED_GITLAB_VERSION,
        details:
          'GitLab Duo Code Suggestions requires GitLab version 16.8 or later. Current version is 16.8.0.',
        engaged: false,
      });
    });

    it('should have an engaged check when version does not support code suggestions', async () => {
      const mockResponse = { version: '16.7.0' };
      jest.mocked(simpleClient.fetchFromApi).mockResolvedValueOnce(mockResponse);

      const result = await check.validate({ baseUrl: 'http://test.com', token: 'glpat-123' });

      expect(mockApi.getSimpleClient).toHaveBeenCalledWith('http://test.com', 'glpat-123');
      expect(result).toEqual({
        checkId: UNSUPPORTED_GITLAB_VERSION,
        details:
          'GitLab Duo Code Suggestions requires GitLab version 16.8 or later. Current version is 16.7.0.',
        engaged: true,
      });
    });

    it('should throw an error when API call fails', async () => {
      jest.mocked(simpleClient.fetchFromApi).mockRejectedValueOnce(new Error('API Error'));

      await expect(
        check.validate({ baseUrl: 'http://test.com', token: 'glpat-123' }),
      ).rejects.toThrow('API Error');
    });
  });
});
