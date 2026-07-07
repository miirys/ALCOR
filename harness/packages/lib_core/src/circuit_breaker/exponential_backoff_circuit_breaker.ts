import EventEmitter from 'events';
import { Disposable } from 'vscode-languageserver';
import { CircuitBreaker, CircuitBreakerState } from './circuit_breaker';

export const DEFAULT_INITIAL_BACKOFF_MS = 1000;
export const DEFAULT_MAX_BACKOFF_MS = 60000;
export const DEFAULT_BACKOFF_MULTIPLIER = 2;

export interface ExponentialBackoffCircuitBreakerOptions {
  maxErrorsBeforeBreaking?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
}

export class ExponentialBackoffCircuitBreaker implements CircuitBreaker {
  #state: CircuitBreakerState = CircuitBreakerState.CLOSED;

  readonly #initialBackoffMs: number;

  readonly #maxBackoffMs: number;

  readonly #backoffMultiplier: number;

  #errorCount = 0;

  #eventEmitter = new EventEmitter();

  #timeoutId: NodeJS.Timeout | null = null;

  constructor({
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
  }: ExponentialBackoffCircuitBreakerOptions = {}) {
    this.#initialBackoffMs = initialBackoffMs;
    this.#maxBackoffMs = maxBackoffMs;
    this.#backoffMultiplier = backoffMultiplier;
  }

  error() {
    this.#errorCount += 1;
    this.#open();
  }

  megaError() {
    this.#errorCount += 3;
    this.#open();
  }

  #open() {
    if (this.#state === CircuitBreakerState.OPEN) {
      return;
    }
    this.#state = CircuitBreakerState.OPEN;
    this.#timeoutId = setTimeout(() => this.#close(), this.#getBackoffTime());
    this.#eventEmitter.emit('open');
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

  isOpen() {
    return this.#state === CircuitBreakerState.OPEN;
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

  #getBackoffTime() {
    return Math.min(
      this.#initialBackoffMs * this.#backoffMultiplier ** (this.#errorCount - 1),
      this.#maxBackoffMs,
    );
  }
}
