import { NO_PARAMS, NO_RESPONSE, RpcMessageDefinition } from '@gitlab-org/rpc';
import { EndpointHandleFunc, Endpoint } from './types';

export const createEndpoint = <TParams = NO_PARAMS, TResponse = NO_RESPONSE>(
  messageDefinition: RpcMessageDefinition<TParams, TResponse>,
  handle: EndpointHandleFunc<TParams, TResponse>,
): Endpoint<TParams, TResponse> => {
  return {
    ...messageDefinition,
    handle,
  };
};
