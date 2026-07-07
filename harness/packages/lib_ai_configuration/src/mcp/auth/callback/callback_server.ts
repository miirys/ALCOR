import Fastify, { FastifyInstance } from 'fastify';
import FastifyRateLimit from '@fastify/rate-limit';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Disposable } from '@gitlab-org/disposable';
import { McpAuthFlowController } from '../flow';
import type { AuthFlowError } from '../flow/errors';

export interface CallbackServerOptions {
  /** Port to use. Default 0 = let OS assign */
  port?: number;
  /**
   * Hostname to bind. Default is 127.0.0.1 (loopback).
   * Use a non-loopback address only for intentional remote-dev scenarios.
   */
  hostname?: string;
  /** Path for the callback endpoint (default: /callback) */
  callbackPath?: string;
  rateLimit?: {
    /** Window length (ms or ms-string), default: 60_000 */
    timeWindow?: number | string;
    /** Max requests per IP per window, default: 30 */
    max?: number;
  };
}

/** Shape returned by the JSON API */
type SuccessBody = { status: 'success' };
type ErrorBody = { status: 'error'; error: { code: string; message: string } };
type HealthBody = { status: 'ok' };

function authFlowErrorToHttpStatus(e: AuthFlowError): number {
  switch (e.code) {
    case 'AUTH_FLOW_STATE_NOT_FOUND':
      return 400;
    case 'AUTH_FLOW_FINALIZER_NOT_FOUND':
    case 'AUTH_FLOW_FINALIZATION_FAILED':
      return 500;
    default:
      return 500;
  }
}

/**
 * Create and configure the Fastify server with OAuth callback routes
 */
async function createServer(
  flowManager: McpAuthFlowController,
  logger: Logger,
  callbackPath: string,
  rateLimit: Required<NonNullable<CallbackServerOptions['rateLimit']>>,
): Promise<FastifyInstance> {
  const log = withPrefix(logger, '[MCP][OAuthCallback]');
  const server = Fastify({ logger: false });
  await server.register(FastifyRateLimit, { global: false, ...rateLimit });

  // add security headers (harmless for JSON responses, defence-in-depth)
  server.addHook('onSend', (_req, reply, payload, done) => {
    reply
      .header('x-frame-options', 'DENY')
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('cache-control', 'no-store')
      .header(
        'content-security-policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );

    done(null, payload);
  });

  // Health check
  server.get('/health', async (): Promise<HealthBody> => ({ status: 'ok' }));

  // OAuth redirect/callback
  server.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
    Reply: SuccessBody | ErrorBody;
  }>(callbackPath, { preHandler: server.rateLimit() }, async (request, reply) => {
    const { code, state, error, error_description: errorDescription } = request.query;

    // 1) Explicit error returned by the Authorization Server
    if (error) {
      // Avoid echoing sensitive info; return a stable code/message
      log.error(`authorize_error type=${error}`);
      return reply.code(400).send({
        status: 'error',
        error: { code: 'OAUTH_AUTHORIZATION_ERROR', message: errorDescription ?? error },
      });
    }

    // 2) Missing required params
    if (!code || !state) {
      log.error('invalid_request: missing code or state');
      return reply.code(400).send({
        status: 'error',
        error: { code: 'INVALID_REQUEST', message: 'Missing required parameters' },
      });
    }

    // 3) Complete the flow via manager (neverthrow)
    const result = await flowManager.completeFlow(state, code);

    if (result.isOk()) {
      log.info('flow_completed');
      return reply.code(200).send({ status: 'success' });
    }

    const http = authFlowErrorToHttpStatus(result.error);
    log.error(`flow_failed code=${result.error.code} msg=${result.error.message}`);

    return reply
      .code(http)
      .send({ status: 'error', error: { code: result.error.code, message: result.error.message } });
  });

  return server;
}

export class OAuthCallbackServer implements Disposable {
  #server: FastifyInstance;

  #logger: Logger;

  #disposed = false;

  readonly #callbackUrl: URL;

  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    server: FastifyInstance,
    logger: Logger,
    hostname: string,
    callbackPath: string,
  ) {
    this.#server = server;
    this.#logger = withPrefix(logger, '[MCP][OAuthCallback]');

    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address'); // This is a true exceptional case.
    }

    this.#callbackUrl = new URL(`http://${hostname}:${address.port}${callbackPath}`);
  }

  get callbackUrl(): URL {
    return this.#callbackUrl;
  }

  static async create(
    flowManager: McpAuthFlowController,
    logger: Logger,
    options: CallbackServerOptions = {},
  ): Promise<OAuthCallbackServer> {
    const hostname = options.hostname ?? '127.0.0.1';
    const callbackPath = options.callbackPath ?? '/callback';
    const port = options.port ?? 0; // OS-assigned
    const rateLimit = {
      timeWindow: options.rateLimit?.timeWindow ?? 60_000,
      max: options.rateLimit?.max ?? 30,
    };

    const server = await createServer(flowManager, logger, callbackPath, rateLimit);
    await server.listen({ port, host: hostname });

    const addr = server.server.address();
    const actual = typeof addr === 'string' ? addr : addr?.port;
    withPrefix(logger, '[MCP][OAuthCallback]').info(`server_started host=${addr} port=${actual}`);

    const loopbacks = new Set(['127.0.0.1', '::1', 'localhost']);
    if (!loopbacks.has(hostname)) {
      withPrefix(logger, '[MCP][OAuthCallback]').warn(
        `non_loopback_binding host=${hostname} - ensure this is intentional and TLS is terminated upstream`,
      );
    }

    return new OAuthCallbackServer(server, logger, hostname, callbackPath);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#server
      .close()
      .then(
        () => this.#logger.info('server_stopped'),
        (err) => this.#logger.error('server_close_error', err),
      )
      .catch((err) => this.#logger.error('server_dispose_uncaught', err));
  }

  isDisposed(): boolean {
    return this.#disposed;
  }
}
