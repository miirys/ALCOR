import { NO_PARAMS, NO_RESPONSE, RpcMessageDefinition } from '@gitlab-org/rpc';
import { createInterfaceId } from '@gitlab/needle';

/**
 * @template TParams - The type of parameters accepted by the handler.
 * @template TResponse - The type of response returned by the handler.
 */
export type EndpointHandleFunc<
  TParams = NO_PARAMS,
  TResponse = NO_RESPONSE,
> = TParams extends NO_PARAMS
  ? (params?: unknown) => TResponse | Promise<TResponse> // No params needed
  : (params: TParams) => TResponse | Promise<TResponse>; // Params required

/**
 * Configuration for an endpoint.
 *
 * An endpoint defines the behavior for handling incoming messages.
 *
 * @template TParams - The type of parameters accepted by this endpoint.
 * @template TResponse - The type of response returned by this endpoint.
 */
export type Endpoint<TParams = NO_PARAMS, TResponse = NO_RESPONSE> = RpcMessageDefinition<
  TParams,
  TResponse
> & {
  handle: EndpointHandleFunc<TParams, TResponse>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEndpoint = Endpoint<any, any>;

/**
 * Interface for providing endpoint definitions for the system.
 *
 * The `EndpointDefinitionProvider` is designed to act as a contract for components or modules
 * that supply endpoint definitions. These endpoint definitions represent the available
 * notification and request handlers within a specific feature, module, or system.
 *
 * @interface EndpointDefinitionProvider
 * @method getEndpoints - Returns an array of `EndpointDefinition` objects.
 */
export interface EndpointProvider {
  getEndpoints(): Endpoint[];
}

export const EndpointProvider = createInterfaceId<EndpointProvider>('EndpointProvider');
