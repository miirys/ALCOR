import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
  ResponseConfig,
  RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { RpcMessageDefinition } from '@gitlab-org/rpc';
import { z } from '@gitlab-org/schema';
import { ApiInfo, OpenAPIV3Document } from '../types';

export function generateOpenApiV3Document(
  apiInfo: ApiInfo,
  messageDefinitions: readonly RpcMessageDefinition[],
): OpenAPIV3Document {
  const registry = new OpenAPIRegistry();

  messageDefinitions
    .map(
      (message): RouteConfig => ({
        method: message.type === 'notification' ? 'put' : 'post',
        path: message.methodName,
        tags: [message.type],
        'x-rpc-type': message.type,
        summary: message.description,
        request: buildRequestInfo(message),
        responses: {
          ...buildSuccessResponse(message),
        },
      }),
    )
    .forEach((routeConfig) => registry.registerPath(routeConfig));

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: apiInfo.title,
      version: apiInfo.version,
    },
    servers: [
      {
        description: 'local stdio',
        url: 'stdio://',
      },
    ],
  }) as OpenAPIV3Document;
}

function buildRequestInfo(message: RpcMessageDefinition): RouteConfig['request'] {
  if (!message.paramsSchema || message.paramsSchema instanceof z.ZodUndefined) {
    return undefined;
  }

  return {
    body: {
      content: {
        'application/json': {
          schema: message.paramsSchema,
        },
      },
    },
  };
}

function buildSuccessResponse(message: RpcMessageDefinition): RouteConfig['responses'] {
  if (message.type === 'notification') {
    return {
      202: {
        description: 'Notification accepted',
      },
    };
  }

  const successResponse: ResponseConfig = { description: 'Success' };

  if (message.responseSchema && !(message.responseSchema instanceof z.ZodUndefined)) {
    successResponse.content = {
      'application/json': {
        schema: message.responseSchema,
      },
    };
  } else {
    successResponse.description = 'No response payload expected.';
  }

  return {
    200: successResponse,
  };
}
