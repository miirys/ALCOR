import { Cable, ReasonError } from '@anycable/core';
import { withPrefix, Logger } from '@gitlab-org/logging';
import {
  DuoWorkflowEvent,
  DuoWorkflowEventConnection,
  GET_WORKFLOW_EVENTS_QUERY,
  generateGraphqlWorkflowId,
  getLatestEvent,
} from '@gitlab-lsp/workflow-api';
import {
  FixedTimeCircuitBreaker,
  GitLabApiService,
  MaxAttemptsCircuitBreaker,
} from '@gitlab-org/core';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { WorkflowEventsChannel } from './graphql/workflow_events_response_channel';

export interface WorkflowConnection {
  subscribeToUpdates(
    messageCallback: (message: DuoWorkflowEvent) => void,
    updateWorkflowCallback: (workflowId: string) => void,
    workflowId: string,
  ): Promise<void>;
  disconnectCable(): void;
}

export const WorkflowConnection = createInterfaceId<WorkflowConnection>('WorkflowConnection');

@Injectable(WorkflowConnection, [GitLabApiService, Logger])
export class DefaultWorkflowConnection {
  #cable: Cable | undefined;

  #pollingIntervalRef: NodeJS.Timeout | undefined;

  #prefixedLogger: Logger;

  #listeners: Disposable[] = [];

  #api: GitLabApiService;

  #circuitBreaker: MaxAttemptsCircuitBreaker;

  constructor(api: GitLabApiService, logger: Logger) {
    this.#api = api;
    this.#prefixedLogger = withPrefix(logger, '[Workflow Connection]');
    this.#circuitBreaker = new MaxAttemptsCircuitBreaker(new FixedTimeCircuitBreaker(1, 3000), 3);
  }

  #stopPolling() {
    this.#prefixedLogger.info('Stopping polling');
    clearInterval(this.#pollingIntervalRef);
    this.#pollingIntervalRef = undefined;
  }

  async pollForUpdates(messageCallback: (message: DuoWorkflowEvent) => void, workflowId: string) {
    if (this.#pollingIntervalRef) {
      this.#stopPolling();
    }

    this.#pollingIntervalRef = setInterval(async () => {
      try {
        const response: DuoWorkflowEventConnection = await this.#api.fetchFromApi({
          type: 'graphql',
          query: GET_WORKFLOW_EVENTS_QUERY,
          variables: { workflowId: generateGraphqlWorkflowId(workflowId) },
        });

        this.#prefixedLogger.info('Polling for updates');

        const latestEvent = getLatestEvent(response);

        if (latestEvent) messageCallback(latestEvent);
      } catch (e) {
        this.#prefixedLogger.error(JSON.stringify(e));
        this.#stopPolling();
        this.#prefixedLogger.warn('Failed to poll for updates');
      }
    }, 5000);
  }

  async handleRetryConnection(
    messageCallback: (message: DuoWorkflowEvent) => void,
    workflowId: string,
  ) {
    this.#cable = undefined;
    this.#prefixedLogger.info('Attempting to reconnect...');
    try {
      await this.#connect(messageCallback, workflowId);
    } catch (e) {
      this.#prefixedLogger.error('Failed to connect to cable', e);
      this.#circuitBreaker.error();
    }
  }

  disconnectCable() {
    for (const listener of this.#listeners) {
      listener.dispose();
    }
    this.#listeners = [];

    if (this.#cable) {
      this.#cable.disconnect();
      this.#cable = undefined;
    }

    if (this.#pollingIntervalRef) {
      this.#stopPolling();
    }

    this.#circuitBreaker.success(); // Reset circuit breaker state on clean disconnect
  }

  async #connect(messageCallback: (message: DuoWorkflowEvent) => void, workflowId: string) {
    try {
      const graphqlId = generateGraphqlWorkflowId(workflowId);

      const channel = new WorkflowEventsChannel({
        workflowId: graphqlId,
      });

      const currentCable = await this.#api.connectToCable();
      this.#cable = currentCable;

      channel.on('checkpoint', async (msg) => {
        await messageCallback(msg);
      });

      currentCable.subscribe(channel);

      this.#prefixedLogger.info('Connection successful.');

      return currentCable;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to connect to Action Cable: ${errorMsg}`);
    }
  }

  async subscribeToUpdates(
    messageCallback: (message: DuoWorkflowEvent) => void,
    updateWorkflowCallback: (workflowId: string) => void,
    workflowId: string,
  ) {
    try {
      this.#circuitBreaker.onReachedMaxAttempts(async () => {
        this.#prefixedLogger.error('Failed to reconnect. Falling back to polling.');
        updateWorkflowCallback(workflowId);
        await this.pollForUpdates(messageCallback, workflowId);
      });

      this.#circuitBreaker.onClose(async () => {
        updateWorkflowCallback(workflowId);
        await this.handleRetryConnection(messageCallback, workflowId);
      });

      if (this.#cable) {
        this.#prefixedLogger.warn(
          'A cable was already present. Disconnecting before subscribing again.',
        );
        this.disconnectCable();
      }

      const currentCable = await this.#connect(messageCallback, workflowId);

      this.#circuitBreaker.success();

      this.#listeners.push({
        dispose: currentCable.on('disconnect', async (event?: ReasonError) => {
          this.#prefixedLogger.error(`Disconnected from Action Cable. Error: ${event?.message}`);
          this.#circuitBreaker.error();
        }),
      });

      this.#listeners.push({
        dispose: currentCable.on('close', async (event?: ReasonError) => {
          this.#prefixedLogger.error(`Action Cable closed. Error: ${event?.message}`);
          this.#circuitBreaker.error();
        }),
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.#prefixedLogger.error(`Subscription to Action Cable failed with error ${errorMsg}`);
      this.#circuitBreaker.error();
    }
  }
}
