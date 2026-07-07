import { Injectable } from '@gitlab/needle';
import {
  RpcMessageDefinitionProvider,
  ServerToClientRpcMessageDefinitionProvider,
} from '@gitlab-org/rpc';
import { generateOpenApiV3Document } from '../../utils';
import { ApiInfo, OpenAPIV3Document, ServerToClientOpenApiSchemaGenerator } from '../../types';
import { API_VERSION } from '../../constants';

@Injectable(ServerToClientOpenApiSchemaGenerator, [ServerToClientRpcMessageDefinitionProvider])
export class DefaultServerToClientOpenApiSchemaGenerator
  implements ServerToClientOpenApiSchemaGenerator
{
  #schemaValue: OpenAPIV3Document | undefined;

  #messageDefinitionProvider: RpcMessageDefinitionProvider;

  constructor(messageDefinitionProvider: RpcMessageDefinitionProvider) {
    this.#messageDefinitionProvider = messageDefinitionProvider;
  }

  generateSchema(): OpenAPIV3Document {
    if (!this.#schemaValue) {
      this.#schemaValue = this.#generateSchema();
    }

    return this.#schemaValue;
  }

  #generateSchema() {
    const apiInfo: ApiInfo = {
      title: 'GitLab Language Server - Server To Client',
      version: API_VERSION,
    };

    const messageDefinitions = this.#messageDefinitionProvider.getMessageDefinitions();
    return generateOpenApiV3Document(apiInfo, messageDefinitions);
  }
}
