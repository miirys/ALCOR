import { readFile } from 'node:fs/promises';
import { WorkflowStatusCode } from '@gitlab-lsp/workflow-api';
import WebSocket from 'isomorphic-ws';
import { v4 as uuid4 } from 'uuid';
import { type Logger, withPrefix } from '@gitlab-org/logging';
import {
  ensureEndsWithSlash,
  getLanguageServerVersion,
  InstanceInfo,
  isBunRuntime,
} from '@gitlab-org/core';
import type { ClientEvent } from '@gitlab-org/duo-workflow-service';
import type { IHttpAgentOptions, ITelemetryOptions } from '@gitlab-org/config';
import {
  getDroppedOptionsWarnings,
  toIsomorphicWsOptions,
  type WebSocketConnectionOptions,
} from '@gitlab-org/fetch';
import type { ClientSslConfig, WorkflowMetadata, WorkflowClient, WorkflowStream } from './types';
import { WebSocketWorkflowStream } from './websocket_workflow_stream';
import { mapClientErrorToUserFacingStatusCode } from './errors';

const CONNECTION_TIMEOUT_MS = 15000;

export type WebSocketConnectionConfig = {
  gitlabInstanceUrl: URL;
  token: string;
} & WebSocketConnectionOptions;

export type WebSocketWorkflowOptions = {
  workflowDefinition?: string;
  aiCatalogItemVersionId?: number;
};

export class WebSocketWorkflowClient implements WorkflowClient {
  #logger: Logger;

  #connectionDetails: WebSocketConnectionConfig;

  #instanceInfo?: InstanceInfo;

  #socket: WebSocket | null = null;

  #stream: WebSocketWorkflowStream | null = null;

  #socketClientOptions: Promise<WebSocket.ClientOptions>;

  #correlationId: string;

  #url: string;

  #agentPlatformFeatureSettingName?: string;

  #langsmithTrace?: string;

  #telemetry?: ITelemetryOptions;

  #heartbeatInterval?: NodeJS.Timeout;

  #heartbeatIntervalMs = 60 * 1000; // 60 seconds

