import http from 'http';
import https from 'https';
import fs from 'fs';
import { ProxyAgent } from 'proxy-agent';
import fetch from 'cross-fetch';
import { getProxySettings, Protocol, ProxySettings } from 'get-proxy-settings';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { Fetch } from './fetch';

jest.useFakeTimers();
jest.mock('cross-fetch');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
}));
jest.mock('get-proxy-settings');

const { setupAbortSignalTimeoutMock, teardownAbortSignalTimeoutMock } = mockAbortSignalTimeout();

type AbortSignalTimeoutMockUtils = {
  setupAbortSignalTimeoutMock: () => void;
  teardownAbortSignalTimeoutMock: () => void;
};

/**
 * Mocks the `AbortSignal.timeout()` function.
 * This is because jest `useFakeTimers` / `runAllTimers` does not work out of the box when using `AbortSignal.timeout()`.
 *
 * @example
 * jest.useFakeTimers();
 * describe('Example', () => {
 *   const { setupAbortSignalTimeoutMock, teardownAbortSignalTimeoutMock } = mockAbortSignalTimeout();
 *
 *   beforeEach(setupAbortSignalTimeoutMock);
 *   afterEach(teardownAbortSignalTimeoutMock);
 *
 *    it('times out', async () => {
 *      const promise = doThingWithTimeout();
 *      jest.runAllTimers();
 *      await expect(promise).rejects.toThrow('The operation was aborted due to timeout');
 *    });
 *  });
 */
function mockAbortSignalTimeout(): AbortSignalTimeoutMockUtils {
  let originalAbortSignalTimeout: typeof AbortSignal.timeout;
  let mockSignalTimeout: NodeJS.Timeout;

  return {
    setupAbortSignalTimeoutMock: () => {
      originalAbortSignalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = (delay: number) => {
        const controller = new AbortController();
        mockSignalTimeout = setTimeout(() => {
          const error = new Error('The operation was aborted due to timeout');
          error.name = 'TimeoutError';
          controller.abort(error);
        }, delay);
        return controller.signal;
      };
    },
    teardownAbortSignalTimeoutMock: () => {
      AbortSignal.timeout = originalAbortSignalTimeout;
      if (mockSignalTimeout) {
        clearTimeout(mockSignalTimeout);
      }
    },
  };
}

const fakeBuffer = createFakePartial<NonSharedBuffer>({});

