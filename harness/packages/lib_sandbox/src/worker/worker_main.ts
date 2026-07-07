import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node';
import { DefaultLogger, LOG_LEVEL, type LogLevel, type LogWriter } from '@gitlab-org/logging';
import { DirectActionExecutor } from '@gitlab-org/workflow-executor';
import type { GenerateTokenResponse } from '@gitlab-org/workflow-executor';
import { DefaultFileStateTracker } from '@gitlab-org/workflow-executor/node';
import type { WorkflowActionContext, WorkflowAction } from '@gitlab-org/workflow-executor/node';
import { URI } from 'vscode-uri';
import { ZodError } from 'zod';
import {
  ExecuteActionRequest,
  CancelActionNotification,
  WorkerReadyNotification,
  WorkerShutdownNotification,
  WorkerActionRequestSchema,
  type WorkerActionRequest,
  type WorkerActionResponse,
} from '../worker_rpc';
import { createWorkerHandlers } from './create_worker_handlers';

const deriveWorkspaceFolderUri = (path: string): string => URI.file(path).toString();

export function setupWorkerRpc(connection: MessageConnection): void {
  // Logger writes to stderr — stdout is reserved for JSON-RPC communication
  const stderrLogWriter: LogWriter = {
    write(msg: string) {
      process.stderr.write(`${msg}\n`);
    },
  };

  const logLevelValues = Object.values(LOG_LEVEL) as string[];
  const envLogLevel = process.env.LOG_LEVEL;
  const logLevel: LogLevel = logLevelValues.includes(envLogLevel ?? '')
    ? (envLogLevel as LogLevel)
    : LOG_LEVEL.INFO;

  const logger = new DefaultLogger(stderrLogWriter, { logLevel });
  const handlers = createWorkerHandlers(logger);
  logger.debug(`Worker created ${handlers.length} action handlers`);
  const executor = new DirectActionExecutor(handlers, logger);
  const fileStateTracker = new DefaultFileStateTracker();
  const inFlightRequests = new Map<string, AbortController>();

  connection.onRequest(
    ExecuteActionRequest.methodName,
    async (params: WorkerActionRequest): Promise<WorkerActionResponse> => {
      try {
        WorkerActionRequestSchema.parse(params);
      } catch (err) {
        if (err instanceof ZodError) {
          return { response: '', error: `Invalid action request: ${err.message}` };
        }
        throw err;
      }

      const { requestID } = params.action as Record<string, unknown>;
      if (typeof requestID !== 'string' || requestID === '') {
        return { response: '', error: 'Action missing requestID' };
      }

      logger.debug(`Executing action requestID=${requestID}`);

      const existing = inFlightRequests.get(requestID);
      if (existing) {
        existing.abort();
      }

      const abortController = new AbortController();
      inFlightRequests.set(requestID, abortController);

      try {
        const actionContext: WorkflowActionContext = {
          workspaceFolderPath: params.context.workspaceFolderPath,
          workspaceFolderUri:
            params.context.workspaceFolderUri ??
            deriveWorkspaceFolderUri(params.context.workspaceFolderPath),
          workflowId: params.context.workflowId,
          workflowToken: {
            gitlab_rails: {
              base_url: params.context.gitlabBaseUrl,
              token: params.context.gitlabToken,
              token_expires_at: '',
            },
            duo_workflow_service: {
              base_url: '',
              token: '',
              secure: false,
            },
          } as GenerateTokenResponse,
          fileStateTracker,
          abortSignal: abortController.signal,
        };

        return await executor.execute(params.action as unknown as WorkflowAction, actionContext);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { response: '', error };
      } finally {
        inFlightRequests.delete(requestID);
      }
    },
  );

  connection.onNotification(
    CancelActionNotification.methodName,
    (params: { requestID: string }) => {
      logger.debug(`Cancel requested for requestID=${params.requestID}`);
      const controller = inFlightRequests.get(params.requestID);
      if (controller) {
        controller.abort();
      }
    },
  );

  connection.onNotification(WorkerShutdownNotification.methodName, () => {
    logger.debug('Shutdown requested, disposing worker');
    executor.dispose();
    connection.dispose();
    setImmediate(() => process.exit(0));
  });

  connection.listen();
  connection.sendNotification(WorkerReadyNotification.methodName).catch((err) => {
    logger.error('Failed to send ready notification', err);
  });
  logger.debug('Worker ready, listening for requests');
}

// Embedded-worker registration.
//
// When this module is part of a binary that can re-spawn itself as a sandbox
// worker (the LS / CLI single-binary distributions), importing this module
// from the main entry registers the binary as worker-capable.
// DefaultWorkerProcessManager checks `isEmbeddedWorkerAvailable()` to decide whether
// to re-exec `process.execPath` (single-binary mode) or look for a sibling
// `sandbox_worker.js` next to the main script (npm/esbuild distribution).
//
// Symbol.for is used so the flag survives multiple module copies that bundlers
// occasionally produce.
const EMBEDDED_WORKER_FLAG = Symbol.for('gitlab.lsp.embedded-sandbox-worker');
(globalThis as Record<symbol, unknown>)[EMBEDDED_WORKER_FLAG] = true;

export function isEmbeddedWorkerAvailable(): boolean {
  return (globalThis as Record<symbol, unknown>)[EMBEDDED_WORKER_FLAG] === true;
}

// Bootstrap: runs when this file is executed as a standalone worker process.
// The GITLAB_SANDBOX_WORKER env var is set by DefaultWorkerProcessManager.#spawnWorker()
// to distinguish bundled entry-point execution from test imports (where
// setupWorkerRpc is called directly with a mock connection).
// In the bundled sandbox_worker.js, require.main === module doesn't work
// because Bun emits ESM, so we rely on the env var instead.
if (process.env.GITLAB_SANDBOX_WORKER === 'true') {
  const connection = createMessageConnection(
    new StreamMessageReader(process.stdin),
    new StreamMessageWriter(process.stdout),
  );
  setupWorkerRpc(connection);
}
