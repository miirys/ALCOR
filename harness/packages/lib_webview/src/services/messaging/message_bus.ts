import { Disposable } from '@gitlab-org/disposable';

type Listener<T = unknown> = (data: T) => void;
type FilterFunction<T> = (data: T) => boolean;

interface Subscription<T> {
  listener: Listener<T>;
  filter?: FilterFunction<T>;
}

export class MessageBus<TMessageMap extends Record<string, unknown>> implements Disposable {
  #subscriptions = new Map<keyof TMessageMap, Set<Subscription<unknown>>>();

  subscribe<K extends keyof TMessageMap>(
    messageType: K,
    listener: Listener<TMessageMap[K]>,
    filter?: FilterFunction<TMessageMap[K]>,
  ): Disposable {
    const subscriptions = this.#subscriptions.get(messageType) ?? new Set<Subscription<unknown>>();
    const subscription: Subscription<unknown> = {
      listener: listener as Listener<unknown>,
      filter: filter as FilterFunction<unknown> | undefined,
    };
    subscriptions.add(subscription);
    this.#subscriptions.set(messageType, subscriptions);

    return {
      dispose: () => {
        const targetSubscriptions = this.#subscriptions.get(messageType);
        if (targetSubscriptions) {
          targetSubscriptions.delete(subscription);
          if (targetSubscriptions.size === 0) {
            this.#subscriptions.delete(messageType);
          }
        }
      },
    };
  }

  publish<K extends keyof TMessageMap>(messageType: K, data: TMessageMap[K]): void {
    const targetSubscriptions = this.#subscriptions.get(messageType);
    targetSubscriptions?.forEach((subscription) => {
      const { listener, filter } = subscription as Subscription<TMessageMap[K]>;
      if (!filter || filter(data)) {
        listener(data);
      }
    });
  }

  hasListeners<K extends keyof TMessageMap>(messageType: K): boolean {
    return this.#subscriptions.has(messageType);
  }

  listenerCount<K extends keyof TMessageMap>(messageType: K): number {
    return this.#subscriptions.get(messageType)?.size ?? 0;
  }

  clear(): void {
    this.#subscriptions.clear();
  }

  dispose(): void {
    this.clear();
  }
}
