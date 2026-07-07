import { createInterfaceId } from '@gitlab/needle';
import { OpenAPIV3 } from 'openapi-types';

export interface ApiInfo {
  title: string;
  version: string;
}

export type OpenAPIV3Document = OpenAPIV3.Document;

interface OpenApiSchemaGenerator {
  generateSchema(): OpenAPIV3Document;
}

export interface SwaggerHtmlGenerator {
  generateSwagger(): string;
}

export interface ClientToServerOpenApiSchemaGenerator extends OpenApiSchemaGenerator {}
export const ClientToServerOpenApiSchemaGenerator =
  createInterfaceId<ClientToServerOpenApiSchemaGenerator>('ClientToServerOpenApiSchemaGenerator');

export interface ServerToClientOpenApiSchemaGenerator extends OpenApiSchemaGenerator {}
export const ServerToClientOpenApiSchemaGenerator =
  createInterfaceId<ServerToClientOpenApiSchemaGenerator>('ServerToClientOpenApiSchemaGenerator');

export interface DualSwaggerHtmlGenerator extends SwaggerHtmlGenerator {}
export const DualSwaggerHtmlGenerator = createInterfaceId<DualSwaggerHtmlGenerator>(
  'DualSwaggerHtmlGenerator',
);
