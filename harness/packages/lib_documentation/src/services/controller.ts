import { Controller, endpoint, EndpointProvider } from '@gitlab-org/rpc-endpoint';
import { Injectable } from '@gitlab/needle';
import { InferParams, InferResponse } from '@gitlab-org/rpc';
import { clientToServerMessages } from '../api';
import {
  ClientToServerOpenApiSchemaGenerator,
  ServerToClientOpenApiSchemaGenerator,
  DualSwaggerHtmlGenerator,
} from '../types';

@Injectable(EndpointProvider, [
  ServerToClientOpenApiSchemaGenerator,
  ClientToServerOpenApiSchemaGenerator,
  DualSwaggerHtmlGenerator,
])
export class DocumentationController extends Controller {
  #serverToClientSchemaService: ServerToClientOpenApiSchemaGenerator;

  #clientToServerSchemaService: ClientToServerOpenApiSchemaGenerator;

  #swaggerService: DualSwaggerHtmlGenerator;

  constructor(
    serverToClientSchemaService: ServerToClientOpenApiSchemaGenerator,
    clientToServerSchemaService: ClientToServerOpenApiSchemaGenerator,
    swaggerService: DualSwaggerHtmlGenerator,
  ) {
    super();
    this.#serverToClientSchemaService = serverToClientSchemaService;
    this.#clientToServerSchemaService = clientToServerSchemaService;
    this.#swaggerService = swaggerService;
  }

  @endpoint(clientToServerMessages.getOpenApiSchema)
  getOpenApiSchema({
    schemaType,
  }: InferParams<typeof clientToServerMessages.getOpenApiSchema>): InferResponse<
    typeof clientToServerMessages.getOpenApiSchema
  > {
    switch (schemaType) {
      case 'server-to-client':
        return this.#serverToClientSchemaService.generateSchema();
      case 'client-to-server':
        return this.#clientToServerSchemaService.generateSchema();
      default:
        throw new Error(`Invalid schemaType: ${schemaType}`);
    }
  }

  @endpoint(clientToServerMessages.getSwaggerDocument)
  getSwagger(): string {
    return this.#swaggerService.generateSwagger();
  }
}
