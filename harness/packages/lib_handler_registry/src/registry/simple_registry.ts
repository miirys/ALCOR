import { Disposable } from '@gitlab-org/disposable';
import { HandlerNotFoundError, UnhandledHandlerError } from '../errors';
import { Handler, HandlerRegistry } from '../types';

export class SimpleRegistry<THandler extends Handler = Handler>
  implements HandlerRegistry<string, THandler>
{
  #handlers = new Map<string, THandler>();

  get size() {
    return this.#handlers.size;
  }

  register(key: string, handler: THandler): Disposable {
    this.#handlers.set(key, handler);

    return {
      dispose: () => {
        this.#handlers.delete(key);
      },
    };
  }

  has(key: string) {
    return this.#handlers.has(key);
  }

  async handle(key: string, ...args: Parameters<THandler>): Promise<ReturnType<THandler>> {
    const handler = this.#handlers.get(key);

    if (!handler) {
      throw new HandlerNotFoundError(key);
    }

    try {
      const handlerResult = await handler(...args);
      return handlerResult as ReturnType<THandler>;
    } catch (error) {
      throw new UnhandledHandlerError(key, resolveError(error));
    }
  }

  dispose() {
    this.#handlers.clear();
  }
}

function resolveError(e: unknown): Error {
  if (e instanceof Error) {
    return e;
  }

  if (typeof e === 'string') {
    return new Error(e);
  }

  return new Error('Unknown error');
}
