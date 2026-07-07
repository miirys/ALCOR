import { declareRequest } from '@gitlab-org/rpc';
import { z } from '@gitlab-org/schema';
import { OpenApiSchema } from './schema';

const getOpenApiSchema = declareRequest('$/gitlab/documentation/getOpenApiSchema')
  .withParams(z.object({ schemaType: z.enum(['client-to-server', 'server-to-client']) }))
  .withResponse(OpenApiSchema)
  .build();

const getSwaggerDocument = declareRequest('$/gitlab/documentation/getSwaggerHtml')
  .withResponse(z.string())
  .build();

export const clientToServerMessages = {
  getOpenApiSchema,
  getSwaggerDocument,
};
