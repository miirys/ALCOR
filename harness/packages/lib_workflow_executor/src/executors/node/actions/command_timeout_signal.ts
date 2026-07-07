import { commandTimedOutMessage } from '../../../api/workflow_command_service';

export class CommandTimeoutSignal {
  #controller: AbortController;

  #timerId: NodeJS.Timeout;

  constructor(timeoutSeconds: number) {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error(`Invalid timeout: ${timeoutSeconds}`);
    }

    this.#controller = new AbortController();
    this.#timerId = setTimeout(() => {
      this.#controller.abort(new Error(commandTimedOutMessage(timeoutSeconds)));
    }, timeoutSeconds * 1000);
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  clear(): void {
    clearTimeout(this.#timerId);
  }
}
