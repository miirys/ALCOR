import { z } from 'zod';
import { NO_PARAMS } from '../constants';
import { RpcNotificationDefinition } from '../types';
import { RpcMessageDefinitionBuilder } from './rpc_message_definition_builder';

class NotificationDeclarationBuilder<TParams = NO_PARAMS>
  implements RpcMessageDefinitionBuilder<TParams, void>
{
  #definition: RpcNotificationDefinition<TParams>;

  constructor(methodName: string, paramsSchema: z.ZodType<TParams>) {
    this.#definition = {
      type: 'notification',
      methodName,
      paramsSchema,
    };
  }

  withName(name: string): NotificationDeclarationBuilder<TParams> {
    this.#definition.name = name;
    return this;
  }

  withDescription(description: string): NotificationDeclarationBuilder<TParams> {
    this.#definition.description = description;
    return this;
  }

  withParams<TNewParams>(
    paramsSchema: z.ZodType<TNewParams>,
  ): NotificationDeclarationBuilder<TNewParams> {
    const builder = this as unknown as NotificationDeclarationBuilder<TNewParams>;
    builder.#definition.paramsSchema = paramsSchema;

    return builder;
  }

  build(): RpcNotificationDefinition<TParams> {
    return this.#definition;
  }
}

export const declareNotification = (method: string) =>
  new NotificationDeclarationBuilder(method, NO_PARAMS);
