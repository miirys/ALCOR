import {
  declareNotification,
  declareRequest,
  RpcMessageDefinition,
  RpcMessageDefinitionSource,
  ServerToClientRpcMessageDefinitionSource,
} from '@gitlab-org/rpc';
import { Injectable } from '@gitlab/needle';
import { z } from 'zod';

export const runCommandRequest = declareRequest('$/gitlab/runCommand')
  .withParams(
    z.object({
      workflowId: z.string(),
      workspaceFolderPath: z.string(),
      command: z.string(),
      silent: z.boolean(),
      args: z.array(z.string()).optional(),
    }),
  )
  .withResponse(z.object({ output: z.string(), exitCode: z.union([z.number(), z.undefined()]) }))
  .build();

export const cancelRunningCommandNotification = declareNotification('$/gitlab/cancelRunningCommand')
  .withParams(z.object({ workflowId: z.string() }))
  .build();

export const showDocumentRequest = declareRequest('window/showDocument')
  .withParams(
    z.object({
      uri: z.string().url(),
      external: z.boolean().optional(),
      takeFocus: z.boolean().optional(),
    }),
  )
  .build();

@Injectable(ServerToClientRpcMessageDefinitionSource, [])
export class WorkflowRpcMessages implements RpcMessageDefinitionSource {
  getMessageDefinitions(): RpcMessageDefinition[] {
    return [runCommandRequest, cancelRunningCommandNotification, showDocumentRequest];
  }
}