  constructor(
    logger: Logger,
    sslConfig: ClientSslConfig,
    connectionDetails: WebSocketConnectionConfig,
    workflowMetadata: Partial<WorkflowMetadata>,
    instanceInfo?: InstanceInfo,
    telemetry?: ITelemetryOptions,
    agentPlatformFeatureSettingName?: string,
    workflowOptions?: WebSocketWorkflowOptions,
    langsmithTrace?: string,
  ) {
    this.#logger = withPrefix(logger, '[WebSocketWorkflowClient]');
    this.#connectionDetails = connectionDetails;
    this.#instanceInfo = instanceInfo;
    this.#telemetry = telemetry;
    this.#agentPlatformFeatureSettingName = agentPlatformFeatureSettingName;
    this.#langsmithTrace = langsmithTrace;

    if (langsmithTrace) {
      this.#logger.debug(`Adding langsmith-trace header: ${langsmithTrace}`);
    }

    this.#correlationId = uuid4();
    this.#socketClientOptions = this.#createConnectionMetadata(
      this.#correlationId,
      sslConfig,
      workflowMetadata,
    );
    this.#url = this.#buildWebSocketUrl(connectionDetails, workflowMetadata, workflowOptions);
  }

  async disposeAsync(): Promise<void> {
    this.#stopHeartbeat();

    if (this.#socket) {
      if (this.#socket.readyState === WebSocket.OPEN) {
        this.#socket.close(1000);
      } else if (this.#socket.readyState === WebSocket.CONNECTING) {
        this.#logger.debug('WebSocket still connecting — terminating');
        this.#socket.terminate();
      }
      this.#socket = null;
    }

    if (this.#stream) {
      this.#stream = null;
    }
  }

  getResponseByteSize(clientEvent: ClientEvent): number {
    return Buffer.byteLength(JSON.stringify(clientEvent), 'utf8');
  }

  getCorrelationId(): string {
    return this.#correlationId;
  }

  async executeWorkflow(): Promise<WorkflowStream> {
    const url = this.#url;
    this.#logger.debug(`Connecting to: ${url}`);

    const clientOptions = await this.#socketClientOptions;

    this.#socket = new WebSocket(url, clientOptions);
    this.#stream = new WebSocketWorkflowStream(this.#socket, this.#logger, this.#instanceInfo);

    const socketIsOpen = new Promise<void>((resolve, reject) => {
      if (!this.#stream) {
        reject(
          new Error(
            'Unexpected error - websocketWorkflowStream was somehow null. This should be impossible because we just created the stream.',
          ),
        );
        return;
      }

      const timeoutId = setTimeout(() => {
        this.#logger.error(`WebSocket connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
        if (this.#stream) {
          this.#stream.removeListener('open', onOpen);
          this.#stream.removeListener('error', onError);
        }
        reject(WorkflowStatusCode.SERVICE_CONNECTION_FAILED);
      }, CONNECTION_TIMEOUT_MS);

      const onOpen = () => {
        clearTimeout(timeoutId);
        if (this.#stream) {
          this.#stream.removeListener('error', onError);
          resolve();
        }
      };

      const onError = (error: Error) => {
        clearTimeout(timeoutId);
        this.#logger.error('WebSocket connection failed', error);
        if (this.#stream) {
          this.#stream.removeListener('open', onOpen);
        }
        // Surface specific failures (e.g. a 401/403 upgrade rejection →
        // AUTH_TOKEN_ERROR) instead of a generic connection error.
        const mappedStatusCode = mapClientErrorToUserFacingStatusCode(error);
        reject(
          mappedStatusCode === WorkflowStatusCode.GENERAL_FAILURE
            ? WorkflowStatusCode.SERVICE_CONNECTION_FAILED
            : mappedStatusCode,
        );
      };

      this.#stream.once('open', onOpen);
      this.#stream.once('error', onError);
    });

    // We don't return until the socket has successfully opened, equivalent to grpc stream
    await socketIsOpen;

    if (this.#stream) {
      this.#startHeartbeat(this.#stream);
    }

    return this.#stream;
  }

  // This 60s heartbeat already PREVENTS the idle-socket drop half of the
  // "auth breaks after ~2 min idle" bug (Patch B.3): it writes periodic
  // traffic so intermediaries don't close the idle workflow socket.
  //
  // TODO(patch-B.3 / idle-resume): the heartbeat only SENDS; it does not
  // detect a dead peer or recover. To fully close B.3, track heartbeat
  // liveness (e.g. server acks / a read-side deadline) and, after N missed
  // in a row, `#socket.close()` then reconnect and resume from the last
  // checkpoint id so the UI never sees a reset. This touches
  // WebSocketWorkflowStream lifecycle + the resume protocol, hence deferred.
  // Tracking: see report FU3.
  #startHeartbeat(stream: WebSocketWorkflowStream): void {
    // Set up listeners to stop heartbeat when stream ends or errors
    stream.on('error', () => this.#stopHeartbeat());
    stream.on('end', () => this.#stopHeartbeat());

    this.#heartbeatInterval = setInterval(() => {
      this.#sendHeartbeat();
    }, this.#heartbeatIntervalMs);

    this.#logger.debug(
      `Heartbeat started with ${Math.floor(this.#heartbeatIntervalMs / 1000)}s interval`,
    );
  }

  #sendHeartbeat(): void {
    if (!this.#stream) return;

    const heartbeatEvent: ClientEvent = {
      heartbeat: {
        timestamp: Date.now(),
      },
    };

    try {
      const success = this.#stream.write(heartbeatEvent);
      if (!success) {
        this.#logger.warn(
          'Heartbeat write returned "false" - this could indicate stream backpressure, network congestion, slow server processing, or a closed stream.',
        );
      } else {
        this.#logger.debug(`Heartbeat sent: ${heartbeatEvent.heartbeat?.timestamp}`);
      }
    } catch (error) {
      this.#logger.error('Failed to send heartbeat', error);
    }
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
      this.#heartbeatInterval = undefined;
      this.#logger.debug('Heartbeat stopped');
    }
  }

  #isSecure(): boolean {
    return this.#connectionDetails.gitlabInstanceUrl.protocol === 'https:';
  }

  #buildWebSocketUrl(
    connectionDetails: WebSocketConnectionConfig,
    workflowMetadata: Partial<WorkflowMetadata>,
    workflowOptions?: WebSocketWorkflowOptions,
  ): string {
    const baseUrl = new URL(ensureEndsWithSlash(connectionDetails.gitlabInstanceUrl));
    const url = new URL('./api/v4/ai/duo_workflows/ws', baseUrl);
    url.protocol = this.#isSecure() ? 'wss:' : 'ws:';
    if (workflowMetadata.projectId) {
      url.searchParams.set('project_id', workflowMetadata.projectId.toString());
    }
    if (workflowMetadata.namespaceId) {
      url.searchParams.set('namespace_id', workflowMetadata.namespaceId.toString());
    }
    if (workflowMetadata.rootNamespaceId) {
      url.searchParams.set('root_namespace_id', workflowMetadata.rootNamespaceId.toString());
    }
    if (workflowMetadata.selectedModelIdentifier) {
      url.searchParams.set(
        'user_selected_model_identifier',
        workflowMetadata.selectedModelIdentifier,
      );
    }
    if (workflowOptions?.workflowDefinition) {
      url.searchParams.set('workflow_definition', workflowOptions.workflowDefinition);
    }
    if (workflowOptions?.aiCatalogItemVersionId) {
      url.searchParams.set(
        'ai_catalog_item_version_id',
        String(workflowOptions.aiCatalogItemVersionId),
      );
    }

    return url.toString();
  }

  async #getSslOptions(sslConfig: ClientSslConfig): Promise<Partial<WebSocket.ClientOptions>> {
    const { httpAgentOptions, ignoreCertificateErrors } = sslConfig;
    const certFiles = await this.#loadCertificateFiles(httpAgentOptions);

    return {
      rejectUnauthorized: ignoreCertificateErrors ? false : undefined,
      ca: certFiles.ca || undefined,
      cert: certFiles.cert || undefined,
      key: certFiles.certKey || undefined,
    };
  }

  #getUserAgent(): string {
    const ideName = (this.#telemetry?.ide?.name ?? 'unknown').replace(/\s+/g, '-').toLowerCase();
    const ideVersion = this.#telemetry?.ide?.version ?? 'unknown';
    const extensionName = (this.#telemetry?.extension?.name ?? 'unknown')
      .replace(/\s+/g, '-')
      .toLowerCase();
    const extensionVersion = this.#telemetry?.extension?.version ?? 'unknown';
    const languageServerVersion = getLanguageServerVersion() ?? 'unknown';

    return `${ideName}/${ideVersion} ${extensionName}/${extensionVersion} gitlab-language-server/${languageServerVersion}`;
  }

  async #loadCertificateFiles(httpAgentOptions: IHttpAgentOptions | undefined): Promise<{
    ca?: Buffer;
    cert?: Buffer;
    certKey?: Buffer;
  }> {
    const { ca, cert, certKey } = httpAgentOptions || {};
    const result: { ca?: Buffer; cert?: Buffer; certKey?: Buffer } = {};

    try {
      if (ca) {
        result.ca = await readFile(ca);
      }

      if (cert) {
        result.cert = await readFile(cert);
      }

      if (certKey) {
        result.certKey = await readFile(certKey);
      }
    } catch (error) {
      this.#logger.error('Failed to load custom certificates', error);
    }

    return result;
  }

  async #createConnectionMetadata(
    correlationId: string,
    sslConfig: ClientSslConfig,
    workflowMetadata: Partial<WorkflowMetadata>,
  ): Promise<WebSocket.ClientOptions> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#connectionDetails.token}`,
      'x-request-id': correlationId,
      'x-gitlab-language-server-version': getLanguageServerVersion(),
      'user-agent': this.#getUserAgent(),
      origin: this.#connectionDetails.gitlabInstanceUrl.origin,
    };

    if (workflowMetadata.projectId) {
      headers['x-gitlab-project-id'] = workflowMetadata.projectId.toString();
    }
    if (workflowMetadata.namespaceId) {
      headers['x-gitlab-namespace-id'] = workflowMetadata.namespaceId.toString();
    }
    if (workflowMetadata.rootNamespaceId) {
      headers['x-gitlab-root-namespace-id'] = workflowMetadata.rootNamespaceId.toString();
    }
    if (this.#agentPlatformFeatureSettingName) {
      headers['x-gitlab-agent-platform-feature-setting-name'] =
        this.#agentPlatformFeatureSettingName;
    }

    if (this.#telemetry?.ide) {
      headers['x-gitlab-client-name'] = this.#telemetry.ide.name;
      headers['x-gitlab-client-version'] = this.#telemetry.ide.version;
    }

    headers['x-gitlab-client-type'] = 'node-websocket';

    if (this.#langsmithTrace) {
      headers['langsmith-trace'] = this.#langsmithTrace;
    }

    const connectionMetadata: WebSocket.ClientOptions = {
      headers,
    };

    // `#getSslOptions` spreads Node-style flat CA / cert / key options. Bun
    // ignores these flat keys and passing them suppresses its
    // `NODE_EXTRA_CA_CERTS` trust handling, so on Bun the TLS material is
    // routed through `toIsomorphicWsOptions` below instead.
    if (this.#isSecure() && !isBunRuntime()) {
      const sslOptions = await this.#getSslOptions(sslConfig);
      Object.assign(connectionMetadata, sslOptions);
    }

    const { proxyUrl, tls, agent } = this.#connectionDetails;
    for (const warning of getDroppedOptionsWarnings({ proxyUrl, tls, agent })) {
      this.#logger.warn(warning);
    }
    const transportOptions = toIsomorphicWsOptions({ proxyUrl, tls, agent });
    if (Object.keys(transportOptions).length > 0) {
      this.#logger.debug(
        `Applying WebSocket transport options: ${Object.keys(transportOptions).join(', ')}`,
      );
      Object.assign(connectionMetadata, transportOptions);
    }

    return connectionMetadata;
  }
}
