import { Cable as ActionCableCable } from '@anycable/core';
import { createInterfaceId } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { Operation } from '@gitlab-org/resiliency';
import { ApiReconfiguredData, ApiRequest, InstanceInfo, SimpleApiClient, TokenInfo } from './types';

export interface GitLabApiService {
  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType>;
  fetchFromApiRaw(request: ApiRequest<unknown>): Promise<Response>;
  fetchOperation<TReturnType>(request: ApiRequest<TReturnType>): Operation<TReturnType>;
  connectToCable(): Promise<ActionCableCable>;
  onApiReconfigured(listener: (data: ApiReconfiguredData) => void): Disposable;
  getSimpleClient(baseUrl: URL | string, token: string): SimpleApiClient;
  readonly instanceInfo?: InstanceInfo;
  readonly tokenInfo?: TokenInfo;
}

export const GitLabApiService = createInterfaceId<GitLabApiService>('GitLabApiService');
