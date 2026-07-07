import EventEmitter from 'events';
import { Stream } from 'node:stream';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ResultAsync, errAsync, ok, okAsync } from 'neverthrow';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { McpServerInfo, ServerName } from '../types';
import { ServerConfig } from '../config';
import { AuthFlowEvent, McpAuthFinalizerRegistry, McpAuthFlowController } from '../auth';
import { McpClient } from './client';
import { McpError } from './errors';
import { TransportProvider } from './transport/provider';
import { ServerVersionInfo } from './types';
import { finishOAuthFlow } from './utils/auth';

export enum ConnectionState {
  Connecting = 'connecting',
  Authenticating = 'authenticating',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Failed = 'failed',
  PendingApproval = 'pendingApproval',
  Rejected = 'rejected',
}

export interface ConnectionStateMap {
  [ConnectionState.Disconnected]: {
    status: ConnectionState.Disconnected;
  };
  [ConnectionState.Connecting]: {
    status: ConnectionState.Connecting;
    config: ServerConfig;
    startedAt: Date;
  };
  [ConnectionState.Authenticating]: {
    status: ConnectionState.Authenticating;
    config: ServerConfig;
    startedAt: Date;
    authUrl?: string;
  };
  [ConnectionState.Connected]: {
    status: ConnectionState.Connected;
    config: ServerConfig;
    serverInfo?: ServerVersionInfo;
    connectedAt: Date;
  };
  [ConnectionState.Failed]: {
    status: ConnectionState.Failed;
    config?: ServerConfig;
    error: McpError;
    failedAt: Date;
  };
  [ConnectionState.PendingApproval]: {
    status: ConnectionState.PendingApproval;
    config: ServerConfig;
    configHash: string;
  };
  [ConnectionState.Rejected]: {
    status: ConnectionState.Rejected;
    config: ServerConfig;
    configHash: string;
  };
}

export type ConnectionStateSnapshot = ConnectionStateMap[keyof ConnectionStateMap];

export interface McpConnection extends Disposable {
  /**
   * Current connection state
   */
  readonly state: ConnectionState;

  /**
   * Server name
   */
  readonly serverName: ServerName;

  /**
   * Get detailed state snapshot
   */
  getStateSnapshot(): ConnectionStateSnapshot;

  /**
   * Complete OAuth authentication
   * Only valid when state is Authenticating
   */
  finishAuth(code: string | null): ResultAsync<void, McpError>;

  /**
   * Wait for the connection to complete and return the high-level client
   * Can be called multiple times - returns the same promise/result
   */
  waitForConnection(): ResultAsync<McpClient, McpError>;

  /**
   * Get the connected client immediately (doesn't wait)
   * Returns error if not currently connected
   */
  getConnectedClient(): ResultAsync<McpClient, McpError>;

  /**
   * Subscribe to state changes
   */
  onStateChanged(handler: (stateSnapshot: ConnectionStateSnapshot) => void): () => void;
}

export class DefaultMcpConnection implements McpConnection {
  readonly #serverName: ServerName;

  readonly #serverInfo: McpServerInfo;

  readonly #sdkClient: Client;

  readonly #logger: Logger;

  readonly #eventBus = new EventEmitter();

  readonly #transportProvider: TransportProvider;

  readonly #authFinalizerRegistry: McpAuthFinalizerRegistry;

  readonly #authFlowController: McpAuthFlowController;

  #state: ConnectionStateSnapshot = { status: ConnectionState.Disconnected };

  #transport: Transport;

  #disposed = false;

  #serverClient?: McpClient;

  #connectionPromise?: Promise<ResultAsync<McpClient, McpError>>;

  #authRegistered = false;

  #transportDisposables = new CompositeDisposable();

  #pendingAuthFlowUrl?: string;

  constructor(
    sdkClient: Client,
    transport: Transport,
    transportProvider: TransportProvider,
    serverInfo: McpServerInfo,
    logger: Logger,
    authFlowController: McpAuthFlowController,
    authFinalizerRegistry: McpAuthFinalizerRegistry,
  ) {
    this.#serverName = serverInfo.name;
    this.#serverInfo = serverInfo;
    this.#sdkClient = sdkClient;
    this.#transport = transport;
    this.#transportProvider = transportProvider;
    this.#logger = withPrefix(logger, `[MCP][Connection][${serverInfo.name}]`);
    this.#authFlowController = authFlowController;
    this.#authFinalizerRegistry = authFinalizerRegistry;

    this.#setupConnectionMonitoring();
  }

