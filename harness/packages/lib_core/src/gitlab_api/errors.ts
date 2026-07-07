/* eslint-disable max-classes-per-file */
import { GraphQLError as GraphQLBaseError } from 'graphql';
import { isEmpty } from 'lodash-es';
import { ContextError, logCtxItem, logCtxParent } from '@gitlab-org/logging';
import { extractGraphQLOperationLabel } from './graphql_query_identifier_utils';
import { ApiRequest, GraphQLRequest } from './types';
import { requestToContext } from './types/request_to_context';

interface ErrorOptions {
  cause?: unknown;
}

export interface SanitizedErrorProvider {
  sanitizedMessage: string;
}

export function isSanitizedError(object: unknown): object is SanitizedErrorProvider {
  return (
    typeof object === 'object' &&
    object !== null &&
    'sanitizedMessage' in object &&
    typeof (object as { sanitizedMessage?: unknown }).sanitizedMessage === 'string'
  );
}

export const stackToArray = (stack: string | undefined): string[] => (stack ?? '').split('\n');

const getErrorType = (body: string): string | unknown => {
  try {
    const parsedBody = JSON.parse(body);
    return parsedBody?.error;
  } catch {
    return undefined;
  }
};

const getErrorDescription = (body?: string): string => {
  if (!body) return '';
  try {
    const parsedBody = JSON.parse(body);
    return parsedBody?.error_description ?? '';
  } catch {
    return '';
  }
};
const isInvalidTokenError = (response: Response, body?: string) =>
  Boolean(response.status === 401 && body && getErrorType(body) === 'invalid_token');

const isInvalidRefresh = (response: Response, body?: string) =>
  Boolean(response.status === 400 && body && getErrorType(body) === 'invalid_grant');

export const isMissingDefaultDuoGroupError = (error: unknown) => {
  if (!isFetchError(error)) return false;
  if (!error.body) return false;

  try {
    const body = JSON.parse(error.body);

    return body.error === 'missing_default_duo_group';
  } catch {
    return false;
  }
};

// Base interface for all API errors
abstract class BaseApiError extends Error implements SanitizedErrorProvider {
  readonly request: ApiRequest<unknown>;

  readonly cause?: unknown;

  constructor(message: string, request: ApiRequest<unknown>, options?: ErrorOptions) {
    super(message);
    this.request = request;
    this.cause = options?.cause;
  }

  /**
   * Returns a sanitized version of the error message that's safe for logging.
   * Subclasses should override this to provide more specific sanitization.
   */
  get sanitizedMessage(): string {
    return 'API request failed';
  }
}

// Base response error - when we got a response but it wasn't ok
abstract class BaseResponseError extends BaseApiError {
  readonly status: number;

  constructor(
    message: string,
    request: ApiRequest<unknown>,
    status: number,
    options?: ErrorOptions,
  ) {
    super(message, request, options);
    this.status = status;
  }
}

// RESTError - for REST API errors (HTTP status errors)
export class RESTError extends BaseResponseError implements ContextError {
  readonly type = 'rest' as const;

  readonly response: Response;

  #body?: string;

  constructor(
    request: ApiRequest<unknown>,
    response: Response,
    resourceName: string,
    body?: string,
  ) {
    let message = `Fetching ${resourceName} from ${response.url} failed. ${getErrorDescription(body)}`;

    if (isInvalidTokenError(response, body)) {
      message = `Request for ${resourceName} failed because the token is expired or revoked.`;
    }
    if (isInvalidRefresh(response, body)) {
      message = `Request to refresh token failed, because it's revoked or already refreshed.`;
    }

    super(message, request, response.status);
    this.response = response;
    this.#body = body;
  }

