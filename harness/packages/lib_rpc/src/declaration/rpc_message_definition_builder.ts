import { RpcMessageDefinition } from '../types';

export interface RpcMessageDefinitionBuilder<TParams, TResponse> {
  build(): RpcMessageDefinition<TParams, TResponse>;
}
