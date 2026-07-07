import { z } from 'zod';
import { Connection } from 'vscode-languageserver';
import { NullLogger } from '@gitlab-org/logging';
import { declareNotification, declareRequest } from '@gitlab-org/rpc';
import { createEndpoint } from '@gitlab-org/rpc-endpoint';
import { EndpointConnectionAdapter } from './endpoint_connection_adapter';
import { Middleware } from './types';

describe('EndpointConnectionAdapter', () => {
  let connection: jest.Mocked<Connection>;
  let adapter: EndpointConnectionAdapter;

  beforeEach(() => {
    connection = {
      onNotification: jest.fn(),
      onRequest: jest.fn(),
    } as unknown as jest.Mocked<Connection>;

    adapter = new EndpointConnectionAdapter(connection, [], new NullLogger());
  });

  describe('applyEndpoints', () => {
    it('registers notification handles', async () => {
      const handleSpy = jest.fn();
      const endpoint = createEndpoint(declareNotification('test').build(), handleSpy);

      adapter.applyEndpoints([endpoint]);

      const handle = (connection.onNotification as jest.Mock).mock.calls[0][1];
      const params = { test: true };
      await handle(params);

      expect(connection.onNotification).toHaveBeenCalledWith('test', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith(params);
    });

    it('registers request handles', async () => {
      const response = { success: true };

      const endpoint = createEndpoint(
        declareRequest('test')
          .withResponse(z.object({ success: z.boolean() }))
          .build(),
        async () => {
          return response;
        },
      );

      adapter.applyEndpoints([endpoint]);

      const handle = (connection.onRequest as jest.Mock).mock.calls[0][1];
      const result = await handle({ test: true });

      expect(connection.onRequest).toHaveBeenCalledWith('test', expect.any(Function));
      expect(result).toBe(response);
    });
  });

  describe('middleware execution order', () => {
    it('executes middleware in correct order', async () => {
      const order: string[] = [];

      const customMiddleware1: Middleware = {
        async handle(params, next) {
          order.push('custom1 before');
          const result = await next(params);
          order.push('custom1 after');
          return result;
        },
      };

      const customMiddleware2: Middleware = {
        async handle(params, next) {
          order.push('custom2 before');
          const result = await next(params);
          order.push('custom2 after');
          return result;
        },
      };

      adapter = new EndpointConnectionAdapter(
        connection,
        [customMiddleware1, customMiddleware2],
        new NullLogger(),
      );

      const endpoint = createEndpoint(declareRequest('test').build(), async () => {
        order.push('handle');
      });

      adapter.applyEndpoints([endpoint]);
      const handle = (connection.onRequest as jest.Mock).mock.calls[0][1];
      await handle({});

      expect(order).toEqual([
        'custom1 before',
        'custom2 before',
        'handle',
        'custom2 after',
        'custom1 after',
      ]);
    });
  });
});
