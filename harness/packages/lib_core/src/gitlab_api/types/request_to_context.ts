import { logCtxItem, logCtxParent } from '@gitlab-org/logging';
import { ApiRequest, RestRequest } from './api_request';

const bodyToContext = (restRequest: RestRequest<unknown>) => {
  if (restRequest.method === 'GET' || restRequest.method === 'HEAD') return undefined;
  if (!restRequest.body) return undefined;
  return logCtxItem('Body', JSON.stringify(restRequest.body));
};

const searchParamsToContext = (restRequest: RestRequest<unknown>) => {
  if (
    restRequest.method === 'POST' ||
    restRequest.method === 'PATCH' ||
    restRequest.method === 'PUT'
  ) {
    return undefined;
  }
  if (!restRequest.searchParams) return undefined;
  return logCtxItem('Search Params', JSON.stringify(restRequest.searchParams));
};

const headersToContext = (restRequest: RestRequest<unknown>) => {
  if (!restRequest.headers) return undefined;
  return logCtxItem('Headers', JSON.stringify(restRequest.headers));
};

export const requestToContext = (request: ApiRequest<unknown>) => {
  switch (request.type) {
    case 'graphql':
      return logCtxParent(
        'GraphQL Request',
        logCtxItem('Query', request.query.replace(/[\s\n]+/g, ' ').trim()),
        logCtxItem('Variables', JSON.stringify(request.variables)),
      );
    case 'rest':
      return logCtxParent(
        'REST Request',
        logCtxItem('Method', request.method),
        logCtxItem('Path', request.path),
        headersToContext(request),
        searchParamsToContext(request),
        bodyToContext(request),
      );
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return logCtxItem('Unknown request type', (request as any).type);
  }
};
