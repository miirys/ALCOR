import { readFile } from 'node:fs/promises';
import type { ClientEvent } from '@gitlab-org/duo-workflow-service';
import WebSocket from 'isomorphic-ws';
import { WorkflowStatusCode } from '@gitlab-lsp/workflow-api';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial, mockBunRuntime } from '@gitlab-org/test-utils';
import { ITelemetryOptions } from '@gitlab-org/config';
import type { ClientSslConfig, WorkflowMetadata } from './types';
import {
  WebSocketConnectionConfig,
  WebSocketWorkflowClient,
  WebSocketWorkflowOptions,
} from './websocket_client';
import { WebSocketWorkflowStream } from './websocket_workflow_stream';
import { WebsocketStreamError } from './errors';

const mockUuid = '12345678-1234-1234-1234-123456789012';

let mockWebSocket: WebSocket & {
  close: jest.MockedFunction<() => void>;
  send: jest.MockedFunction<(data: string | Buffer | ArrayBuffer) => void>;
  on: jest.MockedFunction<(event: string, listener: (...args: unknown[]) => void) => void>;
};
let mockWebSocketWorkflowStream: WebSocketWorkflowStream & {
  write: jest.MockedFunction<(data: unknown) => boolean>;
  end: jest.MockedFunction<() => void>;
  on: jest.MockedFunction<NodeJS.EventEmitter['on']>;
  once: jest.MockedFunction<NodeJS.EventEmitter['once']>;
  removeListener: jest.MockedFunction<NodeJS.EventEmitter['removeListener']>;
};

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockImplementation(() => mockUuid),
}));

jest.mock('isomorphic-ws', () => {
  return jest.fn().mockImplementation(() => mockWebSocket);
});

jest.mock('./websocket_workflow_stream', () => ({
  WebSocketWorkflowStream: jest.fn().mockImplementation(() => mockWebSocketWorkflowStream),
}));

jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  getLanguageServerVersion: jest.fn().mockReturnValue('1.2.3'),
}));

