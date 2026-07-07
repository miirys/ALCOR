import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { LsFetch } from '@gitlab-org/fetch';
import { handleFetchError } from '../fetch/handle_fetch_error';
import { getLanguageServerVersion } from '../get_language_server_version';
import { DefaultSimpleApiClient } from './simple_api_client';
import { ApiRequest, GetRequest, GraphQLRequest, HeadRequest } from './types';

jest.mock('../fetch/handle_fetch_error', () => ({
  handleFetchError: jest.fn(),
}));

describe('SimpleApiClient', () => {
  const lsFetch: LsFetch = createFakePartial<LsFetch>({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    head: jest.fn(),
  });

  const clientInfo = {
    name: 'TestClient',
    version: '1.0.0',
  };

  const token = 'test-token';

  // Define both URL configurations to be tested
  const urlConfigs = [
    {
      name: 'root domain',
      baseUrl: 'https://gitlab.com',
      expectedGraphQLUrl: 'https://gitlab.com/api/graphql',
      expectedRestUrl: 'https://gitlab.com/api/v4/test',
    },
    {
      name: 'custom path',
      baseUrl: 'https://example.com/gitlab',
      expectedGraphQLUrl: 'https://example.com/gitlab/api/graphql',
      expectedRestUrl: 'https://example.com/gitlab/api/v4/test',
    },
  ];

  urlConfigs.forEach(({ name, baseUrl, expectedGraphQLUrl, expectedRestUrl }) => {
    describe(`with ${name} (${baseUrl})`, () => {
      let client: DefaultSimpleApiClient;

      beforeEach(() => {
        client = new DefaultSimpleApiClient(new TestLogger(), lsFetch, clientInfo, baseUrl, token);
      });

      describe('getDefaultHeaders', () => {
        it('returns correct default headers', () => {
          const headers = client.getDefaultHeaders();

          expect(headers).toEqual({
            Authorization: `Bearer ${token}`,
            'User-Agent': `gitlab-language-server:${getLanguageServerVersion()} (${clientInfo.name}:${clientInfo.version})`,
            'X-Gitlab-Language-Server-Version': getLanguageServerVersion(),
            'X-Gitlab-Client-Name': clientInfo.name,
            'X-Gitlab-Client-Version': clientInfo.version,
          });
        });

        it('omits X-Gitlab-Client-Type when clientInfo has no type', () => {
          const clientWithoutType = new DefaultSimpleApiClient(
            new TestLogger(),
            lsFetch,
            { name: 'TestClient', version: '1.0.0' },
            baseUrl,
            token,
          );
          const headers = clientWithoutType.getDefaultHeaders();

          expect(headers).not.toHaveProperty('X-Gitlab-Client-Type');
          expect(headers).toMatchObject({
            'X-Gitlab-Client-Name': 'TestClient',
            'X-Gitlab-Client-Version': '1.0.0',
          });
        });
      });

      describe('fetchFromApi', () => {
        const mockResponse = { data: 'test' };
        const fakeResponse = createFakeResponse({ json: mockResponse });

        beforeEach(() => {
          jest.resetAllMocks();
        });

        it('makes a GraphQL request', async () => {
          const testRequest: GraphQLRequest<unknown> = {
            type: 'graphql',
            query: 'query {test}',
            variables: {
              var: 'test',
            },
          };
          jest.mocked(lsFetch.post).mockResolvedValue(
            createFakeResponse({
              headers: { 'Content-Type': 'application/json' },
              text: '{ "data": {} }',
            }),
          );

          await client.fetchFromApi(testRequest);

          expect(lsFetch.post).toHaveBeenCalledWith(
            expectedGraphQLUrl,
            expect.objectContaining({
              headers: {
                'Content-Type': 'application/json',
                ...client.getDefaultHeaders(),
              },
              body: '{"query":"query {test}","variables":{"var":"test"}}',
            }),
          );
        });

        it('makes a GET request with correct URL and headers', async () => {
          jest.mocked(lsFetch.get).mockResolvedValue(fakeResponse);
          const testRequest: GetRequest<unknown> = {
            type: 'rest',
            method: 'GET',
            path: '/api/v4/test',
          };

          const request: ApiRequest<unknown> = {
            ...testRequest,
            searchParams: { param1: 'value1', param2: 'value2' },
          };

          await client.fetchFromApi(request);

          expect(lsFetch.get).toHaveBeenCalledWith(
            expect.objectContaining({
              href: `${expectedRestUrl}?param1=value1&param2=value2`,
            }),
            expect.objectContaining({
              headers: client.getDefaultHeaders(),
            }),
          );
        });

        it('makes a POST request with correct URL and body', async () => {
          jest.mocked(lsFetch.post).mockResolvedValue(fakeResponse);
          const request: ApiRequest<unknown> = {
            type: 'rest',
            method: 'POST',
            path: '/api/v4/test',
            body: { data: 'test-data' },
          };

          await client.fetchFromApi(request);

          expect(lsFetch.post).toHaveBeenCalledWith(
            new URL(expectedRestUrl),
            expect.objectContaining({
              headers: {
                'Content-Type': 'application/json',
                ...client.getDefaultHeaders(),
              },
              body: JSON.stringify({ data: 'test-data' }),
            }),
          );
        });

        it('makes a PATCH request with correct URL and body', async () => {
          jest.mocked(lsFetch.patch).mockResolvedValue(fakeResponse);
          const request: ApiRequest<unknown> = {
            type: 'rest',
            method: 'PATCH',
            path: '/api/v4/test',
            body: { data: 'test-data' },
          };

          await client.fetchFromApi(request);

          expect(lsFetch.patch).toHaveBeenCalledWith(
            new URL(expectedRestUrl),
            expect.objectContaining({
              headers: {
                'Content-Type': 'application/json',
                ...client.getDefaultHeaders(),
              },
              body: JSON.stringify({ data: 'test-data' }),
            }),
          );
        });

        it('makes a HEAD request with correct URL and parameters', async () => {
          jest.mocked(lsFetch.head).mockResolvedValue(fakeResponse);
          const request: HeadRequest = {
            type: 'rest',
            method: 'HEAD',
            path: '/api/v4/test',
            searchParams: { param1: 'value1', param2: 'value2' },
          };

          await client.fetchFromApi(request);

          expect(lsFetch.head).toHaveBeenCalledWith(
            expect.objectContaining({
              href: `${expectedRestUrl}?param1=value1&param2=value2`,
            }),
            expect.objectContaining({
              headers: client.getDefaultHeaders(),
            }),
          );
        });

        describe.each([
          { method: 'GET', fetchFn: 'get' },
          { method: 'POST', fetchFn: 'post' },
          { method: 'PATCH', fetchFn: 'patch' },
          { method: 'HEAD', fetchFn: 'head' },
        ] as const)('$method requests', ({ method, fetchFn }) => {
          let request: ApiRequest<unknown>;
          beforeEach(() => {
            jest
              .mocked(lsFetch[fetchFn])
              .mockResolvedValue(createFakeResponse({ json: { data: 'test' } }));
            request = {
              type: 'rest',
              method: method as 'GET' | 'POST' | 'PATCH' | 'HEAD',
              path: '/api/v4/test',
            };
          });

          it('uses handleFetchError with the correct resource name', async () => {
            const errorResponse = createFakeResponse({ status: 404 });
            jest.mocked(lsFetch[fetchFn]).mockResolvedValue(errorResponse);
            jest.mocked(handleFetchError).mockRejectedValue(new Error('test error'));

            await expect(client.fetchFromApi(request)).rejects.toThrow();
            expect(handleFetchError).toHaveBeenCalledWith(request, errorResponse, 'test');
          });

          it('merges custom headers with default headers', async () => {
            const customHeaders = { 'Custom-Header': 'value' };

            await client.fetchFromApi({
              ...(request as GetRequest<unknown>),
              headers: customHeaders,
            });

            const expectedHeaders = {
              ...client.getDefaultHeaders(),
              ...customHeaders,
              ...(method !== 'GET' && method !== 'HEAD'
                ? { 'Content-Type': 'application/json' }
                : {}),
            };

            expect(lsFetch[fetchFn]).toHaveBeenCalledWith(
              new URL(expectedRestUrl),
              expect.objectContaining({
                headers: expectedHeaders,
              }),
            );
          });

          it('passes abort signal to fetch request', async () => {
            const abortSignal = new AbortController().signal;

            await client.fetchFromApi({ ...request, signal: abortSignal });

            expect(lsFetch[fetchFn as keyof LsFetch]).toHaveBeenCalledWith(
              expect.any(URL),
              expect.objectContaining({
                signal: abortSignal,
              }),
            );
          });
        });
      });

      describe('fetchFromApiRaw', () => {
        const mockResponse = { data: 'test' };
        const fakeResponse = createFakeResponse({ json: mockResponse });

        beforeEach(() => {
          jest.resetAllMocks();
        });

        it('makes a GET request with correct URL and headers', async () => {
          jest.mocked(lsFetch.get).mockResolvedValue(fakeResponse);
          const testRequest: GetRequest<unknown> = {
            type: 'rest',
            method: 'GET',
            path: '/api/v4/test',
          };

          const request: ApiRequest<unknown> = {
            ...testRequest,
            searchParams: { param1: 'value1', param2: 'value2' },
          };

          await client.fetchFromApiRaw(request);

          expect(lsFetch.get).toHaveBeenCalledWith(
            expect.objectContaining({
              href: `${expectedRestUrl}?param1=value1&param2=value2`,
            }),
            expect.objectContaining({
              headers: client.getDefaultHeaders(),
            }),
          );
        });

        it('makes a POST request with correct URL and body', async () => {
          jest.mocked(lsFetch.post).mockResolvedValue(fakeResponse);
          const request: ApiRequest<unknown> = {
            type: 'rest',
            method: 'POST',
            path: '/api/v4/test',
            body: { data: 'test-data' },
          };

          await client.fetchFromApiRaw(request);

          expect(lsFetch.post).toHaveBeenCalledWith(
            new URL(expectedRestUrl),
            expect.objectContaining({
              headers: {
                'Content-Type': 'application/json',
                ...client.getDefaultHeaders(),
              },
              body: JSON.stringify({ data: 'test-data' }),
            }),
          );
        });

        it('makes a PATCH request with correct URL and body', async () => {
          jest.mocked(lsFetch.patch).mockResolvedValue(fakeResponse);
          const request: ApiRequest<unknown> = {
            type: 'rest',
            method: 'PATCH',
            path: '/api/v4/test',
            body: { data: 'test-data' },
          };

          await client.fetchFromApiRaw(request);

          expect(lsFetch.patch).toHaveBeenCalledWith(
            new URL(expectedRestUrl),
            expect.objectContaining({
              headers: {
                'Content-Type': 'application/json',
                ...client.getDefaultHeaders(),
              },
              body: JSON.stringify({ data: 'test-data' }),
            }),
          );
        });

        it('makes a HEAD request with correct URL and parameters', async () => {
          jest.mocked(lsFetch.head).mockResolvedValue(fakeResponse);
          const request: HeadRequest = {
            type: 'rest',
            method: 'HEAD',
            path: '/api/v4/test',
            searchParams: { param1: 'value1', param2: 'value2' },
          };

          await client.fetchFromApiRaw(request);

          expect(lsFetch.head).toHaveBeenCalledWith(
            expect.objectContaining({
              href: `${expectedRestUrl}?param1=value1&param2=value2`,
            }),
            expect.objectContaining({
              headers: client.getDefaultHeaders(),
            }),
          );
        });

        describe.each([
          { method: 'GET', fetchFn: 'get' },
          { method: 'POST', fetchFn: 'post' },
          { method: 'PATCH', fetchFn: 'patch' },
          { method: 'HEAD', fetchFn: 'head' },
        ] as const)('$method requests', ({ method, fetchFn }) => {
          let request: Exclude<ApiRequest<unknown>, GraphQLRequest<unknown>>;
          beforeEach(() => {
            jest
              .mocked(lsFetch[fetchFn])
              .mockResolvedValue(createFakeResponse({ json: { data: 'test' } }));
            request = {
              type: 'rest',
              method: method as 'GET' | 'POST' | 'PATCH' | 'HEAD',
              path: '/api/v4/test',
            };
          });

          it('merges custom headers with default headers', async () => {
            const customHeaders = { 'Custom-Header': 'value' };

            await client.fetchFromApiRaw({
              ...(request as GetRequest<unknown>),
              headers: customHeaders,
            });

            const expectedHeaders = {
              ...client.getDefaultHeaders(),
              ...customHeaders,
              ...(method !== 'GET' && method !== 'HEAD'
                ? { 'Content-Type': 'application/json' }
                : {}),
            };

            expect(lsFetch[fetchFn]).toHaveBeenCalledWith(
              new URL(expectedRestUrl),
              expect.objectContaining({
                headers: expectedHeaders,
              }),
            );
          });

          it('passes abort signal to fetch request', async () => {
            const abortSignal = new AbortController().signal;

            await client.fetchFromApiRaw({ ...request, signal: abortSignal });

            expect(lsFetch[fetchFn as keyof LsFetch]).toHaveBeenCalledWith(
              expect.any(URL),
              expect.objectContaining({
                signal: abortSignal,
              }),
            );
          });
        });
      });
    });
  });

  describe('POST request responses', () => {
    let client: DefaultSimpleApiClient;
    const baseUrl = 'https://gitlab.com';
    const expectedRestUrl = 'https://gitlab.com/api/v4/test';

    beforeEach(() => {
      jest.resetAllMocks();
      client = new DefaultSimpleApiClient(new TestLogger(), lsFetch, clientInfo, baseUrl, token);
    });

    it('parses JSON response for regular POST request', async () => {
      const mockJsonData = { data: 'test-data', status: 'success' };
      const jsonResponse = createFakeResponse({ json: mockJsonData });
      jest.mocked(lsFetch.post).mockResolvedValue(jsonResponse);

      const request: ApiRequest<unknown> = {
        type: 'rest',
        method: 'POST',
        path: '/api/v4/test',
        body: { request: 'data' },
      };

      const result = await client.fetchFromApi(request);

      expect(lsFetch.post).toHaveBeenCalledWith(
        new URL(expectedRestUrl),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            ...client.getDefaultHeaders(),
          },
          body: JSON.stringify({ request: 'data' }),
        }),
      );
      expect(result).toEqual(mockJsonData);
      expect(handleFetchError).toHaveBeenCalledWith(request, jsonResponse, 'test');
    });

    it('returns raw Response object for POST request with `rawResponse` option', async () => {
      const jsonSpy = jest.fn();

      const binaryResponse = createFakeResponse({
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
        // Assume createFakeResponse can handle binary data or null for this test
        text: 'data: {"message":"Event 1"}\n\ndata: {"message":"Event 2"}\n\n',
        json: jsonSpy,
      });
      jest.mocked(lsFetch.post).mockResolvedValue(binaryResponse);

      const request: ApiRequest<unknown> = {
        type: 'rest',
        method: 'POST',
        path: '/api/v4/binary-endpoint',
        body: { request: 'binary' },
      };

      const result = await client.fetchFromApiRaw(request);

      expect(result).toBe(binaryResponse);
      expect(jsonSpy).not.toHaveBeenCalled();
    });
  });

  describe('HEAD request responses', () => {
    let client: DefaultSimpleApiClient;
    const baseUrl = 'https://gitlab.com';
    const expectedRestUrl = 'https://gitlab.com/api/v4/test';

    beforeEach(() => {
      jest.resetAllMocks();
      client = new DefaultSimpleApiClient(new TestLogger(), lsFetch, clientInfo, baseUrl, token);
    });

    it('returns raw Response object for HEAD request', async () => {
      const headResponse = createFakeResponse({
        status: 200,
        headers: {
          'X-Custom-Header': 'header-value',
        },
      });
      jest.mocked(lsFetch.head).mockResolvedValue(headResponse);

      const request: HeadRequest = {
        type: 'rest',
        method: 'HEAD',
        path: '/api/v4/test',
      };

      const result = await client.fetchFromApiRaw(request);

      expect(lsFetch.head).toHaveBeenCalledWith(
        new URL(expectedRestUrl),
        expect.objectContaining({
          headers: client.getDefaultHeaders(),
        }),
      );
      expect(result).toBe(headResponse);
    });

    it('properly handles search parameters in HEAD request', async () => {
      const headResponse = createFakeResponse({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      jest.mocked(lsFetch.head).mockResolvedValue(headResponse);

      const request: HeadRequest = {
        type: 'rest',
        method: 'HEAD',
        path: '/api/v4/test',
        searchParams: { key1: 'value1', key2: 'value2' },
      };

      await client.fetchFromApi(request);

      expect(lsFetch.head).toHaveBeenCalledWith(
        expect.objectContaining({
          href: `${expectedRestUrl}?key1=value1&key2=value2`,
        }),
        expect.any(Object),
      );
    });
  });
});
