import { EventEmitter } from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import {
  FixedTimeCircuitBreaker,
  CircuitBreaker,
  SUGGESTIONS_API_ERROR,
  NetworkError,
  AbortError as CoreAbortError,
} from '@gitlab-org/core';
import { isAbortError as isResiliencyAbortError } from '@gitlab-org/resiliency';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { log } from '../log';

interface ApiErrorStateCheckChangedEventData extends StateCheckChangedEventData {
  error?: unknown;
}

export interface SuggestionApiErrorCheck
  extends StateCheck<typeof SUGGESTIONS_API_ERROR, ApiErrorStateCheckChangedEventData>,
    CircuitBreaker {}

export const SuggestionApiErrorCheck = createInterfaceId<SuggestionApiErrorCheck>(
  'SuggestionCircuitBreakerCheck',
);

@Injectable(SuggestionApiErrorCheck, [])
export class DefaultSuggestionApiErrorCheck implements SuggestionApiErrorCheck {
  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #circuitBreaker = new FixedTimeCircuitBreaker();

  #error: unknown;

  constructor() {
    this.#subscriptions.push(
      this.#circuitBreaker.onOpen(this.#fireChange),
      this.#circuitBreaker.onClose(this.#fireChange),
    );
  }

  #fireChange = async () => {
    log.debug(`Code Suggestion API error check is  ${this.engaged ? 'engaged' : 'disengaged'}`);
    const data: ApiErrorStateCheckChangedEventData = {
      checkId: this.id,
      details: this.details,
      engaged: this.engaged,
      error: this.#error,
    };
    this.#stateEmitter.emit('change', data);
  };

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  get engaged() {
    return this.#circuitBreaker.isOpen();
  }

  id = SUGGESTIONS_API_ERROR;

  details = 'Error requesting suggestions from the API.';

  #isAbortError(error: unknown): boolean {
    if (isResiliencyAbortError(error)) {
      log.debug('Circuit breaker: Ignoring abort error from resiliency layer');
      return true;
    }

    if (error instanceof CoreAbortError) {
      log.debug('Circuit breaker: Ignoring abort error from core API layer');
      return true;
    }

    if (error instanceof NetworkError && isResiliencyAbortError(error.cause)) {
      log.debug('Circuit breaker: Ignoring abort error wrapped in NetworkError');
      return true;
    }

    return false;
  }

  error = (e?: unknown) => {
    this.#error = e;

    if (this.#isAbortError(e)) {
      return;
    }

    this.#circuitBreaker.error();
  };

  success = () => this.#circuitBreaker.success();

  isOpen = () => this.#circuitBreaker.isOpen();

  onOpen = (listener: () => void) => this.#circuitBreaker.onOpen(listener);

  onClose = (listener: () => void) => this.#circuitBreaker.onClose(listener);

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }
}
