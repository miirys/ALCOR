import { EventEmitter } from 'events';
import WebSocket from 'isomorphic-ws';
import { type Logger } from '@gitlab-org/logging';
import { Action } from '@gitlab-org/duo-workflow-service';
import { ifVersionGte, InstanceInfo } from '@gitlab-org/core';
import type { WorkflowStream } from './types';
import { WebsocketStreamError } from './errors';

const KEEPALIVE_PING_INTERVAL_MS = 45 * 1000;

export class WebSocketWorkflowStream extends EventEmitter implements WorkflowStream {
  #socket: WebSocket;

  #logger: Logger;

  #instanceInfo?: InstanceInfo;

  #keepalivePingIntervalId?: NodeJS.Timeout;

  constructor(socket: WebSocket, logger: Logger, instanceInfo?: InstanceInfo) {
    super();
    this.#socket = socket;
    this.#logger = logger;
    this.#instanceInfo = instanceInfo;

    this.#setupEventHandlers();
  }

  #setupEventHandlers(): void {
    this.#socket.on(
      'message',
      (event: WebSocket.MessageEvent | string | Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const data = event && typeof event === 'object' && 'data' in event ? event.data : event;

          let message: string;
          if (typeof data === 'string') {
            message = data;
          } else if (Buffer.isBuffer(data)) {
            message = data.toString('utf8');
          } else if (data instanceof ArrayBuffer) {
            message = Buffer.from(data).toString('utf8');
          } else if (Array.isArray(data)) {
            message = Buffer.concat(data).toString('utf8');
          } else {
            this.#logger.warn('Received unknown message format');
            return;
          }

          if (!message || message === 'undefined') {
            this.#logger.warn('Received empty or undefined message, skipping');
            return;
          }

          const parsedEvent = Action.fromJSON(JSON.parse(message));
          this.emit('data', parsedEvent);
        } catch (err) {
          this.#logger.error(`Failed to parse WebSocket message`, { event, error: err });
          this.#emitError(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );

    this.#socket.on('open', () => {
      this.#logger.debug('WebSocket connection opened');
      this.emit('open');
    });

    this.#socket.on('error', (event: WebSocket.ErrorEvent | Error) => {
      this.#logger.error('WebSocket error:', event);
      this.#emitError(event instanceof Error ? event : new Error(String(event)));
    });

    // Fired by the underlying `ws` client when the HTTP upgrade handshake is
    // rejected (e.g. 401/403 from an expired or invalid bearer token). Without
    // this handler the real status is masked and only surfaces as a generic
    // error / abnormal closure. Capturing the status lets us map it to a clear,
    // actionable user-facing error (see mapClientErrorToUserFacingStatusCode).
    this.#socket.on(
      'unexpected-response',
      (
        _request: unknown,
        response: { statusCode?: number; statusMessage?: string; resume?: () => void },
      ) => {
        const statusCode = response?.statusCode;
        const statusMessage = response?.statusMessage;
        this.#logger.error(
          `WebSocket upgrade rejected with HTTP ${statusCode ?? 'unknown'} ${statusMessage ?? ''}`.trim(),
        );
        // Consume the response body so the underlying socket is released.
        // Without this, the TCP connection can hang open until the server closes it.
        response?.resume?.();
        this.#emitError(
          new WebsocketStreamError(
            `WebSocket upgrade failed with HTTP status ${statusCode ?? 'unknown'}`,
            statusCode,
            statusMessage,
          ),
        );
      },
    );

    this.#socket.on('close', (code: number, reason: Buffer) => {
      clearInterval(this.#keepalivePingIntervalId);

      const reasonString = reason?.toString('utf8');
      this.#logger.debug(
        `WebSocket connection closed: ${JSON.stringify({ code, reason: reasonString })}`,
      );

      const isNormalClosure = code === 1000;
      if (isNormalClosure) {
        this.emit('end');
        return;
      }

      const isAbnormalClosure = code === 1006;
      if (isAbnormalClosure) {
        let shouldSuppressAbnormalClosure = true;
        ifVersionGte(
          this.#instanceInfo?.instanceVersion,
          '18.5.0',
          () => {
            shouldSuppressAbnormalClosure = false;
          },
          () => {
            shouldSuppressAbnormalClosure = true;
          },
        );

        // Until 18.5, the backend was not correctly closing WebSocket connections, which means that
        // every closure was coming through as a `1006` "abnormal closure". So for older instances we
        // treat these closures as normal. This _can_ result in actual errors being hidden, but the
        // alternative is that every socket disconnection shows an error to the user.
        // https://gitlab.com/gitlab-org/gitlab/-/issues/560848
        if (shouldSuppressAbnormalClosure) {
          this.emit('end');
          return;
        }
      }

      const error = new WebsocketStreamError('WebSocket closed abnormally.', code, reasonString);
      this.#emitError(error);
    });

    this.#socket.on('pong', (data: Buffer) => {
      let rtt = 'unknown';
      try {
        const pingTime = parseInt(data.toString(), 10);
        rtt = `${Date.now() - pingTime}ms`;
      } catch (err) {
        // Nothing to do here, we only parse this for the extra RTT debug logging
        this.#logger.debug('Failed to parse keepalive `pong` response', err);
      }

      this.#logger.debug(`WebSocket keepalive ping acknowledged. Round trip time: ${rtt}`);
    });

    this.#startKeepalivePingInterval();
  }

  /**
   * Emit an `error` event without ever crashing the process.
   *
   * Node's EventEmitter throws synchronously when an `'error'` event is emitted
   * while no listeners are registered. During a failed (re)connection the
   * underlying socket can emit a late abnormal `close` (1006) *after* the
   * connection promise has already rejected and removed its one-shot `error`
   * listener (see WebSocketWorkflowClient#executeWorkflow), leaving this stream
   * with no listeners. Without this guard that orphaned error surfaces as an
   * `uncaughtException`, which the CLI turns into a full shutdown — aborting the
   * retry loop mid-backoff. If nobody is listening, log it instead of throwing.
   */
  #emitError(error: Error): void {
    if (this.listenerCount('error') === 0) {
      this.#logger.warn(`Unobserved WebSocket stream error: ${error.message}`);
      return;
    }
    this.emit('error', error);
  }

  #startKeepalivePingInterval(): void {
    this.#logger.debug(
      `Starting keepalive ping on websocket every ${KEEPALIVE_PING_INTERVAL_MS / 1000}s`,
    );

    this.#keepalivePingIntervalId = setInterval(() => {
      if (this.#socket.readyState !== WebSocket.OPEN) {
        this.#logger.warn(
          `Skipped sending keepalive ping because socket readystate is not OPEN. readystate is: "${this.#socket.readyState}"`,
        );
        return;
      }

      const timestamp = Date.now().toString();
      this.#socket.ping(Buffer.from(timestamp), undefined, (err) => {
        if (err) {
          this.#logger.error('Keepalive ping failed:', err);
        }
      });
    }, KEEPALIVE_PING_INTERVAL_MS);
  }

  write(data: unknown): boolean {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      this.#logger.error(
        `Attempting to write to stream when socket is not open. Socket is in state: "${this.#socket.readyState}"`,
      );
      return false;
    }

    this.#socket.send(JSON.stringify(data));
    return true;
  }

  end(): void {
    this.#socket.close(1000);
  }
}
