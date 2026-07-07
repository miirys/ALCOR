import { z } from 'zod';
import { NO_PARAMS, NO_RESPONSE } from '../constants';
import { RpcRequestDefinition } from '../types';
import { RpcMessageDefinitionBuilder } from './rpc_message_definition_builder';

class RequestDeclarationBuilder<TParams = NO_PARAMS, TResponse = NO_RESPONSE>
  implements RpcMessageDefinitionBuilder<TParams, TResponse>
{
  #definition: RpcRequestDefinition<TParams, TResponse>;

  constructor(
    methodName: string,
    paramsSchema: z.ZodType<TParams>,
    responseSchema: z.ZodType<TResponse>,
  ) {
    this.#definition = {
      type: 'request',
      methodName,
      paramsSchema,
      responseSchema,
    };
  }

  withName(name: string): RequestDeclarationBuilder<TParams, TResponse> {
    this.#definition.name = name;
    return this;
  }

  withDescription(description: string): RequestDeclarationBuilder<TParams, TResponse> {
    this.#definition.description = description;
    return this;
  }

  withParams<TNewParams>(
    paramsSchema: z.ZodType<TNewParams>,
  ): RequestDeclarationBuilder<TNewParams, TResponse> {
    const builder = this as unknown as RequestDeclarationBuilder<TNewParams, TResponse>;
    builder.#definition.paramsSchema = paramsSchema;

    return builder;
  }

  withResponse<TNewResponse>(
    responseSchema: z.ZodType<TNewResponse>,
  ): RequestDeclarationBuilder<TParams, TNewResponse> {
    const builder = this as unknown as RequestDeclarationBuilder<TParams, TNewResponse>;
    builder.#definition.responseSchema = responseSchema;

    return builder;
  }

  build(): RpcRequestDefinition<TParams, TResponse> {
    return this.#definition;
  }
}

export const declareRequest = (method: string) =>
  new RequestDeclarationBuilder(method, NO_PARAMS, NO_RESPONSE);
