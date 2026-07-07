import { Disposable } from '@gitlab-org/disposable';
import { Handler, HandlerRegistry } from '../types';
import { SimpleRegistry } from './simple_registry';

export type HashFunc<K> = (key: K) => string;

export class HashedRegistry<TKey, THandler extends Handler = Handler>
  implements HandlerRegistry<TKey, THandler>
{
  #hashFunc: HashFunc<TKey>;

  #basicRegistry: SimpleRegistry<THandler>;

  constructor(hashFunc: HashFunc<TKey>) {
    this.#hashFunc = hashFunc;
    this.#basicRegistry = new SimpleRegistry<THandler>();
  }

  get size() {
    return this.#basicRegistry.size;
  }

  register(key: TKey, handler: THandler): Disposable {
    const hash = this.#hashFunc(key);
    return this.#basicRegistry.register(hash, handler);
  }

  has(key: TKey): boolean {
    const hash = this.#hashFunc(key);
    return this.#basicRegistry.has(hash);
  }

  handle(key: TKey, ...args: Parameters<THandler>): Promise<ReturnType<THandler>> {
    const hash = this.#hashFunc(key);
    return this.#basicRegistry.handle(hash, ...args);
  }

  dispose() {
    this.#basicRegistry.dispose();
  }
}
