import Emitter from 'events';
import { Disposable } from '@gitlab-org/disposable';

export type EventListener<T> = (e: T, signal: AbortSignal) => unknown;

export type Event<T> = (listener: EventListener<T>, thisArg?: unknown) => Disposable;

/** This interface exactly copies the vscode.EventEmitter class */
export interface EventEmitter<T> {
  event: Event<T>;
  fire(data: T): void;
  dispose(): void;
}

/**
 * This is an arbitrary name. The node event emitter supports multiple
 * types of events per emitter but we need only one, so we hardcode it.
 */
const EVENT_NAME = 'EVENT';

/**
 * This is a  simplified implementation of the vscode.EventEmitter.
 */
export class EventEmitterImpl<T> implements EventEmitter<T> {
  #abortController: AbortController | undefined;

  eventEmitter: Emitter = new Emitter();

  event: Event<T> = (listener, thisArgs = {}) => {
    const nodeListener = (e: T, signal: AbortSignal) => listener.bind(thisArgs)(e, signal);
    this.eventEmitter.on(EVENT_NAME, nodeListener);
    return {
      dispose: () => this.eventEmitter.removeListener(EVENT_NAME, nodeListener),
    };
  };

  fire(data: T): void {
    if (this.#abortController) {
      this.#abortController.abort();
    }
    this.#abortController = new AbortController();
    this.eventEmitter.emit(EVENT_NAME, data, this.#abortController.signal);
  }

  dispose(): void {
    this.#abortController?.abort();
    this.eventEmitter.removeAllListeners();
  }
}
