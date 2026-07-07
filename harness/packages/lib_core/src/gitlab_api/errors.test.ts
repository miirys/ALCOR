import { createFakePartial } from '@gitlab-org/test-utils';
import {
  FetchError,
  isFetchError,
  RESTError,
  GraphQLError,
  NetworkError,
  TimeoutError,
  AbortError,
  GraphQlResponse,
  isMissingDefaultDuoGroupError,
} from './errors';
import type { ApiRequest, GraphQLRequest } from './types/api_request';

const fakeRequest = createFakePartial<ApiRequest<unknown>>({
  type: 'rest',
  method: 'GET',
  path: '/api/v4/project',
});

const fakeResponse = createFakePartial<Response>({
  ok: false,
  url: 'https://example.com/api/v4/project',
  status: 400,
});

describe('RESTError', () => {
  it('includes error_description in message when present', () => {
    const error = new RESTError(
      fakeRequest,
      fakeResponse,
      'User',
      `{ "error_description": "The access token is invalid or expired" }`,
    );
    expect(error.message).toBe(
      'Fetching User from https://example.com/api/v4/project failed. The access token is invalid or expired',
    );
  });

  it('handles error message without error_description', () => {
    const error = new RESTError(
      fakeRequest,
      fakeResponse,
      'User',
      `{ "error": "invalid_request" }`,
    );
    expect(error.message).toBe('Fetching User from https://example.com/api/v4/project failed. ');
  });

  it('handles invalid JSON in response body', () => {
    const error = new RESTError(fakeRequest, fakeResponse, 'User', 'Invalid JSON response');
    expect(error.message).toBe('Fetching User from https://example.com/api/v4/project failed. ');
  });

  it('handles empty response body', () => {
    const error = new RESTError(fakeRequest, fakeResponse, 'User');
    expect(error.message).toBe('Fetching User from https://example.com/api/v4/project failed. ');
  });

  it('prioritizes invalid token message over error_description', () => {
    const error = new RESTError(
      fakeRequest,
      { ...fakeResponse, status: 401 },
      'User',
      `{ "error": "invalid_token", "error_description": "Token has expired" }`,
    );
    expect(error.message).toMatch(/token is expired or revoked/);
    expect(error.message).not.toMatch(/Token has expired/);
  });

  it('indicates invalid token', () => {
    const error = new RESTError(
      fakeRequest,
      { ...fakeResponse, status: 401 },
      'resource name',
      `{ "error": "invalid_token" }`,
    );
    expect(error.isInvalidTokenOrInvalidRefresh()).toBe(true);
    expect(error.message).toMatch(/token is expired or revoked/);
  });

  it('indicates invalid grant as invalid token', () => {
    const request = createFakePartial<ApiRequest<unknown>>({
      type: 'rest',
      method: 'POST',
      path: '/api/v4/oauth/token',
    });
    const response = createFakePartial<Response>({
      ok: false,
      url: 'https://example.com/api/v4/oauth/token',
      status: 400,
    });
    const error = new FetchError(
      request,
      response,
      'resource name',
      `{ "error": "invalid_grant" }`,
    );
    expect(error.isInvalidTokenOrInvalidRefresh()).toBe(true);
    expect(error.message).toMatch(/Request to refresh token failed/);
  });

  describe('sanitizedMessage', () => {
    it('returns token expired message for invalid_token error', () => {
      const error = new RESTError(
        fakeRequest,
        { ...fakeResponse, status: 401 },
        'code suggestions',
        `{ "error": "invalid_token" }`,
      );
      expect(error.sanitizedMessage).toBe(
        'Request failed because the token is expired or revoked.',
      );
    });

    it('returns refresh token message for invalid_grant error', () => {
      const error = new RESTError(
        fakeRequest,
        { ...fakeResponse, status: 400 },
        'code suggestions',
        `{ "error": "invalid_grant" }`,
      );
      expect(error.sanitizedMessage).toBe(
        "Request to refresh token failed, because it's revoked or already refreshed.",
      );
    });

    it('returns generic error code message for other errors', () => {
      const error = new RESTError(
        fakeRequest,
        { ...fakeResponse, status: 429 },
        'code suggestions',
      );
      expect(error.sanitizedMessage).toBe('Request failed with error code: 429');
    });
  });
});

describe('isMissingDefaultDuoGroupError', () => {
  const createMockError = (body?: string) => {
    const request = createFakePartial<ApiRequest<unknown>>({
      type: 'rest',
      method: 'POST',
      path: '/api/v4/code_suggestions/completions',
    });
    const response = createFakePartial<Response>({
      ok: false,
      url: 'https://example.com/api/v4/code_suggestions/completions',
      status: 422,
    });

    return new FetchError(request, response, 'resource name', body);
  };

  it('should return `true` if error body contains `missing_default_duo_group`', () => {
    const error = createMockError(`{ "error": "missing_default_duo_group" }`);
    expect(isMissingDefaultDuoGroupError(error)).toBe(true);
  });

  it.each([
    createMockError(),
    createMockError(''),
    createMockError(`{ "error": "invalid_token" }`),
    new Error('Network error'),
  ])('should return `false` if passed object does not contain expected error body', (error) => {
    expect(isMissingDefaultDuoGroupError(error)).toBe(false);
  });
});