  isInvalidTokenOrInvalidRefresh(): boolean {
    return (
      isInvalidTokenError(this.response, this.#body) || isInvalidRefresh(this.response, this.#body)
    );
  }

  get ctx() {
    return logCtxParent('Error details', requestToContext(this.request), this.#responseToContext());
  }

  get sanitizedMessage() {
    if (isInvalidTokenError(this.response, this.#body)) {
      return `Request failed because the token is expired or revoked.`;
    }
    if (isInvalidRefresh(this.response, this.#body)) {
      return `Request to refresh token failed, because it's revoked or already refreshed.`;
    }

    return `Request failed with error code: ${this.response.status}`;
  }

  #responseToContext() {
    const headers = Object.fromEntries(this.response.headers.entries());
    return logCtxParent(
      'Response',
      logCtxItem('Status', String(this.status)),
      !isEmpty(headers) ? logCtxItem('Headers', JSON.stringify(headers)) : undefined,
      this.#body ? logCtxItem('Response body', this.#body) : undefined,
    );
  }

  get body() {
    return this.#body;
  }
}

export interface GraphQlResponse<T = unknown> {
  data?: T;
  errors?: GraphQLBaseError[];
  extensions?: unknown;
  status: number;
}

const getResponseErrorText = (graphQlResponse: GraphQlResponse) =>
  graphQlResponse.errors?.map((e) => e.message).join(',') || '';

// GraphQLError - for GraphQL API errors
export class GraphQLError extends BaseResponseError implements ContextError {
  readonly type = 'graphql' as const;

  readonly graphQlResponse: GraphQlResponse;

  readonly #queryIdentifier: string | undefined;

  constructor(request: GraphQLRequest<unknown>, errorResponse: GraphQlResponse) {
    const queryIdentifier = extractGraphQLOperationLabel(request.query);
    const message = `GraphQL request "${queryIdentifier}" failed with ${getResponseErrorText(errorResponse)}`;
    super(message, request, errorResponse.status);
    this.graphQlResponse = errorResponse;
    this.#queryIdentifier = queryIdentifier;
  }

  get sanitizedMessage() {
    return `GraphQL request "${this.#queryIdentifier}" failed with status ${this.graphQlResponse.status}`;
  }

  get ctx() {
    return logCtxParent('Error details', requestToContext(this.request), this.#responseToContext());
  }

  #responseToContext() {
    return logCtxParent(
      'Response',
      logCtxItem('Status', String(this.graphQlResponse.status)),
      logCtxItem('Errors', getResponseErrorText(this.graphQlResponse)),
    );
  }
}

// NetworkError - for network-level failures
export class NetworkError extends BaseApiError implements ContextError {
  readonly type = 'network' as const;

  readonly cause?: unknown;

  constructor(request: ApiRequest<unknown>, cause: unknown) {
    const message = cause instanceof Error ? cause.message : `Network error occurred: ${cause}`;
    super(message, request);
    this.cause = cause;
  }

  get ctx() {
    return logCtxParent(
      'Error details',
      requestToContext(this.request),
      this.#networkErrorContext(),
    );
  }

  get sanitizedMessage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorProps = this.cause as any;
    const errorCode = errorProps?.code || errorProps?.errno;
    const errorDetails = this.#getErrorDescription(errorCode);
    return `Network error occurred${errorDetails ? `: ${errorDetails}` : ''}`;
  }

  #networkErrorContext() {
    if (!this.cause || !(this.cause instanceof Error)) {
      return undefined;
    }

    // the `any` type won't leak from here and the custom type guard would be too much code for a simple two property check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorProps = this.cause as any;

    if (errorProps.code || errorProps.errno) {
      const errorCode = errorProps.code || errorProps.errno;
      const description = this.#getErrorDescription(errorCode);
      const message = description ? `${description} (${errorCode})` : `Error code: ${errorCode}`;
      return logCtxItem('Network issue', message);
    }

    return undefined;
  }

  #getErrorDescription(errorCode: string): string | undefined {
    const descriptions: Record<string, string> = {
      ENOTFOUND: 'DNS lookup failed - hostname could not be resolved',
      ECONNREFUSED: 'Connection refused - server is not accepting connections',
      ECONNRESET: 'Connection reset by peer - server closed the connection unexpectedly',
      ETIMEDOUT: 'Connection timed out - server did not respond in time',
      EHOSTUNREACH: 'Host unreachable - network route to server not available',
      ENETUNREACH: 'Network unreachable - no network connectivity',
      ECONNABORTED: 'Connection aborted - request was cancelled',
      EBADF: 'Bad file descriptor - network connection issue',
      EPIPE: 'Broken pipe - connection closed while writing data',
      EAI_AGAIN: 'DNS lookup failed temporarily - try again later',
    };

    return descriptions[errorCode];
  }
}

// TimeoutError - for request timeouts
export class TimeoutError extends BaseApiError implements ContextError {
  readonly type = 'timeout' as const;

  #sanitizedError: string;

  constructor(request: ApiRequest<unknown>, timeout?: number) {
    const message = `Request timed out${timeout ? ` after ${timeout}ms` : ''}`;
    super(message, request);
    this.#sanitizedError = message;
  }

  get ctx() {
    return logCtxParent('Error details', requestToContext(this.request));
  }

  get sanitizedMessage() {
    return this.#sanitizedError;
  }
}

// AbortError - for aborted requests
export class AbortError extends BaseApiError implements ContextError {
  readonly type = 'abort' as const;

  constructor(request: ApiRequest<unknown>, reason?: string) {
    const message = `Request was aborted${reason ? `: ${reason}` : ''}`;
    super(message, request);
  }

  get ctx() {
    return logCtxParent('Error details', requestToContext(this.request));
  }

  get sanitizedMessage() {
    return 'Request was aborted';
  }
}

// Response errors - errors where we got a response but it wasn't ok (not 2xx)
export type ResponseError = RESTError | GraphQLError;

// Transport errors - errors where we couldn't get a response from the server
export type TransportError = NetworkError | TimeoutError | AbortError;

export type ApiError = ResponseError | TransportError;

// Type guard functions for ergonomic error handling
export function isApiError(object: unknown): object is ApiError {
  return isResponseError(object) || isTransportError(object);
}

export function isResponseError(object: unknown): object is ResponseError {
  return object instanceof RESTError || object instanceof GraphQLError;
}

export function isTransportError(object: unknown): object is TransportError {
  return (
    object instanceof NetworkError || object instanceof TimeoutError || object instanceof AbortError
  );
}

// Legacy aliases for backward compatibility
export const FetchError = RESTError;

export function isFetchError(object: unknown): object is RESTError {
  return object instanceof RESTError;
}
