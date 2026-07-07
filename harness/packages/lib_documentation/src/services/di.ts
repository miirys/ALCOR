import { DocumentationController } from './controller';
import { DefaultClientToServerOpenApiSchemaGenerator } from './generators/client_to_server_schema_generator';
import { DefaultServerToClientOpenApiSchemaGenerator } from './generators/server_to_client_schema_generator';
import { DefaultDualSwaggerHtmlGenerator } from './generators/swagger_generator';

export const documentationDiContributions = [
  DocumentationController,
  DefaultClientToServerOpenApiSchemaGenerator,
  DefaultServerToClientOpenApiSchemaGenerator,
  DefaultDualSwaggerHtmlGenerator,
];
