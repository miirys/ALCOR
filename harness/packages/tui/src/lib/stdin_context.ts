import { Disposable } from '@gitlab/needle';
import { createContext } from 'react';

export class StdInSubscriptionManager implements Disposable {
  #subscriptions: Set<(stream: Buffer<ArrayBufferLike>) => void> = new Set();

  dispose(): void {
    process.stdin.off('data', this.#sendEvents);
    this.#subscriptions.clear();
  }

  subscribe(handler: (stream: Buffer<ArrayBufferLike>) => void) {
    this.#subscriptions.add(handler);
  }

  unsubscribe(handler: (stream: Buffer<ArrayBufferLike>) => void) {
    this.#subscriptions.delete(handler);
  }

  startStdinListening() {
    process.stdin.on('data', this.#sendEvents);
  }

  /**
   * Manually emit stdin data to all subscribers.
   * Used for testing purposes.
   */
  emitData(stream: Buffer) {
    this.#sendEvents(stream);
  }

  #sendEvents = (stream: Buffer<ArrayBufferLike>) => {
    for (const handler of this.#subscriptions.values()) {
      handler(stream);
    }
  };
}

export const StdinContext = createContext(new StdInSubscriptionManager());
