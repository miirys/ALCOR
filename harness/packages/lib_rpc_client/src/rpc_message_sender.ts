import { createInterfaceId } from '@gitlab/needle';
import { NO_PARAMS, RpcMessageDefinition } from '@gitlab-org/rpc';

export interface RpcMessageSender {
  send<TResponse>(
    messageDefinition: RpcMessageDefinition<NO_PARAMS, TResponse>,
  ): Promise<TResponse>;
  send<TParams, TResponse>(
    messageDefinition: RpcMessageDefinition<TParams, TResponse>,
    params: TParams,
  ): Promise<TResponse>;
}

export const RpcMessageSender = createInterfaceId<RpcMessageSender>('RpcMessageSender');
