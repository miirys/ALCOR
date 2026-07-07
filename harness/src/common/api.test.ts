import fetch from 'cross-fetch';
import {
  ApiReconfiguredData,
  ApiRequest,
  FetchError,
  getLanguageServerVersion,
  GetRequest,
  type PersonalAccessToken,
  PostRequest,
  versionRequest,
} from '@gitlab-org/core';
import { FetchBase, LsFetch } from '@gitlab-org/fetch';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { GitLabAPI, CodeSuggestionResponse } from './api';
import { CODE_SUGGESTIONS_RESPONSE, FILE_INFO } from './test_utils/mocks';
import { RequestResponse, success, TestSimpleApiClient } from './test_utils/test_simple_api_client';
import { connectToCable } from './action_cable';
import { log } from './log';

jest.mock('./action_cable', () => ({
  connectToCable: jest.fn(),
}));

jest.mock('cross-fetch');
jest.mock('graphql-request');
jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  getLanguageServerVersion: jest.fn(),
}));

const GITLAB_LANGUAGE_SERVER_VERSION = 'v0.0.0';

const GITLAB_INSTANCE_VERSION = '17.0.0';

const TEST_CODE_SUGGESTION_REQUEST = {
  prompt_version: 1,
  project_path: '',
  project_id: -1,
  current_file: {
    content_above_cursor: FILE_INFO.prefix,
    content_below_cursor: FILE_INFO.suffix,
    file_name: FILE_INFO.fileRelativePath,
  },
};

const patRequest: GetRequest<PersonalAccessToken> = {
  type: 'rest',
  method: 'GET',
  path: '/api/v4/personal_access_tokens/self',
};

jest.useFakeTimers();

