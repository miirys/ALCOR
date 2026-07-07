import type { ReadableStream } from 'node:stream/web';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { getProxySettings } from 'get-proxy-settings';
import { ProxyAgent } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import { isEqual } from 'lodash-es';
import { Injectable } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { isAbortError } from '@gitlab-org/resiliency';
import { Agent, Dispatcher, EnvHttpProxyAgent } from 'undici';
import { CancellationToken } from 'vscode-languageserver-protocol';
import {
  FetchAgentOptions,
  FetchBase,
  LsFetch,
  FetchTimeoutError,
  REQUEST_TIMEOUT_MILLISECONDS,
  WebSocketConnectionOptions,
} from '..';

const httpAgent = new http.Agent({
  keepAlive: true,
});

export interface LsRequestInit extends RequestInit {
  agent: ProxyAgent | https.Agent | http.Agent;
  dispatcher?: Dispatcher;
}

interface LsAgentOptions {
  rejectUnauthorized: boolean;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

/**
 * Wrap fetch to support proxy configurations
 */
@Injectable(LsFetch, [Logger])
export class Fetch extends FetchBase implements LsFetch {
  #dispatcher?: Dispatcher;

  #proxy?: ProxyAgent;

  #userProxy?: string;

  #initialized: boolean = false;

  #httpsAgent: https.Agent;

  #agentOptions: Readonly<LsAgentOptions>;

  readonly #logger: Logger;

  constructor(logger: Logger, userProxy?: string) {
    super();

    this.#logger = logger;
    this.#agentOptions = {
      rejectUnauthorized: true,
    };
    this.#userProxy = userProxy;
    this.#httpsAgent = this.#createHttpsAgent();
  }

