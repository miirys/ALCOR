import { z } from '@gitlab-org/schema';

export const OpenApiSchema = z
  .record(z.string(), z.any())
  .openapi('OpenApiSchema', {
    example: {
      openapi: '3.0.0',
      info: {
        title: 'GitLab Language Server - Client To Server',
        version: 'v1',
      },
      paths: {},
    },
  })
  .describe('The generated OpenAPI schema.');

export const SwaggerDocument = z.string();
