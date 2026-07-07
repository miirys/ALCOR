import fetch from 'cross-fetch';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { createInterfaceId } from '@gitlab/needle';

export interface FetchAgentOptions {
  ignoreCertificateErrors: boolean;
  ca?: string;
  cert?: string;
  certKey?: string;
}

/**
 * Structured WebSocket connection options describing the *intent*
 * (proxy URL, TLS material, pre-built agent) for a WebSocket connection.
 *
 * Browser implementations return `undefined` and let the built-in
 * WebSocket constructor handle its own networking.
 *
 * Node implementations populate this from the same proxy/TLS state that
 * `Fetch` uses for HTTP. Consumers should use `toIsomorphicWsOptions`
 * (exported from `@gitlab-org/fetch`) to flatten this to the
 * `isomorphic-ws` / `ws` constructor option shape, which selects the
 * correct fields for the current runtime.
 */
export interface WebSocketConnectionOptions {
  proxyUrl?: string;
  tls?: {
    ca?: Buffer;
    cert?: Buffer;
    key?: Buffer;
    rejectUnauthorized?: boolean;
  };
  // Pre-built Node.js HTTP agent. Typed as unknown here because the agent
  // types live in the node-only `http`/`https`/`proxy-agent` modules.
  agent?: unknown;
}

export interface LsFetch {
  initialize(): Promise<void>;

  destroy(): Promise<void>;

  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  fetchBase(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  delete(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  get(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  post(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  put(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  patch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  head(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  // Returns structured WebSocket connection options for the given URL.
  // Browser implementations return `undefined` (built-in WebSocket handles
  // its own networking). Use `toIsomorphicWsOptions` from
  // `@gitlab-org/fetch` to flatten this to the `isomorphic-ws`
  // ClientOptions shape.
  getWebSocketOptions(input: RequestInfo | URL): WebSocketConnectionOptions | undefined;

  updateAgentOptions(options: FetchAgentOptions): void;

  streamResponse(
    response: Response,
    cancellationToken: CancellationToken,
  ): AsyncGenerator<string, void, void>;
}

export const LsFetch = createInterfaceId<LsFetch>('LsFetch');

export class FetchBase implements LsFetch {
  updateRequestInit(method: string, init?: RequestInit): RequestInit {
    if (typeof init === 'undefined') {
      // eslint-disable-next-line no-param-reassign
      init = { method };
    } else {
      // eslint-disable-next-line no-param-reassign
      init.method = method;
    }

    return init;
  }

  async initialize(): Promise<void> {}

  async destroy(): Promise<void> {}

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return fetch(input, init);
  }

  // eslint-disable-next-line require-yield
  async *streamResponse(
    /* eslint-disable @typescript-eslint/no-unused-vars */
    _response: Response,
    _cancellationToken: CancellationToken,
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AsyncGenerator<string, void, void> {
    // Stub. Should delegate to the node or browser fetch implementations
    throw new Error('Not implemented');
  }

  async delete(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetch(input, this.updateRequestInit('DELETE', init));
  }

  async get(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetch(input, this.updateRequestInit('GET', init));
  }

  async post(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetch(input, this.updateRequestInit('POST', init));
  }

  async put(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetch(input, this.updateRequestInit('PUT', init));
  }

  async patch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetch(input, this.updateRequestInit('PATCH', init));
  }

  async head(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetch(input, this.updateRequestInit('HEAD', init));
  }

  async fetchBase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // eslint-disable-next-line no-underscore-dangle, no-restricted-globals
    const _global = typeof global === 'undefined' ? self : global;

    return _global.fetch(input, init);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getWebSocketOptions(_input: RequestInfo | URL): WebSocketConnectionOptions | undefined {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateAgentOptions(_opts: FetchAgentOptions): void {}
}
