import { ApiRequest, SimpleApiClient, FetchError } from '@gitlab-org/core';
import { isEqual } from 'lodash';
import { createFakeResponse } from '@gitlab-org/test-utils';

export type Resp = { error?: Error; success?: unknown };
export type RequestResponse = [ApiRequest<unknown>, Resp];

type RawResp = Response;
export type RawRequestResponse = [ApiRequest<unknown>, RawResp];

export const success = (response: unknown): Resp => ({ success: response });
export const error = (e: Error): Resp => ({ error: e });

export class TestSimpleApiClient implements SimpleApiClient {
  responses: RequestResponse[];

  rawResponses: RawRequestResponse[];

  constructor() {
    this.responses = [];
    this.rawResponses = [];
  }

  getDefaultHeaders() {
    return {};
  }

  async fetchFromApiRaw<TReturnType>(request: ApiRequest<TReturnType>): Promise<Response> {
    const [, response] = this.rawResponses.find(([req]) => isEqual(request, req)) || [];
    if (response) {
      return response;
    }

    return createFakeResponse({ status: 404 });
  }

  async fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType> {
    const [, response] = this.responses.find(([req]) => isEqual(request, req)) || [];
    if (response?.error) throw response.error;
    if (response?.success) return response.success as TReturnType;

    throw new FetchError(
      request,
      createFakeResponse({ status: 404 }),
      `Request ${JSON.stringify(request)} did not match any recorded test cases in TestSimpleApiClient`,
    );
  }

  fetchOperation: <TReturnType>(
    request: ApiRequest<TReturnType>,
  ) => (signal: AbortSignal) => Promise<TReturnType> = (request) => () =>
    this.fetchFromApi({ ...request });
}