describe('LsFetch', () => {
  let logger: TestLogger;
  const { env } = process;

  beforeEach(() => {
    logger = new TestLogger();
    jest.mocked(fs.readFileSync).mockImplementation(() => fakeBuffer);
    process.env = {
      ...env,
      http_proxy: undefined,
      https_proxy: undefined,
      ws_proxy: undefined,
      wss_proxy: undefined,
    };
  });

  afterEach(() => {
    process.env = env;
  });

  describe('fetch', () => {
    describe('not initialized', () => {
      it('should throw Error', async () => {
        const lsFetch = new Fetch(logger);

        await expect(lsFetch.fetch('https://gitlab.com/')).rejects.toThrowError(
          'LsFetch not initialized. Make sure LsFetch.initialize() was called.',
        );
      });
    });

    describe('request Methods', () => {
      const testCases: ['get' | 'post' | 'put' | 'delete', string, number][] = [
        ['get', 'GET', 200],
        ['post', 'POST', 500],
        ['put', 'PUT', 404],
        ['delete', 'DELETE', 403],
      ];

      test.each(testCases)(
        'should call cross-fetch fetch for %s',
        async (method, expectedMethod, expectedStatusCode) => {
          const lsFetch = new Fetch(logger);
          await lsFetch.initialize();

          const response = { status: expectedStatusCode, json: jest.fn().mockResolvedValue({}) };
          (fetch as jest.Mock).mockResolvedValueOnce(response);

          await lsFetch[method]('https://gitlab.com/');
          expect(fetch).toHaveBeenCalled();

          const [url, init] = (fetch as jest.Mock).mock.calls[0];
          expect(init.method).toBe(expectedMethod);
          expect(url).toBe('https://gitlab.com/');
        },
      );
    });

    describe('agents', () => {
      let subject: Fetch;

      describe.each`
        expected         | expectedAgent  | expectedUrl             | http_proxy                    | https_proxy
        ${'ProxyAgent'}  | ${ProxyAgent}  | ${'http://gdk.local'}   | ${'http://proxy.local:8080/'} | ${'https://proxy.local:8443/'}
        ${'ProxyAgent'}  | ${ProxyAgent}  | ${'https://github.com'} | ${'http://proxy.local:8080/'} | ${'https://proxy.local:8443/'}
        ${'http.Agent'}  | ${http.Agent}  | ${'http://gdk.local'}   | ${''}                         | ${''}
        ${'https.Agent'} | ${https.Agent} | ${'https://github.com'} | ${''}                         | ${''}
      `('$expected', ({ expectedAgent, expectedUrl, http_proxy, https_proxy }) => {
        beforeEach(async () => {
          process.env = {
            ...env,
            http_proxy,
            https_proxy,
          };

          subject = new Fetch(logger);
          await subject.initialize();

          (fetch as jest.Mock).mockResolvedValue({
            status: 200,
            json: jest.fn().mockResolvedValue({}),
          });
        });

        it(`should fetch ${expectedUrl} given proxy settings`, async () => {
          await subject.get(expectedUrl);
          expect(fetch).toHaveBeenCalled();

          const [url, init] = (fetch as jest.Mock).mock.calls[0];
          expect(init.agent).toBeInstanceOf(expectedAgent);
          expect(init.agent).toEqual(
            expect.objectContaining({
              options: expect.objectContaining({}),
            }),
          );
          expect(url).toBe(expectedUrl);
        });

        if (expectedUrl.startsWith('https:')) {
          it(`should include https related agent options`, async () => {
            await subject.get(expectedUrl);

            expect(fetch).toHaveBeenNthCalledWith(
              1,
              expectedUrl,
              expect.objectContaining({
                agent: expect.objectContaining({
                  options: expect.objectContaining({
                    rejectUnauthorized: true,
                  }),
                }),
              }),
            );
          });

          it(`should support updating https related agent options`, async () => {
            await subject.get(expectedUrl);

            expect(fetch).toHaveBeenNthCalledWith(
              1,
              expectedUrl,
              expect.objectContaining({
                agent: expect.objectContaining({
                  options: expect.objectContaining({
                    rejectUnauthorized: true,
                  }),
                }),
              }),
            );

            await subject.updateAgentOptions({
              ignoreCertificateErrors: true,
              ca: 'abc',
              cert: 'def',
              certKey: 'ghi',
            });
            await subject.get(expectedUrl);

            expect(fetch).toHaveBeenNthCalledWith(
              2,
              expectedUrl,
              expect.objectContaining({
                agent: expect.objectContaining({
                  options: expect.objectContaining({
                    rejectUnauthorized: false,
                    ca: fakeBuffer,
                    cert: fakeBuffer,
                    key: fakeBuffer,
                  }),
                }),
              }),
            );
          });

          it(`should not pass through unset agent options`, async () => {
            await subject.updateAgentOptions({
              ignoreCertificateErrors: false,
              ca: '',
              cert: undefined,
              // certKey not present
            });
            await subject.get(expectedUrl);

            const { options } = (fetch as jest.Mock).mock.calls[0][1].agent;
            expect(options).toEqual(expect.objectContaining({ rejectUnauthorized: true }));
            expect(options).toEqual(expect.not.objectContaining({ ca: expect.anything() }));
            expect(options).toEqual(expect.not.objectContaining({ cert: expect.anything() }));
            expect(options).toEqual(expect.not.objectContaining({ key: expect.anything() }));
          });
        }
      });
    });

    describe('websocket proxy settings', () => {
      let subject: Fetch;

      const httpProxySettings = {
        http: { protocol: Protocol.Http, host: 'proxy.local', port: '8080' },
      } as Partial<ProxySettings>;

      const httpsProxySettings = {
        https: { protocol: Protocol.Https, host: 'proxy.local', port: '8443' },
      } as Partial<ProxySettings>;

      const combinedProxySettings = {
        https: { protocol: Protocol.Https, host: 'proxy.local', port: '8443' },
        http: { protocol: Protocol.Http, host: 'proxy.local', port: '8080' },
      } as Partial<ProxySettings>;

      describe.each`
        type                     | expectedProxySettings    | expectedProxyUrl              | expectedMessage
        ${'http only'}           | ${httpProxySettings}     | ${'http://proxy.local:8080'}  | ${'fetch: Setting WebSocket proxy based on http_proxy setting'}
        ${'https only'}          | ${httpsProxySettings}    | ${'https://proxy.local:8443'} | ${'fetch: Setting WebSocket proxy based on https_proxy setting'}
        ${'both http and https'} | ${combinedProxySettings} | ${'https://proxy.local:8443'} | ${'fetch: Setting WebSocket proxy based on https_proxy setting'}
      `(
        'Proxy env var $type already set',
        ({ expectedProxySettings, expectedProxyUrl, expectedMessage }) => {
          beforeEach(async () => {
            jest.mocked(getProxySettings).mockResolvedValue(expectedProxySettings);

            subject = new Fetch(logger);
            await subject.initialize();
          });

          it('should set ws_proxy and wss_proxy to https_proxy value', () => {
            expect(process.env.ws_proxy).toBe(expectedProxyUrl);
            expect(process.env.wss_proxy).toBe(expectedProxyUrl);
          });

          it('should log that websocket proxy was set based on https_proxy', () => {
            expect(logger.infoLogs).toContainEqual(
              expect.objectContaining({ message: expectedMessage }),
            );
          });

          it('should create a proxy', async () => {
            await subject.get('https://github.com');
            expect(fetch).toHaveBeenCalled();

            const [, init] = (fetch as jest.Mock).mock.calls[0];
            expect(init.agent).toBeInstanceOf(ProxyAgent);
          });
        },
      );

      describe.each`
        type           | value
        ${'ws_proxy'}  | ${'ws://existing.proxy:3128/'}
        ${'wss_proxy'} | ${'wss://existing.proxy:3129/'}
      `('WebSocket proxy env var $type already set', ({ type, value }) => {
        beforeEach(async () => {
          jest.mocked(getProxySettings).mockResolvedValue(httpsProxySettings);

          process.env = {
            ...env,
            [type]: value,
          };

          subject = new Fetch(logger);
          await subject.initialize();
        });

        it('should not overwrite existing ws_proxy', () => {
          expect(process.env[type]).toBe(value);
        });

        it('should log that existing $type was detected', () => {
          expect(logger.infoLogs).toContainEqual(
            expect.objectContaining({
              message: expect.stringContaining(`fetch: Detected existing ${type} setting`),
            }),
          );
        });
      });

      describe('when no proxies are set', () => {
        beforeEach(async () => {
          jest.mocked(getProxySettings).mockResolvedValue(null);

          process.env = {
            ...env,
            http_proxy: undefined,
            https_proxy: undefined,
            ws_proxy: undefined,
            wss_proxy: undefined,
          };

          subject = new Fetch(logger);
          await subject.initialize();
        });

        it('should not set websocket proxies', () => {
          expect(process.env.ws_proxy).toBeUndefined();
          expect(process.env.wss_proxy).toBeUndefined();
        });

        it('should log that no proxy settings were detected', () => {
          expect(logger.infoLogs).toContainEqual(
            expect.objectContaining({
              message: 'fetch: Detected no proxy settings',
            }),
          );
        });

        it('should use https agent for https requests', async () => {
          await subject.get('https://github.com');
          expect(fetch).toHaveBeenCalled();

          const [, init] = (fetch as jest.Mock).mock.calls[0];
          expect(init.agent).toBeInstanceOf(https.Agent);
        });

        it('should use http agent for http requests', async () => {
          await subject.get('http://gdk.local');
          expect(fetch).toHaveBeenCalled();

          const [, init] = (fetch as jest.Mock).mock.calls[0];
          expect(init.agent).toBeInstanceOf(http.Agent);
        });
      });
    });

    describe('certificate options', () => {
      const expectedUrl = 'https://github.com';
      const error = new Error('hello');
      let subject: Fetch;

      beforeEach(async () => {
        subject = new Fetch(logger);
        await subject.initialize();
        jest.mocked(fs.readFileSync).mockImplementation(() => {
          throw error;
        });
      });

      it.each([['ca'], ['cert'], ['certKey']])(
        "should log an error when file access to '%s' is not possible",
        async (property) => {
          await subject.updateAgentOptions({
            ignoreCertificateErrors: false,
            [property]: 'abc',
          });
          await subject.get(expectedUrl);

          expect(logger.errorLogs[0]).toEqual(
            expect.objectContaining({
              message: 'Error reading https agent options from file',
              error,
            }),
          );
        },
      );

      it('should NOT log an error when no file access error has occured', async () => {
        await subject.updateAgentOptions({
          ignoreCertificateErrors: false,
        });
        await subject.get(expectedUrl);

        expect(logger.errorLogs).toHaveLength(0);
      });
    });

    describe('abort signal handling', () => {
      let lsFetch: Fetch;

      beforeEach(async () => {
        setupAbortSignalTimeoutMock();
        lsFetch = new Fetch(logger);
        await lsFetch.initialize();
      });

      afterEach(teardownAbortSignalTimeoutMock);

      it('should accept an external abort signal and throw AbortError when aborted', async () => {
        const mockResponse = createFakePartial<Response>({
          status: 200,
          json: jest.fn().mockResolvedValue({}),
        });
        jest.mocked(fetch).mockImplementation(
          (_url, options) =>
            new Promise((resolve, reject) => {
              const timeoutId = setTimeout(() => resolve(mockResponse), 1000);

              // Handle abort signal
              options?.signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(timeoutId);
                  const error = new Error('The operation was aborted');
                  error.name = 'TimeoutError';
                  reject(error);
                },
                { once: true },
              );
            }),
        );

        const controller = new AbortController();
        const fetchPromise = lsFetch.get('https://gitlab.com/', { signal: controller.signal });

        // Abort the request
        controller.abort();

        await expect(fetchPromise).rejects.toThrow('The operation was aborted');
        expect(fetch).toHaveBeenCalledWith(
          'https://gitlab.com/',
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          }),
        );
      });

      describe('request timeouts', () => {
        beforeEach(() => {
          // Unresolved promise to simulate long-running request
          jest.mocked(fetch).mockImplementation(
            (_url, options) =>
              new Promise((_resolve, reject) => {
                // Unresolved response to simulate long-running network request

                // Handle abort signal
                options?.signal?.addEventListener(
                  'abort',
                  () => {
                    const error = new Error('The operation was aborted');
                    error.name = 'AbortError';
                    reject(error);
                  },
                  { once: true },
                );
              }),
          );
        });

        describe('when provided with an external abort signal', () => {
          it('should throw TimeoutError when request times out', async () => {
            const controller = new AbortController();

            const fetchPromise = lsFetch.get('https://gitlab.com/', { signal: controller.signal });

            // controller is never aborted
            jest.runAllTimers();

            await expect(fetchPromise).rejects.toThrow(
              'Request to https://gitlab.com/ timed out after 15 seconds',
            );
          });
        });

        describe('when no external abort signal is provided', () => {
          it('should throw TimeoutError when request times out', async () => {
            const fetchPromise = lsFetch.get('https://gitlab.com/');
            jest.runAllTimers();

            await expect(fetchPromise).rejects.toThrow(
              'Request to https://gitlab.com/ timed out after 15 seconds',
            );
          });
        });
      });
    });
  });

  describe('getWebSocketOptions', () => {
    let lsFetch: Fetch;

    describe('without a proxy configured', () => {
      beforeEach(async () => {
        lsFetch = new Fetch(logger);
        await lsFetch.initialize();
      });

      it('returns the pre-built agent and TLS options', () => {
        const result = lsFetch.getWebSocketOptions(new URL('https://gitlab.example.com'));

        expect(result).toBeDefined();
        expect(result?.agent).toBeDefined();
        expect(result?.tls).toEqual({ rejectUnauthorized: true });
        expect(result?.proxyUrl).toBeUndefined();
      });
    });

    describe('when a proxy is configured', () => {
      beforeEach(async () => {
        process.env.https_proxy = 'http://proxy.example.com:8080';
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.ws_proxy = 'http://proxy.example.com:8080';
        process.env.wss_proxy = 'http://proxy.example.com:8080';
        lsFetch = new Fetch(logger);
        await lsFetch.initialize();
      });

      it('resolves proxyUrl from environment for the requested URL', () => {
        const result = lsFetch.getWebSocketOptions(new URL('https://gitlab.example.com'));

        expect(result).toBeDefined();
        expect(result?.proxyUrl).toBe('http://proxy.example.com:8080');
        expect(result?.agent).toBeDefined();
      });

      describe('and the URL matches NO_PROXY', () => {
        beforeEach(async () => {
          process.env.no_proxy = 'gitlab.example.com';
          lsFetch = new Fetch(logger);
          await lsFetch.initialize();
        });

        it('does not populate proxyUrl but keeps the agent', () => {
          const result = lsFetch.getWebSocketOptions(new URL('https://gitlab.example.com'));

          expect(result?.proxyUrl).toBeUndefined();
          // The agent is still the proxy agent (Fetch.#getAgent does not
          // honour NO_PROXY); only the resolved URL is filtered. Documented
          // here so a future change to #getAgent doesn't silently regress.
          expect(result?.agent).toBeDefined();
        });
      });
    });

    describe('when only wss_proxy / ws_proxy are configured', () => {
      beforeEach(async () => {
        process.env.wss_proxy = 'http://ws-proxy.example.com:3128';
        process.env.ws_proxy = 'http://ws-proxy.example.com:3128';
        lsFetch = new Fetch(logger);
        await lsFetch.initialize();
      });

      it('resolves proxyUrl from wss_proxy for an https:// URL', () => {
        const result = lsFetch.getWebSocketOptions(new URL('https://gitlab.example.com'));

        expect(result).toBeDefined();
        expect(result?.proxyUrl).toBe('http://ws-proxy.example.com:3128');
        expect(result?.agent).toBeDefined();
      });

      it('resolves proxyUrl from ws_proxy for an http:// URL', () => {
        const result = lsFetch.getWebSocketOptions(new URL('http://gitlab.example.com'));

        expect(result).toBeDefined();
        expect(result?.proxyUrl).toBe('http://ws-proxy.example.com:3128');
        expect(result?.agent).toBeDefined();
      });
    });
  });

  describe('streamFetch', () => {
    let subject: Fetch;
    const mockCancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: jest.fn(),
    };

    beforeEach(async () => {
      subject = new Fetch(logger);
      await subject.initialize();
    });

    it('yields decoded chunks from the response body', async () => {
      const mockResponse = createFakePartial<Response>({
        body: {
          // @ts-expect-error: [Symbol.asyncIterator] is not a valid property for ReadableStream
          async *[Symbol.asyncIterator]() {
            yield Buffer.from('never gonna give you up');
            yield Buffer.from('never gonna let you down');
          },
        },
      });

      const generator = subject.streamResponse(mockResponse, mockCancellationToken);

      expect((await generator.next()).value).toBe('never gonna give you up');
      expect((await generator.next()).value).toBe('never gonna let you down');
      expect((await generator.next()).done).toBe(true);
    });

    it('stops streaming when cancellation is requested', async () => {
      const mockDestroy = jest.fn();
      const mockResponse = createFakePartial<Response>({
        body: {
          // @ts-expect-error: [Symbol.asyncIterator] is not a valid property for ReadableStream
          async *[Symbol.asyncIterator]() {
            yield Buffer.from('never gonna tell a lie');
            // Should not yield this chunk due to cancellation
            yield Buffer.from('and hurt you');
          },
          destroy: mockDestroy,
        },
      });

      const cancellationToken = {
        isCancellationRequested: true,
        onCancellationRequested: jest.fn(),
      };
      const generator = subject.streamResponse(mockResponse, cancellationToken);

      const result = await generator.next();
      expect(result.done).toBe(true);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('handles empty response body', async () => {
      const mockResponse = createFakePartial<Response>({
        body: null,
      });

      const generator = subject.streamResponse(mockResponse, mockCancellationToken);
      const result = await generator.next();
      expect(result.done).toBe(true);
    });

    it('decodes chunks using TextDecoder', async () => {
      const mockResponse = createFakePartial<Response>({
        body: {
          // @ts-expect-error: [Symbol.asyncIterator] is not a valid property for ReadableStream
          async *[Symbol.asyncIterator]() {
            yield Buffer.from('Hello 👋');
          },
        },
      });

      const generator = subject.streamResponse(mockResponse, mockCancellationToken);
      const result = await generator.next();
      expect(result.value).toBe('Hello 👋');
    });
  });
});
