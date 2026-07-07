import type { EventEmitter } from 'node:events';
import type { AsyncDisposable } from '@gitlab/needle';
import { type Action, ClientEvent } from '@gitlab-org/duo-workflow-service';
import type { IHttpAgentOptions } from '@gitlab-org/config';

export type WorkflowAction = Action;

export type ClientSslConfig = {
  httpAgentOptions?: IHttpAgentOptions;
  ignoreCertificateErrors?: boolean;
};

export type WorkflowMetadata = {
  projectId: string;
  namespaceId: string;
  rootNamespaceId: string;
  selectedModelIdentifier: string;
};

export interface WorkflowStream extends EventEmitter {
  write(data: ClientEvent): boolean;
  end(): void;
  on(event: 'data', listener: (action: WorkflowAction) => void | Promise<void>): this;
  on(event: 'error', listener: (error: Error) => void | Promise<void>): this;
  on(event: 'end', listener: () => void | Promise<void>): this;
}
export interface WorkflowClient extends AsyncDisposable {
  executeWorkflow(): Promise<WorkflowStream>;
  getResponseByteSize(clientEvent: ClientEvent): number;
  getCorrelationId(): string;
}
