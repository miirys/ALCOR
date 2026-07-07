import { requestToContext } from './request_to_context';
import { GetRequest, PostRequest, GraphQLRequest, ApiRequest } from './api_request';

describe('requestToContext', () => {
  describe('GraphQL requests', () => {
    const request: GraphQLRequest<unknown> = {
      type: 'graphql',
      query: `
          query GetUser($id: ID!) {
            user(id: $id) {
              name
              email
            }
          }
        `,
      variables: { id: '123' },
    };

    it('converts GraphQL request to context', () => {
      const context = requestToContext(request);

      expect(context).toEqual({
        name: 'GraphQL Request',
        children: [
          {
            name: 'Query',
            value: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
          },
          {
            name: 'Variables',
            value: '{"id":"123"}',
          },
        ],
      });
    });

    it('handles GraphQL request without variables', () => {
      const context = requestToContext({ ...request, variables: {} });

      expect(context.name).toBe('GraphQL Request');
      expect(context.children?.[1]?.value).toBe('{}');
    });
  });

  describe('REST requests', () => {
    it('converts GET request to context', () => {
      const request: GetRequest<unknown> = {
        type: 'rest',
        method: 'GET',
        path: '/api/v4/user',
        searchParams: { per_page: '50', page: '1' },
        headers: { 'X-Custom': 'value' },
      };

      const context = requestToContext(request);

      expect(context).toEqual({
        name: 'REST Request',
        children: [
          { name: 'Method', value: 'GET' },
          { name: 'Path', value: '/api/v4/user' },
          { name: 'Headers', value: '{"X-Custom":"value"}' },
          { name: 'Search Params', value: '{"per_page":"50","page":"1"}' },
        ],
      });
    });

    it('converts POST request to context', () => {
      const request: PostRequest<unknown> = {
        type: 'rest',
        method: 'POST',
        path: '/api/v4/projects',
        body: { name: 'test-project', visibility: 'private' },
        headers: { 'Content-Type': 'application/json' },
      };

      const context = requestToContext(request);

      expect(context).toEqual({
        name: 'REST Request',
        children: [
          { name: 'Method', value: 'POST' },
          { name: 'Path', value: '/api/v4/projects' },
          { name: 'Headers', value: '{"Content-Type":"application/json"}' },
          { name: 'Body', value: '{"name":"test-project","visibility":"private"}' },
        ],
      });
    });

    it('omits undefined values', () => {
      const request: GetRequest<unknown> = {
        type: 'rest',
        method: 'GET',
        path: '/api/v4/user',
      };

      const context = requestToContext(request);

      expect(context.children).toHaveLength(2);
      expect(context.children?.some((c) => c?.name === 'Headers')).toBe(false);
      expect(context.children?.some((c) => c?.name === 'Search Params')).toBe(false);
    });
  });

  describe('unknown request types', () => {
    it('handles unknown request type gracefully', () => {
      const request = { type: 'unknown' } as unknown as ApiRequest<unknown>;

      const context = requestToContext(request);

      expect(context.name).toBe('Unknown request type');
      expect(context.value).toBe('unknown');
    });
  });
});