describe('isFetchError', () => {
  it('should return `true` if passed object is a `FetchError` instance', () => {
    const error = new FetchError(fakeRequest, fakeResponse, 'resource name');
    expect(isFetchError(error)).toBe(true);
  });

  it.each([new Error('Network error'), null, undefined, { name: 'FetchError' }])(
    'should return `false` if passed object is not a `FetchError` instance',
    (err) => {
      expect(isFetchError(err)).toBe(false);
    },
  );
});

describe('Error ctx property', () => {
  describe('RESTError', () => {
    it('provides context with request and response details', () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const response = createFakePartial<Response>({
        status: 404,
        headers,
      });

      const error = new RESTError(fakeRequest, response, 'User', 'Not found');

      expect(error.ctx).toEqual({
        name: 'Error details',
        children: [
          {
            name: 'REST Request',
            children: [
              { name: 'Method', value: 'GET' },
              { name: 'Path', value: '/api/v4/project' },
            ],
          },
          {
            name: 'Response',
            children: [
              { name: 'Status', value: '404' },
              { name: 'Headers', value: '{"content-type":"application/json"}' },
              { name: 'Response body', value: 'Not found' },
            ],
          },
        ],
      });
    });
  });

  describe('GraphQLError', () => {
    it('provides context with request and response details', () => {
      const request: GraphQLRequest<unknown> = {
        type: 'graphql',
        query: 'query { user { name } }',
        variables: { id: '123' },
      };

      const error = new GraphQLError(
        request,
        createFakePartial<GraphQlResponse>({
          errors: [{ message: 'Field not found' }],
          status: 400,
        }),
      );

      expect(error.ctx).toEqual({
        name: 'Error details',
        children: [
          {
            name: 'GraphQL Request',
            children: [
              { name: 'Query', value: 'query { user { name } }' },
              { name: 'Variables', value: '{"id":"123"}' },
            ],
          },
          {
            name: 'Response',
            children: [
              { name: 'Status', value: '400' },
              { name: 'Errors', value: 'Field not found' },
            ],
          },
        ],
      });
    });
  });

  describe('NetworkError', () => {
    it('provides context with request details', () => {
      const error = new NetworkError(fakeRequest, new Error('Network down'));

      expect(error.ctx.name).toBe('Error details');
      expect(error.ctx.children).toHaveLength(1);
      expect(error.ctx.children?.[0]?.name).toBe('REST Request');
    });

    it('adds Network issue context when error has code', () => {
      const networkError = new Error('Connection failed');
      Object.defineProperty(networkError, 'code', { value: 'ECONNREFUSED' });

      const error = new NetworkError(fakeRequest, networkError);

      expect(error.ctx.children).toHaveLength(2);
      expect(error.ctx.children?.[1]).toEqual({
        name: 'Network issue',
        value: 'Connection refused - server is not accepting connections (ECONNREFUSED)',
      });
    });
  });

  describe('TimeoutError', () => {
    it('provides context with request details', () => {
      const error = new TimeoutError(fakeRequest, 5000);

      expect(error.ctx.name).toBe('Error details');
      expect(error.ctx.children).toHaveLength(1);
      expect(error.ctx.children?.[0]?.name).toBe('REST Request');
    });
  });

  describe('AbortError', () => {
    it('provides context with request details', () => {
      const error = new AbortError(fakeRequest, 'User cancelled');

      expect(error.ctx.name).toBe('Error details');
      expect(error.ctx.children).toHaveLength(1);
      expect(error.ctx.children?.[0]?.name).toBe('REST Request');
    });
  });

  describe('sanitizedMessage', () => {
    it('returns specific error description for known error codes', () => {
      const networkError = new Error('Connection failed');
      Object.defineProperty(networkError, 'code', { value: 'ECONNREFUSED' });

      const error = new NetworkError(fakeRequest, networkError);

      expect(error.sanitizedMessage).toBe(
        'Network error occurred: Connection refused - server is not accepting connections',
      );
    });

    it('returns generic message for unknown error codes', () => {
      const networkError = new Error('Unknown network issue');
      Object.defineProperty(networkError, 'code', { value: 'EUNKNOWN' });

      const error = new NetworkError(fakeRequest, networkError);

      expect(error.sanitizedMessage).toBe('Network error occurred');
    });

    it('returns generic message when no error code is present', () => {
      const networkError = new Error('Network issue');

      const error = new NetworkError(fakeRequest, networkError);

      expect(error.sanitizedMessage).toBe('Network error occurred');
    });
  });
});