  get state(): ConnectionState {
    if (this.#disposed) {
      return ConnectionState.Disconnected;
    }

    return this.#state.status;
  }

  get serverName(): ServerName {
    return this.#serverName;
  }

  getStateSnapshot(): ConnectionStateSnapshot {
    if (this.#disposed) {
      return { status: ConnectionState.Disconnected };
    }

    return this.#state;
  }

  /**
   * Attempt initial connection to the server.
   * Called by factory after construction to complete the two-phase initialization.
   * Handlers are already registered, so auth URL events will be received.
   *
   * @internal - Only called by McpConnectionFactory
   */
  attemptConnect(): ResultAsync<void, McpError> {
    if (this.#state.status !== ConnectionState.Disconnected) {
      return errAsync(
        McpError.connectionFailed(
          this.#serverName,
          'Cannot connect - already connecting/connected',
        ),
      );
    }

    this.#registerAuthHandler();

    this.#logger.debug('Attempting initial connection...');

    this.#setState({
      status: ConnectionState.Connecting,
      config: this.#serverInfo.config,
      startedAt: new Date(),
    });

    return ResultAsync.fromPromise(this.#sdkClient.connect(this.#transport), (e) => e)
      .andTee(() => {
        this.#logger.info('Connected successfully');
        this.#setState({
          status: ConnectionState.Connected,
          config: this.#serverInfo.config,
          connectedAt: new Date(),
        });
      })
      .orElse((err) => {
        if (err instanceof UnauthorizedError) {
          this.#logger.info('Authentication required');
          this.#setState({
            status: ConnectionState.Authenticating,
            config: this.#serverInfo.config,
            startedAt: new Date(),
            authUrl: this.#pendingAuthFlowUrl,
          });
          this.#pendingAuthFlowUrl = undefined;
          return ok(); // Authenticating is a valid state, not an error
        }

        // Do not discard cause since it includes additional details
        // in case of error being a FetchError with the message "fetch failed".
        const cause =
          err instanceof Error && 'cause' in err && err.cause instanceof Error
            ? err.cause
            : undefined;
        if (cause) {
          this.#logger.warn(`Connection failed - cause="${cause}"`, cause);
        }
        // Any other error is a failure
        this.#logger.warn(`Connection failed - error="${err}"`, err);
        this.#setState({
          status: ConnectionState.Failed,
          config: this.#serverInfo.config,
          error: McpError.connectionFailed(this.#serverName, err),
          failedAt: new Date(),
        });
        return errAsync(McpError.connectionFailed(this.#serverName, err));
      });
  }

  /**
   * Complete OAuth authentication.
   * Only valid when state is Authenticating.
   */
  finishAuth(code: string | null): ResultAsync<void, McpError> {
    // 1. Early exit checks
    if (this.#disposed) {
      return errAsync(McpError.clientDisposed(this.#serverName));
    }

    // 2. State validation (must be in Authenticating state)
    if (this.#state.status !== ConnectionState.Authenticating) {
      this.#logger.debug('Invalid state - cannot finish auth when not in Authenticating state');
      return errAsync(McpError.clientNotConnected(this.#serverName, this.#state.status));
    }

    // 3. Execute OAuth Flow
    return finishOAuthFlow(this.#serverName, this.#transport, code, this.#transportProvider)
      .andThen((newTransport) => this.#connectNewTransport(newTransport))
      .andTee((newTransport) => this.#handleAuthSuccess(newTransport))
      .orTee((error) => this.#handleAuthFailure(error))
      .map(() => undefined);
  }

  /**
   * Wait for the connection to complete and return the high-level client.
   * Can be called multiple times - returns the same promise/result.
   *
   * @returns Connected client on success, or error on failure
   */
  waitForConnection(): ResultAsync<McpClient, McpError> {
    if (this.#disposed) {
      return errAsync(McpError.clientDisposed(this.#serverName));
    }

    const currentState = this.#state;

    // If already connected, return immediately
    if (currentState.status === ConnectionState.Connected && this.#serverClient) {
      return okAsync(this.#serverClient);
    }

    // If already failed or disconnected, return error immediately
    if (
      currentState.status === ConnectionState.Failed ||
      currentState.status === ConnectionState.Disconnected
    ) {
      const error =
        currentState.status === ConnectionState.Failed
          ? currentState.error
          : McpError.connectionFailed(this.#serverName, 'Connection disconnected');
      return errAsync(error);
    }

    // If we're already waiting, return the same promise
    if (this.#connectionPromise) {
      return ResultAsync.fromPromise(this.#connectionPromise, (e) => e as McpError).andThen(
        (r) => r,
      );
    }

    // Create a new promise that resolves when we reach a terminal state
    this.#connectionPromise = new Promise((resolve) => {
      const handleStateChange = (state: ConnectionStateSnapshot) => {
        if (state.status === ConnectionState.Connected) {
          this.#eventBus.off('state_changed', handleStateChange);
          if (this.#serverClient) {
            resolve(okAsync(this.#serverClient));
          } else {
            resolve(
              errAsync(McpError.connectionFailed(this.#serverName, 'Client not initialized')),
            );
          }
        } else if (
          state.status === ConnectionState.Failed ||
          state.status === ConnectionState.Disconnected
        ) {
          this.#eventBus.off('state_changed', handleStateChange);
          const error =
            state.status === ConnectionState.Failed
              ? state.error
              : McpError.connectionFailed(this.#serverName, 'Disconnected');
          resolve(errAsync(error));
        }
      };

      this.#eventBus.on('state_changed', handleStateChange);

      // If we're already in a terminal state, emit it immediately
      if (this.#state.status === ConnectionState.Connected && this.#serverClient) {
        this.#emitStateChange();
      } else if (
        this.#state.status === ConnectionState.Failed ||
        this.#state.status === ConnectionState.Disconnected
      ) {
        this.#emitStateChange();
      }
    });

    return ResultAsync.fromPromise(this.#connectionPromise, (e) => e as McpError).andThen((r) => r);
  }

  /**
   * Get the high-level server client if currently connected.
   * Returns immediately - does not wait for connection to complete.
   *
   * @returns McpClient if connected, or error if not connected
   */
  getConnectedClient(): ResultAsync<McpClient, McpError> {
    if (this.#disposed) {
      return errAsync(McpError.clientDisposed(this.#serverName));
    }

    if (this.#state.status !== ConnectionState.Connected) {
      return errAsync(McpError.clientNotConnected(this.#serverName, this.#state.status));
    }

    if (!this.#serverClient) {
      return errAsync(McpError.connectionFailed(this.#serverName, 'Client not initialized'));
    }

    return okAsync(this.#serverClient);
  }

  onStateChanged(handler: (stateSnapshot: ConnectionStateSnapshot) => void): () => void {
    this.#eventBus.on('state_changed', handler);
    return () => this.#eventBus.off('state_changed', handler);
  }

  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;

    this.#destroyServerClient();

    this.#transportDisposables.dispose();

    // Close transport and SDK client
    Promise.allSettled([this.#transport.close?.().catch(() => {}), this.#sdkClient.close()]).catch(
      () => {},
    );

    this.#setState({ status: ConnectionState.Disconnected });
    this.#eventBus.removeAllListeners();
  }

  // ----- Internal ----------------------------------------------------------

  #setupConnectionMonitoring(): void {
    this.#transportDisposables.dispose();
    this.#transportDisposables = new CompositeDisposable();

    this.#setupStderrLogging();

    this.#transport.onerror = (error: Error) => {
      this.#logger.error('Transport error', error);
      this.#handleConnectionLost('Transport error', error);
    };

    this.#transport.onclose = () => {
      this.#logger.info('Transport closed');
      this.#handleConnectionLost('Transport closed');
    };

    this.#transportDisposables.add(
      {
        dispose: () => {
          this.#transport.onerror = undefined;
        },
      },
      {
        dispose: () => {
          this.#transport.onclose = undefined;
        },
      },
    );
  }

  #setupStderrLogging(): void {
    if (!('stderr' in this.#transport)) return;

    const stderrStream = (this.#transport as { stderr: Stream | null }).stderr;
    if (!stderrStream) return;

    const maxBufferSize = 1024 * 1024; // 1MB
    let buffer = '';

    stderrStream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      if (buffer.length > maxBufferSize) {
        // buffer is getting big, stop consuming memory and just log what we have so far
        this.#logger.warn(`[MCP Server stderr] Buffer exceeded ${maxBufferSize} bytes, dumping...`);
        this.#logger.info(`[MCP Server stderr] ${buffer}`);
        buffer = '';
        return;
      }

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.#logger.info(`[MCP Server stderr] ${line}`);
        }
      }
    });

    stderrStream.on('end', () => {
      if (buffer.trim()) {
        this.#logger.info(`[MCP Server stderr] ${buffer}`);
      }
    });

    stderrStream.on('error', (error: Error) => {
      this.#logger.error('[MCP Server stderr] Stream error', error);
    });

    this.#transportDisposables.add({
      dispose: () => stderrStream.removeAllListeners(),
    });
  }

  #handleConnectionLost(reason: string, error?: Error): void {
    if (this.#disposed) return;

    if (
      this.#state.status === ConnectionState.Failed ||
      this.#state.status === ConnectionState.Disconnected
    ) {
      return;
    }

    this.#logger.warn(`Connection lost: ${reason}`);

    if (this.#state.status === ConnectionState.Connected) {
      this.#destroyServerClient();
    }

    const config = 'config' in this.#state ? this.#state.config : this.#serverInfo.config;

    this.#setState({
      status: ConnectionState.Failed,
      config,
      error: McpError.connectionFailed(this.#serverName, error || reason),
      failedAt: new Date(),
    });
  }

  #createServerClient(): void {
    if (this.#serverClient) {
      this.#logger.warn('Server client already exists, disposing old one');
      this.#destroyServerClient();
    }

    this.#serverClient = new McpClient(this.#sdkClient, this.#serverName, this.#logger);
  }

  #destroyServerClient(): void {
    if (this.#serverClient) {
      this.#serverClient.dispose();
      this.#serverClient = undefined;
    }
  }

  #setState(newState: ConnectionStateSnapshot): void {
    const oldStatus = this.#state.status;
    const newStatus = newState.status;

    this.#state = newState;
    this.#logger.debug(`State transition: ${oldStatus} → ${newStatus}`);

    if (oldStatus !== ConnectionState.Connected && newStatus === ConnectionState.Connected) {
      this.#createServerClient();
    } else if (oldStatus === ConnectionState.Connected && newStatus !== ConnectionState.Connected) {
      this.#destroyServerClient();
    }

    this.#updateAuthRegistrationFor(newStatus);
    this.#emitStateChange();
  }

  #emitStateChange(): void {
    this.#eventBus.emit('state_changed', this.#state);
  }

  #handleAuthFlowEvent = (event: AuthFlowEvent) => {
    if (event.serverName !== this.#serverName) {
      return;
    }

    this.#logger.debug(`Received auth flow event for server "${this.#serverName}":`, event);

    if (this.#state.status === ConnectionState.Authenticating) {
      this.#setState({
        ...this.#state,
        authUrl: event.authUrl,
      });
    } else {
      this.#pendingAuthFlowUrl = event.authUrl;
    }
  };

  #registerAuthHandler(): void {
    if (!this.#authRegistered) {
      this.#authFlowController.onAuthFlowStarted(this.#handleAuthFlowEvent);
      this.#authFinalizerRegistry.registerAuthFinalizer(this.#serverName, this);
      this.#authRegistered = true;
      this.#logger.debug('Auth handler registered');
    }
  }

  #unregisterAuthHandler(): void {
    if (this.#authRegistered) {
      this.#authFlowController.offAuthFlowStarted(this.#handleAuthFlowEvent);
      this.#authFinalizerRegistry.unregisterAuthFinalizer(this.#serverName);
      this.#authRegistered = false;
      this.#logger.debug('Auth handler unregistered');
    }
  }

  #updateAuthRegistrationFor(status: ConnectionState) {
    if (status === ConnectionState.Authenticating) {
      this.#registerAuthHandler();
    } else if (status === ConnectionState.Connected || status === ConnectionState.Failed) {
      this.#unregisterAuthHandler();
    }
  }

  #swapToNewTransport(newTransport: Transport): void {
    this.#transportDisposables.dispose();
    this.#transport.close().catch(() => {});
    this.#transport = newTransport;
    this.#setupConnectionMonitoring();
  }

  #connectNewTransport(newTransport: Transport): ResultAsync<Transport, McpError> {
    this.#logger.debug('Connecting SDK client to new transport');
    return ResultAsync.fromPromise(this.#sdkClient.connect(newTransport), (e) =>
      McpError.connectionFailed(this.#serverName, e),
    ).map(() => newTransport);
  }

  #handleAuthSuccess(newTransport: Transport): void {
    this.#swapToNewTransport(newTransport);
    this.#setState({
      status: ConnectionState.Connected,
      config: this.#serverInfo.config,
      connectedAt: new Date(),
    });

    this.#logger.info('Authentication complete');
  }

  #handleAuthFailure(error: McpError): void {
    this.#setState({
      status: ConnectionState.Failed,
      config: this.#serverInfo.config,
      error,
      failedAt: new Date(),
    });
    this.#logger.error(`Authentication failed - error="${error.message}"`, error);
  }
}
