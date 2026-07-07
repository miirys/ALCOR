import { NO_PARAMS, NO_RESPONSE, RpcMessageDefinition } from '@gitlab-org/rpc';
import { setEndpointMetadata } from '../metadata';

type EndpointHandler<TParams = NO_PARAMS, TResponse = NO_RESPONSE> = TParams extends NO_PARAMS
  ? () => TResponse | Promise<TResponse>
  : (params: TParams) => TResponse | Promise<TResponse>;

export function endpoint<TParams = NO_PARAMS, TResponse = NO_RESPONSE>(
  messageDefinition: RpcMessageDefinition<TParams, TResponse>,
): (target: EndpointHandler<TParams, TResponse>) => void {
  return (target: EndpointHandler<TParams, TResponse>) => {
    setEndpointMetadata(target, messageDefinition);
  };
}
