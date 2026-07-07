import { Disposable } from '@gitlab-org/disposable';
import { EventEmitterImpl } from '../event_emitter';
import { CircuitBreaker } from './circuit_breaker';

/**
 * A circuit breaker that trips after a maximum number of attempts.
 */
export class MaxAttemptsCircuitBreaker implements CircuitBreaker {
  readonly #maxAttempts: number;

  #attempts = 0;

  readonly #innerBreaker: CircuitBreaker;

  #maxAttemptsEventEmitter = new EventEmitterImpl<void>();

  constructor(circuitBreaker: CircuitBreaker, maxAttempts: number) {
    this.#maxAttempts = maxAttempts;
    this.#innerBreaker = circuitBreaker;
  }

  error(): void {
    this.#attempts += 1;
    if (this.#reachedMaxAttempts) {
      this.#maxAttemptsEventEmitter.fire();
      return;
    }
    this.#innerBreaker.error();
  }

  success(): void {
    this.#attempts = 0;
    this.#innerBreaker.success();
  }

  onOpen(listener: () => void): Disposable {
    return this.#innerBreaker.onOpen(listener);
  }

  onClose(listener: () => void): Disposable {
    return this.#innerBreaker.onClose(listener);
  }

  get #reachedMaxAttempts() {
    return this.#attempts >= this.#maxAttempts;
  }

  onReachedMaxAttempts = this.#maxAttemptsEventEmitter.event;

  isOpen(): boolean {
    return this.#reachedMaxAttempts || this.#innerBreaker.isOpen();
  }

  /**
   * Resets the circuit breaker to its initial state.
   */
  reset(): void {
    this.#attempts = 0;
    this.#innerBreaker.success();
  }
}
