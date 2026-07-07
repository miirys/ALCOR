import { ChildProcess } from 'child_process';
import http from 'http';
import https from 'https';
import { ProxyAgent } from 'proxy-agent';
import spawn from 'cross-spawn';
import { Fetch, LsRequestInit } from '@gitlab-org/fetch/node';
import { errAsync, okAsync } from 'neverthrow';

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import fetch from 'cross-fetch';
import { TestLogger } from '@gitlab-org/logging';
import { LsFetch } from '@gitlab-org/fetch';
import { getProxySettings, ProxySetting } from 'get-proxy-settings';
import { Agent, Dispatcher, EnvHttpProxyAgent } from 'undici';
import { createFakePartial } from '@gitlab-org/test-utils';
import { McpStdioCommandTransformer, type StdioLaunchParams } from '@gitlab-org/ai-configuration';
import { OAuthClientProviderFactory } from '../../auth';
import type { McpServerInfo, ServerName } from '../../types';
import { OAuthFactoryError } from '../../auth/provider/errors';
import { SseServerConfig, StreamableHttpServerConfig } from '../../config';
import { TransportFactory } from './transport_factory';

jest.mock('cross-spawn');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

jest.mock('cross-fetch');
const crossFetch = fetch as jest.MockedFunction<typeof fetch>;

jest.mock('get-proxy-settings', () => ({
  ...jest.requireActual('get-proxy-settings'),
  getProxySettings: jest.fn(),
}));

type RemoteTransportScenario = {
  serverInfo: McpServerInfo<SseServerConfig | StreamableHttpServerConfig>;
  transportType: Transport;
};

type AgentProxyScenario = {
  agentType: LsRequestInit['agent'];
  dispatcherType: typeof Dispatcher;
  proxySettings: Record<'http_proxy' | 'https_proxy' | 'no_proxy', string>;
};