describe('WebSocketWorkflowClient', () => {
  let logger: Logger;
  let mockSslConfig: ClientSslConfig;
  let mockConnectionDetails: WebSocketConnectionConfig;
  let mockWorkflowMetadata: WorkflowMetadata;
  let mockTelemetry: ITelemetryOptions;
  let client: WebSocketWorkflowClient;

  beforeEach(() => {
    logger = new TestLogger();
    mockSslConfig = {
      httpAgentOptions: {
        ca: '/path/to/ca',
        cert: '/path/to/cert',
        certKey: '/path/to/key',
      },
      ignoreCertificateErrors: false,
    };
    mockConnectionDetails = {
      gitlabInstanceUrl: new URL('https://gitlab.example.com'),
      token: 'test-token',
    };
    mockWorkflowMetadata = createFakePartial<WorkflowMetadata>({
      namespaceId: '1234',
      projectId: '4321',
      rootNamespaceId: '5678',
    });
    mockTelemetry = createFakePartial<ITelemetryOptions>({
      ide: { name: 'visual-studio-code', version: '0.0.1' },
      extension: { name: 'gitlab-workflow', version: '0.0.2' },
    });

    jest.mocked(readFile).mockImplementation(async (path) => {
      if (path === '/path/to/ca') return Buffer.from('ca-content');
      if (path === '/path/to/cert') return Buffer.from('cert-content');
      if (path === '/path/to/key') return Buffer.from('key-content');
      return Buffer.from('');
    });

    mockWebSocket = createFakePartial<WebSocket>({
      readyState: WebSocket.OPEN,
      close: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
    }) as typeof mockWebSocket;

    mockWebSocketWorkflowStream = createFakePartial<WebSocketWorkflowStream>({
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      removeListener: jest.fn().mockReturnThis(),
    }) as typeof mockWebSocketWorkflowStream;
  });

  const createClient = (
    connectionDetails: WebSocketConnectionConfig = mockConnectionDetails,
    sslConfig: ClientSslConfig = mockSslConfig,
    workflowMetadata: WorkflowMetadata = mockWorkflowMetadata,
    workflowOptions?: WebSocketWorkflowOptions,
  ) => {
    return new WebSocketWorkflowClient(
      logger,
      sslConfig,
      connectionDetails,
      workflowMetadata,
      undefined,
      mockTelemetry,
      undefined,
      workflowOptions,
    );
  };

  describe('executeWorkflow', () => {
    beforeEach(() => {
      client = createClient();
    });

    afterEach(async () => {
      await client.disposeAsync();
    });

    describe('when connection is successful', () => {
      it('should include correct headers in WebSocket options', async () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        const result = await client.executeWorkflow();

        expect(WebSocket).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              authorization: 'Bearer test-token',
              'x-request-id': mockUuid,
              'x-gitlab-language-server-version': expect.any(String),
              'x-gitlab-project-id': '4321',
              'x-gitlab-namespace-id': '1234',
              'x-gitlab-root-namespace-id': '5678',
              'x-gitlab-client-type': 'node-websocket',
              'user-agent':
                'visual-studio-code/0.0.1 gitlab-workflow/0.0.2 gitlab-language-server/1.2.3',
              origin: 'https://gitlab.example.com',
            }),
          }),
        );

        expect(WebSocketWorkflowStream).toHaveBeenCalledWith(
          mockWebSocket,
          expect.anything(),
          undefined,
        );
        expect(result).toBe(mockWebSocketWorkflowStream);

        const calledUrl = jest.mocked(WebSocket).mock.calls[0][0] as string;
        const url = new URL(calledUrl);
        expect(url.searchParams.get('project_id')).toBe('4321');
        expect(url.searchParams.get('namespace_id')).toBe('1234');
        expect(url.searchParams.get('root_namespace_id')).toBe('5678');
      });

      it('should include the user_selected_model_identifier query parameter', async () => {
        const clientWithModelSelection = createClient(undefined, undefined, {
          namespaceId: 'gid://gitlab/Group/1',
          rootNamespaceId: 'gid://gitlab/Group/0',
          projectId: 'gid://gitlab/Project/1',
          selectedModelIdentifier: 'my-model-id',
        });
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        try {
          const result = await clientWithModelSelection.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.stringMatching('user_selected_model_identifier=my-model-id'),
            expect.any(Object),
          );

          expect(WebSocketWorkflowStream).toHaveBeenCalledWith(
            mockWebSocket,
            expect.anything(),
            undefined,
          );
          expect(result).toBe(mockWebSocketWorkflowStream);
        } finally {
          await clientWithModelSelection.disposeAsync();
        }
      });

      describe('when workflowDefinition is provided', () => {
        it('should include workflow_definition query parameter', async () => {
          const clientWithWorkflowDef = createClient(undefined, undefined, undefined, {
            workflowDefinition: 'test_agent/v1',
          });
          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          try {
            await clientWithWorkflowDef.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.stringMatching('workflow_definition=test_agent%2Fv1'),
              expect.any(Object),
            );
          } finally {
            await clientWithWorkflowDef.disposeAsync();
          }
        });
      });

      describe('when workflowDefinition is not provided', () => {
        it('should not include workflow_definition query parameter', async () => {
          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          await client.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.not.stringMatching('workflow_definition'),
            expect.any(Object),
          );
        });
      });

      describe('when aiCatalogItemVersionId is provided', () => {
        it('should include ai_catalog_item_version_id query parameter', async () => {
          const clientWithCatalogId = createClient(undefined, undefined, undefined, {
            aiCatalogItemVersionId: 100,
          });
          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          try {
            await clientWithCatalogId.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.stringMatching('ai_catalog_item_version_id=100'),
              expect.any(Object),
            );
          } finally {
            await clientWithCatalogId.disposeAsync();
          }
        });
      });

      describe('when aiCatalogItemVersionId is not provided', () => {
        it('should not include ai_catalog_item_version_id query parameter', async () => {
          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          await client.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.not.stringMatching('ai_catalog_item_version_id'),
            expect.any(Object),
          );
        });
      });

      describe('x-gitlab-client-name and x-gitlab-client-version headers', () => {
        let testClient: WebSocketWorkflowClient;

        beforeEach(() => {
          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });
        });

        afterEach(async () => {
          await testClient.disposeAsync();
        });

        it('should include headers when ide telemetry is provided', async () => {
          testClient = new WebSocketWorkflowClient(
            logger,
            mockSslConfig,
            mockConnectionDetails,
            mockWorkflowMetadata,
            undefined,
            createFakePartial<ITelemetryOptions>({
              ide: { name: 'visual-studio-code', version: '0.0.1' },
            }),
          );

          await testClient.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              headers: expect.objectContaining({
                'x-gitlab-client-name': 'visual-studio-code',
                'x-gitlab-client-version': '0.0.1',
              }),
            }),
          );
        });

        it('should not include headers when ide telemetry is absent', async () => {
          testClient = new WebSocketWorkflowClient(
            logger,
            mockSslConfig,
            mockConnectionDetails,
            mockWorkflowMetadata,
            undefined,
            createFakePartial<ITelemetryOptions>({}),
          );

          await testClient.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              headers: expect.not.objectContaining({
                'x-gitlab-client-name': expect.anything(),
                'x-gitlab-client-version': expect.anything(),
              }),
            }),
          );
        });
      });

      it('should include the x-gitlab-agent-platform-feature-setting-name header', async () => {
        const clientWithFeatureSetting = new WebSocketWorkflowClient(
          logger,
          mockSslConfig,
          mockConnectionDetails,
          mockWorkflowMetadata,
          undefined,
          mockTelemetry,
          'feature-mcfeature-face',
        );
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        try {
          await clientWithFeatureSetting.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              headers: expect.objectContaining({
                'x-gitlab-agent-platform-feature-setting-name': 'feature-mcfeature-face',
              }),
            }),
          );
        } finally {
          await clientWithFeatureSetting.disposeAsync();
        }
      });

      it.each([
        {
          description: 'secure',
          gitlabInstanceUrl: new URL('https://gitlab.example.com'),
          expectedUrl: 'wss://gitlab.example.com/api/v4/ai/duo_workflows/ws',
        },
        {
          description: 'insecure',
          gitlabInstanceUrl: new URL('http://gitlab.example.com'),
          expectedUrl: 'ws://gitlab.example.com/api/v4/ai/duo_workflows/ws',
        },
        {
          description: 'subdirectory',
          gitlabInstanceUrl: new URL('https://example.com/gitlab'),
          expectedUrl: 'wss://example.com/gitlab/api/v4/ai/duo_workflows/ws',
        },
      ])(
        'should build correct WebSocket URL for $description GitLab instance',
        async ({ gitlabInstanceUrl, expectedUrl }) => {
          const connectionDetails = {
            gitlabInstanceUrl,
            token: 'test-token',
          };

          const testClient = createClient(connectionDetails);

          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          try {
            await testClient.executeWorkflow();

            const calledUrl = jest.mocked(WebSocket).mock.calls[0][0] as string;
            const parsedUrl = new URL(calledUrl);
            const urlWithoutParams = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
            expect(urlWithoutParams).toBe(expectedUrl);
          } finally {
            await testClient.disposeAsync();
          }
        },
      );
    });

    describe('when connection fails', () => {
      it('should reject with SERVICE_CONNECTION_FAILED on error', async () => {
        const mockError = new Error('Connection failed');
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'error') {
            setImmediate(() => handler(mockError));
          }
          return mockWebSocketWorkflowStream;
        });

        await expect(client.executeWorkflow()).rejects.toBe(
          WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
        );
      });

      it('should reject with AUTH_TOKEN_ERROR when the upgrade is rejected with HTTP 401', async () => {
        const authError = new WebsocketStreamError(
          'WebSocket upgrade failed with HTTP status 401',
          401,
          'Unauthorized',
        );
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'error') {
            setImmediate(() => handler(authError));
          }
          return mockWebSocketWorkflowStream;
        });

        await expect(client.executeWorkflow()).rejects.toBe(WorkflowStatusCode.AUTH_TOKEN_ERROR);
      });
    });

    describe('when creating SSL connection', () => {
      it('should include SSL options for secure connection', async () => {
        const secureClient = createClient();

        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        try {
          await secureClient.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              headers: expect.any(Object),
              ca: expect.any(Buffer),
              cert: expect.any(Buffer),
              key: expect.any(Buffer),
            }),
          );
        } finally {
          await secureClient.disposeAsync();
        }
      });

      describe('when ignoreCertificateErrors is true', () => {
        it('should set rejectUnauthorized to false', async () => {
          const sslConfigWithIgnore = {
            ...mockSslConfig,
            ignoreCertificateErrors: true,
          };

          const clientWithIgnore = createClient(mockConnectionDetails, sslConfigWithIgnore);

          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          try {
            await clientWithIgnore.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({
                rejectUnauthorized: false,
              }),
            );
          } finally {
            await clientWithIgnore.disposeAsync();
          }
        });
      });

      describe('when ignoreCertificateErrors is false', () => {
        it('should set rejectUnauthorized to undefined', async () => {
          const sslConfigWithoutIgnore = {
            ...mockSslConfig,
            ignoreCertificateErrors: false,
          };

          const clientWithoutIgnore = createClient(mockConnectionDetails, sslConfigWithoutIgnore);

          mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
            if (event === 'open') {
              setImmediate(() => handler());
            }
            return mockWebSocketWorkflowStream;
          });

          try {
            await clientWithoutIgnore.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({
                rejectUnauthorized: undefined,
              }),
            );
          } finally {
            await clientWithoutIgnore.disposeAsync();
          }
        });
      });
    });

    describe('when no SSL config provided', () => {
      it('should not include SSL options for insecure connection', async () => {
        const insecureConnectionDetails = {
          gitlabInstanceUrl: new URL('http://gitlab.example.com'),
          token: 'test-token',
        };

        const insecureClient = createClient(insecureConnectionDetails);

        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        try {
          await insecureClient.executeWorkflow();

          expect(WebSocket).toHaveBeenCalledWith(
            expect.any(String),
            expect.not.objectContaining({
              ca: expect.anything(),
              cert: expect.anything(),
              key: expect.anything(),
            }),
          );
        } finally {
          await insecureClient.disposeAsync();
        }
      });
    });

    describe('transport options from connectionDetails', () => {
      const setBunRuntime = mockBunRuntime();

      const mockOpenHandler = () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });
      };

      describe('under Node.js runtime', () => {
        beforeEach(() => setBunRuntime(false));

        it('passes the agent through to the WebSocket constructor', async () => {
          const fakeAgent = { name: 'fake-proxy-agent' };
          const detailsWithAgent = {
            ...mockConnectionDetails,
            agent: fakeAgent,
            proxyUrl: 'http://proxy.example.com:8080',
          };
          const clientWithAgent = createClient(detailsWithAgent);
          mockOpenHandler();

          try {
            await clientWithAgent.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({ agent: fakeAgent }),
            );
            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.not.objectContaining({ proxy: expect.anything() }),
            );
          } finally {
            await clientWithAgent.disposeAsync();
          }
        });

        it('omits agent and proxy when neither is provided', async () => {
          const clientNoAgent = createClient();
          mockOpenHandler();

          try {
            await clientNoAgent.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.not.objectContaining({
                agent: expect.anything(),
                proxy: expect.anything(),
              }),
            );
          } finally {
            await clientNoAgent.disposeAsync();
          }
        });
      });

      describe('under Bun runtime', () => {
        beforeEach(() => setBunRuntime(true));

        it('prefers HTTP proxy URL over agent (SRT-style proxy)', async () => {
          const fakeAgent = { name: 'fake-proxy-agent' };
          const detailsWithProxy = {
            ...mockConnectionDetails,
            agent: fakeAgent,
            proxyUrl: 'http://localhost:3128',
          };
          const clientWithProxy = createClient(detailsWithProxy);
          mockOpenHandler();

          try {
            await clientWithProxy.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({ proxy: 'http://localhost:3128' }),
            );
            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.not.objectContaining({ agent: expect.anything() }),
            );
          } finally {
            await clientWithProxy.disposeAsync();
          }
        });

        it('prefers agent over HTTPS proxy URL (HTTPS MITM scenario)', async () => {
          const fakeAgent = { name: 'fake-proxy-agent' };
          const detailsWithHttpsProxy = {
            ...mockConnectionDetails,
            agent: fakeAgent,
            proxyUrl: 'https://localhost:8000',
          };
          const clientWithHttpsProxy = createClient(detailsWithHttpsProxy);
          mockOpenHandler();

          try {
            await clientWithHttpsProxy.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({ agent: fakeAgent }),
            );
            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.not.objectContaining({ proxy: expect.anything() }),
            );
          } finally {
            await clientWithHttpsProxy.disposeAsync();
          }
        });

        it('uses HTTP proxy URL alone (no agent supplied)', async () => {
          const detailsWithOnlyProxy = {
            ...mockConnectionDetails,
            proxyUrl: 'http://localhost:3128',
          };
          const clientProxyOnly = createClient(detailsWithOnlyProxy);
          mockOpenHandler();

          try {
            await clientProxyOnly.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({ proxy: 'http://localhost:3128' }),
            );
            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.not.objectContaining({ agent: expect.anything() }),
            );
          } finally {
            await clientProxyOnly.disposeAsync();
          }
        });

        it('falls back to agent when no proxyUrl resolves', async () => {
          const fakeAgent = { name: 'fake-proxy-agent' };
          const detailsWithoutProxyUrl = {
            ...mockConnectionDetails,
            agent: fakeAgent,
          };
          const clientNoUrl = createClient(detailsWithoutProxyUrl);
          mockOpenHandler();

          try {
            await clientNoUrl.executeWorkflow();

            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.objectContaining({ agent: fakeAgent }),
            );
            expect(WebSocket).toHaveBeenCalledWith(
              expect.any(String),
              expect.not.objectContaining({ proxy: expect.anything() }),
            );
          } finally {
            await clientNoUrl.disposeAsync();
          }
        });

        describe('when a custom CA is configured', () => {
          const tlsDetails = () => ({
            ...mockConnectionDetails,
            tls: { ca: Buffer.from('ca-content'), rejectUnauthorized: true },
          });

          it('does not inject flat ca / cert / key options', async () => {
            const clientWithCa = createClient(tlsDetails());
            mockOpenHandler();

            try {
              await clientWithCa.executeWorkflow();

              expect(WebSocket).toHaveBeenCalledWith(
                expect.any(String),
                expect.not.objectContaining({
                  ca: expect.anything(),
                  cert: expect.anything(),
                  key: expect.anything(),
                }),
              );
            } finally {
              await clientWithCa.disposeAsync();
            }
          });

          it('warns that the CA is dropped on Bun', async () => {
            const warnSpy = jest.spyOn(logger, 'warn');
            const clientWithCa = createClient(tlsDetails());
            mockOpenHandler();

            try {
              await clientWithCa.executeWorkflow();

              expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('NODE_EXTRA_CA_CERTS'),
                undefined,
              );
            } finally {
              await clientWithCa.disposeAsync();
            }
          });
        });
      });
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      client = createClient();
    });

    describe('when stream and socket exist', () => {
      it('should close socket with status 1000 and clear stream reference', async () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        await client.executeWorkflow();

        await client.disposeAsync();

        expect(mockWebSocket.close).toHaveBeenCalledWith(1000);
      });

      it('should set stream and socket to null after disposal', async () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        await client.executeWorkflow();
        await client.disposeAsync();

        // Calling dispose again should not throw
        await expect(client.disposeAsync()).resolves.toBeUndefined();
      });
    });

    describe('when only stream exists', () => {
      it('should not throw error', async () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        await client.executeWorkflow();

        // First dispose closes socket and clears references
        await client.disposeAsync();

        // Second dispose should still not throw even with socket already null
        await expect(client.disposeAsync()).resolves.toBeUndefined();
        expect(mockWebSocket.close).toHaveBeenCalledWith(1000);
      });
    });

    describe('when stream and socket do not exist', () => {
      it('should not throw error', async () => {
        await expect(client.disposeAsync()).resolves.toBeUndefined();
      });
    });
  });

  describe('getResponseByteSize', () => {
    let clientEvent: ClientEvent;

    beforeEach(() => {
      client = createClient();
      clientEvent = {
        actionResponse: {
          requestID: 'test-123',
          plainTextResponse: {
            response: 'test response',
            error: '',
          },
        },
      };
    });

    it('should return the JSON serialized byte size', () => {
      const expectedByteSize = 103;

      const result = client.getResponseByteSize(clientEvent);

      expect(result).toBe(expectedByteSize);
    });

    describe('when serialization fails', () => {
      beforeEach(() => {
        // Circular reference to cause JSON.stringify to fail
        (clientEvent as ClientEvent & { circular: ClientEvent }).circular = clientEvent;
      });

      it('should throw error', () => {
        expect(() => client.getResponseByteSize(clientEvent)).toThrow();
      });
    });
  });

  describe('getCorrelationId', () => {
    it('should return a correlation ID', () => {
      client = createClient();
      const correlationId = client.getCorrelationId();

      expect(correlationId).toBe(mockUuid);
    });
  });

  describe('heartbeat functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      client = createClient();
    });

    afterEach(async () => {
      await client.disposeAsync();
      jest.runOnlyPendingTimers(); // Clear any pending timers
      jest.useRealTimers();
    });

    describe('when heartbeat is active', () => {
      it('should send heartbeat every 60 seconds', async () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });
        mockWebSocketWorkflowStream.write.mockReturnValue(true);

        const executePromise = client.executeWorkflow();

        // Run pending timers to execute setImmediate
        await jest.runOnlyPendingTimersAsync();
        await executePromise;

        // Initially no heartbeat sent
        expect(mockWebSocketWorkflowStream.write).not.toHaveBeenCalled();

        // After 60 seconds, first heartbeat
        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledWith({
          heartbeat: {
            timestamp: expect.any(Number),
          },
        });

        // After another 60 seconds, second heartbeat
        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(2);

        // After another 60 seconds, third heartbeat
        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(3);
      });

      describe('when stream write fails', () => {
        it.each([
          { streamWriteImpl: () => false, description: 'returns false' },
          {
            streamWriteImpl: () => {
              throw new Error('Write failed');
            },
            description: 'throws error',
          },
        ])(
          'should continue sending heartbeats when write $description',
          async ({ streamWriteImpl }) => {
            mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
              if (event === 'open') {
                setImmediate(() => handler());
              }
              return mockWebSocketWorkflowStream;
            });
            mockWebSocketWorkflowStream.write.mockImplementation(streamWriteImpl);

            const executePromise = client.executeWorkflow();

            // Run pending timers to execute setImmediate
            await jest.runOnlyPendingTimersAsync();
            await executePromise;

            // Should not throw and should continue
            expect(() => jest.advanceTimersByTime(60000)).not.toThrow();
            expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1);

            expect(() => jest.advanceTimersByTime(60000)).not.toThrow();
            expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(2);
          },
        );
      });
    });

    describe('when stream has errors', () => {
      it('should stop sending heartbeats after stream error', async () => {
        const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

        mockWebSocketWorkflowStream.on.mockImplementation((event: string | symbol, handler) => {
          const eventKey = String(event);
          if (!eventHandlers.has(eventKey)) {
            eventHandlers.set(eventKey, []);
          }
          eventHandlers.get(eventKey)?.push(handler);
          return mockWebSocketWorkflowStream;
        });

        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        mockWebSocketWorkflowStream.write.mockReturnValue(true);

        const executePromise = client.executeWorkflow();

        // Run pending timers to execute setImmediate
        await jest.runOnlyPendingTimersAsync();
        await executePromise;

        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1);

        // Trigger error event
        const errorHandlers = eventHandlers.get('error') || [];
        errorHandlers.forEach((handler) => handler(new Error('Stream error')));

        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1); // Still only 1
      });

      it('should stop sending heartbeats after stream ends', async () => {
        const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

        mockWebSocketWorkflowStream.on.mockImplementation((event: string | symbol, handler) => {
          const eventKey = String(event);
          if (!eventHandlers.has(eventKey)) {
            eventHandlers.set(eventKey, []);
          }
          eventHandlers.get(eventKey)?.push(handler);
          return mockWebSocketWorkflowStream;
        });

        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        mockWebSocketWorkflowStream.write.mockReturnValue(true);

        const executePromise = client.executeWorkflow();

        // Run pending timers to execute setImmediate
        await jest.runOnlyPendingTimersAsync();
        await executePromise;

        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1);

        // Trigger end event
        const endHandlers = eventHandlers.get('end') || [];
        endHandlers.forEach((handler) => handler());

        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1); // Still only 1
      });
    });

    describe('when disposed', () => {
      it('should stop sending heartbeats after dispose', async () => {
        mockWebSocketWorkflowStream.once.mockImplementation((event, handler) => {
          if (event === 'open') {
            setImmediate(() => handler());
          }
          return mockWebSocketWorkflowStream;
        });

        mockWebSocketWorkflowStream.write.mockReturnValue(true);

        const executePromise = client.executeWorkflow();

        // Run pending timers to execute setImmediate
        await jest.runOnlyPendingTimersAsync();
        await executePromise;

        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1);

        await client.disposeAsync();

        jest.advanceTimersByTime(60000);
        expect(mockWebSocketWorkflowStream.write).toHaveBeenCalledTimes(1); // Still only 1
      });
    });
  });
});
