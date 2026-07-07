import {
  DuoWorkflowEvent,
  generateErrorMessageFromStatusCode,
  WorkflowExecutorError,
  WorkflowStatusCode,
  WorkflowSuccessCode,
} from '@gitlab-lsp/workflow-api';

type InternalStreamClosureEvent = {
  type: 'completion';
  statusCode: typeof WorkflowSuccessCode | WorkflowStatusCode;
};

/**
 * Simple EventQueue that converts callback-based events to async iteration.
 */
export class EventQueue {
  #events: (DuoWorkflowEvent | WorkflowExecutorError | InternalStreamClosureEvent)[] = [];

  #waiters: ((
    event: DuoWorkflowEvent | WorkflowExecutorError | InternalStreamClosureEvent,
  ) => void)[] = [];

  push(event: DuoWorkflowEvent | WorkflowExecutorError | InternalStreamClosureEvent): void {
    if (this.#waiters.length > 0) {
      // Someone is waiting for an event - wake them up immediately
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const waiter = this.#waiters.shift()!;
      waiter(event);
    } else {
      // No one waiting - buffer the event
      this.#events.push(event);
    }
  }

  async #next(): Promise<DuoWorkflowEvent | WorkflowExecutorError | InternalStreamClosureEvent> {
    if (this.#events.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.#events.shift()!;
    }

    return new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<
    DuoWorkflowEvent | WorkflowExecutorError,
    void,
    unknown
  > {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const event = await this.#next();

      if (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        event.type === 'completion'
      ) {
        if (event.statusCode !== WorkflowSuccessCode) {
          yield new WorkflowExecutorError(
            generateErrorMessageFromStatusCode(event.statusCode),
            event.statusCode,
          );
        }
        return;
      }

      yield event as DuoWorkflowEvent | WorkflowExecutorError;
    }
  }
}