  async initialize(): Promise<void> {
    // Set http_proxy and https_proxy environment variables
    // which will then get picked up by the ProxyAgent and
    // used.
    try {
      const proxy = await getProxySettings();
      if (proxy?.http) {
        process.env.http_proxy = `${proxy.http.protocol}://${proxy.http.host}:${proxy.http.port}`;
        this.#logger.info(`fetch: Detected http proxy through settings: ${process.env.http_proxy}`);
        if (
          proxy.http?.credentials &&
          proxy.http.credentials?.username &&
          proxy.http.credentials?.password
        ) {
          this.#logger.info(
            `fetch: Added credentials to http_proxy for username: ${proxy.http.credentials.username}`,
          );
          // NOTE: Do not log this variable after sensitive values have been included.
          process.env.http_proxy = `${proxy.http.protocol}://${proxy.http.credentials.username}:${proxy.http.credentials.password}@${proxy.http.host}:${proxy.http.port}`;
        }
      }

      if (proxy?.https) {
        process.env.https_proxy = `${proxy.https.protocol}://${proxy.https.host}:${proxy.https.port}`;
        this.#logger.info(
          `fetch: Detected https proxy through settings: ${process.env.https_proxy}`,
        );
        if (
          proxy.https?.credentials &&
          proxy.https.credentials?.username &&
          proxy.https.credentials?.password
        ) {
          this.#logger.info(
            `fetch: Added credentials to HTTPS_PROXY for username: ${proxy.https.credentials.username}`,
          );
          // NOTE: Do not log this variable after sensitive values have been included.
          process.env.https_proxy = `${proxy.https.protocol}://${proxy.https.credentials.username}:${proxy.https.credentials.password}@${proxy.https.host}:${proxy.https.port}`;
        }
      }

      /**
       * Set up WebSocketProxy env vars
       * Used by proxy-from-env via the proxy-agent dependency
       * Set both proxies as we don't know until later whether the endpoint is ws:// or wss://
       */
      if (process.env.wss_proxy || process.env.ws_proxy) {
        this.#logger.info(
          `fetch: Detected existing ${process.env.wss_proxy ? 'wss_proxy' : 'ws_proxy'} setting`,
        );
      } else if (proxy?.https) {
        this.#logger.info('fetch: Setting WebSocket proxy based on https_proxy setting');
        process.env.ws_proxy = process.env.https_proxy;
        process.env.wss_proxy = process.env.https_proxy;
      } else if (proxy?.http) {
        this.#logger.info('fetch: Setting WebSocket proxy based on http_proxy setting');
        process.env.ws_proxy = process.env.http_proxy;
        process.env.wss_proxy = process.env.http_proxy;
      }

      if (!proxy?.http && !proxy?.https && !process.env.ws_proxy && !process.env.wss_proxy) {
        this.#logger.info(`fetch: Detected no proxy settings`);
      }
    } catch (err) {
      this.#logger.warn('Unable to load proxy settings', err);
    }

    if (this.#userProxy) {
      this.#logger.debug(`fetch: Detected user proxy ${this.#userProxy}`);
      process.env.http_proxy = this.#userProxy;
      process.env.https_proxy = this.#userProxy;
    }

    if (
      process.env.http_proxy ||
      process.env.https_proxy ||
      process.env.ws_proxy ||
      process.env.wss_proxy
    ) {
      const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
      if (noProxy?.length) {
        this.#logger.info(`fetch: Skipping proxy for hosts in no_proxy: ${noProxy}`);
      }

      this.#proxy = this.#createProxyAgent();
      this.#dispatcher = new EnvHttpProxyAgent(this.#getDispatcherOptions());
    } else {
      this.#dispatcher = new Agent(this.#getDispatcherOptions());
    }

    this.#initialized = true;
  }

  async destroy(): Promise<void> {
    this.#proxy?.destroy();
  }

  async fetchBase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!this.#initialized) {
      throw new Error('LsFetch not initialized. Make sure LsFetch.initialize() was called.');
    }

    return this.#fetchLogged(
      input,
      {
        ...init,
        agent: this.#getAgent(input),
        dispatcher: this.#dispatcher,
      },
      super.fetchBase,
    );
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!this.#initialized) {
      throw new Error('LsFetch not initialized. Make sure LsFetch.initialize() was called.');
    }

    // In order to support both an AbortSignal from outside consumer code (passed via `init`) and the request timeout
    // abort controller below, we create a wrapping controller which aborts if either signal is aborted.
    const controller = new AbortController();
    const timeoutAbortSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS);

    // Listen to both signals. Once we support Node.js >= v20 we can switch to `AbortController.any()`
    [init?.signal, timeoutAbortSignal].forEach((signal) => {
      signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    });

    try {
      return await this.#fetchLogged(
        input,
        {
          ...init,
          signal: controller.signal,
          agent: this.#getAgent(input),
          dispatcher: this.#dispatcher,
        },
        super.fetch,
      );
    } catch (e) {
      if (isAbortError(e)) {
        const { reason } = controller.signal;
        if (reason instanceof Error && reason.name === 'TimeoutError') {
          // Only convert to TimeoutError if this was the timeout signal we set up above
          // Otherwise it's an abort signal passed in from other consumer code
          throw new FetchTimeoutError(input);
        }
      }
      throw e;
    }
  }

  getWebSocketOptions(input: RequestInfo | URL): WebSocketConnectionOptions {
    const agent = this.#getAgent(input);
    const isProxy = agent === this.#proxy;

    const result: WebSocketConnectionOptions = {
      agent,
      tls: { ...this.#agentOptions },
    };

    // Eagerly resolve the proxy URL from env vars so consumers that run
    // under Bun (whose native WebSocket ignores Node's `agent` option) can
    // use the resolved string directly via Bun's `proxy:` option.
    //
    // Resolve against the ws/wss scheme: `getProxyForUrl` keys env lookup off
    // the URL scheme, so an https:// URL would miss a `wss_proxy` setting.
    if (isProxy) {
      const resolved = getProxyForUrl(this.#toWebSocketUrl(this.#extractURL(input)));
      if (resolved) {
        result.proxyUrl = resolved;
      }
    }

    return result;
  }

  updateAgentOptions({ ignoreCertificateErrors, ca, cert, certKey }: FetchAgentOptions): void {
    let fileOptions = {};
    try {
      fileOptions = {
        ...(ca ? { ca: fs.readFileSync(ca) } : {}),
        ...(cert ? { cert: fs.readFileSync(cert) } : {}),
        ...(certKey ? { key: fs.readFileSync(certKey) } : {}),
      };
    } catch (err) {
      this.#logger.error('Error reading https agent options from file', err);
    }

    const newOptions: LsAgentOptions = {
      rejectUnauthorized: !ignoreCertificateErrors,
      ...fileOptions,
    };

    if (isEqual(newOptions, this.#agentOptions)) {
      // new and old options are the same, nothing to do
      return;
    }

    this.#agentOptions = newOptions;
    this.#httpsAgent = this.#createHttpsAgent();
    if (this.#proxy) {
      this.#proxy = this.#createProxyAgent();
      this.#dispatcher = new EnvHttpProxyAgent(this.#getDispatcherOptions());
    } else {
      this.#dispatcher = new Agent(this.#getDispatcherOptions());
    }
  }

  /**
   * Note: we yield chunks of the stream as strings,
   * as the caller is responsible for aggregating them
   */
  async *streamResponse(
    response: Response,
    cancellationToken: CancellationToken,
  ): AsyncGenerator<string, void, void> {
    const logger = this.#logger;
    if (!response.body) {
      return;
    }

    const decoder = new TextDecoder();

    async function* readStream(
      stream: ReadableStream<Uint8Array>,
    ): AsyncGenerator<string, void, void> {
      for await (const chunk of stream) {
        if (cancellationToken.isCancellationRequested) {
          if ('destroy' in stream) {
            logger.debug('Cancelling stream');
            (stream as { destroy: () => void }).destroy();
          }
          return;
        }

        yield decoder.decode(chunk);
      }
    }

    // Note: Using (node:stream).ReadableStream as it supports async iterators
    yield* readStream(response.body as ReadableStream);
  }

  #createHttpsAgent(): https.Agent {
    const agentOptions = {
      ...this.#agentOptions,
      keepAlive: true,
    };
    this.#logger.debug(
      `fetch: https agent with options initialized ${JSON.stringify(
        this.#sanitizeAgentOptions(agentOptions),
      )}.`,
    );
    return new https.Agent(agentOptions);
  }

  #createProxyAgent(): ProxyAgent {
    this.#logger.debug(
      `fetch: proxy agent with options initialized ${JSON.stringify(
        this.#sanitizeAgentOptions(this.#agentOptions),
      )}.`,
    );
    return new ProxyAgent(this.#agentOptions);
  }

  async #fetchLogged(
    input: RequestInfo | URL,
    init: LsRequestInit,
    fetchImpl: typeof fetch,
  ): Promise<Response> {
    const start = Date.now();
    const url = this.#extractURL(input);

    if (init.agent === httpAgent) {
      this.#logger.debug(`fetch: request for ${url} made with http agent.`);
    } else {
      const type = init.agent === this.#proxy ? 'proxy' : 'https';
      this.#logger.debug(`fetch: request for ${url} made with ${type} agent.`);
    }

    try {
      const resp = await fetchImpl(input, init);
      const duration = Date.now() - start;

      this.#logger.debug(
        `fetch: request to ${url} returned HTTP ${resp.status} after ${duration} ms`,
      );

      return resp;
    } catch (e) {
      const duration = Date.now() - start;
      this.#logger.debug(`fetch: request to ${url} threw an exception after ${duration} ms`);
      throw e;
    }
  }

  #getAgent(input: RequestInfo | URL): ProxyAgent | https.Agent | http.Agent {
    if (this.#proxy) {
      return this.#proxy;
    }
    if (input.toString().startsWith('https://')) {
      return this.#httpsAgent;
    }

    return httpAgent;
  }

  #getDispatcherOptions = (): EnvHttpProxyAgent.Options | Agent.Options => ({
    // Default to 1 second to match the https.Agent/http.Agent we pass to our cross-fetch/node-fetch.
    keepAliveTimeout: 1e3,
    requestTls: this.#agentOptions,
  });

  #toWebSocketUrl(url: string): string {
    if (url.startsWith('https://')) {
      return `wss://${url.slice('https://'.length)}`;
    }
    if (url.startsWith('http://')) {
      return `ws://${url.slice('http://'.length)}`;
    }
    return url;
  }

  #extractURL(input: RequestInfo | URL): string {
    if (input instanceof URL) {
      return input.toString();
    }

    if (typeof input === 'string') {
      return input;
    }

    return input.url;
  }

  #sanitizeAgentOptions(agentOptions: LsAgentOptions) {
    const { ca, cert, key, ...options } = agentOptions;
    return {
      ...options,
      ...(ca ? { ca: '<hidden>' } : {}),
      ...(cert ? { cert: '<hidden>' } : {}),
      ...(key ? { key: '<hidden>' } : {}),
    };
  }
}
