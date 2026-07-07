import { Operation } from '@gitlab-org/resiliency';
import { ApiRequest } from './api_request';

export interface SimpleApiClient {
  getDefaultHeaders(): Record<string, string>;

  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType>;
  fetchFromApiRaw<TReturnType>(request: ApiRequest<TReturnType>): Promise<Response>;
  fetchOperation<TReturnType>(request: ApiRequest<TReturnType>): Operation<TReturnType>;
}