describe('GitLabAPI', () => {
  let lsFetch: LsFetch;
  let getSimpleClientSpy: jest.Spied<typeof GitLabAPI.prototype.getSimpleClient>;
  let simpleApiClient: TestSimpleApiClient;
  const token = 'glpat-1234';
  const gitlabBaseUrl = 'https://gitlab.com/';
  const clientInfo = { name: 'MyClient', version: '1.0.0' };
  let configService: ConfigService;
  let api: GitLabAPI;

  const mockCancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(),
  };

  // adds configuration to the ApiClient
  const configureApi = (baseUrl = gitlabBaseUrl, localToken = token) => {
    configService.merge({
      clientInfo,
      baseUrl,
      token: localToken,
    });
    jest.runAllTicks();
  };

  const createVersionRequestResponse = (
    instanceVersion: string = GITLAB_INSTANCE_VERSION,
  ): RequestResponse => [versionRequest, success({ version: instanceVersion })];

  const validTokenRequestResponse: RequestResponse = [patRequest, success({ scopes: ['api'] })];

  // adds configuration and also mocks the token check
  const prepareApi = ({
    baseUrl = gitlabBaseUrl,
    localToken = token,
    instanceVersion = GITLAB_INSTANCE_VERSION,
  } = {}) => {
    const versionRequestResponse = createVersionRequestResponse(instanceVersion);
    simpleApiClient.responses = [versionRequestResponse, validTokenRequestResponse];
    getSimpleClientSpy.mockReturnValue(simpleApiClient);
    configureApi(baseUrl, localToken);
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.mocked(getLanguageServerVersion).mockReturnValue(GITLAB_LANGUAGE_SERVER_VERSION);
    lsFetch = new FetchBase();
    simpleApiClient = new TestSimpleApiClient();
    configService = new DefaultConfigService();
    api = new GitLabAPI(log, lsFetch, configService);
    getSimpleClientSpy = jest.spyOn(api, 'getSimpleClient');
  });

  describe('getCodeSuggestions', () => {
    describe('Error path', () => {
      it('should throw an error when no token provided', async () => {
        await expect(api.getCodeSuggestions(TEST_CODE_SUGGESTION_REQUEST)).rejects.toThrow(
          /Token needs to be provided to request Code Suggestions/,
        );
      });
    });

    describe('Success path', () => {
      let response: CodeSuggestionResponse | undefined;

      beforeEach(async () => {
        prepareApi();
      });

      it('should return code suggestions', async () => {
        const request: PostRequest<CodeSuggestionResponse> = {
          type: 'rest',
          method: 'POST',
          path: '/api/v4/code_suggestions/completions',
          body: TEST_CODE_SUGGESTION_REQUEST,
        };
        simpleApiClient.responses = [
          createVersionRequestResponse(),
          [request, { success: CODE_SUGGESTIONS_RESPONSE }],
        ];

        response = await api.getCodeSuggestions(TEST_CODE_SUGGESTION_REQUEST);

        expect(response).toEqual({ ...CODE_SUGGESTIONS_RESPONSE, status: 200 });
      });
    });
  });

  describe('checkToken', () => {
    beforeEach(() => {
      simpleApiClient.responses = [createVersionRequestResponse()];
      getSimpleClientSpy.mockReturnValue(simpleApiClient);
      configureApi();
    });

    it('should use correct URL and token for validation', async () => {
      await api.checkToken(gitlabBaseUrl, token);

      expect(getSimpleClientSpy).toHaveBeenCalledWith(new URL(gitlabBaseUrl), token);
    });

    it('avoids redundant API reconfiguration for equivalent URLs', async () => {
      simpleApiClient.responses = [createVersionRequestResponse(), validTokenRequestResponse];
      const urlWithoutSlash = 'https://gitlab-t.com';
      const urlWithSlash = 'https://gitlab-t.com/';
      const configuredSpy = jest.fn();
      api.onApiReconfigured(configuredSpy);
      // First configuration
      configService.merge({ baseUrl: urlWithoutSlash, token });
      await jest.runAllTimersAsync();

      expect(configuredSpy).toHaveBeenCalledTimes(1);

      // Same configuration again - should not trigger another check
      configService.merge({ baseUrl: urlWithSlash, token });
      await jest.runAllTimersAsync();

      // Should still only be called once since nothing changed
      expect(configuredSpy).toHaveBeenCalledTimes(1);
    });

    it('passes tokenType argument to skip unnecessary token check', async () => {
      simpleApiClient.responses = [validTokenRequestResponse];
      const fetchSpy = jest.spyOn(simpleApiClient, 'fetchFromApi');
      getSimpleClientSpy.mockReturnValue(simpleApiClient);

      const result = await api.checkToken(gitlabBaseUrl, token, 'pat');

      expect(result).toEqual({
        valid: true,
        tokenInfo: { type: 'pat', scopes: ['api'], token },
      });
      // With tokenType='pat', only PAT endpoint should be called
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(patRequest);
    });

    it('treats empty string token as undefined', async () => {
      const configureApiSpy = jest.spyOn(api, 'configureApi');

      configService.merge({
        baseUrl: gitlabBaseUrl,
        token: '', // empty string
      });
      jest.runAllTicks();

      expect(configureApiSpy).toHaveBeenCalledWith(
        {
          baseUrl: new URL(gitlabBaseUrl),
          token: undefined, // should be converted to undefined
        },
        expect.any(Object), // signal
      );
    });
  });

  describe('getStreamingCodeSuggestions', () => {
    it('throws an error when token is not provided', async () => {
      const generator = api.getStreamingCodeSuggestions(
        TEST_CODE_SUGGESTION_REQUEST,
        mockCancellationToken,
      );

      await expect(() => generator?.next()).rejects.toThrow(
        'Token needs to be provided to stream code suggestions',
      );
    });

    it('throws a FetchError if response is not OK', async () => {
      const mockResponse = createFakeResponse({
        status: 422,
        text: '{"error":"missing_default_duo_group"',
      });
      jest.spyOn(simpleApiClient, 'fetchFromApiRaw').mockResolvedValue(mockResponse);

      prepareApi();
      await jest.runAllTimersAsync();
      const generator = api.getStreamingCodeSuggestions(
        TEST_CODE_SUGGESTION_REQUEST,
        mockCancellationToken,
      );

      await expect(generator?.next()).rejects.toThrow(FetchError);
    });

    it('returns a generator', async () => {
      jest
        .spyOn(simpleApiClient, 'fetchFromApiRaw')
        .mockResolvedValue(createFakeResponse({ status: 200, text: 'hello' }));

      prepareApi();
      await jest.runAllTimersAsync();
      const generator = api.getStreamingCodeSuggestions(
        TEST_CODE_SUGGESTION_REQUEST,
        mockCancellationToken,
      );
      await expect(() => generator?.next()).rejects.toThrow('Not implemented');
    });

    it('passes the streaming header to the server', async () => {
      const spy = jest
        .spyOn(simpleApiClient, 'fetchFromApiRaw')
        .mockResolvedValue(createFakeResponse({ status: 200, text: 'hello' }));

      prepareApi();
      await jest.runAllTimersAsync();
      spy.mockClear();
      const generator = api.getStreamingCodeSuggestions(
        TEST_CODE_SUGGESTION_REQUEST,
        mockCancellationToken,
      );
      await expect(() => generator?.next()).rejects.toThrow('Not implemented');

      expect(spy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Supports-Sse-Streaming': 'true',
          }),
        }),
      );
    });
  });

  describe('fetchFromApi', () => {
    describe('when no token provided', () => {
      it('should not make a request', async () => {
        await expect(
          api.fetchFromApi({ type: 'rest', method: 'GET', path: '/test' }),
        ).rejects.toThrow('Token needs to be provided to authorise API request.');
        expect(fetch).not.toHaveBeenCalled();
      });
    });

    describe('when instance version is not supported', () => {
      let waitForLastReconfigureEvent: Promise<void>;

      const createRequestWithVersionSupport = (version: string) =>
        createFakePartial<ApiRequest<Promise<string>>>({
          type: 'rest',
          method: 'GET',
          path: '/api/v4/test',
          supportedSinceInstanceVersion: {
            version,
            resourceName: 'do something',
          },
        });

      beforeEach(() => {
        waitForLastReconfigureEvent = new Promise<void>((resolve) => {
          api.onApiReconfigured(() => {
            resolve();
          });
        });
      });

      it('should not make a request when instance version is lower than required', async () => {
        prepareApi({ instanceVersion: '17.0.0' });
        await waitForLastReconfigureEvent;

        const requestWithApiEndpointVersionSupport = createRequestWithVersionSupport('17.2.0');
        await expect(api.fetchFromApi(requestWithApiEndpointVersionSupport)).rejects.toThrow(
          `Can't do something until your instance is upgraded to 17.2.0 or higher.`,
        );
      });

      it.each`
        scenario                                                    | instanceVersion | requiredVersion
        ${'when instance version is equal to required version'}     | ${'17.2.0'}     | ${'17.2.0'}
        ${'from an equal version when instance has -pre suffix'}    | ${'17.2.0-pre'} | ${'17.2.0'}
        ${'from an equal version when instance has -ee suffix'}     | ${'17.2.0-ee'}  | ${'17.2.0'}
        ${'when instance version is greater than required version'} | ${'17.4.0'}     | ${'17.2.0'}
      `('should allow a request $scenario', async ({ instanceVersion, requiredVersion }) => {
        prepareApi({ instanceVersion });
        const requestWithApiEndpointVersionSupport =
          createRequestWithVersionSupport(requiredVersion);
        await waitForLastReconfigureEvent;
        simpleApiClient.responses.push([
          requestWithApiEndpointVersionSupport,
          { success: 'test response' },
        ]);

        await expect(api.fetchFromApi(requestWithApiEndpointVersionSupport)).resolves.toBe(
          'test response',
        );
      });
    });

    describe('when token is provided and instance supported', () => {
      const TEST_RESPONSE_JSON = [{ id: 1 }, { id: 2 }];

      beforeEach(() => {
        prepareApi();
      });

      it('forwards the request to simple API client', async () => {
        expect(fetch).not.toHaveBeenCalled();

        const mockGetRequest: ApiRequest<unknown> = {
          type: 'rest',
          method: 'GET',
          path: '/api/v4/test',
          searchParams: {
            param: '123',
            foo: 'bar',
          },
          headers: {
            'X-Test': '123',
          },
          signal: new AbortController().signal,
        };

        simpleApiClient.responses = [[mockGetRequest, { success: TEST_RESPONSE_JSON }]];

        const response = await api.fetchFromApi<unknown>(mockGetRequest);

        expect(response).toEqual(TEST_RESPONSE_JSON);
      });

      it('with failed request rejects', async () => {
        const response = api.fetchFromApi(
          createFakePartial<ApiRequest<unknown>>({
            type: 'rest',
            method: 'GET',
            path: '/api/v4/test',
          }),
        );

        await expect(response).rejects.toThrow(/Fetching Request .* failed/);
      });
    });
  });

  describe('onConfigChange', () => {
    let waitForLastReconfigureEvent: Promise<ApiReconfiguredData>;
    const validTokenCheckResponse = createFakeResponse({
      json: { active: true, scopes: ['api'] },
    });
    const invalidTokenCheckResponse = createFakeResponse({
      status: 401,
    });
    beforeEach(() => {
      configService = new DefaultConfigService();
      if (!configService.onConfigChange) {
        throw new Error('issue');
      }
      api = new GitLabAPI(log, lsFetch, configService);
      waitForLastReconfigureEvent = new Promise((resolve) => {
        api.onApiReconfigured((data) => {
          resolve(data);
        });
      });
      lsFetch.updateAgentOptions = jest.fn();
      lsFetch.get = jest.fn();
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.mocked(lsFetch.updateAgentOptions).mockReset();
    });

    it('initializes http proxy before doing a token check', async () => {
      configService.merge({ token: 'hello' });
      await waitForLastReconfigureEvent;

      const updateAgentOptionsOrder = jest.mocked(lsFetch.updateAgentOptions).mock
        .invocationCallOrder[0];
      const checkTokenOrder = jest.mocked(lsFetch.get).mock.invocationCallOrder[0];
      expect(updateAgentOptionsOrder).toBeLessThan(checkTokenOrder);
    });

    it('when updated with valid token and baseUrl, it sends a valid config event', async () => {
      jest.mocked(lsFetch.get).mockResolvedValue(validTokenCheckResponse);

      configService.merge({ token: 'hello' });
      jest.runAllTicks();

      expect(await waitForLastReconfigureEvent).toEqual({
        isInValidState: true,
        instanceInfo: { instanceUrl: new URL(gitlabBaseUrl) },
        tokenInfo: {
          type: 'pat',
          scopes: ['api'],
          token: 'hello',
        },
      });

      expect(api.tokenInfo).toEqual({ type: 'pat', scopes: ['api'], token: 'hello' });
    });

    it('when updated with invalid token, it sends a non-valid config event', async () => {
      jest.mocked(lsFetch.get).mockResolvedValue(invalidTokenCheckResponse);

      configService.merge({ token: 'hello' });
      jest.runAllTicks();

      expect(await waitForLastReconfigureEvent).toEqual(
        expect.objectContaining({
          isInValidState: false,
          validationMessage: expect.stringMatching(/Token is invalid/),
        }),
      );
    });

    it('aborts previous API configuration when a new one starts', async () => {
      prepareApi();

      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
      configService.merge({ token: 'token1' });
      jest.runAllTimers();

      configService.merge({ token: 'token2' });
      jest.runAllTimers();

      expect(abortSpy).toHaveBeenCalled();

      abortSpy.mockRestore();
    });

    it('uses default GitLab base URL when baseUrl is not provided', async () => {
      jest.mocked(lsFetch.get).mockResolvedValue(validTokenCheckResponse);

      configService.merge({ token: 'hello' });
      jest.runAllTicks();

      const result = await waitForLastReconfigureEvent;
      expect(result.isInValidState).toBe(true);
      if (result.isInValidState) {
        expect(result.instanceInfo?.instanceUrl).toEqual(new URL('https://gitlab.com/'));
      }
    });

    it('reconfigures when baseUrl changes', async () => {
      jest.mocked(lsFetch.get).mockResolvedValue(validTokenCheckResponse);

      let eventCount = 0;
      const events: ApiReconfiguredData[] = [];
      api.onApiReconfigured((data) => {
        eventCount++;
        events.push(data);
      });

      // First configuration
      configService.merge({ token: 'hello', baseUrl: 'https://gitlab.com/' });
      jest.runAllTicks();
      await jest.runAllTimersAsync();

      // Change baseUrl
      configService.merge({ token: 'hello', baseUrl: 'https://gitlab.example.com/' });
      jest.runAllTicks();
      await jest.runAllTimersAsync();

      expect(eventCount).toBe(2);
      expect(events[1].isInValidState).toBe(true);
      if (events[1].isInValidState) {
        expect(events[1].instanceInfo?.instanceUrl).toEqual(new URL('https://gitlab.example.com/'));
      }
    });

    it('reconfigures when token changes', async () => {
      jest.mocked(lsFetch.get).mockResolvedValue(validTokenCheckResponse);

      let eventCount = 0;
      const events: ApiReconfiguredData[] = [];
      api.onApiReconfigured((data) => {
        eventCount++;
        events.push(data);
      });

      // First configuration
      configService.merge({ token: 'token1', baseUrl: gitlabBaseUrl });
      jest.runAllTicks();
      await jest.runAllTimersAsync();

      // Change token
      configService.merge({ token: 'token2', baseUrl: gitlabBaseUrl });
      jest.runAllTicks();
      await jest.runAllTimersAsync();

      expect(eventCount).toBe(2);
      expect(events[1].isInValidState).toBe(true);
      if (events[1].isInValidState) {
        expect(events[1].tokenInfo?.token).toBe('token2');
      }
    });

    it('sets isInValidState to false and clears token when version fetch fails', async () => {
      // Mock successful token check but failed version fetch
      jest
        .mocked(lsFetch.get)
        .mockResolvedValueOnce(validTokenCheckResponse) // token check succeeds
        .mockRejectedValueOnce(new Error('Network error')); // version fetch fails

      configService.merge({ token: 'hello' });
      jest.runAllTicks();

      const result = await waitForLastReconfigureEvent;
      expect(result).toEqual(
        expect.objectContaining({
          isInValidState: false,
          validationMessage: 'Failed to fetch GitLab instance version',
        }),
      );
      expect(api.isInValidState).toBe(false);
    });
  });

  describe('Instance Information', () => {
    beforeEach(() => {
      prepareApi();
    });

    it('is set when api is configured ', () => {
      expect(api.instanceInfo).toEqual({
        instanceUrl: new URL(gitlabBaseUrl),
        instanceVersion: GITLAB_INSTANCE_VERSION,
      });
    });
  });

  describe('connectToCable', () => {
    beforeEach(() => {
      jest
        .mocked(connectToCable)
        .mockResolvedValue({} as unknown as ReturnType<typeof connectToCable>);
    });

    it('throws an error when token is not set', async () => {
      await expect(api.connectToCable()).rejects.toThrow(
        'Token is not set up. Cannot connect to cable without a token.',
      );
    });

    it.each([
      ['https://gitlab.com', 'https://gitlab.com'],
      ['https://gitlab.com/api/v4', 'https://gitlab.com'],
      ['http://gitlab.example.com:8080/foo/bar', 'http://gitlab.example.com:8080'],
      ['https://sub.domain.gitlab.com/path?query=123', 'https://sub.domain.gitlab.com'],
    ])('sets correct Origin header when baseURL is %s', async (baseUrl, expectedOrigin) => {
      prepareApi();
      configService.merge({ baseUrl, token: 'test-token' });

      await jest.runAllTimersAsync();

      await api.connectToCable();

      expect(connectToCable).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            Origin: expectedOrigin,
          }),
        }),
      );
    });

    it('flows structured getWebSocketOptions through toIsomorphicWsOptions into cable options', async () => {
      prepareApi();
      configService.merge({ baseUrl: gitlabBaseUrl, token: 'test-token' });
      await jest.runAllTimersAsync();

      const fakeAgent = { name: 'fake-agent' };
      const ca = Buffer.from('ca');
      jest.spyOn(lsFetch, 'getWebSocketOptions').mockReturnValue({
        agent: fakeAgent,
        tls: { ca, rejectUnauthorized: false },
      });

      await api.connectToCable();

      expect(lsFetch.getWebSocketOptions).toHaveBeenCalledWith(expect.any(URL));
      // Under the Node test runtime the translator produces the flat
      // `{ agent, ca, rejectUnauthorized, ... }` shape.
      expect(connectToCable).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          agent: fakeAgent,
          ca,
          rejectUnauthorized: false,
        }),
      );
    });
  });
});