describe('TransportFactory', () => {
  let factory: TransportFactory;
  const sseTransport = (url: string) => ({
    name: 'sse-test-server' as ServerName,
    displayName: 'sse-test-server',
    config: {
      url: new URL(url),
      headers: { 'Custom-Header': 'hello world' },
      type: 'sse',
    },
  });
  const streamableHTTPTransport = (url: string) => ({
    name: 'http-test-server' as ServerName,
    displayName: 'http-test-server',
    config: {
      url: new URL(url),
      headers: { 'Custom-Header': 'hello world' },
      type: 'http',
    },
  });
  let lsFetch: LsFetch;
  let mockAuthProvider: OAuthClientProvider;
  let mockAuthProviderFactory: OAuthClientProviderFactory;
  let mockStdioTransformer: McpStdioCommandTransformer;

  beforeEach(async () => {
    (getProxySettings as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ...(process.env.http_proxy && { http: new ProxySetting(process.env.http_proxy) }),
        ...(process.env.https_proxy && { https: new ProxySetting(process.env.https_proxy) }),
      }),
    );
    mockAuthProvider = {
      get redirectUrl() {
        return new URL('http://localhost/callback');
      },
      get clientMetadata() {
        return { redirect_uris: ['http://localhost/callback'] };
      },
      clientInformation: jest.fn(async () => ({
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
      })),
      tokens: jest.fn(),
      saveTokens: jest.fn(),
      redirectToAuthorization: jest.fn(),
      saveCodeVerifier: jest.fn(),
      codeVerifier: jest.fn(),
    };
    mockAuthProviderFactory = {
      createOAuthClientProvider: jest.fn().mockReturnValue(okAsync(mockAuthProvider)),
    };
    mockStdioTransformer = createFakePartial<McpStdioCommandTransformer>({
      transform: jest
        .fn()
        .mockImplementation((_name: string, params: StdioLaunchParams) => Promise.resolve(params)),
    });
    lsFetch = new Fetch(new TestLogger());
    factory = new TransportFactory(mockAuthProviderFactory, lsFetch, mockStdioTransformer);
  });

  describe.each`
    testGroup                                       | transportType                    | serverInfo
    ${'sse transport for http server'}              | ${SSEClientTransport}            | ${sseTransport('http://localhost/mcp/sse')}
    ${'sse transport for https server'}             | ${SSEClientTransport}            | ${sseTransport('https://localhost/mcp/sse')}
    ${'streamable http transport for http server'}  | ${StreamableHTTPClientTransport} | ${streamableHTTPTransport('http://localhost/mcp/sse')}
    ${'streamable http transport for https server'} | ${StreamableHTTPClientTransport} | ${streamableHTTPTransport('https://localhost/mcp/sse')}
  `('$testGroup', ({ serverInfo, transportType }: RemoteTransportScenario) => {
    const originalProcessEnv = process.env;
    const protocol = serverInfo.config.url.protocol.replace(':', '');
    const protoAgent = protocol === 'https:' ? https.Agent : http.Agent;
    let transport: Transport;

    beforeEach(() => {
      jest.spyOn(global, 'fetch');
      jest.resetModules();
      process.env = { ...originalProcessEnv };
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await transport?.close().catch(() => {});
    });

    afterAll(() => {
      process.env = originalProcessEnv;
    });

    it('returns a transport failed error when unable to create a auth provider', async () => {
      jest
        .mocked(mockAuthProviderFactory)
        .createOAuthClientProvider.mockReturnValueOnce(
          errAsync(OAuthFactoryError.callbackServerStartFailed()),
        );

      await lsFetch.initialize();
      const result = await factory.createTransport(serverInfo, '/workspace');
      expect(result.isErr()).toBe(true);
      result.mapErr((e) => {
        expect(e.serverName).toEqual(serverInfo.name);
        expect(e.code).toEqual('TRANSPORT_CREATION_FAILED');
      });
    });

    it.each`
      scenario                                                   | agentType     | dispatcherType       | proxySettings
      ${`defaults to ${protocol} agent`}                         | ${protoAgent} | ${Agent}             | ${{}}
      ${'delegates choice to proxy agent when no proxy was set'} | ${ProxyAgent} | ${EnvHttpProxyAgent} | ${{ http_proxy: 'http://localhost:8888', NO_PROXY: 'localhost' }}
      ${'delegates choice to proxy agent when no proxy was set'} | ${ProxyAgent} | ${EnvHttpProxyAgent} | ${{ https_proxy: 'https://localhost:8888', NO_PROXY: 'localhost' }}
      ${'fetches using proxy agent for http endpoint'}           | ${ProxyAgent} | ${EnvHttpProxyAgent} | ${{ http_proxy: 'http://localhost:8888' }}
      ${'fetches using proxy agent for https endpoint'}          | ${ProxyAgent} | ${EnvHttpProxyAgent} | ${{ https_proxy: 'https://localhost:8888' }}
    `('$scenario', async ({ agentType, dispatcherType, proxySettings }: AgentProxyScenario) => {
      process.env.http_proxy = proxySettings.http_proxy;
      process.env.https_proxy = proxySettings.https_proxy;
      process.env.NO_PROXY = proxySettings.no_proxy;

      let actualRequestInit: RequestInit | undefined = {};
      (global.fetch as jest.Mock).mockImplementation(async (_url, requestInit) => {
        actualRequestInit = requestInit;
        return new Response('event: endpoint\r\ndata: /sse/messages\r\n\r\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      });

      await lsFetch.initialize();
      const result = await factory.createTransport(serverInfo, '/workspace');
      expect(result.isOk()).toBe(true);
      // eslint-disable-next-line no-underscore-dangle
      transport = result._unsafeUnwrap();

      expect(transport).toBeInstanceOf(transportType);
      await transport.start();

      await transport.send({ jsonrpc: '2.0', method: 'test', params: {}, id: 'test-id' });

      expect(actualRequestInit.headers).not.toBeUndefined();
      expect((actualRequestInit.headers as Headers).get('Custom-Header')).toEqual('hello world');
      expect(crossFetch).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        new URL(serverInfo.config.url),
        expect.objectContaining({
          // Assert the correct cross-fetch compatible agent was of the expected type:
          agent: expect.any(agentType),
          // Assert the correct dispatcher is used for requests:
          dispatcher: expect.any(dispatcherType),
          body: expect.stringContaining('test-id'),
          headers: expect.objectContaining(actualRequestInit.headers),
        }),
      );
    });
  });

  describe('stdio transport', () => {
    beforeEach(() => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          on: jest.fn((event, callback): ChildProcess => {
            if (event === 'spawn') {
              callback();
            }
            return mockProcess as unknown as ChildProcess;
          }),
          stdin: {
            on: jest.fn(),
            write: jest.fn().mockReturnValue(true),
          },
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
        };
        return mockProcess as unknown as ChildProcess;
      });
    });

    it('passes windowsHide option to spawn', async () => {
      const serverInfo: McpServerInfo = {
        name: 'test-server' as ServerName,
        displayName: 'test-server',
        config: {
          type: 'stdio',
          command: 'npx',
          args: ['mcp-remote', '-y', 'https://localhost/mcp'],
          env: { NODE_ENV: 'test' },
        },
      };

      const result = await factory.createTransport(serverInfo, '/workspace');
      expect(result.isOk()).toBe(true);

      await result.asyncMap((t) => t.start());

      expect(spawn).toHaveBeenCalledWith('npx', ['mcp-remote', '-y', 'https://localhost/mcp'], {
        env: expect.objectContaining({ NODE_ENV: 'test' }),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: process.platform === 'win32',
        cwd: '/workspace',
      });
    });

    it('calls stdio transformer with server config', async () => {
      const serverInfo: McpServerInfo = {
        name: 'test-server' as ServerName,
        displayName: 'test-server',
        config: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'some-server'],
          env: { KEY: 'value' },
        },
      };

      await factory.createTransport(serverInfo, '/workspace');

      expect(mockStdioTransformer.transform).toHaveBeenCalledWith(
        'test-server',
        { command: 'npx', args: ['-y', 'some-server'], env: { KEY: 'value' } },
        '/workspace',
        undefined,
      );
    });

    it('passes sandbox overrides from config to transformer', async () => {
      const serverInfo: McpServerInfo = {
        name: 'test-server' as ServerName,
        displayName: 'test-server',
        config: {
          type: 'stdio',
          command: 'npx',
          args: [],
          sandbox: {
            sandboxEnabled: false,
            allowedDomains: ['example.com'],
          },
        },
      };

      await factory.createTransport(serverInfo, '/workspace');

      expect(mockStdioTransformer.transform).toHaveBeenCalledWith(
        'test-server',
        expect.any(Object),
        '/workspace',
        { sandboxEnabled: false, allowedDomains: ['example.com'] },
      );
    });

    describe('when stdio transformer returns transformed params', () => {
      beforeEach(() => {
        jest.mocked(mockStdioTransformer.transform).mockResolvedValue({
          command: '/usr/bin/node',
          args: ['/path/to/srt/cli.js', '--settings', '/tmp/settings.json', 'npx', '-y', 'server'],
          env: { KEY: 'value' },
        });
      });

      it('uses the wrapped command and args for the transport', async () => {
        const serverInfo: McpServerInfo = {
          name: 'test-server' as ServerName,
          displayName: 'test-server',
          config: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'server'],
            env: { KEY: 'value' },
          },
        };

        const result = await factory.createTransport(serverInfo, '/workspace');
        expect(result.isOk()).toBe(true);

        await result.asyncMap((t) => t.start());

        expect(spawn).toHaveBeenCalledWith(
          '/usr/bin/node',
          ['/path/to/srt/cli.js', '--settings', '/tmp/settings.json', 'npx', '-y', 'server'],
          expect.objectContaining({ windowsHide: process.platform === 'win32' }),
        );
      });
    });

    describe('when stdio transformer throws', () => {
      beforeEach(() => {
        jest.mocked(mockStdioTransformer.transform).mockRejectedValue(new Error('srt init failed'));
      });

      it('returns an error instead of falling back to unwrapped', async () => {
        const serverInfo: McpServerInfo = {
          name: 'test-server' as ServerName,
          displayName: 'test-server',
          config: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'server'],
          },
        };

        const result = await factory.createTransport(serverInfo, '/workspace');
        expect(result.isErr()).toBe(true);
        result.mapErr((e) => {
          expect(e.code).toEqual('TRANSPORT_CREATION_FAILED');
        });
      });
    });
  });
});
