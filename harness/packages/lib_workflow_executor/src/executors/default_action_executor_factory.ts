import { collection, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ActionExecutor } from './action_executor';
import { ActionExecutorFactory } from './action_executor_factory';
import { DirectActionExecutor } from './direct_action_executor';
import { WorkflowActionHandler } from './node/actions';

@Injectable(ActionExecutorFactory, [Logger, collection(WorkflowActionHandler)])
export class DefaultActionExecutorFactory implements ActionExecutorFactory {
  #logger: Logger;

  #handlers: WorkflowActionHandler[];

  constructor(logger: Logger, handlers: WorkflowActionHandler[]) {
    this.#logger = withPrefix(logger, '[ActionExecutorFactory]');
    this.#handlers = handlers;
  }

  createExecutor(): ActionExecutor {
    this.#logger.debug('Creating DirectActionExecutor');
    return new DirectActionExecutor(this.#handlers, this.#logger);
  }
}
