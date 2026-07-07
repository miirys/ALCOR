import { z } from 'zod';
import { declareRequest, declareNotification } from '@gitlab-org/rpc';
import type { PlainTextResponse, HttpResponse } from '@gitlab-org/duo-workflow-service';

// Serialized context passed with each action to the worker.
// Contains everything the worker needs to execute without
// access to the LS's DI container.
// Note: gitlabToken is sent over JSON-RPC via vscode-jsonrpc. This is safe because:
// 1. vscode-jsonrpc trace defaults to Trace.Off
// 2. No logger/tracer is passed to createMessageConnection in WorkerProcessManager
// 3. Only the worker process (which we control) could send $/setTrace on this connection
// 4. The IDE client's LSP connection is completely separate
export const WorkerContextSchema = z.object({
  workspaceFolderPath: z.string(),
  workspaceFolderUri: z.string().optional(),
  workflowId: z.string(),
  gitlabBaseUrl: z.string(),
  gitlabToken: z.string(),
});

export type WorkerContext = z.infer<typeof WorkerContextSchema>;

export const PlainTextResponseSchema = z.object({
  response: z.string(),
  error: z.string(),
}) satisfies z.ZodType<PlainTextResponse>;

export const HttpResponseSchema = z.object({
  headers: z.record(z.string(), z.string()),
  statusCode: z.number(),
  body: z.string(),
  error: z.string(),
}) satisfies z.ZodType<HttpResponse>;

export const WorkerActionResponseSchema = z.union([PlainTextResponseSchema, HttpResponseSchema]);

export type WorkerActionResponse = z.infer<typeof WorkerActionResponseSchema>;

export const WorkerActionRequestSchema = z.object({
  action: z.record(z.string(), z.unknown()),
  context: WorkerContextSchema,
});

export type WorkerActionRequest = z.infer<typeof WorkerActionRequestSchema>;

// RPC definitions using @gitlab-org/rpc infrastructure
export const ExecuteActionRequest = declareRequest('$/worker/executeAction')
  .withParams(WorkerActionRequestSchema)
  .withResponse(WorkerActionResponseSchema)
  .build();

export const WorkerReadyNotification = declareNotification('$/worker/ready').build();

export const WorkerShutdownNotification = declareNotification('$/worker/shutdown').build();

export const CancelActionNotification = declareNotification('$/worker/cancelAction')
  .withParams(z.object({ requestID: z.string() }))
  .build();
