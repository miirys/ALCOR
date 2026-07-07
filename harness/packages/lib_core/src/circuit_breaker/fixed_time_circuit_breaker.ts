import EventEmitter from 'events';
import { Disposable } from 'vscode-languageserver';
import {
  CIRCUIT_BREAK_INTERVAL_MS,
  CircuitBreaker,
  CircuitBreakerState,
  MAX_ERRORS_BEFORE_CIRCUIT_BREAK,
} from './circuit_breaker';

export class FixedTimeCircuitBreaker implements CircuitBreaker {
  #state: CircuitBreakerState = CircuitBreakerState.CLOSED;

  readonly #maxErrorsBeforeBreaking: number;

  readonly #breakTimeMs: number;

  #errorCount = 0;

  #eventEmitter = new EventEmitter();

  #timeoutId: NodeJS.Timeout | null = null;

  /**
   * @param name identifier of the circuit breaker that will appear in the logs
   * */
  constructor(
    maxErrorsBeforeBreaking: number = MAX_ERRORS_BEFORE_CIRCUIT_BREAK,
    breakTimeMs: number = CIRCUIT_BREAK_INTERVAL_MS,
  ) {
    this.#maxErrorsBeforeBreaking = maxErrorsBeforeBreaking;
    this.#breakTimeMs = breakTimeMs;
  }

  error() {
    this.#errorCount += 1;
    if (this.#errorCount >= this.#maxErrorsBeforeBreaking) {
      this.#open();
    }
  }

  #open() {
    this.#state = CircuitBreakerState.OPEN;
    this.#timeoutId = setTimeout(() => this.#close(), this.#breakTimeMs);
    this.#eventEmitter.emit('open');
  }

  isOpen() {
    return this.#state === CircuitBreakerState.OPEN;
  }

  #close() {
    if (this.#state === CircuitBreakerState.CLOSED) {
      return;
    }
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
    }
    this.#state = CircuitBreakerState.CLOSED;
    this.#eventEmitter.emit('close');
  }

  success() {
    this.#errorCount = 0;
    this.#close();
  }

  onOpen(listener: () => void): Disposable {
    this.#eventEmitter.on('open', listener);
    return { dispose: () => this.#eventEmitter.removeListener('open', listener) };
  }

  onClose(listener: () => void): Disposable {
    this.#eventEmitter.on('close', listener);
    return { dispose: () => this.#eventEmitter.removeListener('close', listener) };
  }
}
