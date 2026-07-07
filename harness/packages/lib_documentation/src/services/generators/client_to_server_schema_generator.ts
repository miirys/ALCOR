import { Injectable } from '@gitlab/needle';
import {
  RpcMessageDefinitionProvider,
  ClientToServerRpcMessageDefinitionProvider,
} from '@gitlab-org/rpc';
import { generateOpenApiV3Document } from '../../utils';
import { ApiInfo, ClientToServerOpenApiSchemaGenerator, OpenAPIV3Document } from '../../types';
import { API_VERSION } from '../../constants';

@Injectable(ClientToServerOpenApiSchemaGenerator, [ClientToServerRpcMessageDefinitionProvider])
export class DefaultClientToServerOpenApiSchemaGenerator
  implements ClientToServerOpenApiSchemaGenerator
{
  #schemaValue: OpenAPIV3Document | undefined;

  #messageDefinitionProvider: RpcMessageDefinitionProvider;

  constructor(messageDefininitionProvider: RpcMessageDefinitionProvider) {
    this.#messageDefinitionProvider = messageDefininitionProvider;
  }

  generateSchema(): OpenAPIV3Document {
    if (!this.#schemaValue) {
      this.#schemaValue = this.#generateSchema();
    }

    return this.#schemaValue;
  }

  #generateSchema() {
    const apiInfo: ApiInfo = {
      title: 'GitLab Language Server - Client To Server',
      version: API_VERSION,
    };

    const messageDefinitions = this.#messageDefinitionProvider.getMessageDefinitions();
    return generateOpenApiV3Document(apiInfo, messageDefinitions);
  }
}
