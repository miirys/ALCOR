import { MessageBus } from '@gitlab-org/message-bus';
import { Cable } from '@anycable/core';
import { Messages } from '../contract';

export type DuoChatWebviewMessageBus = MessageBus<{
  inbound: Messages['webviewToPlugin'];
  outbound: Messages['pluginToWebview'];
}>;

export type DuoChatExtensionMessageBus = MessageBus<{
  inbound: Messages['extensionToPlugin'];
  outbound: Messages['pluginToExtension'];
}>;

/**
 * These types are copied from ./src/common/api_types.ts
 * TODO: move these types to a common package
 */

// why: `_TReturnType` helps encapsulate the full request type when used with `fetchFromApi`
/* eslint @typescript-eslint/no-unused-vars: ["error", { "varsIgnorePattern": "TReturnType" }] */

/**
 * The response body is parsed as JSON and it's up to the client to ensure it
 * matches the TReturnType
 */
interface SupportedSinceInstanceVersion {
  version: string;
  resourceName: string;
}

interface BaseRestRequest<_TReturnType> {
  type: 'rest';
  /**
   * The request path must include `/api/v4`
   * If you want to make request to `https://gitlab.example/api/v4/projects`
   * set the path to `/api/v4/projects`
   */
  path: string;
  headers?: Record<string, string>;
  supportedSinceInstanceVersion?: SupportedSinceInstanceVersion;
}

interface GraphQLRequest<_TReturnType> {
  type: 'graphql';
  query: string;
  /** Options passed to the GraphQL query */
  variables: Record<string, unknown>;
  supportedSinceInstanceVersion?: SupportedSinceInstanceVersion;
}

interface PostRequest<_TReturnType> extends BaseRestRequest<_TReturnType> {
  method: 'POST';

  body?: unknown;
}

/**
 * The response body is parsed as JSON and it's up to the client to ensure it
 * matches the TReturnType
 */
interface GetRequest<_TReturnType> extends BaseRestRequest<_TReturnType> {
  method: 'GET';
  searchParams?: Record<string, string>;
  supportedSinceInstanceVersion?: SupportedSinceInstanceVersion;
}

export type ApiRequest<_TReturnType> =
  | GetRequest<_TReturnType>
  | PostRequest<_TReturnType>
  | GraphQLRequest<_TReturnType>;

export interface GitLabApiClient {
  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType>;
  connectToCable(): Promise<Cable>;
}
