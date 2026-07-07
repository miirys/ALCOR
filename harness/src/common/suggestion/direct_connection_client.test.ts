import { ApiReconfiguredData, EventListener } from '@gitlab-org/core';
import { LsFetch } from '@gitlab-org/fetch';
import { CancellationToken } from 'vscode-languageserver';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { GitLabApiClient } from '../api';
import { IDocContext } from '../document_transformer_service';
import { log } from '../log';
import { SuggestionContext } from '../suggestion_client/suggestion_client';
import {
  DirectConnectionDetailsService,
  IDirectConnectionDetails,
} from './direct_connection_details_service';
import { DirectConnectionClient } from './direct_connection_client';

jest.mock('../log');
jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  getLanguageServerVersion: jest.fn().mockReturnValue('1.2.3.4.5'),
  getUserAgent: jest.fn().mockImplementation((clientInfo) => {
    return `gitlab-language-server:1.2.3.4.5 (${clientInfo?.name}:${clientInfo?.version})`;
  }),
}));

describe('DirectConnectionClient', () => {
  let api: GitLabApiClient;
  let context: SuggestionContext;
  let client: DirectConnectionClient;
  let configService: ConfigService;
  let directConnectionDetailsService: DirectConnectionDetailsService;
  let lsFetch: LsFetch;
  let cancellationToken: CancellationToken;

  const projectPath = 'test-project';
  const successfulSuggestionResponse = { status: 200 };
  const TEST_EXPIRES_AT_S = 1713343569;
  const TEST_EXPIRES_AT_MS = TEST_EXPIRES_AT_S * 1000;
  const SECOND = 1000;
  const expired = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    expired.mockReturnValue(false);
    context = createFakePartial<SuggestionContext>({
      document: createFakePartial<IDocContext>({}),
      projectPath,
    });
    api = createFakePartial<GitLabApiClient>({
      onApiReconfigured: jest.fn(),
    });
    lsFetch = createFakePartial<LsFetch>({
      post: jest.fn(),
    });
    directConnectionDetailsService = createFakePartial<DirectConnectionDetailsService>({
      expired,
      refreshIfNeeded: jest.fn(),
      details: {
        headers: {
          'X-Gitlab-Host-Name': 'gitlab.example.com',
          'X-Gitlab-Global-User-Id': 'mockGlobalUserId',
          'X-Gitlab-Instance-Id': '123',
          'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': '789',
        },
        expires_at: TEST_EXPIRES_AT_S,
      },
    });
    configService = new DefaultConfigService();
    cancellationToken = createFakePartial<CancellationToken>({
      isCancellationRequested: false,
      onCancellationRequested: jest.fn(),
    });
    configService.set('projectPath', projectPath);
    client = new DirectConnectionClient(
      api,
      configService,
      directConnectionDetailsService,
      lsFetch,
    );
  });

  afterEach(() => {
    jest.runAllTicks();
  });

  const mockFetchResponse = (status: number, json: unknown) =>
    jest.mocked(lsFetch.post).mockResolvedValue(createFakeResponse({ status, json }));

  describe('reacting to API client reconfiguration', () => {
    let reconfigurationListener: EventListener<ApiReconfiguredData>;

    beforeEach(() => {
      api = createFakePartial<GitLabApiClient>({
        fetchFromApi: jest
          .fn()
          .mockResolvedValue(createFakePartial<IDirectConnectionDetails>({ token: 'abc' })),
        onApiReconfigured: (l) => {
          reconfigurationListener = l;
          return { dispose: () => {} };
        },
      });
      client = new DirectConnectionClient(
        api,
        configService,
        directConnectionDetailsService,
        lsFetch,
      );
    });

    it('it does not use API when API client is not in valid state', async () => {
      reconfigurationListener(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: false,
          validationMessage: 'error',
        }),
        new AbortController().signal,
      );

      await client.getSuggestions(context, cancellationToken);

      expect(api.fetchFromApi).not.toHaveBeenCalled();
    });
  });

  describe('fetching suggestions directly', () => {
    beforeEach(async () => {
      jest.setSystemTime(new Date(TEST_EXPIRES_AT_MS - 60 * SECOND));
      api = createFakePartial<GitLabApiClient>({
        onApiReconfigured: jest.fn(),
      });
      client = new DirectConnectionClient(
        api,
        configService,
        directConnectionDetailsService,
        lsFetch,
      );
      mockFetchResponse(200, successfulSuggestionResponse);

      // prime the direct connection details with first request
      await client.getSuggestions(context, cancellationToken);
    });

    it('returns undefined when intent is generation', async () => {
      const result = await client.getSuggestions(
        { ...context, intent: 'generation' },
        cancellationToken,
      );
      expect(result).toBeUndefined();
    });

    it('fetches suggestions using direct connection', async () => {
      const result = await client.getSuggestions(context, cancellationToken);

      expect(result).toEqual(expect.objectContaining(successfulSuggestionResponse));
    });

    it('calls lsFetch.post with proper parameters', async () => {
      await client.getSuggestions(context, cancellationToken);
      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.any(String),
          headers: expect.any(Object),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('sets "X-Gitlab-Language-Server-Version" header for the fetch', async () => {
      await client.getSuggestions(context, cancellationToken);
      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Gitlab-Language-Server-Version': '1.2.3.4.5' }),
        }),
      );
    });

    it('sets "User-Agent" header for the fetch', async () => {
      configService.set('clientInfo', { name: 'test-ide', version: '6.7.8' });
      await client.getSuggestions(context, cancellationToken);
      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'gitlab-language-server:1.2.3.4.5 (test-ide:6.7.8)',
          }),
        }),
      );
    });

    it('suggestion response from this client have direct has isDirectConnection set to true', async () => {
      const result = await client.getSuggestions(context, cancellationToken);
      expect(result).toEqual(expect.objectContaining({ isDirectConnection: true }));
    });

    it('handles error from direct connection', async () => {
      jest.mocked(lsFetch.post).mockResolvedValue(
        createFakeResponse({
          status: 500,
          json: {
            error: 'test error',
          },
        }),
      );

      const result = await client.getSuggestions(context, cancellationToken);
      expect(result).toEqual(undefined);
      expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/failed/), expect.any(Error));
    });

    it('refreshes connection details if the token expired', async () => {
      expired.mockReturnValue(true);

      const result = await client.getSuggestions(context, cancellationToken);

      expect(result).toEqual(expect.objectContaining(successfulSuggestionResponse));
      expect(directConnectionDetailsService.refreshIfNeeded).toHaveBeenCalled();
    });
  });
});
